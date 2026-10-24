// Listen-together relay: one host per room, many guests. Forwards host state, keeps the latest for late joiners.
// ponytail: in-memory, no auth/rate limit — fine for a small self-hosted relay; put it behind a proxy if public.
import { randomInt } from "node:crypto";
import { WebSocketServer } from "ws";

const MAX_GUESTS = 50;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const rooms = new Map(); // code -> { host, guests: Set<ws>, state }

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const newCode = () => {
	let code;
	do code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
	while (rooms.has(code));
	return code;
};
const validState = (m) =>
	typeof m.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(m.videoId) && typeof m.playing === "boolean" && Number.isFinite(m.positionMs);

function leave(ws) {
	const room = rooms.get(ws.room);
	if (!room) return;
	if (room.host === ws) {
		for (const g of room.guests) {
			send(g, { t: "closed" });
			g.room = null;
		}
		rooms.delete(ws.room);
	} else {
		room.guests.delete(ws);
		send(room.host, { t: "listeners", n: room.guests.size });
	}
	ws.room = null;
}

const wss = new WebSocketServer({ port: Number(process.env.PORT) || 8787, maxPayload: 4096 });
wss.on("connection", (ws) => {
	ws.alive = true;
	ws.on("pong", () => (ws.alive = true));
	ws.on("close", () => leave(ws));
	ws.on("message", (raw) => {
		let m;
		try {
			m = JSON.parse(raw);
		} catch {
			return;
		}
		if (m.t === "host" && !ws.room) {
			const code = newCode();
			rooms.set(code, { host: ws, guests: new Set(), state: null });
			ws.room = code;
			send(ws, { t: "room", code });
		} else if (m.t === "join" && !ws.room) {
			const room = rooms.get(String(m.code ?? "").toUpperCase());
			if (!room) return send(ws, { t: "error", reason: "no-room" });
			if (room.guests.size >= MAX_GUESTS) return send(ws, { t: "error", reason: "full" });
			room.guests.add(ws);
			ws.room = String(m.code).toUpperCase();
			send(ws, { t: "joined" });
			if (room.state) send(ws, room.state);
			send(room.host, { t: "listeners", n: room.guests.size });
		} else if (m.t === "state" && ws.room && rooms.get(ws.room)?.host === ws && validState(m)) {
			const room = rooms.get(ws.room);
			room.state = { t: "state", videoId: m.videoId, playing: m.playing, positionMs: m.positionMs };
			for (const g of room.guests) send(g, room.state);
		}
	});
});
setInterval(() => {
	for (const ws of wss.clients) {
		if (!ws.alive) ws.terminate();
		else {
			ws.alive = false;
			ws.ping();
		}
	}
}, 30_000);
console.log(`listen-relay on :${wss.options.port}`);
