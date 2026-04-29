/**
 * GrommetOverlay
 *
 * Renders grommet rings on top of the design preview canvas. Pure SVG,
 * no DOM nodes, and the parent <svg> handles all responsive scaling so
 * the overlay scales correctly on mobile / Safari without overflow.
 *
 * IMPORTANT: This is a PREVIEW-ONLY visual. Grommets rendered here are
 * never serialized into canvas_state_json and so are excluded from the
 * server-side print/PDF pipeline, cart thumbnails, and admin downloads.
 */

import React, { useMemo } from 'react';
import {
  getGrommetPositions,
  getGrommetRadius,
  toGrommetOverlayOption,
  type GrommetOverlayOption,
} from '@/lib/preview/grommetPositions';

interface GrommetOverlayProps {
  /** Banner width in inches (matches the parent SVG coordinate space). */
  widthIn: number;
  /** Banner height in inches. */
  heightIn: number;
  /** Grommet selection. Accepts the PR-2 overlay options or any legacy
   *  value from the store; legacy values are mapped automatically. */
  option: GrommetOverlayOption | string;
  /** X offset (inches) where the banner area begins inside the SVG. */
  offsetX?: number;
  /** Y offset (inches) where the banner area begins inside the SVG. */
  offsetY?: number;
  /** Optional radius override (inches). Defaults to a size-aware value. */
  radius?: number;
  /** Stable id suffix so multiple overlays on the same page don't share gradients. */
  idSuffix?: string;
}

const GrommetOverlay: React.FC<GrommetOverlayProps> = ({
  widthIn,
  heightIn,
  option,
  offsetX = 0,
  offsetY = 0,
  radius,
  idSuffix = 'default',
}) => {
  const overlayOption = useMemo(
    () => (typeof option === 'string' ? toGrommetOverlayOption(option) : option),
    [option]
  );

  const positions = useMemo(
    () => getGrommetPositions(widthIn, heightIn, overlayOption),
    [widthIn, heightIn, overlayOption]
  );

  const r = radius ?? getGrommetRadius(widthIn, heightIn);
  const gradientId = `grommet-gradient-${idSuffix}`;

  if (positions.length === 0) return null;

  return (
    <g
      className="grommet-overlay"
      data-preview-only="true"
      pointerEvents="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradientId} cx="30%" cy="30%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#a0aec0" />
          <stop offset="100%" stopColor="#4a5568" />
        </radialGradient>
      </defs>
      {positions.map((p, i) => {
        const cx = offsetX + p.x;
        const cy = offsetY + p.y;
        return (
          <g key={`grommet-${i}`}>
            {/* Drop shadow */}
            <circle cx={cx + 0.06} cy={cy + 0.06} r={r * 1.3} fill="#000000" opacity="0.15" />
            {/* Outer metallic ring */}
            <circle
              cx={cx}
              cy={cy}
              r={r * 1.3}
              fill={`url(#${gradientId})`}
              stroke="#2d3748"
              strokeWidth={Math.max(0.04, r * 0.12)}
            />
            {/* Inner hole */}
            <circle
              cx={cx}
              cy={cy}
              r={r * 0.7}
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth={Math.max(0.02, r * 0.06)}
            />
            {/* Subtle highlight for 3D effect */}
            <circle
              cx={cx - r * 0.4}
              cy={cy - r * 0.4}
              r={r * 0.3}
              fill="#ffffff"
              opacity="0.4"
            />
          </g>
        );
      })}
    </g>
  );
};

export default GrommetOverlay;
