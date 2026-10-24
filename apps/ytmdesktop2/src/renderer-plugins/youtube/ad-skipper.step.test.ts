import { describe, expect, test } from "vitest";
import { stepAdSkip, type VideoLike } from "./ad-skipper.step";

const video = (over: Partial<VideoLike> = {}): VideoLike => ({ muted: false, playbackRate: 1, currentTime: 2, duration: 15, ...over });

describe("stepAdSkip", () => {
	test("mutes, speeds up and jumps to the end during an ad", () => {
		const v = video();
		const saved = stepAdSkip(true, v, null);
		expect(v).toMatchObject({ muted: true, playbackRate: 16 });
		expect(v.currentTime).toBeCloseTo(14.9);
		expect(saved).toEqual({ muted: false, rate: 1 });
	});
	test("restores the user's own mute and rate afterwards", () => {
		const v = video({ muted: true, playbackRate: 1.25 });
		const saved = stepAdSkip(true, v, null);
		expect(stepAdSkip(true, v, saved)).toEqual({ muted: true, rate: 1.25 }); // second tick keeps the original
		expect(stepAdSkip(false, v, saved)).toBeNull();
		expect(v).toMatchObject({ muted: true, playbackRate: 1.25 });
	});
	test("does nothing without an ad or a video; ignores unknown duration", () => {
		const v = video();
		expect(stepAdSkip(false, v, null)).toBeNull();
		expect(v).toMatchObject({ muted: false, playbackRate: 1, currentTime: 2 });
		expect(stepAdSkip(true, null, null)).toBeNull();
		const live = video({ duration: Number.NaN });
		stepAdSkip(true, live, null);
		expect(live.currentTime).toBe(2);
	});
});
