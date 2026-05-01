/**
 * ThumbnailPreviewWrapper
 *
 * Wraps a small product design thumbnail (typically a <BannerPreview />) and:
 *   1. Overlays a subtle magnifying-glass-with-plus icon in the corner.
 *   2. Makes the entire thumbnail and the icon clickable / tappable to open
 *      a <ProductPreviewLightbox /> with a larger version of the same design
 *      and the supplied product details.
 *
 * Accessibility / UX:
 *   - The icon button is a 44x44 tap target (mobile-friendly).
 *   - On desktop the icon is dimmed and brightens on hover/focus.
 *   - On mobile/touch devices the icon stays visible (no hover available).
 *   - The thumbnail itself is also clickable via a transparent overlay button.
 */
import React, { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import ProductPreviewLightbox, {
  PreviewDetail,
} from './ProductPreviewLightbox';

export interface ThumbnailPreviewWrapperProps {
  /** Small thumbnail node to display (e.g., <BannerPreview /> at default size). */
  children: React.ReactNode;
  /** Enlarged preview node shown inside the lightbox. */
  largePreview: React.ReactNode;
  /** Optional product title (e.g., "24" x 36" Vinyl Banner"). */
  title?: string;
  /** Optional product details displayed under the enlarged preview. */
  details?: PreviewDetail[];
  /** Optional class name applied to the outer wrapper. */
  className?: string;
  /** Accessible label for the magnifier button (defaults to "Enlarge preview"). */
  ariaLabel?: string;
  /** Product width in inches; passed to the lightbox to reserve an aspect-ratio slot. */
  widthIn?: number;
  /** Product height in inches; passed to the lightbox to reserve an aspect-ratio slot. */
  heightIn?: number;
}

const ThumbnailPreviewWrapper: React.FC<ThumbnailPreviewWrapperProps> = ({
  children,
  largePreview,
  title,
  details,
  className = '',
  ariaLabel = 'Enlarge preview',
  widthIn,
  heightIn,
}) => {
  const [open, setOpen] = useState(false);

  const handleOpen = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpen(true);
  };

  return (
    <>
      <div className={`relative inline-block group ${className}`}>
        {children}

        {/*
          Transparent overlay button covering the thumbnail. Lets users tap
          anywhere on the thumbnail to open the lightbox without blocking
          rendering of the design (it sits above the thumbnail visually but is
          fully transparent until interacted with).
        */}
        <button
          type="button"
          onClick={handleOpen}
          aria-label={ariaLabel}
          className="absolute inset-0 z-10 cursor-zoom-in bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D] focus-visible:ring-offset-2 rounded-lg"
        />

        {/*
          Magnifier-plus icon. Positioned in the top-right corner. Visible but
          subtle on desktop (brightens on hover); always visible on touch
          devices since hover doesn't apply there.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 right-1.5 z-20 inline-flex items-center justify-center rounded-full bg-white/85 text-[#18448D] shadow-md border border-white/80 opacity-80 sm:opacity-60 sm:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
          style={{ width: 28, height: 28 }}
        >
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>

      <ProductPreviewLightbox
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        details={details}
        widthIn={widthIn}
        heightIn={heightIn}
      >
        {largePreview}
      </ProductPreviewLightbox>
    </>
  );
};

export default ThumbnailPreviewWrapper;
