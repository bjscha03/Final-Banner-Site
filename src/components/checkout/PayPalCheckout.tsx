import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { Loader2 } from 'lucide-react';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string) => void;
  onError: (error: any) => void;
  disabled?: boolean;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live' | null;
}

const PayPalCheckout: React.FC<PayPalCheckoutProps> = ({ total, onSuccess, onError, disabled = false }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode } = useCartStore();
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCapturingPayment, setIsCapturingPayment] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Load PayPal configuration on mount
  useEffect(() => {
    console.log('[PayPalCheckout] Loading PayPal configuration...');
    const isDev = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

    const setFallbackConfig = () => {
      const fallbackClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
      if (fallbackClientId) {
        console.log('[PayPalCheckout] Using fallback config with client ID');
        setPaypalConfig({
          enabled: true,
          clientId: fallbackClientId,
          environment: 'live', // Or determine from another env var
        });
      } else {
        console.error('[PayPalCheckout] PayPal fallback failed: NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set.');
        setPaypalConfig({ enabled: false, clientId: null, environment: null });
      }
    };

    const loadPayPalConfig = async () => {
      // CRITICAL FIX: Add timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.error('[PayPalCheckout] PayPal config fetch timed out after 10 seconds');
        setFallbackConfig();
        setIsLoadingConfig(false);
      }, 10000); // 10 second timeout

      try {
        console.log('[PayPalCheckout] Fetching PayPal config from function...');
        const response = await fetch('/.netlify/functions/paypal-config');
        clearTimeout(timeoutId); // Clear timeout if fetch succeeds
        
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
  }, []);

  // Check if user is admin (for test pay button)
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user?.email) {
        try {
          // Check admin status via server endpoint (which reads ADMIN_TEST_PAY_ALLOWLIST)
          const response = await fetch('/.netlify/functions/check-admin-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: user.email }),
          });

          if (response.ok) {
            const result = await response.json();
            setIsAdminUser(result.isAdmin);
          } else {
            setIsAdminUser(false);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdminUser(false);
        }
      }
    };

    checkAdminStatus();
  }, [user]);

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
            pole_pocket_size: item.pole_pocket_size,
            pole_pocket_cost_cents: item.pole_pocket_cost_cents,
            rope_feet: item.rope_feet,
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
            // Design Service fields - "Let Us Design It" orders
            design_service_enabled: item.design_service_enabled,
            design_request_text: item.design_request_text,
            design_draft_preference: item.design_draft_preference,
            design_draft_contact: item.design_draft_contact,
            design_uploaded_assets: item.design_uploaded_assets,
          })),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onSuccess(result.id);
      } else {
        throw new Error('Test payment failed');
      }
    } catch (error) {
      console.error('Test payment error:', error);
      onError(error);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Loading state
  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading payment options...</span>
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
            {isAdminUser && ' Use the admin test payment button below.'}
            <br />
            <small>Debug: enabled={String(paypalConfig?.enabled)}, clientId={paypalConfig?.clientId ? 'present' : 'missing'}</small>
          </p>
        </div>

        {isAdminUser && (
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
              `Admin Test Pay $${(total / 100).toFixed(2)}`
            )}
          </Button>
        )}
      </div>
    );
  }

  // PayPal order creation handler
  const handleCreateOrder = async () => {
    try {
      setIsCreatingOrder(true);

      // Log user state for debugging
      console.log("🔍 PayPal Create Order - User:", {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email
      });

      // Development fallback - if functions aren't available, return a mock order ID
      const isDev = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
      
      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items.map(item => ({
            width_in: item.width_in,
            height_in: item.height_in,
            quantity: item.quantity,
            material: item.material,
            grommets: item.grommets,
            pole_pockets: item.pole_pockets,
            pole_pocket_position: item.pole_pocket_position,
            pole_pocket_size: item.pole_pocket_size,
            pole_pocket_cost_cents: item.pole_pocket_cost_cents,
            rope_feet: item.rope_feet,
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
            // Design Service fields - "Let Us Design It" orders
            design_service_enabled: item.design_service_enabled,
            design_request_text: item.design_request_text,
            design_draft_preference: item.design_draft_preference,
            design_draft_contact: item.design_draft_contact,
            design_uploaded_assets: item.design_uploaded_assets,
          })),
          email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
          user_id: user?.id || null,
          // Include discount code for server-side validation and total calculation
          discountCode: discountCode ? {
            code: discountCode.code,
            discountPercentage: discountCode.discountPercentage,
            discountAmountCents: discountCode.discountAmountCents,
          } : null,
        }),
      });

      if (!response.ok) {
        if (isDev) {
          console.log('Development mode: Using mock PayPal order ID');
          return `DEV_ORDER_${Date.now()}`;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to create PayPal order');
      }

      const result = await response.json();
      return result.paypalOrderId;
    } catch (error) {
      console.error('PayPal create order error:', error);
      
      // Development fallback
      const isDev = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
      if (isDev) {
        console.log('Development mode: Using mock PayPal order ID due to error');
        return `DEV_ORDER_${Date.now()}`;
      }
      
      throw error;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // PayPal order approval handler
  const handleApprove = async (data: any) => {
    try {
      setIsCapturingPayment(true);
      
      const isDev = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

      // First capture the PayPal payment
      const captureResponse = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ orderID: data.orderID }),
      });
      
      let captureResult: any = {};
      
      if (captureResponse.ok) {
        captureResult = await captureResponse.json().catch(()=> ({}));
      } else if (isDev) {
        console.log('Development mode: Using mock capture result');
        captureResult = {
          ok: true,
          paypalData: {
            id: `DEV_CAPTURE_${Date.now()}`,
            payer: { email_address: user?.email || 'dev@test.com' }
          }
        };
      }
      
      if (!captureResponse.ok && !isDev) {
        console.error('Payment capture error:', captureResult || captureResponse.status);
        alert(`Payment failed: ${captureResult?.error || 'Unknown error'}\nStatus: ${captureResponse.status}`);
        return;
      }

      // Now create the database order
      const orderResponse = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || captureResult.paypalData?.payer?.email_address || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          paypal_order_id: data.orderID,
          paypal_capture_id: captureResult.paypalData?.id,
          shipping_name: captureResult.shippingAddress?.name || null,
          shipping_street: captureResult.shippingAddress?.street || null,
          shipping_street2: captureResult.shippingAddress?.street2 || null,
          shipping_city: captureResult.shippingAddress?.city || null,
          shipping_state: captureResult.shippingAddress?.state || null,
          shipping_zip: captureResult.shippingAddress?.zip || null,
          shipping_country: captureResult.shippingAddress?.country || 'US',
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
              pole_pocket_size: item.pole_pocket_size,
              pole_pocket_cost_cents: item.pole_pocket_cost_cents,
              rope_feet: item.rope_feet,
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
              // Design Service fields - "Let Us Design It" orders
              design_service_enabled: item.design_service_enabled,
              design_request_text: item.design_request_text,
              design_draft_preference: item.design_draft_preference,
              design_draft_contact: item.design_draft_contact,
              design_uploaded_assets: item.design_uploaded_assets,
            };
          }),
        }),
      });

      let orderResult: any = {};
      if (orderResponse.ok) {
        orderResult = await orderResponse.json();
      } else if (isDev) {
        console.log('Development mode: Using mock order result');
        orderResult = {
          ok: true,
          orderId: `DEV_DB_ORDER_${Date.now()}`
        };
      }
      
      if (!orderResponse.ok && !isDev) {
        console.error('Order creation error:', orderResult);
        // Payment succeeded but order creation failed - still show success but log error
        console.error('PayPal payment succeeded but database order creation failed');
      }

      toast({
        title: "Payment Successful!",
        description: `Payment of $${(total / 100).toFixed(2)} has been processed.${isDev ? ' (Development Mode)' : ''}`,
      });

      // Use database order ID if available, otherwise PayPal order ID
      const orderId = orderResult?.orderId || data.orderID;
      onSuccess(orderId);
    } catch (e: any) {
      console.error('Payment exception:', e);
      alert('Network error capturing payment. Please try again.');
      onError(e);
    } finally {
      setIsCapturingPayment(false);
    }
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
      {(isCreatingOrder || isCapturingPayment) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-blue-800 text-sm">
              {isCreatingOrder && "Preparing your order..."}
              {isCapturingPayment && "Processing payment..."}
            </span>
          </div>
        </div>
      )}

      <PayPalScriptProvider options={initialOptions}>
        <div className="relative z-10">
          <PayPalButtons
            style={{
              layout: "vertical",
              color: "blue",
              shape: "rect",
              label: "paypal",
            }}
            disabled={disabled || isCreatingOrder || isCapturingPayment}
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
        </div>
      </PayPalScriptProvider>

      {/* Admin Test Pay Button */}
      {isAdminUser && (
        <div className="border-t pt-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-gray-700 text-sm">
              <strong>Admin Access:</strong> You can use the test payment button below to create orders without processing real payments.
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
              `Admin Test Pay $${(total / 100).toFixed(2)}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PayPalCheckout;
