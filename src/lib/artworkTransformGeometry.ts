export type ArtworkCanvasSize = { w: number; h: number };

export type PixelArtworkTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export type NormalizedArtworkGeometry = {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export function getContainedArtworkRect(
  canvas: ArtworkCanvasSize,
  natural: ArtworkCanvasSize,
): ArtworkCanvasSize {
  if (canvas.w <= 0 || canvas.h <= 0 || natural.w <= 0 || natural.h <= 0) {
    return { w: Math.max(1, canvas.w), h: Math.max(1, canvas.h) };
  }

  const canvasAspect = canvas.w / canvas.h;
  const imageAspect = natural.w / natural.h;
  return imageAspect > canvasAspect
    ? { w: canvas.w, h: canvas.w / imageAspect }
    : { w: canvas.h * imageAspect, h: canvas.h };
}

export function captureNormalizedArtworkGeometry(
  transform: PixelArtworkTransform,
  canvas: ArtworkCanvasSize,
  natural: ArtworkCanvasSize,
): NormalizedArtworkGeometry {
  const contained = getContainedArtworkRect(canvas, natural);
  return {
    xPct: canvas.w ? transform.x / canvas.w : 0,
    yPct: canvas.h ? transform.y / canvas.h : 0,
    widthPct: canvas.w ? (contained.w * transform.scaleX) / canvas.w : transform.scaleX,
    heightPct: canvas.h ? (contained.h * transform.scaleY) / canvas.h : transform.scaleY,
  };
}

export function restoreArtworkTransformFromGeometry(
  geometry: NormalizedArtworkGeometry,
  canvas: ArtworkCanvasSize,
  natural: ArtworkCanvasSize,
  constrain: boolean,
): PixelArtworkTransform {
  const contained = getContainedArtworkRect(canvas, natural);
  const scaleX = contained.w > 0 ? (geometry.widthPct * canvas.w) / contained.w : 1;
  const scaleY = constrain
    ? scaleX
    : contained.h > 0
      ? (geometry.heightPct * canvas.h) / contained.h
      : 1;

  return {
    x: geometry.xPct * canvas.w,
    y: geometry.yPct * canvas.h,
    scaleX,
    scaleY,
  };
}
