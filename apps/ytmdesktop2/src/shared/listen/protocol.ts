/** Wire format shared with apps/listen-relay. Host → relay → guests; guests never send state. */
export type ListenState = { t: "state"; videoId: string; playing: boolean; positionMs: number };

export type ListenServerMessage =
	| { t: "room"; code: string }
	| { t: "joined" }
	| { t: "listeners"; n: number }
	| { t: "closed" }
	| { t: "error"; reason: "no-room" | "full" }
	| ListenState;

export type ListenStatus = {
	mode: "idle" | "host" | "guest";
	code: string | null;
	listeners: number;
	connecting: boolean;
	error: string | null;
};

/** Guest seeks only when drifting past this; smaller gaps are network jitter. */
export const LISTEN_DRIFT_MS = 2000;

const ROOM_CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/i;
export const isListenCode = (code: string) => ROOM_CODE_RE.test(code);

/** Where the host is now, given a state received `elapsedMs` ago. */
export function expectedPositionMs(state: Pick<ListenState, "playing" | "positionMs">, elapsedMs: number): number {
	return state.positionMs + (state.playing ? Math.max(0, elapsedMs) : 0);
}
