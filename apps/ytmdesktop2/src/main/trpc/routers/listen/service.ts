import { BaseProvider, type OnDestroy } from "@main/core/baseProvider";
import { emitAppToast } from "@main/lib/appToast";
import { trackService } from "@main/trpc/routers/track";
import {
	DEFAULT_RELAY_URL,
	expectedPositionMs,
	isListenCode,
	LISTEN_DRIFT_MS,
	type ListenServerMessage,
	type ListenState,
	type ListenStatus,
	relayConnectUrl,
} from "@shared/listen/protocol";
import type { App } from "electron";
import WebSocket from "ws";

const HEARTBEAT_MS = 5000;
/** Don't re-open the same video while it is still loading. */
const REOPEN_GUARD_MS = 8000;
const SEEK_COOLDOWN_MS = 3000;
const idle: ListenStatus = { mode: "idle", code: null, listeners: 0, connecting: false, error: null };

/**
 * Listen together: the host's track/play/seek is mirrored to guests through a relay (apps/listen-relay).
 * ponytail: no auto-reconnect and one room at a time — rejoin by hand, add backoff if relays prove flaky.
 */
export default class ListenProvider extends BaseProvider implements OnDestroy {
	private ws: WebSocket | null = null;
	private status: ListenStatus = idle;
	private disposers: (() => void)[] = [];
	private heartbeat: NodeJS.Timeout | null = null;
	/** Host: last pushed state, to detect seeks between heartbeats. */
	private sent: { id: string; playing: boolean; positionMs: number; at: number } | null = null;
	/** Guest: newest host state and when we got it. */
	private last: { state: ListenState; at: number } | null = null;
	private opened: { id: string; at: number } | null = null;
	private lastSeekAt = 0;

	constructor(private app: App) {
		super("listen");
	}

	getStatus() {
		return this.status;
	}

	host() {
		return this.connect("host");
	}

	join(code: string) {
		const clean = code.trim().toUpperCase();
		if (!isListenCode(clean)) return this.fail("Invalid room code");
		return this.connect("join", clean);
	}

	leave() {
		this.teardown();
		this.setStatus(idle);
	}

	async OnDestroy() {
		this.teardown();
	}

	private setStatus(next: ListenStatus) {
		this.status = next;
		this.windowContext?.sendToAllViews("listen.status", next);
	}

	private fail(error: string) {
		this.teardown();
		this.setStatus({ ...idle, error });
		emitAppToast(this.windowContext, { type: "error", message: error });
	}

	private teardown() {
		const ws = this.ws;
		this.ws = null;
		ws?.removeAllListeners();
		ws?.on("error", () => {});
		ws?.close();
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.heartbeat = null;
		for (const off of this.disposers.splice(0)) off();
		this.sent = this.last = this.opened = null;
	}

	private connect(role: "host" | "join", joinCode?: string) {
		this.teardown();
		const base = this.getProvider("settings").get<string>("listen.relayUrl", "").trim() || DEFAULT_RELAY_URL;
		const url = relayConnectUrl(base, role, joinCode);
		if (!url) return this.fail("Set a relay URL (ws:// or wss://) in Listen Together settings first");
		const hello = role === "host" ? { t: "host" } : { t: "join", code: joinCode };
		this.setStatus({ ...idle, connecting: true });

		const ws = new WebSocket(url);
		this.ws = ws;
		ws.on("open", () => ws.send(JSON.stringify(hello)));
		ws.on("error", (err) => this.ws === ws && this.fail(`Relay connection failed: ${err.message}`));
		ws.on("close", () => this.ws === ws && this.fail("Disconnected from relay"));
		ws.on("message", (raw) => {
			try {
				this.onMessage(JSON.parse(raw.toString()) as ListenServerMessage, joinCode);
			} catch (err) {
				this.logger.warn("bad relay message", err);
			}
		});
	}

	private onMessage(msg: ListenServerMessage, joinCode?: string) {
		switch (msg.t) {
			case "room":
				this.setStatus({ ...idle, mode: "host", code: msg.code });
				this.startHosting();
				break;
			case "joined":
				this.setStatus({ ...idle, mode: "guest", code: joinCode ?? null });
				this.disposers.push(
					trackService.onTrackStateChange((s) => {
						// Track we opened has loaded: apply position/play state once.
						if (this.opened?.id === s.id && s.id === this.last?.state.videoId) {
							this.opened = null;
							void this.reconcile();
						}
					}),
				);
				break;
			case "listeners":
				this.setStatus({ ...this.status, listeners: msg.n });
				break;
			case "closed":
				this.fail("The host ended the session");
				break;
			case "error":
				this.fail(msg.reason === "full" ? "Room is full" : "Room not found");
				break;
			case "state":
				this.last = { state: msg, at: Date.now() };
				void this.reconcile();
				break;
		}
	}

	private startHosting() {
		this.pushState();
		this.heartbeat = setInterval(() => this.pushState(), HEARTBEAT_MS);
		this.disposers.push(
			trackService.onTrackStateChange((s) => {
				const prev = this.sent;
				const moved = prev ? Math.abs(s.progress * 1000 - expectedPositionMs({ playing: prev.playing, positionMs: prev.positionMs }, Date.now() - prev.at)) : 0;
				if (!prev || prev.id !== s.id || prev.playing !== s.playing || moved > LISTEN_DRIFT_MS / 2) this.pushState();
			}),
		);
	}

	private pushState() {
		const s = trackService.getTrackState();
		if (!s?.id || this.ws?.readyState !== WebSocket.OPEN) return;
		const positionMs = Math.round(s.progress * 1000);
		this.sent = { id: s.id, playing: s.playing, positionMs, at: Date.now() };
		this.ws.send(JSON.stringify({ t: "state", videoId: s.id, playing: s.playing, positionMs }));
	}

	private async reconcile() {
		const g = this.last;
		if (!g) return;
		try {
			const cur = trackService.getTrackState();
			if (cur?.id !== g.state.videoId) {
				const recent = this.opened?.id === g.state.videoId && Date.now() - this.opened.at < REOPEN_GUARD_MS;
				if (recent) return;
				this.opened = { id: g.state.videoId, at: Date.now() };
				await this.getProvider("navigation").openWatch(g.state.videoId);
				return;
			}
			if (cur.playing !== g.state.playing) await (g.state.playing ? trackService.playTrack() : trackService.pauseTrack());
			const want = expectedPositionMs(g.state, Date.now() - g.at);
			if (Math.abs(cur.progress * 1000 - want) > LISTEN_DRIFT_MS && Date.now() - this.lastSeekAt > SEEK_COOLDOWN_MS) {
				this.lastSeekAt = Date.now();
				await trackService.seekTrack(undefined, { time: want, type: "seek" });
			}
		} catch (err) {
			this.logger.warn("listen reconcile failed", err);
		}
	}
}
