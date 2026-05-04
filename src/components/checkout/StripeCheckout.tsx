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
}> = ({ total, onSuccess, onError, disabled, paymentIntentId }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    items,
    discountCode,
    sameDayHitService,
    saturdayDelivery,
  } = useCartStore();
  const [submitting, setSubmitting] = useState(false);

  const buildItemsPayload = () =>
    items.map((item) => ({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting || disabled) return;

    setSubmitting(true);
    try {
      // Confirm the payment in the browser. We don't redirect for normal
      // card / Apple Pay / Google Pay flows; only redirect-based methods
      // (e.g., bank redirects) need a return_url, hence redirect: 'if_required'.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
      });

      if (error) {
        console.error('Stripe confirmPayment error:', error);
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
        console.warn('Stripe payment did not succeed; status =', status);
        toast({
          title: 'Payment Not Completed',
          description: `Payment status: ${status}. Please try again.`,
          variant: 'destructive',
        });
        onError(new Error(`Stripe payment status: ${status}`));
        return;
      }

      // Pull billing details from the PaymentMethod when available so we
      // can pre-fill shipping/customer fields on the order.
      const billing = (paymentIntent as any)?.charges?.data?.[0]?.billing_details
        || null;
      const shipping = (paymentIntent as any)?.shipping || null;

      const customerName =
        shipping?.name ||
        billing?.name ||
        user?.user_metadata?.full_name ||
        user?.email ||
        null;

      const shippingAddress = shipping?.address || billing?.address || null;

      const orderResponse = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || billing?.email || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          payment_method: 'stripe',
          stripe_payment_intent_id: paymentIntent.id,
          customer_name: customerName,
          customer_first_name: customerName
            ? String(customerName).trim().split(/\s+/)[0]
            : null,
          shipping_name: shipping?.name || billing?.name || null,
          shipping_street: shippingAddress?.line1 || null,
          shipping_street2: shippingAddress?.line2 || null,
          shipping_city: shippingAddress?.city || null,
          shipping_state: shippingAddress?.state || null,
          shipping_zip: shippingAddress?.postal_code || null,
          shipping_country: shippingAddress?.country || 'US',
          shippingAddress: shippingAddress
            ? {
                name: shipping?.name || billing?.name || '',
                line1: shippingAddress.line1 || '',
                line2: shippingAddress.line2 || '',
                city: shippingAddress.city || '',
                state: shippingAddress.state || '',
                postalCode: shippingAddress.postal_code || '',
                country: shippingAddress.country || 'US',
              }
            : null,
          items: buildItemsPayload(),
          discountCode: discountCode
            ? {
                code: discountCode.code,
                discountPercentage: discountCode.discountPercentage,
                discountAmountCents: discountCode.discountAmountCents,
              }
            : null,
          sameDayHitService: !!sameDayHitService,
          saturdayDelivery: !!saturdayDelivery,
        }),
      });

      let orderResult: any = {};
      if (orderResponse.ok) {
        orderResult = await orderResponse.json().catch(() => ({}));
      } else {
        // Payment succeeded but order persistence failed. Don't lose the
        // sale: surface the PaymentIntent id to the user via the success
        // handler so support can reconcile.
        console.error('Stripe payment succeeded but create-order failed:',
          orderResponse.status);
      }

      toast({
        title: 'Payment Successful!',
        description: `Payment of $${(total / 100).toFixed(2)} has been processed.`,
      });

      const orderId = orderResult?.orderId || paymentIntent.id;
      onSuccess(orderId, orderResult?.order);
    } catch (err: any) {
      console.error('Stripe payment exception:', err);
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

  // Suppress unused-variable lint on paymentIntentId — it's intentionally
  // kept on the form for debugging / future use.
  void paymentIntentId;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
          // Apple Pay / Google Pay / Link are surfaced automatically when
          // automatic_payment_methods is enabled on the PaymentIntent.
          wallets: { applePay: 'auto', googlePay: 'auto' },
        }}
      />
      <Button
        type="submit"
        disabled={!stripe || !elements || submitting || disabled}
        className="w-full bg-[#18448D] hover:bg-[#143a7a] text-white py-3 text-lg font-semibold"
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
    </form>
  );
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  total,
  onSuccess,
  onError,
  disabled = false,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stripeReady = useMemo(() => getStripePromise(), []);

  useEffect(() => {
    if (!PUBLISHABLE_KEY) {
      setLoadError('Stripe publishable key not configured.');
      return;
    }
    if (!items || items.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    fetch('/.netlify/functions/stripe-create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((item) => ({
          width_in: item.width_in,
          height_in: item.height_in,
          quantity: item.quantity,
          material: item.material,
          line_total_cents: item.line_total_cents,
          product_type: item.product_type || 'banner',
        })),
        discountCode: discountCode
          ? {
              code: discountCode.code,
              discountPercentage: discountCode.discountPercentage,
              discountAmountCents: discountCode.discountAmountCents,
            }
          : null,
        email: user?.email || null,
        user_id: user?.id || null,
        sameDayHitService: !!sameDayHitService,
        saturdayDelivery: !!saturdayDelivery,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || `Failed to initialize Stripe (${res.status})`);
        }
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('stripe-create-payment-intent failed:', err);
        setLoadError(err?.message || 'Failed to initialize Stripe.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // We intentionally re-create the PaymentIntent when the priced total
    // or eligibility changes. Recreating is cheap (Stripe doesn't charge
    // until confirmation) and keeps the amount in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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

  if (loading || !clientSecret) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading payment form...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
        {loadError}
      </div>
    );
  }

  return (
    <Elements
      stripe={stripeReady}
      options={{
        clientSecret,
        appearance: { theme: 'stripe' },
      }}
    >
      <StripePaymentForm
        total={total}
        onSuccess={onSuccess}
        onError={onError}
        disabled={disabled}
        paymentIntentId={paymentIntentId || ''}
      />
    </Elements>
  );
};

export default StripeCheckout;
