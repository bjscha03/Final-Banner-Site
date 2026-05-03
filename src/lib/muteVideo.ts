/**
 * Force a <video> element to be permanently silent.
 *
 * This is used for background/hero videos so that they never emit audio —
 * including inside session-replay tools (e.g. Microsoft Clarity) which can
 * otherwise capture the underlying media element's audio track even when the
 * live page sounds silent. The helper sets every relevant flag (muted,
 * defaultMuted, volume) and is safe to call multiple times.
 */
export const muteVideoElement = (el: HTMLVideoElement | null | undefined): void => {
  if (!el) return;
  try {
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
  } catch {
    // no-op: some browsers may throw on volume assignment in odd states
  }
};

/**
 * Append Cloudinary's `ac_none` (audio codec = none) transformation to a
 * Cloudinary delivery URL so that the served file contains no audio track at
 * all. Falls back to returning the original URL untouched if it doesn't look
 * like a Cloudinary `/video/upload/` URL.
 */
export const stripCloudinaryAudio = (url: string): string => {
  const marker = '/video/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const after = url.slice(idx + marker.length);
  // Avoid double-applying the transformation.
  if (after.startsWith('ac_none/') || after.includes('/ac_none/')) return url;
  return `${url.slice(0, idx + marker.length)}ac_none/${after}`;
};
