import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore, type CanonicalCartQuote } from '@/store/cart';
import { useAuth, getCurrentUser } from '@/lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { OrderItem } from '../lib/orders/types';

import Layout from '@/components/Layout';
import { usd, formatDimensions, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { validateMinimumOrder, canProceedToCheckout } from '@/lib/validation/minimumOrder';
import PayPalCheckout from '@/components/checkout/PayPalCheckoutReliable';
import StripeCheckout from '@/components/checkout/StripeCheckout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Package, Plus, Minus, Trash2, Eye, Tag, Lock, Truck, CircleCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/lib/api';
import { CartItem } from '@/store/cart';
import BannerPreview from '@/components/cart/BannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/ThumbnailPreviewWrapper';
import CheckoutOrderTotals from '@/components/checkout/CheckoutOrderTotals';
import SameDayHitServiceCard from '@/components/cart/SameDayHitServiceCard';
import DeliveryTimer from '@/components/delivery/DeliveryTimer';
import { trackBeginCheckout, trackViewCart, trackFBInitiateCheckout } from '@/lib/analytics';
import { trackPromoEvent } from '@/lib/posthog';
import { getItemDisplayName, isYardSignItem, getProductCategory, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { getProductCopy, getDominantProductType } from '@/lib/product-copy';
import { getGrommetLabelForDisplay, getGrommetModeForPreview } from '@/lib/cartGrommet';
import { getExpandedPreviewSelection, getSmallPreviewSelection } from '@/lib/previewSelection';
import { sanitizedStripeReturnPath } from '@/components/checkout/stripeReturnUrl';
import {
  clearActiveCheckoutMarker,
  readActiveCheckoutMarker,
  writeActiveCheckoutMarker,
  type ActiveCheckoutMarker,
  type CheckoutPaymentStateEvent,
} from '@/components/checkout/checkoutPaymentState';
import { storeOrderConfirmationToken } from '@/lib/orderConfirmationStorage';
import {
  clearAbandonedCartRecoveryQuery,
  clearStoredAbandonedCartRecoveryRetryToken,
  isAbandonedCartRecoveryTokenRetryable,
  prepareAbandonedCartRecoveryToken,
  restoreAbandonedCartFromToken,
} from '@/lib/abandonedCartRecovery';
import {
  beginStartupCartRecovery,
  canStartCartRecoveryAttempt,
  finishStartupCartRecovery,
  isStartupCartRecoveryAttemptCurrent,
  terminateCurrentStartupCartRecovery,
} from '@/lib/cartRecoveryStartup';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items: rawItems, getMigratedItems, isLoading, syncToServer, replaceItemsFromRecovery, restoreRecoveredCheckoutPreferences, clearCart, getSubtotalCents, getTaxCents, getTotalCents, updateQuantity, removeItem, applyCanonicalPricingQuote, discountCode, applyDiscountCode, removeDiscountCode, getResolvedDiscount, sameDayHitService, saturdayDelivery, getSameDayFeeCents, getSaturdayDeliveryFeeCents } = useCartStore();

  // CRITICAL: Use migrated items to ensure rope/pole pocket costs are calculated
  const items = getMigratedItems();
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const { toast } = useToast();
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [stripeRuntime, setStripeRuntime] = useState<{
    status: 'loading' | 'available' | 'unavailable';
    publishableKey: string | null;
    environment: 'test' | 'live' | null;
  }>({ status: 'loading', publishableKey: null, environment: null });
  // Read once during the initial render. This makes the provider-neutral lock
  // synchronous, including the crash window where only a checkout key exists
  // and the create-payment response never reached the browser.
  const [initialActiveCheckout] = useState<ActiveCheckoutMarker | null>(() => readActiveCheckoutMarker());
  // Capture a valid fragment credential into bounded session state before the
  // layout effect scrubs it from history. This permits an explicit retry after
  // a transient outage without extending the signed token's own lifetime.
  const [initialCartRecoveryToken] = useState<string | null>(() => prepareAbandonedCartRecoveryToken());
  const [activeCheckout, setActiveCheckout] = useState<ActiveCheckoutMarker | null>(initialActiveCheckout);
  const [cartRecoveryLoading, setCartRecoveryLoading] = useState(
    Boolean(initialCartRecoveryToken && !initialActiveCheckout),
  );
  const [needsStoredCheckoutRecovery, setNeedsStoredCheckoutRecovery] = useState(Boolean(initialActiveCheckout));
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [cartRecoveryError, setCartRecoveryError] = useState<string | null>(null);
  const [cartRecoveryCanRetry, setCartRecoveryCanRetry] = useState(false);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const [staleCartReview, setStaleCartReview] = useState<{
    serverTotalCents: number;
    applyFailed: boolean;
  } | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'paypal'>(
    initialActiveCheckout?.provider || 'stripe',
  );
  const [showPromoCode, setShowPromoCode] = useState(false);
  const paymentSuccessHandledRef = useRef(false);
  const cartRecoveryHandledRef = useRef(false);
  const cartRecoveryInFlightRef = useRef(false);
  const recoveryReleaseTimerRef = useRef<number | null>(null);
  const checkoutLocked = Boolean(activeCheckout)
    || recoveryChecking
    || cartRecoveryLoading
    || cartRecoveryCanRetry;

  // Keep signed recovery authoritative only for this checkout visit. A
  // zero-delay cleanup survives React's development effect replay (the next
  // setup cancels it), while a real route change releases account hydration.
  useEffect(() => {
    if (recoveryReleaseTimerRef.current !== null) {
      window.clearTimeout(recoveryReleaseTimerRef.current);
      recoveryReleaseTimerRef.current = null;
    }
    return () => {
      recoveryReleaseTimerRef.current = window.setTimeout(() => {
        terminateCurrentStartupCartRecovery();
        recoveryReleaseTimerRef.current = null;
      }, 0);
    };
  }, []);

  const handlePaymentStateChange = useCallback((event: CheckoutPaymentStateEvent) => {
    setNeedsStoredCheckoutRecovery(false);
    if (event.active) {
      const marker = writeActiveCheckoutMarker({
        provider: event.provider,
        checkoutKey: event.checkoutKey,
        phase: event.phase,
        orderId: event.orderId,
        paymentIntentId: event.paymentIntentId,
        totalCents: event.totalCents,
      });
      setActiveCheckout(marker);
      setPaymentProvider(event.provider);
      setRecoveryMessage(event.phase === 'requires_action'
        ? 'Your bank needs one more authentication step before payment can finish.'
        : 'Your payment is still being securely verified. Cart changes are temporarily locked.');
      return;
    }

    clearActiveCheckoutMarker(event.checkoutKey);
    setActiveCheckout((current) => (
      !current || current.checkoutKey === event.checkoutKey ? null : current
    ));
    setRecoveryMessage(null);
  }, []);

  const handleCanonicalQuote = useCallback((
    quote: CanonicalCartQuote,
    serverTotalCents: number,
  ): boolean => {
    const totalsMatch = Number.isSafeInteger(serverTotalCents)
      && serverTotalCents >= 0
      && serverTotalCents === quote.totalCents;
    const applied = totalsMatch && applyCanonicalPricingQuote(quote);
    setStaleCartReview({
      serverTotalCents: totalsMatch ? serverTotalCents : 0,
      applyFailed: !applied,
    });
    setRecoveryMessage(null);
    toast({
      title: applied ? 'Your order total was updated' : 'Refresh checkout before paying',
      description: applied
        ? 'We applied current server pricing. Review the updated total before submitting a fresh payment.'
        : 'The server quote did not match this cart exactly, so payment remains blocked for your protection.',
      variant: applied ? undefined : 'destructive',
    });
    return applied;
  }, [applyCanonicalPricingQuote, toast]);

  // Stripe can append the PaymentIntent client secret after a 3DS redirect.
  // Strip it in a layout effect before checkout's passive analytics effects.
  // The values are never read or used as authorization; recovery uses the
  // session-bound checkout key and same-origin POST status endpoint instead.
  useIsomorphicLayoutEffect(() => {
    const cleanPath = sanitizedStripeReturnPath(window.location.href);
    if (cleanPath) window.history.replaceState(window.history.state, '', cleanPath);
  }, []);

  // Recovery credentials are short-lived bearer tokens. Remove them (and all
  // retired unsigned recovery parameters) from browser history before passive
  // analytics, payment providers, or outbound navigation can observe them.
  useIsomorphicLayoutEffect(() => {
    clearAbandonedCartRecoveryQuery();
  }, []);

  const attemptCartRecovery = useCallback((isRetry: boolean) => {
    if (cartRecoveryInFlightRef.current || !canStartCartRecoveryAttempt({
      hasToken: Boolean(initialCartRecoveryToken),
      cartIsLoading: isLoading,
      hasActiveCheckout: Boolean(activeCheckout),
      needsStoredCheckoutRecovery,
      paymentRecoveryChecking: recoveryChecking,
      paymentAlreadySucceeded: paymentSuccessHandledRef.current,
    })) return;

    if (isRetry && !isAbandonedCartRecoveryTokenRetryable(initialCartRecoveryToken || '')) {
      clearStoredAbandonedCartRecoveryRetryToken();
      terminateCurrentStartupCartRecovery();
      setCartRecoveryCanRetry(false);
      setCartRecoveryError('This cart recovery link has expired.');
      return;
    }

    const recoveryRevision = beginStartupCartRecovery();
    cartRecoveryInFlightRef.current = true;
    setCartRecoveryCanRetry(false);
    setCartRecoveryError(null);
    setRecoveryMessage(null);
    setCartRecoveryLoading(true);

    void restoreAbandonedCartFromToken({
      token: initialCartRecoveryToken,
      replaceCartItems: replaceItemsFromRecovery,
      applyValidatedDiscount: applyDiscountCode,
      restoreCheckoutPreferences: restoreRecoveredCheckoutPreferences,
      shouldApply: () => isStartupCartRecoveryAttemptCurrent(recoveryRevision),
    })
      .then((outcome) => {
        if (!isStartupCartRecoveryAttemptCurrent(recoveryRevision)) return;
        if (outcome.ok) {
          clearStoredAbandonedCartRecoveryRetryToken();
          finishStartupCartRecovery(recoveryRevision, 'restored');
          setCartRecoveryError(null);
          setRecoveryMessage(outcome.message);
          toast({
            title: 'Cart restored',
            description: outcome.message,
          });
          return;
        }

        const retryable = outcome.status === 'unavailable'
          && isAbandonedCartRecoveryTokenRetryable(initialCartRecoveryToken || '');
        if (retryable) {
          finishStartupCartRecovery(recoveryRevision, 'retryable');
          setCartRecoveryCanRetry(true);
        } else {
          clearStoredAbandonedCartRecoveryRetryToken();
          finishStartupCartRecovery(recoveryRevision, 'terminal');
        }
        setCartRecoveryError(outcome.message);
        toast({
          title: 'Cart could not be restored',
          description: retryable ? `${outcome.message} You can retry safely.` : outcome.message,
          variant: 'destructive',
        });
      })
      .finally(() => {
        cartRecoveryInFlightRef.current = false;
        setCartRecoveryLoading(false);
      });
  }, [
    activeCheckout,
    applyDiscountCode,
    initialCartRecoveryToken,
    isLoading,
    needsStoredCheckoutRecovery,
    recoveryChecking,
    replaceItemsFromRecovery,
    restoreRecoveredCheckoutPreferences,
    toast,
  ]);

  const discardCartRecoveryAttempt = useCallback(() => {
    clearStoredAbandonedCartRecoveryRetryToken();
    terminateCurrentStartupCartRecovery();
    setCartRecoveryCanRetry(false);
    setCartRecoveryError(null);
    setCartRecoveryLoading(false);
    setRecoveryMessage(null);
  }, []);

  useEffect(() => {
    if (cartRecoveryHandledRef.current || !canStartCartRecoveryAttempt({
      hasToken: Boolean(initialCartRecoveryToken),
      cartIsLoading: isLoading,
      hasActiveCheckout: Boolean(activeCheckout),
      needsStoredCheckoutRecovery,
      paymentRecoveryChecking: recoveryChecking,
      paymentAlreadySucceeded: paymentSuccessHandledRef.current,
    })) return;
    cartRecoveryHandledRef.current = true;
    attemptCartRecovery(false);
  }, [
    activeCheckout,
    attemptCartRecovery,
    initialCartRecoveryToken,
    isLoading,
    needsStoredCheckoutRecovery,
    recoveryChecking,
  ]);

  // Stripe configuration is resolved server-side so preview/test and live keys
  // cannot cross environments. A bounded failure falls back to the existing
  // PayPal checkout instead of leaving customers on an endless loading state.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    let active = true;
    void fetch('/.netlify/functions/stripe-config', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        const publishableKey = typeof payload?.publishableKey === 'string'
          ? payload.publishableKey.trim()
          : '';
        const environment = payload?.environment === 'live' ? 'live' : 'test';
        const prefixMatches = environment === 'live'
          ? publishableKey.startsWith('pk_live_')
          : publishableKey.startsWith('pk_test_');
        if (response.ok && payload?.enabled === true && prefixMatches) {
          setStripeRuntime({ status: 'available', publishableKey, environment });
          return;
        }
        setStripeRuntime({ status: 'unavailable', publishableKey: null, environment: null });
      })
      .catch(() => {
        if (active) setStripeRuntime({ status: 'unavailable', publishableKey: null, environment: null });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const stripeAvailable = stripeRuntime.status === 'available' && Boolean(stripeRuntime.publishableKey);

  // Get totals from cart store methods
  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();
  const resolvedDiscount = getResolvedDiscount();
  const sameDayFeeCents = getSameDayFeeCents();
  const saturdayFeeCents = getSaturdayDeliveryFeeCents();

  // Calculate feature flag pricing details
  const flags = getFeatureFlags();
  const pricingOptions = getPricingOptions();
  let minOrderAdjustmentCents = 0;
  let showMinOrderAdjustment = false;


  // Determine dominant product type for product-aware copy
  const dominantProductType = getDominantProductType(items);
  const productCopy = getProductCopy(dominantProductType);

  // Minimum order validation (moved outside conditional block)
  // Pass product type and yard sign config for contextual suggestions
  const firstYardSign = items.find(item => isYardSignItem(item));
  const adminContext = {
    isAdmin: isAdminUser,
    bypassValidation: isAdminUser,
    productType: dominantProductType,
    yardSignSidedness: firstYardSign?.yard_sign_sidedness,
    yardSignStepStakesEnabled: firstYardSign?.yard_sign_step_stakes_enabled,
  };
  const minimumOrderValidation = validateMinimumOrder(totalCents, adminContext);

  // Yard sign quantity validation at checkout
  const yardSignItems = items.filter(item => isYardSignItem(item));
  const yardSignOverLimit = yardSignItems.some(item => item.quantity > 90);
  const yardSignNoArtwork = yardSignItems.some(item => !item.yard_sign_design_count || item.yard_sign_design_count === 0);
  const yardSignNotMultipleOf10 = yardSignItems.some(item => item.quantity < 10 || item.quantity % 10 !== 0);
  const yardSignInvalid = yardSignOverLimit || yardSignNoArtwork || yardSignNotMultipleOf10;
  const yardSignValidationMessage = yardSignOverLimit
    ? 'Maximum 90 signs per order for 24-hour production. Please place multiple orders.'
    : yardSignNotMultipleOf10
    ? 'Yard signs must be ordered in increments of 10 (10, 20, 30, etc.).'
    : yardSignNoArtwork
    ? 'Please upload at least one design for your yard sign order.'
    : '';

  const canProceed = minimumOrderValidation.isValid && !yardSignInvalid;
  const providerTotalCents = activeCheckout?.totalCents || totalCents;
  const paymentSubmissionBlocked = !canProceed || Boolean(staleCartReview);
  if (flags.freeShipping || flags.minOrderFloor) {
    const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
    const totals = computeTotals(pricingItems, 0.06, pricingOptions);

    minOrderAdjustmentCents = totals.min_order_adjustment_cents;
    showMinOrderAdjustment = minOrderAdjustmentCents > 0;
  }

  // Helper to compute rope cost with backward compatibility
  const getRopeCost = (item: CartItem): number => {
    return item.rope_cost_cents ?? 0;
  };

  // Helper to compute pole pocket cost with backward compatibility
  const getPolePocketCost = (item: CartItem): number => {
    return item.pole_pocket_cost_cents ?? 0;
  };

  // Compute "each" price
  const computeEach = (item: CartItem): number => {
    const ropeMode = item.rope_pricing_mode || 'per_item';
    const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
    const ropeCost = getRopeCost(item);
    const pocketCost = getPolePocketCost(item);
    
    const perOrderCosts = (ropeMode === 'per_order' ? ropeCost : 0) + (pocketMode === 'per_order' ? pocketCost : 0);
    const each = Math.round((item.line_total_cents - perOrderCosts) / Math.max(1, item.quantity));
    return each;
  };

  // Check admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user?.email) {
        try {
          const response = await fetch('/.netlify/functions/check-admin-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email }),
          });
          if (response.ok) {
            const result = await response.json();
            setIsAdminUser(result.isAdmin);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }
      }
    };
    checkAdminStatus();
  }, [user?.email]);

  // NOTE: We intentionally do NOT auto-prefill the discount code from
  // sessionStorage. Promo codes must be entered explicitly by the user
  // in checkout to prevent silent/auto-application of stale codes
  // (e.g. NEW20 leaking from a previous design-page session).
  // Cart management functions
  const handleIncreaseQuantity = (itemId: string) => {
    if (checkoutLocked) return;
    const item = items.find(i => i.id === itemId);
    if (item && item.quantity < 999) {
      updateQuantity(itemId, item.quantity + 1);
    }
  };

  const handleDecreaseQuantity = (itemId: string) => {
    if (checkoutLocked) return;
    const item = items.find(i => i.id === itemId);
    if (item && item.quantity > 1) {
      updateQuantity(itemId, item.quantity - 1);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    if (checkoutLocked) return;
    removeItem(itemId);
    toast({
      title: "Item Removed",
      description: "Item has been removed from your cart.",
    });
  };

  // Discount code handlers
  const handleApplyDiscount = async () => {
    if (checkoutLocked) return;
    if (!discountCodeInput.trim()) {
      setDiscountError('Please enter a discount code');
      return;
    }


    setIsValidatingDiscount(true);
    setDiscountError('');

    try {
      const response = await fetch('/.netlify/functions/validate-discount-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: discountCodeInput.trim(),
          userId: user?.id || null,
          items: items.map((item) => ({
            id: item.id,
            product_type: item.product_type || 'banner',
            width_in: item.width_in,
            height_in: item.height_in,
            line_total_cents: item.line_total_cents,
          })),
        }),
      });

      const result = await response.json();

      if (result.valid && result.discount) {
        applyDiscountCode(result.discount);
        
        // Track successful promo application
        trackPromoEvent('promo_applied_success', {
          promo_code: result.discount.code,
          discount_percentage: result.discount.discountPercentage,
          discount_amount_cents: result.discount.discountAmountCents,
        });
        
        toast({
          title: 'Discount Applied!',
          description: result.discount.code === 'BIG25'
            ? '25% off qualifying large banners'
            : `${result.discount.discountPercentage}% off your order`,
        });
        setDiscountCodeInput('');
        setDiscountError('');
      } else {
        // Track rejected promo
        trackPromoEvent('promo_rejected', {
          promo_code: discountCodeInput.trim(),
          reason: result.error || 'Invalid discount code',
        });
        
        setDiscountError(result.error || 'Invalid discount code');
      }
    } catch (error) {
      console.error('Error validating discount code:', error);
      setDiscountError('Failed to validate discount code');
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    if (checkoutLocked) return;
    removeDiscountCode();
    setDiscountCodeInput('');
    setDiscountError('');
    toast({
      title: 'Discount Removed',
      description: 'Discount code has been removed from your order',
    });
  };



  // Track checkout only after the persisted cart has finished hydrating.
  // A ref prevents duplicate events when totals or migrated items settle.
  const checkoutTrackedRef = useRef(false);
  useEffect(() => {
    if (checkoutTrackedRef.current || isLoading || cartRecoveryLoading || items.length === 0) return;

    const analyticsItems = items.map(item => ({
      item_id: item.id,
      item_name: `${item.width_in}x${item.height_in} ${item.material} ${getItemDisplayName(item)}`,
      item_category: getProductCategory(item.product_type),
      item_variant: item.material,
      price: Math.round(item.line_total_cents / Math.max(1, item.quantity)),
      quantity: Math.max(1, item.quantity),
    }));
    checkoutTrackedRef.current = true;
    trackBeginCheckout(analyticsItems, totalCents, discountCode?.code || null);
    trackViewCart(analyticsItems, totalCents, discountCode?.code || null);

    // Track Facebook Pixel InitiateCheckout
    trackFBInitiateCheckout({
      value: totalCents,
      num_items: items.length,
    });
  }, [cartRecoveryLoading, discountCode?.code, isLoading, items, totalCents]);

  const handlePaymentSuccess = useCallback(async (orderId: string, orderData?: any) => {
    if (paymentSuccessHandledRef.current) return;
    paymentSuccessHandledRef.current = true;
    try {
      console.log('Payment success handler called with order ID:', orderId);
      const paidItems = items;
      const paidTotalCents = Number.isInteger(Number(orderData?.total_cents))
        ? Number(orderData.total_cents)
        : totalCents;
      const confirmationToken = orderData?.orderConfirmationToken
        || orderData?.confirmationToken
        || null;
      if (confirmationToken) {
        // The signed credential is scoped by order and is only ever sent in
        // X-Order-Confirmation-Token, never in a URL.
        storeOrderConfirmationToken(orderId, confirmationToken);
      }

      // An already-started payment is authoritative. Discard the deferred cart
      // credential so it cannot restore over the newly completed order.
      clearStoredAbandonedCartRecoveryRetryToken();
      terminateCurrentStartupCartRecovery();
      clearActiveCheckoutMarker();
      setActiveCheckout(null);
      setRecoveryMessage(null);
      clearCart();

      toast({
        title: 'Order Placed Successfully!',
        description: `Your order has been created and payment processed. Order ID: ${orderId}`,
      });

      navigate(`/payment-success?orderId=${orderId}`, {
        replace: true,
        state: {
          fromCheckout: true,
          orderId,
          orderConfirmationToken: confirmationToken,
          orderAccessRecovery: orderData?.orderAccessRecovery || null,
          items: paidItems,
          shippingAddress: orderData?.shippingAddress || null,
          total: paidTotalCents,
          discountCode: discountCode ? { code: discountCode.code, discountPercentage: discountCode.discountPercentage, discountAmountCents: discountCode.discountAmountCents } : null,
          serverPricing: orderData ? { subtotal_cents: orderData.subtotal_cents, tax_cents: orderData.tax_cents, total_cents: orderData.total_cents, applied_discount_cents: orderData.applied_discount_cents, applied_discount_label: orderData.applied_discount_label, applied_discount_type: orderData.applied_discount_type, same_day_fee_cents: orderData.same_day_fee_cents, saturday_fee_cents: orderData.saturday_fee_cents, shipping_cents: orderData.shipping_cents } : null,
        },
      });
    } catch (error) {
      console.error('Payment success handler error:', error);
      toast({
        title: 'Order Processing Error',
        description: 'Your payment was processed but there was an issue completing your order. Please contact support.',
        variant: 'destructive',
      });
    }
  }, [clearCart, discountCode, items, navigate, toast, totalCents]);

  const handlePaymentError = useCallback((error: any) => {
    console.error('Payment error:', error);
    if (error?.code === 'STALE_CART_TOTAL') return;
    if (error?.paymentStatusUnknown === true || error?.doNotRetry === true) {
      toast({
        title: 'Payment verification in progress',
        description: 'We are checking the payment result. Do not submit another payment.',
      });
      return;
    }
    toast({
      title: 'Payment Failed',
      description: error?.userMessage
        || error?.message
        || 'There was an error processing your payment. Please try again.',
      variant: 'destructive',
    });
  }, [toast]);

  const reconcileStoredStripeCheckout = useCallback(async () => {
    const marker = activeCheckout;
    if (!marker || marker.provider !== 'stripe') return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setRecoveryChecking(true);
    setRecoveryMessage('Restoring your secure payment status…');
    try {
      const response = await fetch('/.netlify/functions/stripe-payment-status', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ checkoutKey: marker.checkoutKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok
          && payload?.ok === true
          && payload?.paid === true
          && payload?.finalized === true
          && payload?.confirmationToken) {
        const orderId = payload.orderId || payload.order?.id;
        if (orderId) {
          await handlePaymentSuccess(orderId, {
            ...(payload.order || {}),
            orderConfirmationToken: payload.confirmationToken,
            shippingAddress: payload.shippingAddress || payload.order?.shipping_address,
          });
          return;
        }
      }

      if (response.ok && payload?.activePayment === true) {
        const phase = payload?.status === 'requires_action' ? 'requires_action' : 'verifying';
        const refreshed = writeActiveCheckoutMarker({
          provider: 'stripe',
          checkoutKey: marker.checkoutKey,
          phase,
          orderId: payload.orderId || marker.orderId,
          paymentIntentId: payload.paymentIntentId || marker.paymentIntentId,
          totalCents: marker.totalCents,
        });
        setActiveCheckout(refreshed);
        setPaymentProvider('stripe');
        setRecoveryMessage(phase === 'requires_action'
          ? 'Your bank needs one more authentication step. Resume it in the secure payment panel.'
          : 'Your payment is still being securely verified. Cart changes remain locked.');
        return;
      }

      if (response.status === 404 || payload?.safeToRetry === true) {
        clearActiveCheckoutMarker(marker.checkoutKey);
        setActiveCheckout(null);
        setRecoveryMessage(payload?.message || 'No payment was completed. You may review the cart and try again.');
        return;
      }

      setRecoveryMessage('Payment verification is taking longer than usual. Do not submit another payment; check status again shortly.');
    } catch {
      setRecoveryMessage('We could not reach payment verification. Your cart is locked to prevent a duplicate charge; check status again shortly.');
    } finally {
      window.clearTimeout(timeout);
      setRecoveryChecking(false);
      setNeedsStoredCheckoutRecovery(false);
    }
  }, [activeCheckout, handlePaymentSuccess]);

  useEffect(() => {
    if (!needsStoredCheckoutRecovery || !activeCheckout) return;
    if (activeCheckout.provider === 'paypal') {
      setPaymentProvider('paypal');
      setRecoveryMessage('Restoring your PayPal verification…');
      setNeedsStoredCheckoutRecovery(false);
      return;
    }
    if (stripeRuntime.status === 'loading') return;
    if (stripeRuntime.status === 'available') {
      // The mounted Stripe panel owns polling/action recovery when Stripe.js
      // is available. Checkout owns the same key-only recovery when runtime
      // configuration failed, avoiding duplicate status requests on reload.
      setNeedsStoredCheckoutRecovery(false);
      return;
    }
    void reconcileStoredStripeCheckout();
  }, [activeCheckout, needsStoredCheckoutRecovery, reconcileStoredStripeCheckout, stripeRuntime.status]);

  useEffect(() => {
    if (!checkoutLocked) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [checkoutLocked]);

  // Show loading state while cart is being loaded/merged
  if (isLoading || cartRecoveryLoading) {
    return (
      <Layout>
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D]"></div>
              <h2 className="mt-4 text-2xl font-bold text-[#18448D]">
                {cartRecoveryLoading ? 'Restoring your cart...' : 'Loading your cart...'}
              </h2>
              <p className="mt-2 text-gray-600">
                {cartRecoveryLoading
                  ? 'We are securely restoring the items from your recovery link.'
                  : 'Please wait while we prepare your items.'}
              </p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  // Detect if user came from Google Ads landing page
  const isFromGoogleAds = sessionStorage.getItem('isGoogleAdsLanding') === 'true' || items.some(item => item.source === 'google-ads');

  // Build product-aware navigation URL for "Add Another" actions
  const getAddAnotherUrl = (productType?: string): string => {
    // Determine the base page: Google Ads landing or regular design page
    const basePage = isFromGoogleAds ? '/google-ads-banner' : '/design';
    if (productType === 'yard_sign') return `${basePage}?product=yard-signs`;
    if (productType === 'car_magnet') return `${basePage}?product=car-magnets`;
    return `${basePage}?product=banner`;
  };

  // Redirect if cart is empty
  if (items.length === 0 && !checkoutLocked) {
    return (
      <Layout>
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Package className={`mx-auto h-12 w-12 ${cartRecoveryError ? 'text-red-500' : 'text-gray-400'}`} />
              <h2 className="mt-4 text-2xl font-bold text-[#18448D]">
                {cartRecoveryError ? 'Cart could not be restored' : 'Your cart is empty'}
              </h2>
              {cartRecoveryError ? (
                <div className="mx-auto mt-3 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">
                  {cartRecoveryError}{' '}
                  {cartRecoveryCanRetry
                    ? 'Your secure recovery link is still valid, so you can retry without rebuilding the design.'
                    : 'You can start a new design below.'}
                </div>
              ) : (
                <p className="mt-2 text-gray-600">Add some items to your cart before checking out.</p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {cartRecoveryCanRetry ? (
                  <Button onClick={() => attemptCartRecovery(true)} disabled={cartRecoveryLoading}>
                    {cartRecoveryLoading ? 'Retrying recovery…' : 'Retry cart recovery'}
                  </Button>
                ) : null}
                <Button
                  variant={cartRecoveryCanRetry ? 'outline' : 'default'}
                  onClick={() => {
                    discardCartRecoveryAttempt();
                    navigate(isFromGoogleAds ? '/google-ads-banner' : '/design');
                  }}
                >
                  {isFromGoogleAds ? (dominantProductType === 'yard_sign' ? 'Order a Yard Sign' : 'Order a Banner') : 'Start Designing'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showFooterBanner={false} checkoutMode>
      <div className="min-h-[calc(100vh-4rem)] bg-[#F7F7F7] py-5 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 sm:mb-10">
            <Button
              variant="ghost"
              onClick={() => { if (!checkoutLocked) navigate(-1); }}
              disabled={checkoutLocked}
              className="mb-6 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="text-center mb-8">
              <div className="mb-3 inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                <span>Design</span><span>→</span><span>Review</span><span>→</span><span className="text-[#18448D]">Checkout</span><span>→</span><span>Complete</span>
              </div>
              <h1 className="mb-2 font-display text-3xl font-bold tracking-[-0.035em] text-[#0B1F3A] sm:text-4xl">Secure checkout</h1>
              <p className="text-base text-gray-600">Most standard orders are produced within 24 hours; free next-day air begins after production.</p>
              <p className="text-sm text-[#18448D] font-medium">Order before tonight’s cutoff for fastest turnaround.</p>
            </div>
            
          </div>

          <DeliveryTimer
            variant="slim"
            reflectCartSelection
            className="mb-4 sm:mb-6"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Order Summary - Takes 2 columns on large screens */}
            <div id="checkout-order-summary" className="order-2 w-full space-y-6 lg:order-1 lg:col-span-2">
              <div className="border border-slate-200 border-t-4 border-t-[#FF6A00] bg-white p-6 shadow-[0_10px_28px_rgba(11,31,58,0.06)] sm:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-[#18448D]">Order Summary</h2>
                  <div className="bg-blue-50 px-4 py-2 rounded-full">
                    <span className="text-sm font-semibold text-[#18448D]">{items.length} {items.length === 1 ? 'Item' : 'Items'}</span>
                  </div>
                </div>
                
                {/* Thumbnail preview notice - shown once above all items */}
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 mb-4">
                  <Eye className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                  <p>
                    <span className="font-medium">Preview only.</span> {productCopy.reviewNoticeBody}
                  </p>
                </div>

                <div className="space-y-4">
                  {items.map((item) => {
                    const eachCents = computeEach(item);
                    const normalized = normalizeOrderItemDisplay(item as NormalizableOrderItem);
                    const grommetLabel = getGrommetLabelForDisplay(item, normalized.grommetsDisplay);
                    const grommetMode = getGrommetModeForPreview(item);
                    const isYardSign = isYardSignItem(item);
                    const smallPreview = getSmallPreviewSelection(item);
                    const expandedPreview = getExpandedPreviewSelection(item);
                    const compositionSignature = item.placement_preview?.compositionSignature
                      || item.composition_signature;
                    const yardSignPreviewUrl = smallPreview.url;
                    const bannerPreviewUrl = smallPreview.url;
                    if (isYardSign && !yardSignPreviewUrl) {
                      console.warn('⚠️  CHECKOUT: No image URL found for item:', item.id, {
                        thumbnail_url: item.thumbnail_url,
                        web_preview_url: item.web_preview_url,
                        file_url: item.file_url,
                        print_ready_url: item.print_ready_url,
                        aiDesign_proofUrl: item.aiDesign?.assets?.proofUrl
                      });
                    }
                    const details = [
                      { label: 'Size', value: normalized.sizeDisplay },
                      { label: 'Material', value: normalized.materialDisplay },
                      { label: 'Print', value: normalized.printDisplay },
                      ...(normalized.uploadedDesignsCount ? [{ label: 'Uploaded Designs', value: String(normalized.uploadedDesignsCount) }] : []),
                      ...(normalized.stepStakesQty ? [{ label: 'Step Stakes', value: String(normalized.stepStakesQty) }] : []),
                      ...(normalized.productType === 'banner' ? [
                        { label: 'Grommets', value: grommetLabel },
                        { label: 'Pole Pockets', value: normalized.polePocketsDisplay },
                        { label: 'Rope', value: normalized.ropeDisplay },
                        { label: 'Hemming', value: normalized.hemmingDisplay || 'Always included' },
                      ] : []),
                      ...(normalized.roundedCornersDisplay ? [{ label: 'Rounded Corners', value: normalized.roundedCornersDisplay }] : []),
                    ];

                    return (
                    <div key={item.id} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] last:mb-0 sm:p-5">
                      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:items-start lg:gap-6">
                        {isYardSign ? (
                          <div className="flex justify-center shrink-0">
                            <ThumbnailPreviewWrapper
                              title={getItemDisplayName(item)}
                              widthIn={item.width_in}
                              heightIn={item.height_in}
                              details={[
                                ...details,
                                { label: 'Qty', value: normalized.qtyDisplay },
                              ]}
                              largePreview={
                                <div className="space-y-2">
                                  {expandedPreview.isPreparingHighResolution && (
                                    <p className="text-center text-xs font-medium text-amber-700">
                                      Preparing high-resolution preview…
                                    </p>
                                  )}
                                  {expandedPreview.isLowResolutionFallback && (
                                    <p className="text-center text-xs text-amber-700">
                                      Low-resolution fallback shown until the high-resolution proof finishes.
                                    </p>
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
                                    imagePosition={item.image_position}
                                    fitMode={item.fit_mode || "fill"}
                                    className="flex-shrink-0"
                                    designServiceEnabled={item.design_service_enabled}
                                    source={item.source}
                                    isFinalizedSnapshot={expandedPreview.isExactComposition}
                                    compositionSignature={compositionSignature}
                                    maxSize={820}
                                  />
                                </div>
                              }
                            >
                              <BannerPreview
                                widthIn={item.width_in}
                                heightIn={item.height_in}
                                grommets={grommetMode}
                                imageUrl={yardSignPreviewUrl}
                                material={item.material}
                                textElements={item.text_elements}
                                overlayImage={item.overlay_image}
                                imageScale={item.image_scale}
                                imagePosition={item.image_position}
                                fitMode={item.fit_mode || "fill"}
                                className="flex-shrink-0"
                                designServiceEnabled={item.design_service_enabled}
                                source={item.source}
                                isFinalizedSnapshot={smallPreview.isExactComposition}
                                compositionSignature={compositionSignature}
                              />
                            </ThumbnailPreviewWrapper>
                          </div>
                        ) : (
                          <div className="flex justify-center shrink-0">
                            <ThumbnailPreviewWrapper
                              title={getItemDisplayName(item)}
                              widthIn={item.width_in}
                              heightIn={item.height_in}
                              details={[
                                ...details,
                                { label: 'Qty', value: normalized.qtyDisplay },
                              ]}
                              largePreview={
                                <div className="space-y-2">
                                  {expandedPreview.isPreparingHighResolution && (
                                    <p className="text-center text-xs font-medium text-amber-700">
                                      Preparing high-resolution preview…
                                    </p>
                                  )}
                                  {expandedPreview.isLowResolutionFallback && (
                                    <p className="text-center text-xs text-amber-700">
                                      Low-resolution fallback shown until the high-resolution proof finishes.
                                    </p>
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
                                    imagePosition={item.image_position}
                                    fitMode={item.fit_mode || "fill"}
                                    className="flex-shrink-0"
                                    designServiceEnabled={item.design_service_enabled}
                                    source={item.source}
                                    isFinalizedSnapshot={expandedPreview.isExactComposition}
                                    compositionSignature={compositionSignature}
                                    maxSize={820}
                                  />
                                </div>
                              }
                            >
                              <BannerPreview
                                widthIn={item.width_in}
                                heightIn={item.height_in}
                                grommets={grommetMode}
                                imageUrl={bannerPreviewUrl}
                                material={item.material}
                                textElements={item.text_elements}
                                overlayImage={item.overlay_image}
                                imageScale={item.image_scale}
                                imagePosition={item.image_position}
                                fitMode={item.fit_mode || "fill"}
                                className="flex-shrink-0"
                                designServiceEnabled={item.design_service_enabled}
                                source={item.source}
                                isFinalizedSnapshot={smallPreview.isExactComposition}
                                compositionSignature={compositionSignature}
                              />
                            </ThumbnailPreviewWrapper>
                          </div>
                        )}

                        <div className="min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-[#18448D] text-lg sm:text-xl leading-snug break-words">
                                  {getItemDisplayName(item)}
                                </h3>
                                <span className="inline-flex items-center rounded-full bg-blue-50 text-[#18448D] border border-blue-100 px-2 py-0.5 text-xs font-semibold">
                                  {normalized.productLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="font-bold text-gray-900 text-lg leading-tight">
                                {usd(item.line_total_cents / 100)}
                              </p>
                              <p className="text-xs text-gray-500 font-medium">
                                {usd(eachCents / 100)} each
                              </p>
                            </div>
                          </div>

                          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {details.map((detail) => (
                              <div key={`${item.id}-${detail.label}`} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{detail.label}</dt>
                                <dd className="mt-0.5 break-words text-sm font-semibold leading-5 text-slate-800">{detail.value}</dd>
                              </div>
                            ))}
                          </dl>

                        </div>

                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm text-gray-800 font-semibold">Qty</span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDecreaseQuantity(item.id)}
                              disabled={checkoutLocked || item.quantity <= 1}
                              className="h-11 w-11 p-0 border-2 hover:bg-[#18448D] hover:text-white hover:border-[#18448D] transition-all"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-12 text-center font-bold text-base">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleIncreaseQuantity(item.id)}
                              disabled={checkoutLocked || item.quantity >= 999}
                              className="h-11 w-11 p-0 border-2 hover:bg-[#18448D] hover:text-white hover:border-[#18448D] transition-all"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={checkoutLocked}
                          className="text-red-600 hover:text-red-700 hover:bg-red-100 font-semibold transition-all"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );})}
                </div>

                <div className="mt-5">
                  <CheckoutOrderTotals
                    subtotalCents={subtotalCents}
                    minOrderAdjustmentCents={showMinOrderAdjustment ? minOrderAdjustmentCents : 0}
                    discountAmountCents={resolvedDiscount.appliedDiscountAmountCents}
                    discountLabel={resolvedDiscount.appliedDiscountLabel}
                    discountHelperMessage={resolvedDiscount.helperMessage}
                    shippingLabel={flags.freeShipping ? flags.shippingMethodLabel : 'Shipping'}
                    taxCents={taxCents}
                    sameDayFeeCents={sameDayFeeCents}
                    saturdayFeeCents={saturdayFeeCents}
                    totalCents={totalCents}
                  />
                </div>

                {/* Add Another Item button — product-aware for correct tab routing */}
                <div className="mt-4">
                  {(() => {
                    const hasYardSigns = items.some(i => isYardSignItem(i));
                    const hasBanners = items.some(i => !isYardSignItem(i));
                    const isMixed = hasYardSigns && hasBanners;

                    if (!isFromGoogleAds) {
                      // Non-Google-Ads flow — use /design page with product-aware routing
                      if (isMixed) {
                        return (
                          <div className="flex gap-3">
                            <Button
                              variant="outline"
                              onClick={() => navigate(getAddAnotherUrl('banner'))}
                              disabled={checkoutLocked}
                              className="flex-1 border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Another Banner
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => navigate(getAddAnotherUrl('yard_sign'))}
                              disabled={checkoutLocked}
                              className="flex-1 border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Another Yard Sign
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <Button
                          variant="outline"
                          onClick={() => navigate(getAddAnotherUrl(dominantProductType))}
                          disabled={checkoutLocked}
                          className="w-full border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {productCopy.addAnotherCta}
                        </Button>
                      );
                    }

                    if (isMixed) {
                      // Mixed cart: show two separate buttons
                      return (
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => navigate(getAddAnotherUrl('banner'))}
                            disabled={checkoutLocked}
                            className="flex-1 border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Another Banner
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => navigate(getAddAnotherUrl('yard_sign'))}
                            disabled={checkoutLocked}
                            className="flex-1 border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Another Yard Sign
                          </Button>
                        </div>
                      );
                    }

                    // Homogeneous cart: show single product-specific CTA
                    return (
                      <Button
                        variant="outline"
                        onClick={() => navigate(getAddAnotherUrl(dominantProductType))}
                        disabled={checkoutLocked}
                        className="w-full border-dashed border-2 border-gray-300 text-gray-600 hover:border-[#18448D] hover:text-[#18448D] hover:bg-blue-50 transition-all py-3"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {productCopy.addAnotherCta}
                      </Button>
                    );
                  })()}
                </div>

                {/* Discount Code Section */}
                <div className="border-t border-gray-200 pt-6 mt-6">
                  {!discountCode ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowPromoCode((v) => !v)}
                        disabled={checkoutLocked}
                        className="text-sm font-semibold text-[#18448D] underline underline-offset-2"
                      >
                        Have a promo code?
                      </button>
                      {showPromoCode && (
                      <>
                      <label htmlFor="discount-code" className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#18448D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Have a Discount Code?
                      </label>
                      
                      {/* Email input for guests */}
                      <div className="flex gap-2">
                        <Input
                          id="discount-code"
                          type="text"
                          placeholder="Enter your code"
                          value={discountCodeInput}
                          onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                          onKeyPress={(e) => e.key === 'Enter' && handleApplyDiscount()}
                          className="flex-1 h-12 text-base border-2 focus:border-[#18448D] transition-colors"
                          disabled={checkoutLocked || isValidatingDiscount}
                        />
                        <Button
                          onClick={handleApplyDiscount}
                          disabled={checkoutLocked || isValidatingDiscount || !discountCodeInput.trim()}
                          className="h-12 bg-[#0B1F3A] px-6 font-semibold text-white hover:bg-[#102A4C]"
                        >
                          {isValidatingDiscount ? 'Validating...' : 'Apply'}
                        </Button>
                      </div>
                      {discountError && (
                        <p className="text-sm text-red-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          {discountError}
                        </p>
                      )}
                      </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        {discountCode.code} &mdash; {discountCode.discountPercentage}% off
                      </span>
                      <button
                        onClick={handleRemoveDiscount}
                        disabled={checkoutLocked}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Same-Day Hit Service upsell — production priority (NOT shipping) */}
                <div className="border-t border-gray-200 pt-6 mt-6">
                  <SameDayHitServiceCard disabled={checkoutLocked} />
                </div>
              </div>
            </div>

            {/* Minimum Order Warning */}
            {!minimumOrderValidation.isValid && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-amber-800 mb-2">Minimum Order Required</h3>
                    <p className="text-amber-700 mb-4">{minimumOrderValidation.message}</p>
                    {minimumOrderValidation.suggestions.length > 0 && (
                      <div className="bg-amber-100 rounded-lg p-4">
                        <p className="font-medium text-amber-800 mb-2">Suggestions to reach minimum:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-amber-700">
                          {minimumOrderValidation.suggestions.slice(0, 3).map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Yard Sign Validation Warning */}
            {yardSignInvalid && (
              <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Yard Sign Order Issue</h3>
                    <p className="text-red-700">{yardSignValidationMessage}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Payment */}
            <div className="order-1 w-full space-y-4 lg:order-2 lg:space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </p>
                  <p className="text-lg font-bold text-[#0B1F3A]">{usd(totalCents / 100)} total</p>
                </div>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-[#18448D] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D]"
                  onClick={() => document.getElementById('checkout-order-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Review order
                </button>
              </div>
              <div className="relative z-0 rounded-xl border border-gray-100 bg-white p-4 shadow-md sm:p-5">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-[#18448D]">Payment</h2>
                  <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                <span className="text-sm font-bold text-green-700">Secure</span>
                  </div>
                </div>
                
                {cartRecoveryError ? (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                    <p className="text-sm font-medium text-red-900">{cartRecoveryError}</p>
                    {cartRecoveryCanRetry ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-red-300 bg-white text-red-800 hover:bg-red-100"
                          onClick={() => attemptCartRecovery(true)}
                          disabled={cartRecoveryLoading}
                        >
                          {cartRecoveryLoading ? 'Retrying recovery…' : 'Retry cart recovery'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-slate-700 hover:bg-white"
                          onClick={discardCartRecoveryAttempt}
                          disabled={cartRecoveryLoading}
                        >
                          Discard recovery and use this cart
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {recoveryMessage ? (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3" role="status" aria-live="polite">
                    <p className="text-sm font-medium text-blue-900">{recoveryMessage}</p>
                    {activeCheckout?.provider === 'stripe' && !recoveryChecking ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 border-blue-300 bg-white text-blue-800 hover:bg-blue-100"
                        onClick={() => void reconcileStoredStripeCheckout()}
                      >
                        Check payment status
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {staleCartReview ? (
                  <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
                    <p className="text-sm font-bold text-amber-950">
                      {staleCartReview.applyFailed ? 'Checkout needs a secure refresh' : 'Pricing was updated securely'}
                    </p>
                    <p className="mt-1 text-sm text-amber-900">
                      {staleCartReview.applyFailed
                        ? 'The server quote did not match the current cart exactly. No payment was created; refresh before trying again.'
                        : <>Review the updated order total of {usd(staleCartReview.serverTotalCents / 100)}. No payment was created from the old total.</>}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
                      onClick={() => {
                        if (staleCartReview.applyFailed) window.location.reload();
                        else setStaleCartReview(null);
                      }}
                    >
                      {staleCartReview.applyFailed ? 'Refresh checkout' : 'I reviewed the updated total'}
                    </Button>
                  </div>
                ) : null}
                
                {stripeRuntime.status === 'loading' ? (
                  <div className="min-h-[132px] rounded-lg border border-slate-200 bg-slate-50 p-4" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Loader2 className="h-4 w-4 animate-spin text-[#18448D]" aria-hidden="true" />
                      Loading secure payment options…
                    </div>
                    <div className="mt-4 h-12 animate-pulse rounded-md bg-slate-200/70" aria-hidden="true" />
                  </div>
                ) : stripeAvailable && stripeRuntime.publishableKey ? (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-sm font-bold text-[#0B1F3A]">Choose a payment method</p>
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Choose a payment method">
                        <button
                          type="button"
                          aria-pressed={paymentProvider === 'stripe'}
                          className={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${paymentProvider === 'stripe'
                            ? 'bg-white text-[#18448D] shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-600 hover:bg-white/70 hover:text-[#18448D]'}`}
                          disabled={checkoutLocked}
                          onClick={() => { if (!checkoutLocked) setPaymentProvider('stripe'); }}
                        >
                          Card &amp; wallets
                        </button>
                        <button
                          type="button"
                          aria-pressed={paymentProvider === 'paypal'}
                          aria-label="PayPal"
                          className={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${paymentProvider === 'paypal'
                            ? 'bg-[#FFC439] shadow-sm ring-1 ring-[#D9A400]'
                            : 'text-slate-600 hover:bg-[#FFF3C4]'}`}
                          disabled={checkoutLocked}
                          onClick={() => { if (!checkoutLocked) setPaymentProvider('paypal'); }}
                        >
                          <span aria-hidden="true" className="inline-flex items-baseline font-extrabold italic tracking-tight">
                            <span className="text-[#003087]">Pay</span><span className="text-[#0070BA]">Pal</span>
                          </span>
                        </button>
                      </div>
                    </div>

                    {paymentProvider === 'stripe' ? (
                      <StripeCheckout
                        publishableKey={stripeRuntime.publishableKey}
                        disabled={paymentSubmissionBlocked || checkoutLocked}
                        total={providerTotalCents}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                        resumeCheckout={activeCheckout}
                        onPaymentStateChange={handlePaymentStateChange}
                        onCanonicalQuote={handleCanonicalQuote}
                      />
                    ) : (
                      <PayPalCheckout
                        disabled={paymentSubmissionBlocked || (checkoutLocked && activeCheckout?.provider !== 'paypal')}
                        providerLocked={checkoutLocked}
                        total={providerTotalCents}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                        paypalOnly
                        resumeCheckout={activeCheckout}
                        onPaymentStateChange={handlePaymentStateChange}
                        onCanonicalQuote={handleCanonicalQuote}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2 rounded-lg border border-[#E7D9C7] bg-[#FCF7F0] p-3 shadow-sm">
                      <p className="text-xs text-gray-600">
                        Pay securely by card or PayPal. No PayPal account required.
                      </p>
                      <div className="flex justify-center">
                        <img
                          src="https://res.cloudinary.com/dtrxl120u/image/upload/v1778187843/8b1a7087-53d4-4389-a6b8-090268a31dd5_bscbcu.png"
                          alt="Accepted payment methods: Visa, Mastercard, American Express, Discover"
                          className="h-auto w-full max-w-[240px] sm:max-w-[280px] object-contain"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                    </div>
                    <PayPalCheckout
                      disabled={paymentSubmissionBlocked || (checkoutLocked && activeCheckout?.provider !== 'paypal')}
                      providerLocked={checkoutLocked}
                      total={providerTotalCents}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      cardFirstLayout
                      resumeCheckout={activeCheckout}
                      onPaymentStateChange={handlePaymentStateChange}
                      onCanonicalQuote={handleCanonicalQuote}
                    />
                  </div>
                )}

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { icon: <Lock className="h-3 w-3" />, label: 'Secure encrypted checkout' },
                      { icon: <CircleCheck className="h-3 w-3" />, label: 'Most standard orders: 24-hour production' },
                      { icon: <Truck className="h-3 w-3" />, label: 'Free next-day air anywhere in the U.S.' },
                    ].map((badge) => (
                      <span key={badge.label} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {badge.icon}
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-600">Secure checkout · No PayPal account required · Upload almost any file type · We check your file before production.</p>
                  <p className="text-xs text-gray-600">Production time and carrier transit are separate; delivery dates are estimates.</p>
                </div>
              </div>

              {user && (
                <div className="border-l-4 border-[#FF6A00] bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center bg-[#0B1F3A]">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-[#18448D] text-lg">Account</h3>
                  </div>
                  <p className="text-gray-700 font-semibold mb-1">{user.email}</p>
                  <p className="text-sm text-gray-600">
                    Order will be saved to your account
                  </p>
                </div>
              )}

              {!user && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-5">
                  <h3 className="font-semibold text-gray-900 text-base mb-2">Checking Out as a Guest</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    You can optionally create a free account after purchase to save your order history and reorder faster next time.
                  </p>
                  <div className="flex items-center gap-3 mt-3 text-sm">
                    <Button
                      variant="link"
                      onClick={() => navigate('/sign-in?from=checkout&next=/checkout')}
                      className="p-0 h-auto text-[#18448D]"
                    >
                      Sign In
                    </Button>
                    <span className="text-gray-300">•</span>
                    <Button
                      variant="link"
                      onClick={() => navigate('/sign-up?from=checkout&next=/checkout')}
                      className="p-0 h-auto text-gray-600 hover:text-[#18448D]"
                    >
                      Create Account
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
