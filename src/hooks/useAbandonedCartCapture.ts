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
const CHECKOUT_HEARTBEAT_MS = 60_000;

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
  const pagehideSignaledRef = useRef(false);
  const paymentHandoffInFlightRef = useRef(false);
  const latestRef = useRef({
    items,
    customer: normalizedCustomer,
    subtotalCents,
    discountCents,
    taxCents,
    estimatedTotalCents,
    discountCode: discountCode?.code || null,
    sameDayHitService,
    saturdayDelivery,
  });
  latestRef.current = {
    items,
    customer: normalizedCustomer,
    subtotalCents,
    discountCents,
    taxCents,
    estimatedTotalCents,
    discountCode: discountCode?.code || null,
    sameDayHitService,
    saturdayDelivery,
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
    lifecycle?: { abandonmentSignal: boolean },
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
      captureKind: lifecycle ? 'lifecycle' : 'full',
      abandonmentSignal: lifecycle?.abandonmentSignal === true,
      checkoutState: {
        version: 1,
        sameDayHitService: latest.sameDayHitService,
        saturdayDelivery: latest.saturdayDelivery,
        discountCode: latest.discountCode,
      },
      metadata: { source: lifecycle ? 'checkout_lifecycle' : 'checkout' },
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

  // A visible checkout heartbeat keeps the quiet-time fallback safely in the
  // future and clears any earlier best-effort pagehide signal after a return.
  useEffect(() => {
    const heartbeat = () => {
      const latest = latestRef.current;
      if (document.visibilityState === 'visible' && latest.items.length > 0) {
        void saveProgress(latest.customer.email ? 'contact' : 'checkout');
      }
    };
    const interval = window.setInterval(heartbeat, CHECKOUT_HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pagehideSignaledRef.current = false;
        heartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveProgress]);

  // Flush the latest valid contact if the tab is closed or backgrounded
  // inside the debounce window. Only pagehide is an abandonment signal;
  // ordinary tab backgrounding is a compact durability flush and the quiet
  // heartbeat fallback decides whether the checkout was actually left.
  useEffect(() => {
    const flush = (abandonmentSignal: boolean) => {
      const latest = latestRef.current;
      if (latest.items.length > 0 && latest.customer.email) {
        void saveProgress('contact', undefined, { abandonmentSignal });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !pagehideSignaledRef.current) flush(false);
    };
    const onPageHide = (event: PageTransitionEvent) => {
      pagehideSignaledRef.current = true;
      // A bfcache navigation keeps this checkout alive, and payment providers
      // can pagehide the document while handing off authentication. Persist a
      // compact snapshot in both cases, but let the quiet-time detector decide
      // whether the customer actually abandoned instead of emailing now.
      flush(!event.persisted && !paymentHandoffInFlightRef.current);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveProgress]);

  const markPaymentStarted = useCallback((contact?: AbandonedCartContact | null) => {
    // Set this before starting the asynchronous save. A provider redirect can
    // fire pagehide before that request settles.
    paymentHandoffInFlightRef.current = true;
    return saveProgress('payment_started', contact);
  }, [saveProgress]);

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
