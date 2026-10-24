import definePlugin from "@plugins/utils";
import adSkipperRenderer from "./ad-skipper.renderer";

/** Skips ads in the YouTube Music player when `player.skipAds` is on. */
export default definePlugin(
	"ad-skipper",
	{ enabled: true, displayName: "Ad skipper" },
	{ renderer: adSkipperRenderer },
);
