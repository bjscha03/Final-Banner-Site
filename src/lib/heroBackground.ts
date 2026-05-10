import type { CSSProperties } from 'react';

/**
 * Shared hero background image used across the site (Homepage, Design,
 * Google Ads landing page, etc.). Replaces the previous Cloudinary video
 * background so we can keep visual consistency without the cost of an
 * autoplaying video.
 */
export const HERO_BG_IMAGE_URL =
  'https://res.cloudinary.com/dtrxl120u/image/upload/e_brightness:20,e_contrast:8,e_shadow:28,e_blackwhite:10,co_rgb:111111,e_colorize:8/e_sharpen:35/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png';

/**
 * Inline style applying the hero image with a dark overlay so foreground
 * text/CTAs remain readable. Use as the `style` prop on the hero `<section>`
 * or an absolutely-positioned background `<div>`.
 */
export const heroBackgroundStyle: CSSProperties = {
  backgroundImage: `linear-gradient(rgba(0,0,0,0.24), rgba(0,0,0,0.36)), url("${HERO_BG_IMAGE_URL}")`,
  backgroundSize: 'cover',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat',
};

export const heroCinematicOverlayStyle: CSSProperties = {
  background: [
    'radial-gradient(62% 52% at 50% 32%, rgba(255, 171, 94, 0.16) 0%, rgba(255, 171, 94, 0.06) 34%, rgba(0,0,0,0) 66%)',
    'radial-gradient(96% 82% at 50% 46%, rgba(15, 23, 42, 0.44) 0%, rgba(15, 23, 42, 0.54) 48%, rgba(2, 6, 23, 0.7) 100%)',
    'linear-gradient(120deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.44) 42%, rgba(2,6,23,0.6) 100%)',
    'linear-gradient(to bottom, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.22) 38%, rgba(0,0,0,0.45) 100%)',
  ].join(','),
};
