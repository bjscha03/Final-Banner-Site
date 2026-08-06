import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { Loader2 } from 'lucide-react';
import { shouldUseDeployPreviewTestCheckout } from './checkoutEnvironment';
import { gtag } from '@/lib/analytics';
import { getStoredAttribution } from '@/lib/attribution';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void; // orderData includes server-computed pricing
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live' | null;
}

const getFirstNonEmpty = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const extractShippingFromCapture = (captureResult: any) => {
  const directShipping = captureResult?.shippingAddress || null;
  const paypalShipping = captureResult?.paypalData?.purchase_units?.[0]?.shipping || null;
  const payer = captureResult?.paypalData?.payer || null;
  const shippingAddress = directShipping || paypalShipping?.address || payer?.address || {};

  const name = getFirstNonEmpty(
    directShipping?.name,
    paypalShipping?.name?.full_name,
    `${payer?.name?.given_name || ''} ${payer?.name?.surname || ''}`
  );
  const street = getFirstNonEmpty(directShipping?.street, shippingAddress?.address_line_1, shippingAddress?.line1, shippingAddress?.street);
  const street2 = getFirstNonEmpty(directShipping?.street2, shippingAddress?.address_line_2, shippingAddress?.line2, shippingAddress?.street2);
  const city = getFirstNonEmpty(directShipping?.city, shippingAddress?.admin_area_2, shippingAddress?.city);
  const state = getFirstNonEmpty(directShipping?.state, shippingAddress?.admin_area_1, shippingAddress?.state, shippingAddress?.region);
  const zip = getFirstNonEmpty(directShipping?.zip, shippingAddress?.postal_code, shippingAddress?.zip);
  const country = getFirstNonEmpty(directShipping?.country, shippingAddress?.country_code, shippingAddress?.country);

  const hasData = Boolean(name || street || street2 || city || state || zip || country);
  if (!hasData) return null;

  return {
    name: name || null,
    street: street || null,
    street2: street2 || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    country: country || 'US',
  };
};

const trackCheckoutPaymentClick = (method: 'card' | 'paypal') => {
  gtag('event', 'payment_button_click', {
    payment_method: method,
    device_type: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
};

// Shared across both funding widgets and component remounts. This is only a
// latency/UX guard; the server remains the payment authority.
const paypalPreparationFlights = new Map<string, Promise<string>>();

const PayPalCheckout: React.FC<PayPalCheckoutProps> = ({ total, onSuccess, onError, disabled = false, cardFirstLayout = false }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCapturingPayment, setIsCapturingPayment] = useState(false);
  const isDeployPreview = shouldUseDeployPreviewTestCheckout();
  const internalOrderIdRef = useRef<string | null>(null);
  const approvalFlightRef = useRef<Promise<void> | null>(null);
  const paymentReceivedRef = useRef(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const checkoutSignature = useMemo(() => JSON.stringify({
    total,
    items: items.map(({ line_total_cents, quantity, width_in, height_in, material, product_type }) =>
      ({ line_total_cents, quantity, width_in, height_in, material, product_type })),
    discount: discountCode?.code || null,
    sameDayHitService: !!sameDayHitService,
    saturdayDelivery: !!saturdayDelivery,
  }), [total, items, discountCode?.code, sameDayHitService, saturdayDelivery]);
  const storageKey = `paypal-checkout:${checkoutSignature}`;
  const checkoutIdempotencyKeyRef = useRef<string>('');

  if (!checkoutIdempotencyKeyRef.current) {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    try {
      const state = saved ? JSON.parse(saved) : null;
      checkoutIdempotencyKeyRef.current = state?.checkoutKey || crypto.randomUUID();
      internalOrderIdRef.current = state?.internalOrderId || null;
    } catch {
      checkoutIdempotencyKeyRef.current = crypto.randomUUID();
    }
  }

  const persistCheckoutLock = (processing = false, received = false) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ checkoutKey: checkoutIdempotencyKeyRef.current, internalOrderId: internalOrderIdRef.current, processing, received }));
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (saved?.received || saved?.processing) {
        paymentReceivedRef.current = true;
        setPaymentReceived(true);
      }
    } catch { /* a corrupt UX cache cannot affect server-side correctness */ }
  }, [storageKey]);

  // Load PayPal configuration on mount
  useEffect(() => {
    if (isDeployPreview) {
      setPaypalConfig(null);
      setIsLoadingConfig(false);
      return;
    }

    console.log('[PayPalCheckout] Loading PayPal configuration...');
    const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';

    const setFallbackConfig = () => {
      const fallbackClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || import.meta.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
      if (fallbackClientId) {
        console.log('[PayPalCheckout] Using fallback config with client ID');
        setPaypalConfig({
          enabled: true,
          clientId: fallbackClientId,
          environment: 'live', // Or determine from another env var
        });
      } else {
        console.error('[PayPalCheckout] PayPal fallback failed: VITE_PAYPAL_CLIENT_ID is not set.');
        setPaypalConfig({ enabled: false, clientId: null, environment: null });
      }
    };

    const loadPayPalConfig = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[PayPalCheckout] PayPal config fetch timed out after 4 seconds');
        controller.abort();
      }, 4000);

      try {
        console.log('[PayPalCheckout] Fetching PayPal config from function...');
        const response = await fetch('/.netlify/functions/paypal-config', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const config = await response.json();
          console.log('[PayPalCheckout] PayPal config loaded successfully:', config);
          setPaypalConfig(config);
        } else {
          console.error('[PayPalCheckout] Failed to load PayPal config:', response.status);
          throw new Error(`Failed to load PayPal config: ${response.status}`);
        }
      } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error
        console.error('[PayPalCheckout] Error loading PayPal config:', error);
        setFallbackConfig();
      } finally {
        console.log('[PayPalCheckout] Setting isLoadingConfig to false');
        setIsLoadingConfig(false);
      }
    };

    loadPayPalConfig();
  }, [isDeployPreview]);

  // Admin test payment handler
  const handleTestPayment = async () => {
    try {
      setIsCreatingOrder(true);

      // Log user state for debugging
      console.log('🔍 PayPal Create Order - User:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      // Log user state for debugging
      console.log('🔍 PayPal Create Order - User:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      // Log user state for debugging
      console.log('🔍 PayPal Create Order - User:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      // Log user state for debugging
      console.log('🔍 PayPal Create Order - User:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      toast({
        title: "Test Payment Processed",
        description: "This is an admin test payment. Order will be created with test payment provider.",
      });

      // Call existing create-order endpoint with test payment
      const response = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          items: items.map(item => ({
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
            file_name: item.file_name,
            file_url: item.file_url,
            is_pdf: item.is_pdf,
            artwork_manifest: item.artwork_manifest,
            placement_preview: item.placement_preview,
            text_elements: item.text_elements,
            overlay_image: item.overlay_image,
            overlay_images: item.overlay_images,
            canvas_background_color: item.canvas_background_color,
            image_scale: item.image_scale,
            image_scale_y: item.image_scale_y,
            thumbnail_url: item.thumbnail_url,
            web_preview_url: item.web_preview_url,
            image_position: item.image_position,
            fit_mode: item.fit_mode,
            final_render_url: item.final_render_url,
            final_render_file_key: item.final_render_file_key,
            final_render_width_px: item.final_render_width_px,
            final_render_height_px: item.final_render_height_px,
            final_render_dpi: item.final_render_dpi,
            canvas_state_json: item.canvas_state_json,
            // Design Service fields - "Let Us Design It" orders
            design_service_enabled: item.design_service_enabled,
            design_request_text: item.design_request_text,
            design_draft_preference: item.design_draft_preference,
            design_draft_contact: item.design_draft_contact,
            design_uploaded_assets: item.design_uploaded_assets,
            // Product type (yard_sign or banner)
            product_type: item.product_type || 'banner',
            // Yard sign metadata
            yard_sign_sidedness: item.yard_sign_sidedness,
            yard_sign_step_stakes_enabled: item.yard_sign_step_stakes_enabled,
            yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty,
            yard_sign_design_count: item.yard_sign_design_count,
            yard_sign_designs: item.yard_sign_designs,
            yard_sign_signs_subtotal_cents: item.yard_sign_signs_subtotal_cents,
            yard_sign_stakes_subtotal_cents: item.yard_sign_stakes_subtotal_cents,
          })),
          discountCode: discountCode ? { code: discountCode.code, discountPercentage: discountCode.discountPercentage, discountAmountCents: discountCode.discountAmountCents } : null,
          checkout_mode: 'admin_deploy_preview_test',
          payment_method: 'admin_deploy_preview_test',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onSuccess(result.id, result.order);
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || 'Test payment failed');
      }
    } catch (error) {
      console.error('Test payment error:', error);
      onError(error);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  if (isDeployPreview) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-gray-700 text-sm">
            <strong>Deploy Preview Test Checkout:</strong> Create this order without processing a real payment.
          </p>
        </div>

        <Button
          onClick={handleTestPayment}
          disabled={disabled || isCreatingOrder || isCapturingPayment}
          variant="outline"
          className="w-full border-green-300 text-green-700 hover:bg-green-50"
          size="lg"
        >
          {isCreatingOrder ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing Test Payment...
            </>
          ) : (
            'Place Test Order — No Payment'
          )}
        </Button>
      </div>
    );
  }

  // Loading state
  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading secure checkout…</span>
      </div>
    );
  }

  // Debug information (remove this in production)
  console.log('PayPal config state:', paypalConfig);

  // PayPal disabled or not configured
  if (!paypalConfig?.enabled || !paypalConfig?.clientId) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm">
            <strong>PayPal Unavailable:</strong> PayPal payments are currently disabled or not configured.
            {isDeployPreview && ' Use the deploy-preview test payment button below.'}
            <br />
            <small>If this persists, please refresh or contact support.</small>
          </p>
        </div>

        {isDeployPreview && (
          <Button
            onClick={handleTestPayment}
            disabled={isCreatingOrder}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg font-semibold"
            size="lg"
          >
            {isCreatingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing Test Payment...
              </>
            ) : (
              'Place Test Order — No Payment'
            )}
          </Button>
        )}
      </div>
    );
  }

  // PayPal order creation handler
  const preparePayPalOrder = async () => {
    try {
      setIsCreatingOrder(true);

      // Log user state for debugging
      console.log("🔍 PayPal Create Order - User:", {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      // Development fallback - if functions aren't available, return a mock order ID
      const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';

      // Persist the complete application order and artwork manifest before any
      // payment can be approved or captured. The idempotency key makes PayPal
      // button retries return the same pending order.
      if (!internalOrderIdRef.current) {
        const pendingResponse = await fetch('/.netlify/functions/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id || null,
            email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
            subtotal_cents: total,
            tax_cents: 0,
            total_cents: total,
            currency: 'usd',
            payment_method: 'paypal',
            payment_status: 'pending',
            checkout_idempotency_key: checkoutIdempotencyKeyRef.current,
            items,
            discountCode,
            sameDayHitService: !!sameDayHitService,
            saturdayDelivery: !!saturdayDelivery,
            attribution: getStoredAttribution(),
          }),
        });
        const pending = await pendingResponse.json().catch(() => ({}));
        if (!pendingResponse.ok || !pending.orderId) throw new Error(pending.message || pending.error || 'Could not safely persist the order before payment');
        internalOrderIdRef.current = pending.orderId;
        persistCheckoutLock();
      }
      
      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Pass the authoritative client-side total so PayPal amount matches the
          // displayed checkout total exactly (avoids 1-cent floating-point drift).
          totalCents: total,
          items: items.map(item => ({
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
            web_preview_url: item.web_preview_url,
            image_position: item.image_position,
            final_render_url: item.final_render_url,
            final_render_file_key: item.final_render_file_key,
            final_render_width_px: item.final_render_width_px,
            final_render_height_px: item.final_render_height_px,
            final_render_dpi: item.final_render_dpi,
            canvas_state_json: item.canvas_state_json,
            // Design Service fields - "Let Us Design It" orders
            design_service_enabled: item.design_service_enabled,
            design_request_text: item.design_request_text,
            design_draft_preference: item.design_draft_preference,
            design_draft_contact: item.design_draft_contact,
            design_uploaded_assets: item.design_uploaded_assets,
            // Product type (yard_sign or banner) - REQUIRED so the server
            // correctly excludes yard signs from the banner quantity-discount
            // tier when computing the PayPal order amount.
            product_type: item.product_type || 'banner',
            // Yard sign metadata
            yard_sign_sidedness: item.yard_sign_sidedness,
            yard_sign_step_stakes_enabled: item.yard_sign_step_stakes_enabled,
            yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty,
            yard_sign_design_count: item.yard_sign_design_count,
            yard_sign_designs: item.yard_sign_designs,
            yard_sign_signs_subtotal_cents: item.yard_sign_signs_subtotal_cents,
            yard_sign_stakes_subtotal_cents: item.yard_sign_stakes_subtotal_cents,
          })),
          email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
          user_id: user?.id || null,
          // Include discount code for server-side validation and total calculation
          discountCode: discountCode ? {
            code: discountCode.code,
            discountPercentage: discountCode.discountPercentage,
            discountAmountCents: discountCode.discountAmountCents,
          } : null,
          // Same-Day Hit Service flags. The server is authoritative — it
          // re-validates the ET window and product eligibility and may
          // strip these flags before charging PayPal.
          sameDayHitService: !!sameDayHitService,
          saturdayDelivery: !!saturdayDelivery,
          attribution: getStoredAttribution(),
          internalOrderId: internalOrderIdRef.current,
        }),
      });

      if (!response.ok) {
        if (isDev) {
          console.log('Development mode: Using mock PayPal order ID');
          return `DEV_ORDER_${Date.now()}`;
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create PayPal order');
      }

      const result = await response.json();
      return result.paypalOrderId;
    } catch (error) {
      console.error('PayPal create order error:', error);
      
      // Development fallback
      const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
      if (isDev) {
        console.log('Development mode: Using mock PayPal order ID due to error');
        return `DEV_ORDER_${Date.now()}`;
      }
      
      throw error;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleCreateOrder = () => {
    const flightKey = `${checkoutSignature}:${internalOrderIdRef.current || checkoutIdempotencyKeyRef.current}`;
    const existing = paypalPreparationFlights.get(flightKey);
    if (existing) return existing;
    const flight = preparePayPalOrder().catch((error) => {
      paypalPreparationFlights.delete(flightKey);
      throw error;
    });
    paypalPreparationFlights.set(flightKey, flight);
    return flight;
  };

  // PayPal order approval handler
  const approveOnce = async (data: any) => {
    try {
      setIsCapturingPayment(true);
      persistCheckoutLock(true, false);
      
      const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';

      // First capture the PayPal payment
      const captureResponse = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ orderID: data.orderID, internalOrderId: internalOrderIdRef.current }),
      });
      
      let captureResult: any = {};
      
      // Parse every response, including non-2xx reconciliation responses.
      captureResult = await captureResponse.json().catch(()=> ({}));
      if (!captureResponse.ok && isDev) {
        console.log('Development mode: Using mock capture result');
        captureResult = {
          ok: true,
          paypalData: {
            id: `DEV_CAPTURE_${Date.now()}`,
            payer: { email_address: user?.email || 'dev@test.com' }
          }
        };
      }

      if (captureResult?.paymentCaptured && captureResult?.reconciliationRequired) {
        paymentReceivedRef.current = true;
        setPaymentReceived(true);
        persistCheckoutLock(true, true);
        toast({
          title: 'Payment received',
          description: 'Your payment was received. Your order is being verified. Do not submit another payment.',
        });
        return;
      }
      
      if (!captureResponse.ok && !isDev) {
        console.error('Payment capture error:', captureResult || captureResponse.status);
        alert(`Payment failed: ${captureResult?.error || 'Unknown error'}\nStatus: ${captureResponse.status}`);
        return;
      }

      if (!isDev && (captureResult?.status !== 'COMPLETED' || captureResult?.captureStatus !== 'COMPLETED' || !captureResult?.captureID)) {
        console.error('PayPal capture did not complete:', captureResult);
        alert('PayPal did not return a completed payment capture. Your card was not recorded as paid by this site. Please contact support if PayPal shows a charge.');
        return;
      }

      const shippingDetails = extractShippingFromCapture(captureResult);
      const customerName = getFirstNonEmpty(
        shippingDetails?.name,
        `${captureResult?.paypalData?.payer?.name?.given_name || ''} ${captureResult?.paypalData?.payer?.name?.surname || ''}`,
        user?.user_metadata?.full_name,
        user?.email
      );

      // The database order was created before PayPal and atomically marked paid
      // by paypal-capture-minimal. Keep this payload only for receipt data and
      // legacy deploy-preview behavior; never create a second paid order.
      const orderPayload = {
          user_id: user?.id || null,
          email: user?.email || captureResult.paypalData?.payer?.email_address || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          paypal_order_id: data.orderID,
          paypal_capture_id: captureResult.captureID || captureResult.paypalData?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
          paypal_captured_amount_cents: captureResult.capturedAmountCents || null,
          paypal_captured_currency: captureResult.capturedCurrency || null,
          shipping_name: shippingDetails?.name || null,
          customer_name: customerName || null,
          customer_first_name: customerName
            ? String(customerName).trim().split(/\s+/)[0]
            : null,
          shipping_street: shippingDetails?.street || null,
          shipping_street2: shippingDetails?.street2 || null,
          shipping_city: shippingDetails?.city || null,
          shipping_state: shippingDetails?.state || null,
          shipping_zip: shippingDetails?.zip || null,
          shipping_country: shippingDetails ? (shippingDetails.country || 'US') : null,
          shippingAddress: shippingDetails ? {
            name: shippingDetails.name || '',
            line1: shippingDetails.street || '',
            line2: shippingDetails.street2 || '',
            city: shippingDetails.city || '',
            state: shippingDetails.state || '',
            postalCode: shippingDetails.zip || '',
            country: shippingDetails.country || 'US',
          } : null,
          items: items.map(item => {
            // DEBUG: Log design service fields for each item
            console.log('🎨 [PayPal Capture] Item design service data:', {
              design_service_enabled: item.design_service_enabled,
              design_request_text: item.design_request_text ? item.design_request_text.substring(0, 50) : null,
              design_draft_preference: item.design_draft_preference,
              design_draft_contact: item.design_draft_contact,
              design_uploaded_assets_count: item.design_uploaded_assets?.length || 0,
            });
            return {
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
              file_name: item.file_name,
              file_url: item.file_url,
              is_pdf: item.is_pdf,
              artwork_manifest: item.artwork_manifest,
              placement_preview: item.placement_preview,
              text_elements: item.text_elements,
              overlay_image: item.overlay_image,
              overlay_images: item.overlay_images,
              canvas_background_color: item.canvas_background_color,
              image_scale: item.image_scale,
              image_scale_y: item.image_scale_y,
              thumbnail_url: item.thumbnail_url,
              web_preview_url: item.web_preview_url,
              image_position: item.image_position,
              fit_mode: item.fit_mode,
              final_render_url: item.final_render_url,
              final_render_file_key: item.final_render_file_key,
              final_render_width_px: item.final_render_width_px,
              final_render_height_px: item.final_render_height_px,
              final_render_dpi: item.final_render_dpi,
              canvas_state_json: item.canvas_state_json,
              // Design Service fields - "Let Us Design It" orders
              design_service_enabled: item.design_service_enabled,
              design_request_text: item.design_request_text,
              design_draft_preference: item.design_draft_preference,
              design_draft_contact: item.design_draft_contact,
              design_uploaded_assets: item.design_uploaded_assets,
              // Product type (yard_sign or banner)
              product_type: item.product_type || 'banner',
              // Yard sign metadata
              yard_sign_sidedness: item.yard_sign_sidedness,
              yard_sign_step_stakes_enabled: item.yard_sign_step_stakes_enabled,
              yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty,
              yard_sign_design_count: item.yard_sign_design_count,
              yard_sign_designs: item.yard_sign_designs,
              yard_sign_signs_subtotal_cents: item.yard_sign_signs_subtotal_cents,
              yard_sign_stakes_subtotal_cents: item.yard_sign_stakes_subtotal_cents,
            };
          }),
          discountCode: discountCode ? { code: discountCode.code, discountPercentage: discountCode.discountPercentage, discountAmountCents: discountCode.discountAmountCents } : null,
          // Same-Day Hit Service flags (server re-validates, recomputes fees,
          // and persists same_day_* columns onto the order).
          sameDayHitService: !!sameDayHitService,
          saturdayDelivery: !!saturdayDelivery,
          attribution: getStoredAttribution(),
        };

      const orderResult: any = { ok: true, orderId: internalOrderIdRef.current, order: orderPayload };

      paymentReceivedRef.current = true;
      setPaymentReceived(true);
      persistCheckoutLock(true, true);

      toast({
        title: "Payment Successful!",
        description: `Payment of $${(total / 100).toFixed(2)} has been processed.${isDev ? ' (Development Mode)' : ''}`,
      });

      // Use database order ID if available, otherwise PayPal order ID
      const orderId = orderResult?.orderId || data.orderID;
      onSuccess(orderId, orderResult?.order);
    } catch (e: any) {
      console.error('Payment exception:', e);
      alert(e?.message || 'We could not verify the payment status. Do not submit another payment; contact support.');
      onError(e);
    } finally {
      setIsCapturingPayment(false);
    }
  };

  const handleApprove = (data: any) => {
    if (approvalFlightRef.current) return approvalFlightRef.current;
    const flight = approveOnce(data).finally(() => {
      // A completed/reconciliation payment remains locked. Only pre-capture
      // failures may start a later approval callback.
      if (!paymentReceivedRef.current) approvalFlightRef.current = null;
    });
    approvalFlightRef.current = flight;
    return flight;
  };

  const initialOptions = {
    clientId: paypalConfig.clientId!,
    currency: "USD",
    intent: "capture" as const,
    commit: true,
    vault: false,
    disableFunding: "paylater,credit" as any, // Disable Pay Later and PayPal Credit options
  };

  return (
    <div className="space-y-4">
      {/* Loading states */}
      {(isCreatingOrder || isCapturingPayment || paymentReceived) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-blue-800 text-sm">
              {isCreatingOrder && "Preparing your order..."}
              {isCapturingPayment && !paymentReceived && "Processing payment..."}
              {paymentReceived && "Your payment was received. Your order is being verified. Do not submit another payment."}
            </span>
          </div>
        </div>
      )}

      <PayPalScriptProvider options={initialOptions}>

      <p className="mb-3 text-xs text-gray-600">Pay securely by card or PayPal. No PayPal account required.</p>
        <div className="relative z-10">
          {cardFirstLayout ? (
            <div className="space-y-2.5">
              <PayPalButtons
                key={`card-${total}`}
                fundingSource={"card" as any}
                style={{ layout: "vertical", color: "black", shape: "rect", label: "checkout", height: 45 }}
                disabled={disabled || isCreatingOrder || isCapturingPayment || paymentReceived}
                onClick={() => trackCheckoutPaymentClick('card')}
                createOrder={async () => handleCreateOrder()}
                onApprove={handleApprove}
                onError={(error) => onError(error)}
              />
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-[#E7D9C7]" />
                <span className="text-[11px] text-[#8B7355]">or</span>
                <span className="h-px flex-1 bg-[#E7D9C7]" />
              </div>
              <PayPalButtons
                key={`paypal-${total}`}
                fundingSource={"paypal" as any}
                style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 42 }}
                disabled={disabled || isCreatingOrder || isCapturingPayment || paymentReceived}
                onClick={() => trackCheckoutPaymentClick('paypal')}
                createOrder={async () => handleCreateOrder()}
                onApprove={handleApprove}
                onError={(error) => onError(error)}
              />
            </div>
          ) : (
            <PayPalButtons
              key={total}
              style={{
                layout: "vertical",
                color: "blue",
                shape: "rect",
                label: "paypal",
              }}
              disabled={disabled || isCreatingOrder || isCapturingPayment || paymentReceived}
              createOrder={async (data, actions) => {
                const paypalOrderId = await handleCreateOrder();
                return paypalOrderId;
              }}
              onApprove={handleApprove}
              onError={(error) => {
                console.error('PayPal error:', error);
                toast({
                  title: "Payment Error",
                  description: "Payment could not be completed. Your card was not charged.",
                  variant: "destructive",
                });
                onError(error);
              }}
              onCancel={() => {
                toast({
                  title: "Payment Cancelled",
                  description: "You cancelled the payment. Your order was not created.",
                });
              }}
            />
          )}
        </div>
      </PayPalScriptProvider>

      {/* Deploy Preview Test Checkout */}
      {isDeployPreview && (
        <div className="border-t pt-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-gray-700 text-sm">
              <strong>Deploy Preview Admin Access:</strong> Create this order without processing a real payment.
            </p>
          </div>

          <Button
            onClick={handleTestPayment}
            disabled={disabled || isCreatingOrder || isCapturingPayment}
            variant="outline"
            className="w-full border-green-300 text-green-700 hover:bg-green-50"
            size="lg"
          >
            {isCreatingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing Test Payment...
              </>
            ) : (
              'Place Test Order — No Payment'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PayPalCheckout;
