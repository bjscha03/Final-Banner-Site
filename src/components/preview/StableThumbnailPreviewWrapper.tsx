import React, { useCallback, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { buildCommercePreviewUrl, isRawPdfPreviewSource } from '@/lib/commercePreviewUrl';
import { dedupePreviewImageSources, preloadPreviewImage } from '@/lib/previewImageCache';
import StableProductPreviewLightbox, {
  type PreviewDetail,
} from './StableProductPreviewLightbox';

export interface ThumbnailPreviewWrapperProps {
  children: React.ReactNode;
  largePreview?: React.ReactNode;
  renderLargePreview?: () => React.ReactNode;
  title?: string;
  details?: PreviewDetail[];
  className?: string;
  ariaLabel?: string;
  widthIn?: number;
  heightIn?: number;
}

function collectPreviewSources(node: React.ReactNode, output: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return output;
  if (Array.isArray(node)) {
    node.forEach((child) => collectPreviewSources(child, output));
    return output;
  }
  if (!React.isValidElement(node)) return output;

  const props = node.props as Record<string, unknown>;
  for (const key of ['imageUrl', 'src', 'previewUrl', 'thumbnailUrl', 'webPreviewUrl']) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) output.push(value.trim());
  }
  collectPreviewSources(props.children as React.ReactNode, output);
  return output;
}

const StableThumbnailPreviewWrapper: React.FC<ThumbnailPreviewWrapperProps> = ({
  children,
  largePreview,
  renderLargePreview,
  title,
  details,
  className = '',
  ariaLabel = 'Enlarge preview',
  widthIn,
  heightIn,
}) => {
  const [open, setOpen] = useState(false);

  const createLargePreview = useCallback(
    () => renderLargePreview ? renderLargePreview() : largePreview,
    [renderLargePreview, largePreview],
  );

  const prefetchLargePreview = useCallback(() => {
    const node = createLargePreview();
    const rawSources = collectPreviewSources(node);
    const candidates = dedupePreviewImageSources(rawSources.flatMap((source) => [
      buildCommercePreviewUrl(source, 900),
      isRawPdfPreviewSource(source) ? null : source,
    ]));

    candidates.forEach((candidate) => {
      void preloadPreviewImage(candidate, {
        timeoutMs: 20_000,
        fetchPriority: 'high',
      }).catch(() => {
        // The preview component has its own ordered fallback chain. Prefetch is
        // opportunistic and must never block opening the modal.
      });
    });
  }, [createLargePreview]);

  const handleOpen = (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    prefetchLargePreview();
    setOpen(true);
  };

  const renderedLargePreview = open ? createLargePreview() : null;

  return (
    <>
      <div
        className={`group relative inline-block ${className}`}
        onPointerEnter={prefetchLargePreview}
        onPointerDown={prefetchLargePreview}
        onFocus={prefetchLargePreview}
      >
        {children}

        <button
          type="button"
          onClick={handleOpen}
          aria-label={ariaLabel}
          className="absolute inset-0 z-10 cursor-zoom-in rounded-lg bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D] focus-visible:ring-offset-2"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1.5 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#18448D] opacity-90 shadow-md sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <ZoomIn className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>

      <StableProductPreviewLightbox
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        details={details}
        widthIn={widthIn}
        heightIn={heightIn}
      >
        {renderedLargePreview}
      </StableProductPreviewLightbox>
    </>
  );
};

export default StableThumbnailPreviewWrapper;
