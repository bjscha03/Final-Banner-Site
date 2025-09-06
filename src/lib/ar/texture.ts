// Draw artwork (image/canvas) onto a new canvas sized to the artwork,
// optionally overlay grommet markers based on banner inches.
export async function composeTexture(params: {
  artwork: HTMLImageElement | HTMLCanvasElement;
  widthIn: number;
  heightIn: number;
  showGrommets?: boolean;
  grommetMode?: 'none'|'every-2-3ft'|'every-1-2ft'|'4-corners'|'top-corners'|'right-corners'|'left-corners';
}) {
  const { artwork, widthIn, heightIn, showGrommets = true, grommetMode = 'none' } = params;
  const srcCanvas = artwork instanceof HTMLCanvasElement ? artwork : imageToCanvas(artwork);

  // Create banner-sized canvas (like live preview)
  const aspectRatio = widthIn / heightIn;
  const maxSize = 1024;
  let canvasWidth, canvasHeight;

  if (aspectRatio > 1) {
    canvasWidth = maxSize;
    canvasHeight = Math.round(maxSize / aspectRatio);
  } else {
    canvasWidth = Math.round(maxSize * aspectRatio);
    canvasHeight = maxSize;
  }

  const c = document.createElement('canvas');
  c.width = canvasWidth;
  c.height = canvasHeight;
  const ctx = c.getContext('2d')!;

  // Fill with white background (like live preview)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  // Fit artwork inside banner (like live preview)
  const artworkAspect = srcCanvas.width / srcCanvas.height;
  const bannerAspect = canvasWidth / canvasHeight;

  let drawWidth, drawHeight, drawX, drawY;

  if (artworkAspect > bannerAspect) {
    // Artwork is wider - fit to width
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / artworkAspect;
    drawX = 0;
    drawY = (canvasHeight - drawHeight) / 2;
  } else {
    // Artwork is taller - fit to height
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * artworkAspect;
    drawX = (canvasWidth - drawWidth) / 2;
    drawY = 0;
  }

  ctx.drawImage(srcCanvas, drawX, drawY, drawWidth, drawHeight);

  if (showGrommets && grommetMode !== 'none') {
    const m_in = 1; // 1" inset
    const spacing = (grommetMode === 'every-1-2ft') ? 18 : 24;
    // map inches -> pixels (using banner dimensions)
    const pxPerInX = canvasWidth / widthIn;
    const pxPerInY = canvasHeight / heightIn;
    const mX = m_in * pxPerInX, mY = m_in * pxPerInY;

    const addCorner = (x: number, y: number) => dot(ctx, x, y);
    const corners = [
      {x: mX, y: mY}, 
      {x: c.width - mX, y: mY}, 
      {x: mX, y: c.height - mY}, 
      {x: c.width - mX, y: c.height - mY}
    ];

    const sides = new Set<string>();
    if (['every-2-3ft','every-1-2ft'].includes(grommetMode)) sides.add('all');
    if (grommetMode === '4-corners') corners.forEach(p => addCorner(p.x, p.y));
    if (grommetMode === 'top-corners') [0,1].forEach(i => addCorner(corners[i].x, corners[i].y));
    if (grommetMode === 'right-corners') [1,3].forEach(i => addCorner(corners[i].x, corners[i].y));
    if (grommetMode === 'left-corners') [0,2].forEach(i => addCorner(corners[i].x, corners[i].y));

    if (sides.has('all')) {
      corners.forEach(p => addCorner(p.x, p.y));
      // top/bottom
      placeAlong(ctx, mX, c.width - mX, mY, true, pxPerInX, spacing);
      placeAlong(ctx, mX, c.width - mX, c.height - mY, true, pxPerInX, spacing);
      // left/right
      placeAlong(ctx, mY, c.height - mY, mX, false, pxPerInY, spacing);
      placeAlong(ctx, mY, c.height - mY, c.width - mX, false, pxPerInY, spacing);
    }
  }
  return c;
}

function imageToCanvas(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; 
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return c;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const rOuter = Math.max(6, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.012);
  const rInner = rOuter * 0.65;
  ctx.save();

  // Shadow for depth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, rOuter, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring (metal)
  ctx.fillStyle = '#6b7280';
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, rOuter, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner hole
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, rInner, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Metallic highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(x - rOuter * 0.25, y - rOuter * 0.25, rOuter * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function placeAlong(
  ctx: CanvasRenderingContext2D,
  start: number, 
  end: number, 
  fixed: number, 
  horizontal: boolean,
  pxPerIn: number, 
  spacingIn: number
) {
  const usablePx = Math.max(0, (end - start));
  const n = Math.floor((usablePx / pxPerIn) / spacingIn);
  if (n <= 0) return;
  const step = usablePx / (n + 1);
  for (let k = 1; k <= n; k++) {
    const pos = start + k * step;
    dot(ctx, horizontal ? pos : fixed, horizontal ? fixed : pos);
  }
}
