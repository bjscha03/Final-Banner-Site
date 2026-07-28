import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { Grommets, TextElement } from '@/store/quote';
import { grommetRadius as calcGrommetRadius } from '@/lib/preview/grommets';
import {
  buildCommercePreviewUrl,
  isRawPdfPreviewSource,
} from '@/lib/commercePreviewUrl';

const BRAND_BLUE = '#18448D';

interface BannerPreviewProps {
  widthIn: number;
  heightIn: number;
  grommets: Grommets;
  imageUrl?: string;
  material?: string;
  isLoading?: boolean;
  className?: string;
  textElements?: TextElement[];
  overlayImage?: {
    url: string;
    position: { x: number; y: number };
    scale: number;
    aspectRatio?: number;
  };
  imageScale?: number;
  imageScaleY?: number;
  imagePosition?: { x: number; y: number };
  fitMode?: 'fill' | 'fit' | 'stretch';
  designServiceEnabled?: boolean;
  source?: string;
  /** A positioned/finalized snapshot already contains the approved composition. */
  isFinalizedSnapshot?: boolean;
  /** Maximum width/height of the preview frame in pixels. */
  maxSize?: number;
}

interface Point {
  x: number;
  y: number;
}

function calculateGrommetPoints(w: number, h: number, mode: Grommets): Point[] {
  const margin = 1;
  const corners: Point[] = [
    { x: margin, y: margin },
    { x: w - margin, y: margin },
    { x: margin, y: h - margin },
    { x: w - margin, y: h - margin },
  ];

  if (mode === 'none') return [];
  if (mode === '4-corners') return corners;
  if (mode === 'top-corners') return [corners[0], corners[1]];
  if (mode === 'bottom-corners') return [corners[2], corners[3]];
  if (mode === 'left-corners') return [corners[0], corners[2]];
  if (mode === 'right-corners') return [corners[1], corners[3]];

  const spacing = mode === 'every-1-2ft' ? 18 : 24;
  const points: Point[] = [...corners];
  const usableWidth = Math.max(0, w - margin * 2);
  const usableHeight = Math.max(0, h - margin * 2);
  const widthCount = Math.floor(usableWidth / spacing);
  const heightCount = Math.floor(usableHeight / spacing);

  if (widthCount > 0) {
    const step = usableWidth / (widthCount + 1);
    for (let index = 1; index <= widthCount; index += 1) {
      const x = margin + index * step;
      points.push({ x, y: margin }, { x, y: h - margin });
    }
  }

  if (heightCount > 0) {
    const step = usableHeight / (heightCount + 1);
    for (let index = 1; index <= heightCount; index += 1) {
      const y = margin + index * step;
      points.push({ x: margin, y }, { x: w - margin, y });
    }
  }

  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const BannerPreview: React.FC<BannerPreviewProps> = ({
  widthIn,
  heightIn,
  grommets,
  imageUrl,
  isLoading = false,
  className = '',
  textElements = [],
  overlayImage,
  imageScale = 1,
  imageScaleY,
  imagePosition = { x: 0, y: 0 },
  fitMode = 'fill',
  designServiceEnabled = false,
  isFinalizedSnapshot = false,
  maxSize: maxSizeProp,
}) => {
  const safeWidth = Number.isFinite(widthIn) && widthIn > 0 ? widthIn : 1;
  const safeHeight = Number.isFinite(heightIn) && heightIn > 0 ? heightIn : 1;
  const aspectRatio = safeWidth / safeHeight;
  const maxSize = Math.max(80, maxSizeProp ?? 200);
  const previewWidth = aspectRatio >= 1 ? maxSize : maxSize * aspectRatio;
  const framePaddingBottom = `${(safeHeight / safeWidth) * 100}%`;

  const optimizedUrl = useMemo(
    () => buildCommercePreviewUrl(imageUrl, maxSize),
    [imageUrl, maxSize],
  );
  const [activeUrl, setActiveUrl] = useState<string | null>(optimizedUrl);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setActiveUrl(optimizedUrl);
    setImageError(false);
  }, [optimizedUrl]);

  const grommetPoints = useMemo(
    () => calculateGrommetPoints(safeWidth, safeHeight, grommets),
    [safeWidth, safeHeight, grommets],
  );
  const grommetRadius = calcGrommetRadius(safeWidth, safeHeight);

  const isImmediateSnapshot = Boolean(imageUrl?.startsWith('data:image/'));
  const isApprovedSnapshot = isImmediateSnapshot || isFinalizedSnapshot;
  const scaleX = Number.isFinite(imageScale) && imageScale > 0 ? imageScale : 1;
  const requestedScaleY = imageScaleY ?? scaleX;
  const scaleY = Number.isFinite(requestedScaleY) && requestedScaleY > 0
    ? requestedScaleY
    : scaleX;
  const x = Number.isFinite(imagePosition?.x) ? imagePosition.x : 0;
  const y = Number.isFinite(imagePosition?.y) ? imagePosition.y : 0;

  const overlay = useMemo(() => {
    if (!overlayImage?.url || !overlayImage.position) return null;
    const aspect = Number(overlayImage.aspectRatio) > 0 ? Number(overlayImage.aspectRatio) : 1;
    const baseDimension = Math.min(safeWidth, safeHeight);
    const overlayScale = Number(overlayImage.scale) > 0 ? Number(overlayImage.scale) : 0.3;
    const overlayWidthIn = aspect >= 1
      ? baseDimension * overlayScale * aspect
      : baseDimension * overlayScale;
    const overlayHeightIn = aspect >= 1
      ? baseDimension * overlayScale
      : baseDimension * overlayScale / aspect;
    const leftIn = (safeWidth * overlayImage.position.x / 100) - overlayWidthIn / 2;
    const topIn = (safeHeight * overlayImage.position.y / 100) - overlayHeightIn / 2;

    return {
      url: buildCommercePreviewUrl(overlayImage.url, Math.min(1200, maxSize)),
      left: `${(leftIn / safeWidth) * 100}%`,
      top: `${(topIn / safeHeight) * 100}%`,
      width: `${(overlayWidthIn / safeWidth) * 100}%`,
      height: `${(overlayHeightIn / safeHeight) * 100}%`,
    };
  }, [overlayImage, safeWidth, safeHeight, maxSize]);

  const handleImageError = () => {
    // A transformed Cloudinary derivative should be used on phones. If that
    // derivative is temporarily unavailable, retry the original image once for
    // non-PDF artwork before showing the placeholder.
    if (
      activeUrl
      && imageUrl
      && activeUrl !== imageUrl
      && !isRawPdfPreviewSource(imageUrl)
    ) {
      setActiveUrl(imageUrl);
      return;
    }
    setImageError(true);
  };

  const imageObjectFit: React.CSSProperties['objectFit'] = isApprovedSnapshot
    ? 'fill'
    : fitMode === 'stretch'
      ? 'fill'
      : 'contain';

  return (
    <div className={`flex min-w-0 items-center justify-center ${className}`}>
      {/*
        Do not use CSS aspect-ratio for this frame. Mobile Safari can collapse
        an aspect-ratio element to zero height when every child is absolutely
        positioned inside an overflow-hidden flex/modal container. The
        padding-bottom technique reserves real layout height before the image
        loads and works consistently in the upsell, cart, and checkout.
      */}
      <div
        className="min-w-0 max-w-full"
        style={{
          width: `${previewWidth}px`,
          maxWidth: '100%',
        }}
      >
        <div
          className="relative w-full overflow-hidden rounded-lg border-2 border-gray-200 bg-white shadow-lg"
          style={{
            paddingBottom: framePaddingBottom,
            minHeight: '1px',
          }}
          aria-label="Banner preview"
        >
          {designServiceEnabled ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-2 text-center">
              <div
                className="absolute inset-0 opacity-5"
                style={{
                  backgroundImage: `repeating-linear-gradient(45deg, ${BRAND_BLUE} 0, ${BRAND_BLUE} 1px, transparent 0, transparent 50%)`,
                  backgroundSize: '10px 10px',
                }}
              />
              <div className="relative z-10">
                <p className="text-sm font-bold sm:text-base" style={{ color: BRAND_BLUE }}>
                  Your Custom Design
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {safeWidth}&quot; × {safeHeight}&quot;
                </p>
              </div>
            </div>
          ) : activeUrl && !imageError ? (
            <div
              className="absolute inset-0 h-full w-full"
              style={{
                transform: isApprovedSnapshot
                  ? undefined
                  : `translate(${x}%, ${y}%) scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'center center',
              }}
            >
              <img
                key={activeUrl}
                src={activeUrl}
                alt="Banner preview"
                className="absolute inset-0 block h-full w-full"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: imageObjectFit,
                }}
                draggable={false}
                loading="eager"
                decoding="async"
                onLoad={() => setImageError(false)}
                onError={handleImageError}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading preview" />
              ) : (
                <div className="text-center">
                  <ImageIcon className="mx-auto h-6 w-6" />
                  <span className="mt-1 block text-[10px]">Preview unavailable</span>
                </div>
              )}
            </div>
          )}

          {overlay?.url && (
            <img
              src={overlay.url}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-[5] block object-contain"
              style={{
                left: overlay.left,
                top: overlay.top,
                width: overlay.width,
                height: overlay.height,
                display: 'block',
              }}
              loading="eager"
              decoding="async"
            />
          )}

          <svg
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            viewBox={`0 0 ${safeWidth} ${safeHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {textElements.map((textElement, index) => {
              const fontSize = Math.max(
                safeHeight * 0.02,
                Number(textElement.fontSize || 24) * (safeHeight / 400),
              );
              const textAnchor = textElement.textAlign === 'center'
                ? 'middle'
                : textElement.textAlign === 'right'
                  ? 'end'
                  : 'start';

              return (
                <text
                  key={textElement.id || `preview-text-${index}`}
                  x={(safeWidth * Number(textElement.xPercent || 0)) / 100}
                  y={(safeHeight * Number(textElement.yPercent || 0)) / 100}
                  fontSize={fontSize}
                  fontFamily={textElement.fontFamily || 'system-ui, sans-serif'}
                  fill={textElement.color || '#111827'}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  fontWeight={textElement.fontWeight || 'normal'}
                >
                  {textElement.content}
                </text>
              );
            })}

            {grommetPoints.map((point, index) => (
              <g key={`preview-grommet-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={grommetRadius * 1.25}
                  fill="#4b5563"
                  stroke="#111827"
                  strokeWidth={Math.max(grommetRadius * 0.08, 0.02)}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={grommetRadius * 0.68}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  strokeWidth={Math.max(grommetRadius * 0.04, 0.01)}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default BannerPreview;
