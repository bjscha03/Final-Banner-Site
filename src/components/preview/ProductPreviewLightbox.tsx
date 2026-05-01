/**
 * ProductPreviewLightbox
 *
 * Reusable modal/lightbox that displays an enlarged version of a product
 * design preview alongside its product details (name, size, material,
 * quantity, add-ons, etc.).
 *
 * Behavior:
 *  - Centered modal on desktop, near-full-width responsive modal on mobile.
 *  - Dark backdrop (semi-transparent + blur).
 *  - Closes on backdrop click, close button, and Escape key.
 *  - Locks background page scroll while open.
 *  - Renders via React Portal so it always overlays everything else.
 *  - Smooth fade + scale animation using CSS transitions (no extra deps).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * FitToContainer
 *
 * Scales an arbitrary natural-size child down with CSS `transform: scale()` so
 * that it never exceeds the dimensions of its parent slot. Used inside the
 * lightbox so that fixed-pixel previews (e.g., a 820px BannerPreview) shrink
 * to fit on portrait mobile viewports without being horizontally cropped.
 *
 * The scale is applied uniformly so the preview keeps its aspect ratio and any
 * absolutely positioned overlays (such as grommets) stay aligned and visible.
 *
 * The wrapper itself takes `width: 100%; height: 100%` so the parent (which
 * reserves a slot of an explicit aspect ratio derived from product
 * dimensions) controls layout. This means the slot height is guaranteed by
 * CSS even on the first paint, before the BannerPreview's image has loaded —
 * preventing the "thin strip" mobile collapse where the wrapper's height
 * collapses to zero waiting for content measurement.
 */
const FitToContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Start at 0 so the natural-size BannerPreview never paints unscaled — even
  // for the single frame between mount and the first useLayoutEffect — which
  // would otherwise overflow the slot and get clipped by `overflow: hidden`,
  // hiding edge content like grommets.
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const recompute = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const naturalWidth = content.offsetWidth;
      const naturalHeight = content.offsetHeight;
      // Only require width measurements. The slot reserves its height via
      // CSS `aspect-ratio` matching the BannerPreview's intrinsic ratio, so
      // a width-only scale produces a perfectly fitting result. Some
      // browsers (notably older Safari) momentarily report `clientHeight`
      // as 0 for an element sized via `aspect-ratio` whose child uses
      // `height: 100%`; gating on `containerHeight` here would leave
      // `scale` stuck at the initial `1`, which would render the natural
      // 820px BannerPreview at full size centered in a small slot under
      // `overflow: hidden` — clipping the corner grommets out of view.
      if (!containerWidth || !naturalWidth || !naturalHeight) return;

      const widthScale = containerWidth / naturalWidth;
      // Use the height scale as an extra clamp only when the slot has been
      // resolved AND has been capped (e.g., by `max-height`) so its
      // effective aspect ratio is taller than the BannerPreview's.
      const heightScale =
        containerHeight > 0 ? containerHeight / naturalHeight : widthScale;
      const next = Math.min(1, widthScale, heightScale);

      setScale(next);
    };

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(content);
    window.addEventListener('resize', recompute);

    // Re-measure shortly after mount in case images load and change size.
    // 50ms catches synchronous/cached image loads; 250ms catches typical
    // network image loads inside the preview.
    const t = window.setTimeout(recompute, 50);
    const t2 = window.setTimeout(recompute, 250);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      // Fill the slot reserved by the parent (which sets width + aspect-ratio).
      // IMPORTANT: do NOT clip overflow here. BannerPreview's grommet overlays
      // are absolutely positioned at the banner corners with
      // `transform: translate(-50%, -50%)`, so half of each corner grommet
      // visually extends outside the previewWidth×previewHeight box. Once the
      // viewport is sized so FitToContainer's scale lands at 1, the slot is
      // the exact size of the BannerPreview and any `overflow: hidden` here
      // would clip those grommet halves out of view — which looked like the
      // zoom modal "removed" the grommets after a window resize. The lightbox
      // panel already has its own `overflowY: auto` + `max-height` for scroll
      // containment, so a few pixels of grommet bleed into the panel padding
      // is harmless.
      className="w-full h-full flex items-center justify-center"
    >
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          // Inline-block so offsetWidth/offsetHeight reflect the natural
          // intrinsic size of the child rather than expanding to the parent.
          display: 'inline-block',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export interface PreviewDetail {
  label: string;
  value: string;
}

export interface ProductPreviewLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional product title shown at the top of the lightbox. */
  title?: string;
  /** Optional list of product details displayed beneath the preview. */
  details?: PreviewDetail[];
  /** The enlarged preview node (typically a <BannerPreview /> with a larger maxSize). */
  children: React.ReactNode;
  /**
   * Product width in inches. Used together with `heightIn` to reserve a
   * preview slot whose CSS `aspect-ratio` matches the product. This
   * guarantees the slot has a real height on the very first paint, so the
   * preview never collapses to a thin strip on mobile while waiting for the
   * inner image to load and report its size.
   */
  widthIn?: number;
  /** Product height in inches. See `widthIn`. */
  heightIn?: number;
}

const ProductPreviewLightbox: React.FC<ProductPreviewLightboxProps> = ({
  isOpen,
  onClose,
  title,
  details,
  children,
  widthIn,
  heightIn,
}) => {
  // Drive an "entered" state one tick after mount so CSS transitions can run.
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEntered(false);
      // Delay unmount slightly so the fade-out animation can play.
      const t = window.setTimeout(() => setMounted(false), 180);
      return () => window.clearTimeout(t);
    }
    setMounted(true);
    // Next animation frame: flip to entered to trigger transitions.
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Product preview'}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel
          Sized to its content rather than to the viewport. The width is
          capped to a comfortable reading width on desktop and shrinks with
          a small page gutter on mobile, so the modal never expands into a
          mostly-empty box. Height is content-driven; we only impose a
          viewport-relative `max-height` as a scroll fallback. */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl transition-all duration-200 ease-out transform ${
          entered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
        style={{
          // `min()` clamps to the smaller of the desktop cap and the mobile
          // gutter. Using `width` (not `max-width`) gives the panel a
          // definite size so the inner `w-full` measurement target is
          // stable and the FitToContainer scale calculation is correct on
          // first paint.
          width: 'min(900px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
        }}
        // Stop clicks inside the panel from bubbling to the backdrop button
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center rounded-full bg-white/95 hover:bg-gray-100 text-gray-700 shadow-md border border-gray-200 transition-colors"
          style={{ width: 44, height: 44 }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-5 sm:p-7">
          {title && (
            <h2 className="text-lg sm:text-xl font-bold text-[#18448D] pr-12 mb-4 leading-snug break-words">
              {title}
            </h2>
          )}

          {/* Enlarged preview slot.
              The slot has an explicit `aspect-ratio` derived from the
              product dimensions so it always has a real, layout-defined
              height — even on the first paint, before the BannerPreview's
              inner <img> has loaded. This is what fixes the mobile bug
              where the preview collapsed to a thin strip waiting for
              measurement. The slot is also capped at ~70vh on tall portrait
              banners so it never pushes the close button off-screen. */}
          <div
            className="w-full"
            style={{
              aspectRatio:
                widthIn && heightIn && widthIn > 0 && heightIn > 0
                  ? `${widthIn} / ${heightIn}`
                  : undefined,
              maxHeight: '70vh',
            }}
          >
            <FitToContainer>{children}</FitToContainer>
          </div>

          {/* Details */}
          {details && details.length > 0 && (
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-gray-100 pt-4">
              {details.map((d) => (
                <div key={d.label} className="flex items-baseline gap-2 min-w-0">
                  <dt className="font-semibold text-gray-700 shrink-0">{d.label}:</dt>
                  <dd className="text-gray-700 min-w-0 break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductPreviewLightbox;
