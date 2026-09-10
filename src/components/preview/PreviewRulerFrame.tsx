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
  bandPx = 28,
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

  // Crisp-text strategy:
  //   The canvas itself is a normal in-flow child whose intrinsic size
  //   (set via padding-bottom aspect-ratio by the caller) drives the
  //   wrapper's height. Rulers are rendered as plain HTML / CSS overlays
  //   absolutely positioned over the padded gutters — NOT inside a
  //   `preserveAspectRatio="none"` SVG — so labels and tick lines render
  //   at 1:1 device pixels and never get stretched horizontally on the
  //   bottom ruler or vertically on the left ruler.
  //
  // Tick/label positioning is expressed as a percentage along the axis
  // (`pos / lengthIn * 100%`) so the rulers stay perfectly aligned with
  // the canvas at any zoom level or resize.
  //
  // CRITICAL — canvas-locked ruler bounds:
  //   The rulers MUST measure the printable canvas only, not the entire
  //   wrapper (which may be taller than the canvas because children like
  //   `ArtworkPreviewEditor` render a controls pill below the canvas in
  //   normal flow). To guarantee ruler 0 sits exactly on the canvas's
  //   top-left corner and ruler endpoint sits exactly on the canvas's
  //   bottom-right corner, we:
  //     1. Define an explicit canvas slot whose height is locked to the
  //        print aspect ratio via `paddingBottom = (heightIn/widthIn) * 100%`.
  //     2. Render `children` absolutely positioned inside that slot
  //        (`inset: 0`) so the canvas content fills it exactly.
  //     3. Render the rulers absolutely on the gutters surrounding the
  //        canvas slot — left ruler height = canvas slot height, bottom
  //        ruler width = canvas slot width.
  //   Anything the children render BELOW their own canvas (e.g. the
  //   absolute-positioned overlay toolbar in `ArtworkPreviewEditor`) is
  //   visually outside the canvas slot and does not affect ruler size.
  const tickColor = '#475569';
  const labelColor = '#1e293b';
  const labelFont = '10px/1 system-ui, -apple-system, "Segoe UI", sans-serif';
  const majorTickPx = 8;
  const minorTickPx = 4;
  const aspectPct = `${(heightIn / widthIn) * 100}%`;

  return (
    <div
      className={className}
      style={{
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Padded frame: bandPx of left/bottom gutter for the rulers. */}
      <div
        style={{
          position: 'relative',
          paddingLeft: bandPx,
          paddingBottom: bandPx,
          boxSizing: 'border-box',
        }}
      >
        {/* Canvas slot — width = parent content width, height locked to
            the print aspect ratio. This is the SINGLE SOURCE OF TRUTH
            for canvas bounds; rulers and children both reference it. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: aspectPct,
          }}
        >
          {/* Children fill the canvas slot exactly. Anything the child
              renders outside this absolute box (e.g. an overlay toolbar)
              spills visually but does NOT influence ruler sizing. */}
          <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
        </div>

        {/* Left vertical ruler — exactly the canvas slot's height. Ticks
            point RIGHT toward the canvas; labels sit to the LEFT of the ticks. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: bandPx,
            height: `calc(100% - ${bandPx}px)`,
            pointerEvents: 'none',
            font: labelFont,
            color: labelColor,
          }}
          aria-hidden="true"
        >
          {verticalTicks.map((t, i) => {
            const pct = (t.pos / heightIn) * 100;
            const tickW = t.major ? majorTickPx : minorTickPx;
            return (
              <React.Fragment key={`v-${i}`}>
                <div
                  style={{
                    position: 'absolute',
                    top: `${pct}%`,
                    right: 0,
                    width: tickW,
                    height: t.major ? 1 : 1,
                    background: tickColor,
                    transform: 'translateY(-0.5px)',
                    opacity: t.major ? 1 : 0.55,
                  }}
                />
                {t.major && t.label && (
                  <span
                    style={{
                      position: 'absolute',
                      top: `${pct}%`,
                      right: majorTickPx + 3,
                      transform: 'translateY(-50%)',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Bottom horizontal ruler — exactly the canvas slot's width. Ticks
            point UP toward the canvas; labels sit BELOW the ticks. */}
        <div
          style={{
            position: 'absolute',
            left: bandPx,
            bottom: 0,
            width: `calc(100% - ${bandPx}px)`,
            height: bandPx,
            pointerEvents: 'none',
            font: labelFont,
            color: labelColor,
          }}
          aria-hidden="true"
        >
          {horizontalTicks.map((t, i) => {
            const pct = (t.pos / widthIn) * 100;
            const tickH = t.major ? majorTickPx : minorTickPx;
            return (
              <React.Fragment key={`h-${i}`}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    top: 0,
                    height: tickH,
                    width: 1,
                    background: tickColor,
                    transform: 'translateX(-0.5px)',
                    opacity: t.major ? 1 : 0.55,
                  }}
                />
                {t.major && t.label && (
                  <span
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: majorTickPx + 2,
                      transform: 'translateX(-50%)',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PreviewRulerFrame;
