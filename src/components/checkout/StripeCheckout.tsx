import React, { useEffect, useMemo, useState } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';

interface StripeCheckoutProps {
  total: number; // cents (informational; server prices the PaymentIntent)
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  /**
   * Optional callback invoked when the user opts to fall back to PayPal
   * after a Stripe initialization failure. Lets the parent switch its
   * payment-method tab so the customer can complete the order.
   */
  onSwitchToPayPal?: () => void;
}

const PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || '';

let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
};

// Inner form. Must be rendered inside <Elements> so the Stripe hooks work.
const StripePaymentForm: React.FC<{
  total: number;
  onSuccess: StripeCheckoutProps['onSuccess'];
  onError: StripeCheckoutProps['onError'];
  disabled?: boolean;
  paymentIntentId: string;
  orderId: string;
}> = ({ total, onSuccess, onError, disabled, paymentIntentId, orderId }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting || disabled) return;

    setSubmitting(true);
    try {
      console.log('[StripeCheckout] confirmPayment start', { orderId, paymentIntentId });
      // Confirm the payment in the browser. We don't redirect for normal
      // card / Apple Pay / Google Pay flows; only redirect-based methods
      // (e.g., bank redirects) need a return_url, hence redirect: 'if_required'.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/payment-success?orderId=${encodeURIComponent(orderId)}`,
        },
      });

      if (error) {
        console.error('[StripeCheckout] confirmPayment error:', error);
        toast({
          title: 'Payment Failed',
          description: error.message || 'Your card was not charged.',
          variant: 'destructive',
        });
        onError(error);
        return;
      }

      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        const status = paymentIntent?.status || 'unknown';
        console.warn('[StripeCheckout] payment not succeeded; status =', status);
        toast({
          title: 'Payment Not Completed',
          description: `Payment status: ${status}. Please try again.`,
          variant: 'destructive',
        });
        onError(new Error(`Stripe payment status: ${status}`));
        return;
      }

      console.log('[StripeCheckout] payment succeeded — finalizing order', {
        orderId,
        paymentIntentId: paymentIntent.id,
      });

      // Pull billing/shipping details from Stripe so we can update the
      // (already-existing) pending order row with real address data.
      const billing = (paymentIntent as any)?.charges?.data?.[0]?.billing_details
        || null;
      const stripeShipping = (paymentIntent as any)?.shipping || null;
      const stripeAddress = stripeShipping?.address || billing?.address || null;
      const shippingPayload = stripeAddress
        ? {
            name: stripeShipping?.name || billing?.name || null,
            line1: stripeAddress.line1 || null,
            line2: stripeAddress.line2 || null,
            city: stripeAddress.city || null,
            state: stripeAddress.state || null,
            postal_code: stripeAddress.postal_code || null,
            country: stripeAddress.country || null,
          }
        : null;

      // Mark the EXISTING pending order paid via the dedicated finalize
      // endpoint. We do NOT call create-order here — the order was
      // already persisted before the PaymentIntent was created.
      const finalizeResp = await fetch('/.netlify/functions/stripe-finalize-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          paymentIntentId: paymentIntent.id,
          shipping: shippingPayload,
          billing,
        }),
      });

      let finalizeResult: any = {};
      try { finalizeResult = await finalizeResp.json(); } catch (_e) { /* ignore */ }

      if (!finalizeResp.ok || !finalizeResult.ok) {
        // Payment succeeded with Stripe — and the pending order ALREADY
        // exists in our database (it was created before the
        // PaymentIntent). The webhook will retry the finalize on the
        // server side, so the order WILL be marked paid eventually.
        // Surface the real orderId so the success page can show
        // something useful.
        console.error('[StripeCheckout] finalize failed (webhook will retry):', finalizeResult);
        toast({
          title: 'Payment received',
          description: 'Your payment is being finalized. Order #' + orderId,
        });
        onSuccess(orderId, undefined);
        return;
      }

      console.log('[StripeCheckout] order finalized', {
        orderId: finalizeResult.orderId,
        alreadyPaid: !!finalizeResult.alreadyPaid,
        emailSent: !!finalizeResult.emailSent,
      });

      toast({
        title: 'Payment Successful!',
        description: `Payment of $${(total / 100).toFixed(2)} has been processed.`,
      });

      onSuccess(finalizeResult.orderId || orderId, undefined);
    } catch (err: any) {
      console.error('[StripeCheckout] payment exception:', err);
      toast({
        title: 'Payment Error',
        description: err?.message || 'Unexpected error processing payment.',
        variant: 'destructive',
      });
      onError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 min-h-[260px]">
        <PaymentElement
          options={{
            layout: { type: 'tabs', defaultCollapsed: false },
            // Apple Pay / Google Pay / Link are surfaced automatically when
            // automatic_payment_methods is enabled on the PaymentIntent.
            wallets: { applePay: 'auto', googlePay: 'auto' },
            // Capture phone for shipping/contact fallback.
            fields: { billingDetails: { phone: 'auto' } },
          }}
        />
      </div>
      <Button
        type="submit"
        disabled={!stripe || !elements || submitting || disabled}
        className="w-full bg-[#18448D] hover:bg-[#143a7a] text-white py-3 text-base sm:text-lg font-semibold rounded-xl shadow-sm whitespace-normal break-words leading-tight"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          `Pay $${(total / 100).toFixed(2)}`
        )}
      </Button>
      <p className="text-[11px] sm:text-xs text-gray-500 text-center leading-snug">
        Secured by <span className="font-semibold text-gray-700">Stripe</span> · Card details are encrypted and never touch our servers.
      </p>
    </form>
  );
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  total,
  onSuccess,
  onError,
  disabled = false,
  onSwitchToPayPal,
}) => {
  const { user } = useAuth();
  const {
    items,
    discountCode,
    sameDayHitService,
    saturdayDelivery,
  } = useCartStore();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The Stripe init flow (pending order create + PaymentIntent create)
  // is gated behind an explicit user action so we don't try to save an
  // order or talk to Stripe until the customer actually wants to pay
  // with a card / Apple Pay / Google Pay. Without this gate, a backend
  // error (e.g. database hiccup) would render a permanent "Could not
  // save your order" banner the moment the checkout page mounts —
  // which is exactly the bug we are fixing here.
  const [started, setStarted] = useState(false);
  // Bumping this triggers a re-run of the init effect (used by the
  // Retry button after a failure).
  const [attempt, setAttempt] = useState(0);

  const stripeReady = useMemo(() => getStripePromise(), []);

  // Reset any pending init state if the cart contents change before the
  // user has started the Stripe flow. We deliberately do NOT reset
  // `started` once init is in progress — that would cancel an in-flight
  // PaymentIntent request and frustrate the user.
  useEffect(() => {
    if (!started) {
      setClientSecret(null);
      setPaymentIntentId(null);
      setOrderId(null);
      setLoadError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, total, discountCode?.code, sameDayHitService, saturdayDelivery]);

  useEffect(() => {
    if (!started) return;
    if (!PUBLISHABLE_KEY) {
      setLoadError('Stripe publishable key not configured.');
      return;
    }
    if (!items || items.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    setOrderId(null);

    // Send the FULL item shape that create-order expects so the pending
    // order's order_items rows are populated correctly. The server-side
    // function persists a pending order BEFORE creating the
    // PaymentIntent, so we must give it everything it needs to insert.
    const fullItems = items.map((item) => ({
      width_in: item.width_in,
      height_in: item.height_in,
      quantity: item.quantity,
      material: item.material,
      grommets: item.grommets,
      pole_pockets: item.pole_pockets,
      pole_pocket_position: item.pole_pocket_position,
      rounded_corners: (item as any).rounded_corners,
      pole_pocket_size: item.pole_pocket_size,
      pole_pocket_cost_cents: item.pole_pocket_cost_cents,
      rope_feet: item.rope_feet,
      rope_placement: item.rope_placement,
      rope_cost_cents: item.rope_cost_cents,
      area_sqft: item.area_sqft,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      file_key: item.file_key,
      file_url: item.file_url,
      text_elements: item.text_elements,
      overlay_image: item.overlay_image,
      overlay_images: item.overlay_images,
      canvas_background_color: item.canvas_background_color,
      image_scale: item.image_scale,
      thumbnail_url: item.thumbnail_url,
      image_position: item.image_position,
      final_render_url: item.final_render_url,
      final_render_file_key: item.final_render_file_key,
      final_render_width_px: item.final_render_width_px,
      final_render_height_px: item.final_render_height_px,
      final_render_dpi: item.final_render_dpi,
      canvas_state_json: item.canvas_state_json,
      design_service_enabled: item.design_service_enabled,
      design_request_text: item.design_request_text,
      design_draft_preference: item.design_draft_preference,
      design_draft_contact: item.design_draft_contact,
      design_uploaded_assets: item.design_uploaded_assets,
      product_type: item.product_type || 'banner',
      yard_sign_sidedness: item.yard_sign_sidedness,
      yard_sign_step_stakes_enabled: item.yard_sign_step_stakes_enabled,
      yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty,
      yard_sign_design_count: item.yard_sign_design_count,
      yard_sign_designs: item.yard_sign_designs,
      yard_sign_signs_subtotal_cents: item.yard_sign_signs_subtotal_cents,
      yard_sign_stakes_subtotal_cents: item.yard_sign_stakes_subtotal_cents,
    }));

    fetch('/.netlify/functions/stripe-create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: fullItems,
        discountCode: discountCode
          ? {
              code: discountCode.code,
              discountPercentage: discountCode.discountPercentage,
              discountAmountCents: discountCode.discountAmountCents,
            }
          : null,
        email: user?.email || null,
        customer_name: (user as any)?.full_name || null,
        user_id: user?.id || null,
        sameDayHitService: !!sameDayHitService,
        saturdayDelivery: !!saturdayDelivery,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.clientSecret || !data.orderId) {
          // Log the real backend reason (error / details / cid) to the
          // console for debugging, but DO NOT show any of it to the
          // customer — they only get the friendly banner below.
          console.error('[StripeCheckout] init failed', {
            status: res.status,
            error: data?.error,
            message: data?.message,
            details: data?.details,
            cid: data?.cid,
          });
          throw new Error('init_failed');
        }
        if (cancelled) return;
        console.log('[StripeCheckout] pending order + PaymentIntent ready', {
          orderId: data.orderId,
          paymentIntentId: data.paymentIntentId,
        });
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || null);
        setOrderId(data.orderId);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[StripeCheckout] stripe-create-payment-intent failed:', err);
        // Customer-facing message must NEVER include developer detail
        // (status codes, "Failed to create order", correlation ids,
        // etc.). The error card is what the customer sees.
        setLoadError('init_failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // We intentionally re-create the PaymentIntent (and pending order)
    // when the priced total or eligibility changes, OR when the user
    // hits Retry (`attempt`). Recreating is cheap (Stripe doesn't
    // charge until confirmation) and keeps the amount in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    started,
    attempt,
    total,
    items.length,
    discountCode?.code,
    sameDayHitService,
    saturdayDelivery,
  ]);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
        Card / Apple Pay checkout is not configured. Please use PayPal.
      </div>
    );
  }

  if (loadError) {
    // Pending-order creation failed → we did NOT create a PaymentIntent
    // and the customer was NOT charged (enforced server-side in
    // stripe-create-payment-intent.cjs). Show a small, professional
    // card with a Try Again primary action and a PayPal fallback.
    // Developer detail (cid/ref/error code) is logged to the console
    // only — never shown to the customer.
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        <p className="font-semibold mb-1">We couldn’t start card payment</p>
        <p className="text-red-700/90">
          Your card was <strong>not</strong> charged. Please try again, or use
          PayPal to complete your order.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
            disabled={loading}
            className="w-full sm:w-auto bg-[#18448D] hover:bg-[#143a7a] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Trying again...
              </>
            ) : (
              'Try Again'
            )}
          </Button>
          {onSwitchToPayPal && (
            <Button
              type="button"
              variant="outline"
              onClick={onSwitchToPayPal}
              className="w-full sm:w-auto border-red-300 text-red-800 hover:bg-red-100"
            >
              Use PayPal
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Initial state: explicit "start" gate. We do NOT create a pending
  // order or talk to Stripe until the user clicks this button. This is
  // the requirement: "Stripe should not show a permanent error on page
  // load unless the user selects Stripe and tries to start payment."
  if (!started) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3 min-h-[180px]">
        <p className="text-sm text-gray-700 leading-snug">
          Pay securely with your card, Apple Pay, Google Pay, or Link.
        </p>
        <Button
          type="button"
          disabled={disabled || !items || items.length === 0}
          onClick={() => setStarted(true)}
          className="w-full bg-[#18448D] hover:bg-[#143a7a] text-white py-3 px-4 text-base sm:text-lg font-semibold rounded-xl shadow-sm leading-tight whitespace-normal break-words text-center"
          size="lg"
        >
          {/* Mobile: short label so it never overflows.
              ≥sm: full label including Apple Pay. */}
          <span className="sm:hidden">Continue to Pay</span>
          <span className="hidden sm:inline">Continue with Card or Apple Pay</span>
        </Button>
        <p className="text-[11px] sm:text-xs text-gray-500 text-center leading-snug">
          Secured by <span className="font-semibold text-gray-700">Stripe</span> · 256-bit SSL · PCI compliant
        </p>
      </div>
    );
  }

  if (loading || !clientSecret || !orderId) {
    return (
      <div className="flex items-center justify-center py-12 min-h-[260px] rounded-xl border border-gray-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin mr-2 text-[#18448D]" />
        <span className="text-gray-700">Loading payment form...</span>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripeReady}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            // Match Banners on the Fly: navy primary, orange accent,
            // rounded corners, system font, comfortable spacing.
            colorPrimary: '#18448D',
            colorText: '#1f2937',
            colorTextSecondary: '#6b7280',
            colorBackground: '#ffffff',
            colorDanger: '#dc2626',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSizeBase: '15px',
            borderRadius: '10px',
            spacingUnit: '4px',
          },
          rules: {
            '.Tab': {
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            },
            '.Tab--selected': {
              borderColor: '#18448D',
              color: '#18448D',
              backgroundColor: '#f5f8ff',
            },
            '.Input': {
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            },
            '.Input:focus': {
              borderColor: '#18448D',
              boxShadow: '0 0 0 3px rgba(24, 68, 141, 0.15)',
            },
            '.Label': { fontWeight: '500' },
          },
        },
      }}
    >
      <StripePaymentForm
        total={total}
        onSuccess={onSuccess}
        onError={onError}
        disabled={disabled}
        paymentIntentId={paymentIntentId || ''}
        orderId={orderId}
      />
    </Elements>
  );
};

export default StripeCheckout;
