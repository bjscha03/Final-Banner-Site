/**
 * Unit conversion utilities for banner design
 */

export const inToPx = (inches: number, dpi: number = 96): number => inches * dpi;

export const pxToIn = (px: number, dpi: number = 96): number => px / dpi;

/**
 * Calculate effective DPI of an image for a given banner size
 */
export const calculateEffectiveDPI = (
  imageWidth: number,
  imageHeight: number,
  bannerWidthIn: number,
  bannerHeightIn: number
): number => {
  const widthDPI = imageWidth / bannerWidthIn;
  const heightDPI = imageHeight / bannerHeightIn;
  return Math.min(widthDPI, heightDPI);
};

/**
 * Compute grommet positions for banner edges
 */
export interface GrommetPosition {
  x: number;
  y: number;
  id: string;
}

export const computeGrommetPositions = (
  widthIn: number,
  heightIn: number,
  dpi: number,
  grommetEveryIn: number,
  cornerGrommetOffsetIn: number
): GrommetPosition[] => {
  const positions: GrommetPosition[] = [];
  const widthPx = inToPx(widthIn, dpi);
  const heightPx = inToPx(heightIn, dpi);
  const offsetPx = inToPx(cornerGrommetOffsetIn, dpi);
  const spacingPx = inToPx(grommetEveryIn, dpi);

  // Corner grommets
  positions.push(
    { x: offsetPx, y: offsetPx, id: 'corner-tl' },
    { x: widthPx - offsetPx, y: offsetPx, id: 'corner-tr' },
    { x: offsetPx, y: heightPx - offsetPx, id: 'corner-bl' },
    { x: widthPx - offsetPx, y: heightPx - offsetPx, id: 'corner-br' }
  );

  // Edge grommets (skip if too close to corners)
  const minDistanceFromCorner = inToPx(2, dpi); // 2" minimum distance

  // Top and bottom edges
  for (let x = spacingPx; x < widthPx; x += spacingPx) {
    const distanceFromLeftCorner = Math.abs(x - offsetPx);
    const distanceFromRightCorner = Math.abs(x - (widthPx - offsetPx));
    
    if (distanceFromLeftCorner > minDistanceFromCorner && distanceFromRightCorner > minDistanceFromCorner) {
      positions.push(
        { x, y: offsetPx, id: `top-${x}` },
        { x, y: heightPx - offsetPx, id: `bottom-${x}` }
      );
    }
  }

  // Left and right edges
  for (let y = spacingPx; y < heightPx; y += spacingPx) {
    const distanceFromTopCorner = Math.abs(y - offsetPx);
    const distanceFromBottomCorner = Math.abs(y - (heightPx - offsetPx));
    
    if (distanceFromTopCorner > minDistanceFromCorner && distanceFromBottomCorner > minDistanceFromCorner) {
      positions.push(
        { x: offsetPx, y, id: `left-${y}` },
        { x: widthPx - offsetPx, y, id: `right-${y}` }
      );
    }
  }

  return positions;
};
