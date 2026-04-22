import React, { useMemo } from 'react';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import type { Grommets, MaterialKey } from '@/store/quote';

interface RealBannerOverlayProps {
  widthIn: number;
  heightIn: number;
  material: MaterialKey;
  grommets: Grommets;
  polePockets?: string;
}

/**
 * Pure visual SVG overlay that simulates the look of a printed banner.
 * It is rendered as an absolutely positioned, pointer-events-none sibling
 * over the existing PreviewCanvas. The overlay uses the SAME viewBox as
 * PreviewCanvas (computed from widthIn / heightIn plus the same bleed and
 * ruler constants) so its banner area aligns precisely with the canvas
 * banner area. This component never modifies the artwork and never causes
 * the underlying canvas to re-render — switching modes only toggles its
 * visibility.
 */
const RealBannerOverlay: React.FC<RealBannerOverlayProps> = ({
  widthIn,
  heightIn,
  material,
  grommets,
  polePockets,
}) => {
  // Mirror the layout constants used inside PreviewCanvas so this overlay
  // shares the exact coordinate system / aspect ratio.
  const BLEED_SIZE = 0.25;
  const RULER_HEIGHT = 1.2;
  const bleedWidth = widthIn + BLEED_SIZE * 2;
  const bleedHeight = heightIn + BLEED_SIZE * 2;
  const totalWidth = bleedWidth + RULER_HEIGHT * 2;
  const totalHeight = bleedHeight + RULER_HEIGHT * 2;
  const bannerOffsetX = RULER_HEIGHT + BLEED_SIZE;
  const bannerOffsetY = RULER_HEIGHT + BLEED_SIZE;

  const isMesh = material === 'mesh';

  const grommetPositions = useMemo(
    () => grommetPoints(widthIn, heightIn, grommets),
    [widthIn, heightIn, grommets]
  );
  const grommetR = useMemo(
    () => grommetRadius(widthIn, heightIn),
    [widthIn, heightIn]
  );

  const showPolePocketTop =
    polePockets === 'top' || polePockets === 'top-bottom';
  const showPolePocketBottom =
    polePockets === 'bottom' || polePockets === 'top-bottom';

  // Pole pocket strip thickness in inches (visual only).
  const pocketThickness = Math.min(3, Math.max(1.5, heightIn * 0.06));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      data-testid="real-banner-overlay"
    >
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
        }}
        // preserveAspectRatio defaults to xMidYMid meet — same as PreviewCanvas
      >
        <defs>
          {/* Mesh perforation pattern */}
          <pattern
            id="rb-mesh-pattern"
            width={0.18}
            height={0.18}
            patternUnits="userSpaceOnUse"
          >
            <rect width={0.18} height={0.18} fill="transparent" />
            <circle cx={0.09} cy={0.09} r={0.045} fill="rgba(0,0,0,0.55)" />
          </pattern>

          {/* Vinyl gloss highlight */}
          <linearGradient id="rb-vinyl-gloss" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="35%" stopColor="rgba(255,255,255,0)" />
            <stop offset="65%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
          </linearGradient>

          {/* Subtle vinyl micro-texture */}
          <pattern
            id="rb-vinyl-texture"
            width={0.12}
            height={0.12}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={0.12} height={0.12} fill="transparent" />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={0.12}
              stroke="rgba(0,0,0,0.04)"
              strokeWidth={0.04}
            />
          </pattern>

          {/* Pole pocket gradients */}
          <linearGradient id="rb-pocket-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id="rb-pocket-bottom" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>

          {/* Edge shading vignette */}
          <radialGradient id="rb-edge-shade" cx="50%" cy="50%" r="65%">
            <stop offset="65%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
          </radialGradient>

          {/* Drop shadow filter */}
          <filter id="rb-drop-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={0.18} />
            <feOffset dx={0} dy={0.12} result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope={0.35} />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Grommet radial gradient (metal) */}
          <radialGradient id="rb-grommet-metal" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#f4f4f5" />
            <stop offset="55%" stopColor="#a1a1aa" />
            <stop offset="100%" stopColor="#52525b" />
          </radialGradient>
          <radialGradient id="rb-grommet-hole" cx="50%" cy="60%" r="60%">
            <stop offset="0%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#0b0f17" />
          </radialGradient>
        </defs>

        {/* Drop shadow under the banner — group is empty geometry just to
            cast a soft shadow behind the artwork without altering it */}
        <rect
          x={bannerOffsetX}
          y={bannerOffsetY}
          width={widthIn}
          height={heightIn}
          fill="rgba(0,0,0,0)"
          filter="url(#rb-drop-shadow)"
        />

        {/* Material texture layer — multiply blend keeps artwork crisp */}
        {isMesh ? (
          <>
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY}
              width={widthIn}
              height={heightIn}
              fill="url(#rb-mesh-pattern)"
              style={{ mixBlendMode: 'multiply' }}
              opacity={0.85}
            />
            {/* Slight matte tint */}
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY}
              width={widthIn}
              height={heightIn}
              fill="rgba(20,20,20,0.06)"
              style={{ mixBlendMode: 'multiply' }}
            />
          </>
        ) : (
          <>
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY}
              width={widthIn}
              height={heightIn}
              fill="url(#rb-vinyl-texture)"
              style={{ mixBlendMode: 'multiply' }}
              opacity={0.6}
            />
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY}
              width={widthIn}
              height={heightIn}
              fill="url(#rb-vinyl-gloss)"
              style={{ mixBlendMode: 'overlay' }}
              opacity={0.9}
            />
          </>
        )}

        {/* Hemming — subtle inner stitched border */}
        <rect
          x={bannerOffsetX + 0.08}
          y={bannerOffsetY + 0.08}
          width={widthIn - 0.16}
          height={heightIn - 0.16}
          fill="none"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth={0.05}
          strokeDasharray="0.25 0.18"
        />

        {/* Pole pockets */}
        {showPolePocketTop && (
          <>
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY}
              width={widthIn}
              height={pocketThickness}
              fill="url(#rb-pocket-top)"
            />
            <line
              x1={bannerOffsetX}
              y1={bannerOffsetY + pocketThickness}
              x2={bannerOffsetX + widthIn}
              y2={bannerOffsetY + pocketThickness}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={0.04}
              strokeDasharray="0.3 0.2"
            />
          </>
        )}
        {showPolePocketBottom && (
          <>
            <rect
              x={bannerOffsetX}
              y={bannerOffsetY + heightIn - pocketThickness}
              width={widthIn}
              height={pocketThickness}
              fill="url(#rb-pocket-bottom)"
            />
            <line
              x1={bannerOffsetX}
              y1={bannerOffsetY + heightIn - pocketThickness}
              x2={bannerOffsetX + widthIn}
              y2={bannerOffsetY + heightIn - pocketThickness}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={0.04}
              strokeDasharray="0.3 0.2"
            />
          </>
        )}

        {/* Edge shading vignette */}
        <rect
          x={bannerOffsetX}
          y={bannerOffsetY}
          width={widthIn}
          height={heightIn}
          fill="url(#rb-edge-shade)"
          style={{ mixBlendMode: 'multiply' }}
        />

        {/* Grommets — purely visual, share the print preview's spacing logic */}
        {grommetPositions.map((p, idx) => (
          <g key={`rb-g-${idx}`}>
            <circle
              cx={bannerOffsetX + p.x}
              cy={bannerOffsetY + p.y}
              r={grommetR}
              fill="url(#rb-grommet-metal)"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.03}
            />
            <circle
              cx={bannerOffsetX + p.x}
              cy={bannerOffsetY + p.y}
              r={grommetR * 0.5}
              fill="url(#rb-grommet-hole)"
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

export default RealBannerOverlay;
