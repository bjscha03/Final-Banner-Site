// Compute <image> x,y,width,height in INCH space for contain / cover
export type FitMode = 'contain' | 'cover' | 'stretch';

export function fitImage(
  bannerW: number, 
  bannerH: number, 
  artWpx: number, 
  artHpx: number, 
  mode: FitMode
) {
  if (mode === 'stretch') {
    return { x: 0, y: 0, w: bannerW, h: bannerH };
  }

  const artRatio = artWpx / artHpx;
  const bannerRatio = bannerW / bannerH;

  let w: number, h: number;

  if (mode === 'contain') {
    // Fit entire image within banner bounds
    if (artRatio > bannerRatio) {
      // Art is wider than banner - fit to width
      w = bannerW;
      h = bannerW / artRatio;
    } else {
      // Art is taller than banner - fit to height
      h = bannerH;
      w = bannerH * artRatio;
    }
  } else { // cover
    // Fill entire banner, cropping as needed
    if (artRatio > bannerRatio) {
      // Art is wider than banner - fit to height and crop width
      h = bannerH;
      w = bannerH * artRatio;
    } else {
      // Art is taller than banner - fit to width and crop height
      w = bannerW;
      h = bannerW / artRatio;
    }
  }

  // Center the image
  const x = (bannerW - w) / 2;
  const y = (bannerH - h) / 2;

  return { x, y, w, h };
}
