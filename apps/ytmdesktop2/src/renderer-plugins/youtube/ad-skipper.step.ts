export type VideoLike = { muted: boolean; playbackRate: number; currentTime: number; duration: number };
export type SavedVideo = { muted: boolean; rate: number } | null;

/**
 * One tick. While an ad shows: remember the user's mute/rate once, mute, speed up and jump to the end.
 * Once it is gone: put them back. Returns the state to feed into the next tick.
 */
export function stepAdSkip(adShowing: boolean, video: VideoLike | null, saved: SavedVideo): SavedVideo {
	if (!video) return saved;
	if (adShowing) {
		saved ??= { muted: video.muted, rate: video.playbackRate };
		video.muted = true;
		video.playbackRate = 16;
		if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
			video.currentTime = video.duration - 0.1;
		}
		return saved;
	}
	if (saved) {
		video.muted = saved.muted;
		video.playbackRate = saved.rate;
	}
	return null;
}
