import { type SavedVideo, stepAdSkip } from "./ad-skipper.step";
import type { RendererPluginRegistration } from "./world0/types";

const SETTING_KEY = "player.skipAds";
const TICK_MS = 400;
const SKIP_BUTTONS = ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button";

/**
 * Opt-in (default off): while the player reports an ad, mute it, fast-forward to its end and press Skip.
 * ponytail: polls every 400 ms; the player's `ad-showing` class is not a public API, so YouTube can break it.
 */
const adSkipperRenderer: RendererPluginRegistration = {
	id: "ad-skipper",
	enabled: true,
	async start(ctx) {
		let on = false;
		let saved: SavedVideo = null;
		try {
			on = (await ctx.ytmd?.settings.get(SETTING_KEY)) === true;
		} catch {
			/* stays off */
		}

		const tick = () => {
			const player = document.querySelector("#movie_player");
			const adShowing = !!player?.classList.contains("ad-showing") || !!player?.classList.contains("ad-interrupting");
			const video = document.querySelector<HTMLVideoElement>("#movie_player video");
			if (!on && !saved) return;
			saved = stepAdSkip(on && adShowing, video, saved);
			if (on && adShowing) document.querySelector<HTMLElement>(SKIP_BUTTONS)?.click();
		};
		const timer = setInterval(tick, TICK_MS);

		const off = ctx.ytmd?.on("settingsProvider.change", (key, value) => {
			if (key === SETTING_KEY) on = value === true;
			else if (key === "player" && value && typeof value === "object" && "skipAds" in value) on = (value as { skipAds?: boolean }).skipAds === true;
		});
		return () => {
			clearInterval(timer);
			off?.();
		};
	},
};

export default adSkipperRenderer;
