import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Eye, Tag } from 'lucide-react';
import BannerPreview from './cart/BannerPreview';
import ThumbnailPreviewWrapper from './preview/ThumbnailPreviewWrapper';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import { getItemDisplayName, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { getProductCopy, getDominantProductType } from '@/lib/product-copy';
import CartItemBreakdown from './cart/CartItemBreakdown';
import SameDayHitServiceCard from './cart/SameDayHitServiceCard';
import { getGrommetLabelForDisplay, getGrommetModeForPreview } from '@/lib/cartGrommet';
import { getExpandedPreviewSelection, getSmallPreviewSelection } from '@/lib/previewSelection';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const getFocusableElements = (container: HTMLElement): HTMLElement[] => (
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest('[inert]') || element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  })
);

const findScrollableAncestor = (
  target: EventTarget | null,
  boundary: HTMLElement,
): HTMLElement | null => {
  let element = target instanceof HTMLElement ? target : null;
  while (element && boundary.contains(element)) {
    const style = window.getComputedStyle(element);
    if (
      /auto|scroll/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1
    ) {
      return element;
    }
    if (element === boundary) break;
    element = element.parentElement;
  }
  return null;
};

const canScrollInDirection = (element: HTMLElement, deltaY: number): boolean => {
  if (deltaY < 0) return element.scrollTop > 0;
  if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  return false;
};

interface BackgroundElementState {
  element: HTMLElement;
  hadInert: boolean;
  ariaHidden: string | null;
  pointerEvents: string;
}

/**
 * Make every DOM branch outside the drawer unavailable to pointer and
 * assistive-technology navigation while preserving its exact prior state.
 * Walking ancestor-by-ancestor also covers portals mounted beside #root.
 */
const makeBackgroundInert = (dialog: HTMLElement): (() => void) => {
  const states: BackgroundElementState[] = [];
  let activeBranch: HTMLElement | null = dialog;

  while (activeBranch?.parentElement) {
    const parent = activeBranch.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === activeBranch) continue;
      states.push({
        element: sibling,
        hadInert: sibling.hasAttribute('inert'),
        ariaHidden: sibling.getAttribute('aria-hidden'),
        pointerEvents: sibling.style.pointerEvents,
      });
      sibling.setAttribute('inert', '');
      sibling.setAttribute('aria-hidden', 'true');
      // `inert` is supported by current evergreen browsers; pointer-events is
      // the safe fallback for older embedded Safari/WebView versions.
      sibling.style.pointerEvents = 'none';
    }
    if (parent === document.body) break;
    activeBranch = parent;
  }

  return () => {
    for (const { element, hadInert, ariaHidden, pointerEvents } of states) {
      if (!hadInert) element.removeAttribute('inert');
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
      element.style.pointerEvents = pointerEvents;
    }
  };
};

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { getMigratedItems, updateQuantity, removeItem, getSubtotalCents, getTaxCents, getTotalCents, getResolvedDiscount, getSameDayFeeCents, getSaturdayDeliveryFeeCents } = useCartStore();

  // CRITICAL: Use migrated items to ensure rope/pole pocket costs are calculated
  const items = getMigratedItems();
  const dominantProductType = getDominantProductType(items);
  const productCopy = getProductCopy(dominantProductType);

  // Cart raw subtotal (sum of line totals before any cart-level discount).
  // NOTE: Hooks stay above the conditional return so modal open/close never
  // changes React hook order.
  const cartRawSubtotalCents = useMemo(
    () => items.reduce((sum, it) => sum + (it.line_total_cents || 0), 0),
    [items],
  );

  // Banner-only raw subtotal: yard signs and car magnets do not participate in
  // banner quantity discounts.
  const bannerRawSubtotalCents = useMemo(
    () => items.reduce((sum, it) => {
      const type = (it as any).product_type || 'banner';
      if (type === 'yard_sign' || type === 'car_magnet') return sum;
      return sum + (it.line_total_cents || 0);
    }, 0),
    [items],
  );

  const contentRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [headerOffset, setHeaderOffset] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;

    const header = Array.from(document.querySelectorAll<HTMLElement>('[data-site-header]'))
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });

    const updateOffset = () => {
      const bottom = header?.getBoundingClientRect().bottom ?? 0;
      setHeaderOffset(Math.max(0, Math.round(bottom)));
    };

    updateOffset();
    const resizeObserver = header && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateOffset)
      : null;
    if (header && resizeObserver) resizeObserver.observe(header);
    window.addEventListener('resize', updateOffset);
    window.visualViewport?.addEventListener('resize', updateOffset);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOffset);
      window.visualViewport?.removeEventListener('resize', updateOffset);
    };
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    const restoreBackground = makeBackgroundInert(dialog);
    const lockedScrollY = window.scrollY;
    let restoringScroll = false;
    let lastTouchY: number | null = null;

    const eventBelongsToNestedModal = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const containingModal = target.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
      return Boolean(containingModal && containingModal !== dialog);
    };

    const hasOpenNestedModal = () => Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
    ).some((candidate) => candidate !== dialog && candidate.getClientRects().length > 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (eventBelongsToNestedModal(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = getFocusableElements(dialog);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (!['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const scrollContainer = findScrollableAncestor(document.activeElement, dialog) || contentRef.current;
      if (!scrollContainer) return;
      if (event.key === 'Home') scrollContainer.scrollTo({ top: 0 });
      else if (event.key === 'End') scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
      else scrollContainer.scrollBy({
        top: event.key === 'PageDown' ? scrollContainer.clientHeight * 0.8 : -scrollContainer.clientHeight * 0.8,
        behavior: 'auto',
      });
    };

    const preventBackgroundWheel = (event: WheelEvent) => {
      if (eventBelongsToNestedModal(event.target)) return;
      const scrollable = findScrollableAncestor(event.target, dialog);
      if (!scrollable || !canScrollInDirection(scrollable, event.deltaY)) event.preventDefault();
    };

    const captureTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const preventBackgroundTouchMove = (event: TouchEvent) => {
      if (eventBelongsToNestedModal(event.target)) return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined || lastTouchY === null) {
        event.preventDefault();
        return;
      }
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;
      const scrollable = findScrollableAncestor(event.target, dialog);
      if (!scrollable || !canScrollInDirection(scrollable, deltaY)) event.preventDefault();
    };

    const preserveDocumentScroll = () => {
      if (hasOpenNestedModal()) return;
      if (restoringScroll || Math.abs(window.scrollY - lockedScrollY) < 1) return;
      restoringScroll = true;
      window.scrollTo({ top: lockedScrollY, left: 0, behavior: 'auto' });
      window.requestAnimationFrame(() => { restoringScroll = false; });
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', preventBackgroundWheel, { capture: true, passive: false });
    document.addEventListener('touchstart', captureTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', preventBackgroundTouchMove, { capture: true, passive: false });
    window.addEventListener('scroll', preserveDocumentScroll, { passive: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', preventBackgroundWheel, true);
      document.removeEventListener('touchstart', captureTouchStart, true);
      document.removeEventListener('touchmove', preventBackgroundTouchMove, true);
      window.removeEventListener('scroll', preserveDocumentScroll);
      restoreBackground();
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    contentRef.current.scrollTop = 0;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const computeEach = (item: any): number => {
    const ropeMode = item.rope_pricing_mode || 'per_item';
    const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
    const ropeCost = item.rope_cost_cents || 0;
    const pocketCost = item.pole_pocket_cost_cents || 0;
    const perOrderCosts = (ropeMode === 'per_order' ? ropeCost : 0)
      + (pocketMode === 'per_order' ? pocketCost : 0);
    return Math.round((item.line_total_cents - perOrderCosts) / Math.max(1, item.quantity));
  };

  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();
  const resolvedDiscount = getResolvedDiscount();
  const sameDayFeeCents = getSameDayFeeCents();
  const saturdayFeeCents = getSaturdayDeliveryFeeCents();
  const hasSameDayFee = sameDayFeeCents > 0;

  return (
    <div
      ref={dialogRef}
      data-cart-modal
      className="cart-modal fixed inset-x-0 bottom-0 z-40 overflow-hidden"
      style={{ top: `${headerOffset}px` }}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
      tabIndex={-1}
    >
      <div
        data-cart-backdrop
        className="absolute inset-0 touch-none bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="cart-modal__panel absolute right-0 top-0 w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white p-6">
            <h2 className="flex items-center text-xl font-bold text-gray-900">
              <ShoppingBag className="mr-2 h-6 w-6 text-[#18448D]" /> Shopping Cart ({items.length})
            </h2>
            <button ref={closeButtonRef} onClick={onClose} aria-label="Close cart" className="rounded-lg p-2 transition-colors hover:bg-gray-100">
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>

          <div
            ref={contentRef}
            className="cart-modal__content min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain bg-gray-50 p-4 sm:p-6"
          >
            {items.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                <p className="mb-2 text-lg text-gray-600">Your cart is empty</p>
                <p className="mb-6 text-sm text-gray-500">{productCopy.emptyCartPrompt}</p>
                <button
                  onClick={onClose}
                  className="rounded-lg bg-[#ff6b35] px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-[#e16629] hover:shadow-lg"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                  <p><span className="font-medium">Preview only.</span> {productCopy.reviewNoticeBody}</p>
                </div>

                {items.map((item) => {
                  const eachCents = computeEach(item);
                  const normalized = normalizeOrderItemDisplay(item as NormalizableOrderItem);
                  const grommetLabel = getGrommetLabelForDisplay(item, normalized.grommetsDisplay);
                  const grommetMode = getGrommetModeForPreview(item);
                  const smallPreview = getSmallPreviewSelection(item);
                  const expandedPreview = getExpandedPreviewSelection(item);
                  const compositionSignature = item.placement_preview?.compositionSignature
                    || item.composition_signature;

                  return (
                    <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg transition-shadow hover:shadow-xl">
                      <div className="mb-4 flex justify-center">
                        <ThumbnailPreviewWrapper
                          title={getItemDisplayName(item)}
                          widthIn={item.width_in}
                          heightIn={item.height_in}
                          details={[
                            { label: 'Size', value: normalized.sizeDisplay },
                            { label: 'Material', value: normalized.materialDisplay },
                            { label: 'Print', value: normalized.printDisplay },
                            { label: 'Qty', value: normalized.qtyDisplay },
                            ...(normalized.uploadedDesignsCount ? [{ label: 'Uploaded Designs', value: String(normalized.uploadedDesignsCount) }] : []),
                            ...(normalized.stepStakesQty ? [{ label: 'Step Stakes', value: String(normalized.stepStakesQty) }] : []),
                            ...(normalized.productType === 'banner' ? [
                              { label: 'Grommets', value: grommetLabel },
                              { label: 'Pole Pockets', value: normalized.polePocketsDisplay },
                              { label: 'Rope', value: normalized.ropeDisplay },
                              { label: 'Hemming', value: normalized.hemmingDisplay || 'Always included' },
                            ] : []),
                            ...(normalized.roundedCornersDisplay ? [{ label: 'Rounded Corners', value: normalized.roundedCornersDisplay }] : []),
                          ]}
                          renderLargePreview={() => (
                            <div className="space-y-2">
                              {expandedPreview.isPreparingHighResolution && (
                                <p className="text-center text-xs font-medium text-amber-700">Preparing high-resolution preview…</p>
                              )}
                              {expandedPreview.isLowResolutionFallback && (
                                <p className="text-center text-xs text-amber-700">Low-resolution fallback shown until the high-resolution proof finishes.</p>
                              )}
                              <BannerPreview
                                widthIn={item.width_in}
                                heightIn={item.height_in}
                                grommets={grommetMode}
                                imageUrl={expandedPreview.url}
                                material={item.material}
                                textElements={item.text_elements}
                                overlayImage={item.overlay_image}
                                imageScale={item.image_scale}
                                imageScaleY={item.image_scale_y}
                                imagePosition={item.image_position}
                                fitMode={item.fit_mode || 'fill'}
                                className="flex-shrink-0"
                                designServiceEnabled={item.design_service_enabled}
                                source={item.source}
                                isFinalizedSnapshot={expandedPreview.isExactComposition}
                                compositionSignature={compositionSignature}
                                maxSize={820}
                              />
                            </div>
                          )}
                        >
                          <BannerPreview
                            widthIn={item.width_in}
                            heightIn={item.height_in}
                            grommets={grommetMode}
                            imageUrl={smallPreview.url}
                            material={item.material}
                            textElements={item.text_elements}
                            overlayImage={item.overlay_image}
                            imageScale={item.image_scale}
                            imageScaleY={item.image_scale_y}
                            imagePosition={item.image_position}
                            fitMode={item.fit_mode || 'fill'}
                            className="flex-shrink-0"
                            designServiceEnabled={item.design_service_enabled}
                            source={item.source}
                            isFinalizedSnapshot={smallPreview.isExactComposition}
                            compositionSignature={compositionSignature}
                          />
                        </ThumbnailPreviewWrapper>
                      </div>

                      <div className="mb-3 flex items-start justify-between">
                        <h3 className="text-base font-semibold text-gray-900">{getItemDisplayName(item)}</h3>
                        <div className="ml-4 flex-shrink-0 text-right">
                          <p className="text-lg font-bold text-[#18448D]">{usd(item.line_total_cents / 100)}</p>
                          <p className="text-xs text-gray-600">{usd(eachCents / 100)} each</p>
                        </div>
                      </div>

                      <dl className="mb-3 grid grid-cols-2 gap-2">
                        {[
                          { label: 'Size', value: normalized.sizeDisplay },
                          { label: 'Material', value: normalized.materialDisplay },
                          { label: 'Print', value: normalized.printDisplay },
                          { label: 'Qty', value: normalized.qtyDisplay },
                          ...(normalized.uploadedDesignsCount ? [{ label: 'Uploaded Designs', value: String(normalized.uploadedDesignsCount) }] : []),
                          ...(normalized.stepStakesQty ? [{ label: 'Step Stakes', value: String(normalized.stepStakesQty) }] : []),
                          ...(normalized.productType === 'banner' ? [
                            { label: 'Grommets', value: grommetLabel },
                            { label: 'Pole Pockets', value: normalized.polePocketsDisplay },
                            { label: 'Rope', value: normalized.ropeDisplay },
                          ] : []),
                          ...(normalized.roundedCornersDisplay ? [{ label: 'Rounded Corners', value: normalized.roundedCornersDisplay }] : []),
                        ].map((detail) => (
                          <div key={detail.label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                            <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{detail.label}</dt>
                            <dd className="mt-0.5 break-words text-xs font-semibold leading-4 text-slate-800">{detail.value}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className="mb-3">
                        <CartItemBreakdown
                          item={item}
                          resolvedDiscount={resolvedDiscount}
                          cartRawSubtotalCents={cartRawSubtotalCents}
                          bannerRawSubtotalCents={bannerRawSubtotalCents}
                        />
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">Qty:</span>
                          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                            <button
                              onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                              className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={item.quantity <= 1}
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold text-gray-900">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                          aria-label="Remove from cart"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="cart-modal__footer space-y-2.5 border-t border-gray-200 bg-white p-4 shadow-lg sm:space-y-3 sm:p-6">
              <SameDayHitServiceCard variant="compact" />
              <div className="flex justify-between text-gray-700">
                <span className="font-medium">Subtotal:</span>
                <span className="font-semibold">{usd(subtotalCents / 100)}</span>
              </div>
              {resolvedDiscount.appliedDiscountAmountCents > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-green-600">
                    <span className="flex items-center gap-1 font-medium"><Tag className="h-4 w-4" />{resolvedDiscount.appliedDiscountLabel}</span>
                    <span className="font-semibold">-{usd(resolvedDiscount.appliedDiscountAmountCents / 100)}</span>
                  </div>
                  {resolvedDiscount.helperMessage && <p className="text-xs italic text-gray-500">{resolvedDiscount.helperMessage}</p>}
                </div>
              )}
              <div className={`flex justify-between font-semibold ${hasSameDayFee ? 'text-slate-700' : 'text-green-600'}`}>
                <span>Shipping:</span>
                <span>{hasSameDayFee ? 'Next-Day Air Included' : 'FREE'}</span>
              </div>
              {sameDayFeeCents > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span className="font-medium">Same-Day Hit Service:</span>
                  <span className="font-semibold">+{usd(sameDayFeeCents / 100)}</span>
                </div>
              )}
              {saturdayFeeCents > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span className="font-medium">Saturday Delivery:</span>
                  <span className="font-semibold">+{usd(saturdayFeeCents / 100)}</span>
                </div>
              )}
              <div className="space-y-0.5">
                <div className="flex justify-between text-gray-700">
                  <span className="font-medium">Estimated tax:</span>
                  <span className="font-semibold">{usd(taxCents / 100)}</span>
                </div>
                <p className="text-[11px] text-slate-500">Final tax is confirmed from the shipping address at checkout.</p>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-3 text-xl font-bold">
                <span className="text-gray-900">Total:</span>
                <span className="text-[#18448D]">{usd(totalCents / 100)}</span>
              </div>

              <button
                onClick={handleCheckout}
                className="mt-4 w-full rounded-md bg-[#C94E00] py-4 text-lg font-bold text-white transition-colors hover:bg-[#B84300] hover:text-white"
              >
                Proceed to Checkout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;
