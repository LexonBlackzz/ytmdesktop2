// Cloudflare Worker flavour of the relay: one Durable Object per room (hibernating WebSockets).
// Clients pick the room through the URL: ?t=host (we mint the code) or ?t=join&code=ABC234.
// ponytail: no per-IP rate limit (guests are capped per room); add a Workers rate-limit binding if abused.
const MAX_GUESTS = 50;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L, same as the Node relay
const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");
const validState = (m) =>
	typeof m.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(m.videoId) && typeof m.playing === "boolean" && Number.isFinite(m.positionMs);

export default {
	async fetch(req, env) {
		if (req.headers.get("Upgrade") !== "websocket") return new Response("ytmd listen relay", { status: 426 });
		const url = new URL(req.url);
		const host = url.searchParams.get("t") === "host";
		const code = host ? newCode() : (url.searchParams.get("code") ?? "").toUpperCase();
		if (!CODE_RE.test(code)) return new Response("bad room code", { status: 400 });
		const room = env.ROOM.get(env.ROOM.idFromName(code));
		return room.fetch(`https://room/?role=${host ? "host" : "guest"}&code=${code}`, req);
	},
};

export class Room {
	constructor(state) {
		this.state = state;
	}

	send(ws, msg) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {}
	}

	async fetch(req) {
		const url = new URL(req.url);
		const role = url.searchParams.get("role");
		const { 0: client, 1: server } = new WebSocketPair();
		const hosts = this.state.getWebSockets("host");
		const guests = this.state.getWebSockets("guest");

		if (role === "host") {
			if (hosts.length) return this.reject(client, server, "no-room"); // minted code collided; client just retries
			this.state.acceptWebSocket(server, ["host"]);
			await this.state.storage.delete("state");
			this.send(server, { t: "room", code: url.searchParams.get("code") });
		} else if (!hosts.length) {
			return this.reject(client, server, "no-room");
		} else if (guests.length >= MAX_GUESTS) {
			return this.reject(client, server, "full");
		} else {
			this.state.acceptWebSocket(server, ["guest"]);
			this.send(server, { t: "joined" });
			const last = await this.state.storage.get("state");
			if (last) this.send(server, last);
			this.send(hosts[0], { t: "listeners", n: guests.length + 1 });
		}
		return new Response(null, { status: 101, webSocket: client });
	}

	reject(client, server, reason) {
		server.accept();
		this.send(server, { t: "error", reason });
		server.close(1000, reason);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws, raw) {
		if (typeof raw !== "string" || raw.length > 4096 || !this.state.getTags(ws).includes("host")) return;
		let m;
		try {
			m = JSON.parse(raw);
		} catch {
			return;
		}
		if (m.t !== "state" || !validState(m)) return; // the client's hello ({t:"host"}) lands here too and is ignored
		const state = { t: "state", videoId: m.videoId, playing: m.playing, positionMs: m.positionMs };
		await this.state.storage.put("state", state);
		for (const g of this.state.getWebSockets("guest")) this.send(g, state);
	}

	async webSocketClose(ws) {
		if (this.state.getTags(ws).includes("host")) {
			for (const g of this.state.getWebSockets("guest")) {
				this.send(g, { t: "closed" });
				g.close(1000, "closed");
			}
			await this.state.storage.deleteAll();
		} else {
			const [host] = this.state.getWebSockets("host");
			if (host) this.send(host, { t: "listeners", n: this.state.getWebSockets("guest").filter((g) => g !== ws).length });
		}
	}

	webSocketError(ws) {
		return this.webSocketClose(ws);
	}
}
