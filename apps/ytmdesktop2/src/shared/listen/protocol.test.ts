import { describe, expect, test } from "vitest";
import { expectedPositionMs, isListenCode } from "./protocol";

describe("listen protocol", () => {
	test("expected position advances only while playing", () => {
		expect(expectedPositionMs({ playing: true, positionMs: 1000 }, 500)).toBe(1500);
		expect(expectedPositionMs({ playing: false, positionMs: 1000 }, 500)).toBe(1000);
		expect(expectedPositionMs({ playing: true, positionMs: 1000 }, -5)).toBe(1000);
	});
	test("room codes avoid ambiguous characters", () => {
		expect(isListenCode("ABC234")).toBe(true);
		expect(isListenCode("abc234")).toBe(true);
		expect(isListenCode("ABC0O1")).toBe(false);
		expect(isListenCode("ABC23")).toBe(false);
	});
});
