import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cartSyncService, type CartSnapshotResult } from '@/lib/cartSync';
import {
  cartItemHasArtwork,
  normalizeCaptureContact,
  readStoredAbandonedCartRecoveryAttribution,
  readStoredAbandonedCartId,
  type AbandonedCartRecoveryAttribution,
  type AbandonedCartContact,
  type AbandonedCartStage,
} from '@/lib/abandonedCartCapture';
import { useCartStore } from '@/store/cart';

type UseAbandonedCartCaptureOptions = {
  customer: AbandonedCartContact;
  estimatedTotalCents: number;
};

type AbandonedCartCapture = {
  markPaymentStarted: (contact?: AbandonedCartContact | null) => Promise<CartSnapshotResult | null>;
  getCartId: () => string | null;
  getSessionId: () => string | null;
  getRecoveryAttribution: () => AbandonedCartRecoveryAttribution | null;
};

const CAPTURE_DEBOUNCE_MS = 300;

export const useAbandonedCartCapture = ({
  customer,
  estimatedTotalCents,
}: UseAbandonedCartCaptureOptions): AbandonedCartCapture => {
  const store = useCartStore();
  const {
    items,
    discountCode,
    sameDayHitService,
    saturdayDelivery,
  } = store;
  const subtotalCents = store.getSubtotalCents();
  const taxCents = store.getTaxCents();
  const discountCents = store.getResolvedDiscount().appliedDiscountAmountCents;
  const normalizedCustomer = normalizeCaptureContact(customer);
  const latestRef = useRef({
    items,
    customer: normalizedCustomer,
    subtotalCents,
    discountCents,
    taxCents,
    estimatedTotalCents,
  });
  latestRef.current = {
    items,
    customer: normalizedCustomer,
    subtotalCents,
    discountCents,
    taxCents,
    estimatedTotalCents,
  };

  const cartFingerprint = useMemo(() => JSON.stringify({
    discount: discountCode?.code || null,
    sameDayHitService,
    saturdayDelivery,
    items: items.map((item) => ({
      id: item.id,
      productType: item.product_type || 'banner',
      width: item.width_in,
      height: item.height_in,
      material: item.material,
      quantity: item.quantity,
      lineTotalCents: item.line_total_cents,
      artwork: cartItemHasArtwork(item),
    })),
  }), [discountCode?.code, items, sameDayHitService, saturdayDelivery]);

  const saveProgress = useCallback((
    stage: AbandonedCartStage,
    contact?: AbandonedCartContact | null,
  ) => {
    const latest = latestRef.current;
    return cartSyncService.saveCheckoutProgress(latest.items, {
      stage,
      contact: contact || latest.customer,
      totals: {
        subtotalCents: latest.subtotalCents,
        discountCents: latest.discountCents,
        taxCents: latest.taxCents,
        estimatedTotalCents: latest.estimatedTotalCents,
      },
      metadata: { source: 'checkout' },
    });
  }, []);

  // Register arrival at checkout immediately, even before the customer has
  // entered contact details. Subsequent updates can only advance this stage.
  useEffect(() => {
    if (items.length === 0) return;
    void saveProgress('checkout');
    // This is intentionally mount-only. Cart/totals updates are handled by the
    // bounded debounced effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep dimensions, quantity, material, artwork, discounts, and totals fresh.
  // Once a valid email exists, the same update also advances the funnel to the
  // contact stage. An invalid partial address is never persisted as an email.
  useEffect(() => {
    if (items.length === 0) return;
    const timeout = window.setTimeout(() => {
      void saveProgress(normalizedCustomer.email ? 'contact' : 'checkout');
    }, CAPTURE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [
    cartFingerprint,
    discountCents,
    estimatedTotalCents,
    items.length,
    normalizedCustomer.email,
    normalizedCustomer.firstName,
    normalizedCustomer.lastName,
    normalizedCustomer.phone,
    saveProgress,
    subtotalCents,
    taxCents,
  ]);

  // Flush the latest valid contact if the tab is closed or backgrounded
  // inside the debounce window. `keepalive` on the underlying request makes
  // this best-effort send safe during page teardown.
  useEffect(() => {
    const flush = () => {
      const latest = latestRef.current;
      if (latest.items.length > 0 && latest.customer.email) {
        void saveProgress('contact');
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveProgress]);

  const markPaymentStarted = useCallback((contact?: AbandonedCartContact | null) => (
    saveProgress('payment_started', contact)
  ), [saveProgress]);

  return {
    markPaymentStarted,
    getCartId: readStoredAbandonedCartId,
    getSessionId: () => (
      cartSyncService.getExistingSessionId()
      || (cartSyncService.getUserId() ? null : cartSyncService.getSessionId())
      || null
    ),
    getRecoveryAttribution: readStoredAbandonedCartRecoveryAttribution,
  };
};
