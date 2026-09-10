import type { CSSProperties } from 'react';

/**
 * Shared hero background image used across the site (Homepage, Design,
 * Google Ads landing page, etc.). Replaces the previous Cloudinary video
 * background so we can keep visual consistency without the cost of an
 * autoplaying video.
 */
export const HERO_BG_IMAGE_URL =
  'https://res.cloudinary.com/dtrxl120u/image/upload/e_brightness:10,e_shadow:12/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png';

/**
 * Inline style applying the hero image with a dark overlay so foreground
 * text/CTAs remain readable. Use as the `style` prop on the hero `<section>`
 * or an absolutely-positioned background `<div>`.
 */
export const heroBackgroundStyle: CSSProperties = {
  backgroundImage: `linear-gradient(rgba(0,0,0,0.38), rgba(0,0,0,0.52)), url("${HERO_BG_IMAGE_URL}")`,
  backgroundSize: 'cover',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat',
};
