'use client';
import React, { useMemo, useState } from 'react';
import { grommetPoints, grommetRadius, GrommetMode } from '@/lib/preview/grommets';
import { fitImage, FitMode } from '@/lib/preview/fit';

type Props = {
  widthIn: number;
  heightIn: number;
  imageUrl?: string;
  imageNaturalW?: number;
  imageNaturalH?: number;
  grommets: GrommetMode;
  fit?: FitMode;
  scalePct: number;
};

export default function LivePreview({
  widthIn: w,
  heightIn: h,
  imageUrl,
  imageNaturalW,
  imageNaturalH,
  grommets,
  fit = 'contain',
  scalePct
}: Props) {
  const [imgDimensions, setImgDimensions] = useState<{width: number, height: number} | null>(null);

  const pts = useMemo(() => grommetPoints(w, h, grommets), [w, h, grommets]);
  const r = grommetRadius(w, h);
  const sizeBadge = `${w}″ × ${h}″`;

  // Use provided dimensions or detected dimensions
  const finalImgW = imageNaturalW || imgDimensions?.width || 800;
  const finalImgH = imageNaturalH || imgDimensions?.height || 600;

  const imgAttrs = useMemo(() => {
    if (!imageUrl) return null;
    const f = fitImage(w, h, finalImgW, finalImgH, fit);
    return { ...f, href: imageUrl };
  }, [imageUrl, finalImgW, finalImgH, w, h, fit]);

  const handleImageLoad = (e: React.SyntheticEvent<SVGImageElement>) => {
    if (!imageNaturalW || !imageNaturalH) {
      const tempImg = new Image();
      tempImg.onload = () => {
        setImgDimensions({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
      };
      tempImg.src = imageUrl || '';
    }
  };

  return (
    <div className="rounded-2xl border bg-white shadow-inner p-4">
      <div
        className="mx-auto origin-top"
        style={{
          width: '100%',
          transform: `scale(${scalePct / 100})`,
          transformOrigin: 'top center'
        }}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-auto border border-gray-200 rounded-lg"
          style={{ maxWidth: '100%', height: 'auto' }}
        >
          {/* banner background */}
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill="#ffffff"
            stroke="#e5e7eb"
            strokeWidth={0.1}
          />

          {/* safe area / hem (1") */}
          <rect
            x={1}
            y={1}
            width={w - 2}
            height={h - 2}
            fill="none"
            stroke="#d1d5db"
            strokeDasharray="0.3 0.3"
            strokeWidth={0.05}
          />

          {/* artwork */}
          {imgAttrs && (
            <image
              href={imgAttrs.href}
              x={imgAttrs.x}
              y={imgAttrs.y}
              width={imgAttrs.w}
              height={imgAttrs.h}
              preserveAspectRatio="xMidYMid meet"
              onLoad={handleImageLoad}
            />
          )}

          {/* placeholder when no image */}
          {!imageUrl && (
            <g>
              <rect
                x={2}
                y={2}
                width={w - 4}
                height={h - 4}
                fill="#f9fafb"
                stroke="#d1d5db"
                strokeWidth={0.1}
                strokeDasharray="0.5 0.5"
              />
              <text
                x={w / 2}
                y={h / 2}
                fontSize={Math.min(w, h) * 0.06}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#6b7280"
                fontFamily="system-ui, sans-serif"
              >
                Upload artwork to preview
              </text>
            </g>
          )}

          {/* grommets - more prominent */}
          {pts.map((p, i) => (
            <g key={i}>
              {/* Shadow */}
              <circle cx={p.x + 0.02} cy={p.y + 0.02} r={r} fill="#000000" opacity="0.3" />
              {/* Outer ring */}
              <circle cx={p.x} cy={p.y} r={r} fill="#6b7280" stroke="#374151" strokeWidth={0.03} />
              {/* Inner hole */}
              <circle cx={p.x} cy={p.y} r={r * 0.65} fill="#ffffff" stroke="#9ca3af" strokeWidth={0.02} />
              {/* Highlight */}
              <circle cx={p.x - r * 0.25} cy={p.y - r * 0.25} r={r * 0.25} fill="white" opacity="0.8" />
            </g>
          ))}

          {/* size badge */}
          <g>
            <rect
              x={w - 3}
              y={0.3}
              width={2.7}
              height={0.8}
              rx={0.15}
              fill="#1f2937"
              opacity="0.9"
            />
            <text
              x={w - 1.65}
              y={0.75}
              fontSize={Math.min(0.35, w * 0.02)}
              textAnchor="middle"
              fill="#ffffff"
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
            >
              {sizeBadge}
            </text>
          </g>
        </svg>
      </div>

      {/* footer meta */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>Actual size: <strong>{sizeBadge}</strong></span>
        <span>Preview scale: <strong>{scalePct}%</strong></span>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-md bg-blue-600/10 px-2.5 py-1 text-xs font-medium text-blue-700">
          {pts.length} grommets
        </span>
        {grommets !== 'none' && (
          <span className="inline-flex items-center rounded-md bg-green-600/10 px-2.5 py-1 text-xs font-medium text-green-700">
            1″ inset
          </span>
        )}
        {(grommets === 'every-1-2ft' || grommets === 'every-2-3ft') && (
          <span className="inline-flex items-center rounded-md bg-purple-600/10 px-2.5 py-1 text-xs font-medium text-purple-700">
            {grommets === 'every-1-2ft' ? '18″' : '24″'} spacing
          </span>
        )}
        {fit === 'stretch' && (
          <span className="inline-flex items-center rounded-md bg-amber-600/10 px-2.5 py-1 text-xs font-medium text-amber-700">
            ⚠️ Stretched
          </span>
        )}
      </div>
    </div>
  );
}
