import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDocumentScrollLock } from '@/hooks/useDocumentScrollLock';

export interface PreviewDetail {
  label: string;
  value: string;
}

export interface ProductPreviewLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  details?: PreviewDetail[];
  children: React.ReactNode;
  widthIn?: number;
  heightIn?: number;
}

const StableProductPreviewLightbox: React.FC<ProductPreviewLightboxProps> = ({
  isOpen,
  onClose,
  title,
  details,
  children,
  widthIn,
  heightIn,
}) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useDocumentScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);

    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const safeWidth = Number(widthIn) > 0 ? Number(widthIn) : null;
  const safeHeight = Number(heightIn) > 0 ? Number(heightIn) : null;
  const ratio = safeWidth && safeHeight ? safeWidth / safeHeight : null;
  const previewWidth = ratio && ratio < 1
    ? `min(100%, calc((100dvh - 140px) * ${ratio}))`
    : '100%';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        paddingTop: 'max(8px, env(safe-area-inset-top))',
        paddingRight: 'max(8px, env(safe-area-inset-right))',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(8px, env(safe-area-inset-left))',
        touchAction: 'pan-y',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Product preview'}
      data-expanded-product-preview="true"
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-[900px] overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-2xl"
        style={{
          maxHeight: 'calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute right-3 top-3 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-md hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D] focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-4 sm:p-7">
          {title && (
            <h2
              id={titleId}
              className="mb-4 break-words pr-12 text-lg font-bold leading-snug text-[#18448D] sm:text-xl"
            >
              {title}
            </h2>
          )}

          <div className="flex w-full justify-center overflow-hidden">
            <div
              className="min-w-0"
              style={{
                width: previewWidth,
                maxWidth: '100%',
              }}
              data-expanded-preview-canvas="true"
            >
              {children}
            </div>
          </div>

          {details && details.length > 0 && (
            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm sm:grid-cols-2">
              {details.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} className="flex min-w-0 items-baseline gap-2">
                  <dt className="shrink-0 font-semibold text-gray-700">{detail.label}:</dt>
                  <dd className="min-w-0 break-words text-gray-700">{detail.value}</dd>
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

export default StableProductPreviewLightbox;
