/**
 * PreviewRulerFrame
 *
 * Wraps the live preview surface with measurement rulers on the LEFT
 * (vertical) and BOTTOM (horizontal) edges only. Pure UI overlay — does
 * not affect pricing, cart serialization, or print/PDF exports.
 *
 * The wrapped child is expected to be a relatively-positioned element
 * that uses the padding-bottom technique for its aspect ratio (matches
 * the existing inline preview on Design.tsx / GoogleAdsBanner.tsx). This
 * component does not modify the child's layout — it only renders the
 * ruler bands on the left and bottom using a 2-column / 2-row CSS grid.
 *
 * Tick positions are computed via the shared `getRulerTicks` helper so
 * the same logic powers PreviewCanvas and this in-page wrapper.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { getRulerTicks, type RulerUnit } from '@/lib/dimensions/rulers';

interface PreviewRulerFrameProps {
  widthIn: number;
  heightIn: number;
  unit?: RulerUnit;
  /** Pixel size of each ruler band (top/bottom height, left/right width). */
  bandPx?: number;
  /** When true, render a debug-only console message confirming ruler ticks. */
  debug?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const PreviewRulerFrame: React.FC<PreviewRulerFrameProps> = ({
  widthIn,
  heightIn,
  unit = 'in',
  bandPx = 22,
  debug = false,
  className = '',
  style,
  children,
}) => {
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 480
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsNarrowViewport(window.innerWidth < 480);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const maxMajorLabels = isNarrowViewport ? 4 : 12;

  const horizontalTicks = useMemo(
    () => getRulerTicks(widthIn, unit, { maxMajorLabels }),
    [widthIn, unit, maxMajorLabels]
  );
  const verticalTicks = useMemo(
    () => getRulerTicks(heightIn, unit, { maxMajorLabels }),
    [heightIn, unit, maxMajorLabels]
  );

  // Lightweight debug to confirm rulers/unit propagation in the live UI.
  useEffect(() => {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.debug(
      '[PreviewRulerFrame] unit=%s widthIn=%s heightIn=%s ticks=h:%d/v:%d',
      unit,
      widthIn,
      heightIn,
      horizontalTicks.length,
      verticalTicks.length
    );
  }, [debug, unit, widthIn, heightIn, horizontalTicks.length, verticalTicks.length]);

  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return <>{children}</>;
  }

  // Ruler styling. Ticks point INWARD toward the canvas so the bands
  // visually hug the print surface.
  const tickColor = '#475569';
  const labelColor = '#1e293b';

  // Layout strategy: a single block-level wrapper that reserves padding
  // for the LEFT and BOTTOM ruler bands, with the canvas as a normal
  // in-flow child. The wrapper's height is therefore driven by the
  // canvas's intrinsic height (e.g. via padding-bottom aspect-ratio),
  // which guarantees:
  //   * the vertical ruler is exactly as tall as the canvas
  //   * the horizontal ruler is exactly as wide as the canvas
  //   * no oversized ruler "frame" stretches past the canvas when a
  //     parent flex/grid container would otherwise stretch us.
  // The rulers themselves are absolutely positioned over the padded
  // gutters and never affect layout.
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'block',
        boxSizing: 'border-box',
        paddingLeft: bandPx,
        paddingBottom: bandPx,
        ...style,
      }}
    >
      {/* Canvas (children) renders into the area to the right of the
          left ruler and above the bottom ruler. */}
      {children}

      {/* Left vertical ruler — exactly the canvas's height. Ticks point
          RIGHT toward the canvas. */}
      <svg
        viewBox={`0 0 1 ${heightIn}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: bandPx,
          height: `calc(100% - ${bandPx}px)`,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        {verticalTicks.map((t, i) => {
          const tickW = t.major ? 0.45 : 0.25;
          return (
            <g key={`v-${i}`}>
              <line
                x1={1 - tickW}
                y1={t.pos}
                x2={1}
                y2={t.pos}
                stroke={tickColor}
                strokeWidth={t.major ? 0.04 : 0.025}
                vectorEffect="non-scaling-stroke"
              />
              {t.major && t.label && (
                <text
                  x={0.42}
                  y={t.pos}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={0.42}
                  fill={labelColor}
                  fontWeight={600}
                  transform={`rotate(-90, 0.42, ${t.pos})`}
                  style={{ fontFamily: 'system-ui, sans-serif' }}
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Bottom horizontal ruler — exactly the canvas's width. Ticks
          point UP toward the canvas. */}
      <svg
        viewBox={`0 0 ${widthIn} 1`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: bandPx,
          bottom: 0,
          width: `calc(100% - ${bandPx}px)`,
          height: bandPx,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        {horizontalTicks.map((t, i) => {
          const tickH = t.major ? 0.45 : 0.25;
          return (
            <g key={`h-${i}`}>
              <line
                x1={t.pos}
                y1={0}
                x2={t.pos}
                y2={tickH}
                stroke={tickColor}
                strokeWidth={t.major ? 0.04 : 0.025}
                vectorEffect="non-scaling-stroke"
              />
              {t.major && t.label && (
                <text
                  x={t.pos}
                  y={0.92}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  fontSize={0.42}
                  fill={labelColor}
                  fontWeight={600}
                  style={{ paintOrder: 'stroke', fontFamily: 'system-ui, sans-serif' }}
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default PreviewRulerFrame;
