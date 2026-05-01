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
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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
}

const ProductPreviewLightbox: React.FC<ProductPreviewLightboxProps> = ({
  isOpen,
  onClose,
  title,
  details,
  children,
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

      {/* Panel */}
      <div
        className={`relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl transition-all duration-200 ease-out transform ${
          entered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
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

          {/* Enlarged preview */}
          <div className="flex items-center justify-center w-full overflow-hidden">
            {children}
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
