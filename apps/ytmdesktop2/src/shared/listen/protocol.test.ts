import { describe, expect, test } from "vitest";
import { expectedPositionMs, isListenCode, relayConnectUrl } from "./protocol";

describe("listen protocol", () => {
	test("expected position advances only while playing", () => {
		expect(expectedPositionMs({ playing: true, positionMs: 1000 }, 500)).toBe(1500);
		expect(expectedPositionMs({ playing: false, positionMs: 1000 }, 500)).toBe(1000);
		expect(expectedPositionMs({ playing: true, positionMs: 1000 }, -5)).toBe(1000);
	});
	test("relay url carries the room choice", () => {
		expect(relayConnectUrl("wss://r.example.com", "host")).toBe("wss://r.example.com/?t=host");
		expect(relayConnectUrl(" ws://localhost:8787/ ", "join", "ABC234")).toBe("ws://localhost:8787/?t=join&code=ABC234");
		expect(relayConnectUrl("https://r.example.com", "host")).toBeNull();
		expect(relayConnectUrl("", "host")).toBeNull();
	});
	test("room codes avoid ambiguous characters", () => {
		expect(isListenCode("ABC234")).toBe(true);
		expect(isListenCode("abc234")).toBe(true);
		expect(isListenCode("ABC0O1")).toBe(false);
		expect(isListenCode("ABC23")).toBe(false);
	});
});
