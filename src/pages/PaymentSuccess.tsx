import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Home, ArrowRight } from 'lucide-react';
import { usd } from '@/lib/pricing';
import { trackPurchase, trackFBPurchase, trackGoogleAdsPurchaseConversion } from '@/lib/analytics';
import { getItemDisplayName, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { formatShippingAddress, hasShippingAddress, normalizeShippingAddress } from '@/lib/shipping-address';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  const orderId = searchParams.get('orderId');
  const state = location.state as {
    items?: NormalizableOrderItem[];
    shippingAddress?: {
      name?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    } | null;
    total?: number;
    discountCode?: { code?: string } | null;
    serverPricing?: {
      applied_discount_type?: string;
      applied_discount_label?: string;
      subtotal_cents?: number;
      tax_cents?: number;
      total_cents?: number;
      applied_discount_cents?: number;
    } | null;
  } | null;
  const [loadedOrder, setLoadedOrder] = useState<{
    items?: NormalizableOrderItem[];
    shippingAddress?: {
      name?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    } | null;
  } | null>(null);
  
  // Get data from navigation state or defaults
  const items = loadedOrder?.items || state?.items || [];
  const total = state?.total || 0;
  const discountCode = state?.discountCode || null;
  const serverPricing = state?.serverPricing || null; // Server-computed pricing from create-order
  const stateShippingAddress = normalizeShippingAddress(state?.shippingAddress || {});
  const loadedShippingAddress = normalizeShippingAddress(loadedOrder?.shippingAddress || {});
  const normalizedShippingAddress = hasShippingAddress(loadedShippingAddress)
    ? loadedShippingAddress
    : stateShippingAddress;
  const showShippingAddress = hasShippingAddress(normalizedShippingAddress);
  const shippingAddressLines = formatShippingAddress(normalizedShippingAddress);

  useEffect(() => {
    if (!orderId) return;
    const loadOrder = async () => {
      try {
        const response = await fetch(`/.netlify/functions/get-order?id=${orderId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data?.ok && data?.order) {
          setLoadedOrder(data.order);
        }
      } catch (error) {
        console.warn('Unable to load order for payment success address block', error);
      }
    };
    loadOrder();
  }, [orderId]);

  // Calculate pricing breakdown using the same logic as cart store

  // Track purchase event for analytics
  useEffect(() => {
    if (orderId && items.length > 0) {
      // Idempotency guard: never fire purchase events twice for the same order
      const trackedKey = `purchase_tracked_${orderId}`;
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(trackedKey)) {
          return;
        }
      } catch (_e) {
        // sessionStorage unavailable — fall back to component lifecycle dedupe
      }

      const analyticsItems = items.map((item) => ({
        item_id: item.id,
        item_name: `${item.width_in}x${item.height_in} ${item.material} Banner`,
        item_category: 'Banner',
        item_variant: item.material,
        price: item.line_total_cents,
        quantity: item.quantity,
      }));
      
      const pricing = calculatePricingBreakdown();
      
      trackPurchase({
        transaction_id: orderId,
        value: pricing.total,
        tax: pricing.tax,
        shipping: 0, // Free shipping
        items: analyticsItems,
      });
      
      // Track Facebook Pixel Purchase
      trackFBPurchase({
        value: pricing.total,
        transaction_id: orderId,
      });

      // Track Google Ads purchase conversion (no-op if env vars not configured)
      trackGoogleAdsPurchaseConversion({
        transaction_id: orderId,
        value: pricing.total,
        currency: 'USD',
      });

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(trackedKey, '1');
        }
      } catch (_e) {
        // ignore
      }
    }
  }, [orderId]); // Track once when orderId is available
  const calculatePricingBreakdown = () => {
    if (items.length === 0) {
      return { subtotal: 0, tax: 0, total: 0, discountCents: 0, discountLabel: "" };
    }

    // FIXED: Use server-computed pricing when available (includes discount calculations)
    // The server-side computeTotals in create-order.cjs handles promo + quantity discounts correctly.
    // Client-side computeTotals does NOT support promo discounts, so we must use server values.
    if (serverPricing) {
      const discountLabel = serverPricing.applied_discount_type === 'quantity'
        ? 'Qty Discount'
        : serverPricing.applied_discount_type === 'promo'
          ? (serverPricing.applied_discount_label || discountCode?.code || 'Promo Applied')
          : '';
      return {
        subtotal: serverPricing.subtotal_cents || 0,
        tax: serverPricing.tax_cents || 0,
        total: serverPricing.total_cents || 0,
        discountCents: serverPricing.applied_discount_cents || 0,
        discountLabel,
      };
    }

    // Fallback: client-side calculation (no discount support - only for old orders without serverPricing)
    const subtotalCents = items.reduce((sum: number, item) => sum + (item.line_total_cents || 0), 0);
    const taxCents = Math.round(subtotalCents * 0.06);
    const totalCents = subtotalCents + taxCents;

    return {
      subtotal: subtotalCents,
      tax: taxCents,
      total: totalCents,
      discountCents: 0,
      discountLabel: "",
    };
  };

  const pricing = calculatePricingBreakdown();

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-orange-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Payment Successful! 🎉
            </h1>
            <p className="text-gray-600">
              Thank you for your payment. Your order has been processed successfully.
            </p>
          </div>

          {/* Payment Details */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <div className="border-b border-gray-200 pb-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-[#18448D]">Banners On The Fly</h2>
                  <p className="text-gray-600 mt-1">Payment Confirmation</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Payment ID</p>
                  <p className="font-mono font-semibold">{orderId?.slice(-8).toUpperCase() || 'CONFIRMED'}</p>
                  <p className="text-sm text-gray-600 mt-2">{new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            {items.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                <div className="space-y-3">
                  {items.map((item, index: number) => {
                    const normalized = normalizeOrderItemDisplay(item);
                    return (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-start gap-4">
                        {normalized.thumbnailUrl ? (
                          <img
                            src={normalized.thumbnailUrl}
                            alt={`${normalized.productLabel} preview`}
                            className="h-20 w-28 rounded-md border border-gray-200 object-cover flex-shrink-0"
                          />
                        ) : null}
                        <div className="flex-1">
                          <p className="font-medium">{getItemDisplayName(item)} <span className="ml-1 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{normalized.productLabel}</span></p>
                          <p className="text-sm text-gray-600 mt-1">
                            {`Size: ${normalized.sizeDisplay} • Material: ${normalized.materialDisplay} • Print: ${normalized.printDisplay}`}
                          </p>
                          {normalized.uploadedDesignsCount ? <p className="text-sm text-gray-600">Uploaded Designs: {normalized.uploadedDesignsCount}</p> : null}
                          {normalized.stepStakesQty ? <p className="text-sm text-gray-600">Step Stakes: {normalized.stepStakesQty}</p> : null}
                          {normalized.grommetsDisplay ? <p className="text-sm text-gray-600">Grommets: {normalized.grommetsDisplay}</p> : null}
                          {normalized.polePocketsDisplay ? <p className="text-sm text-gray-600">Pole Pockets: {normalized.polePocketsDisplay}</p> : null}
                          {normalized.ropeDisplay ? <p className="text-sm text-gray-600">Rope: {normalized.ropeDisplay}</p> : null}

                          {/* Cost Breakdown */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Unit Price:</span>
                                <span className="text-gray-900">{usd(normalized.unitPriceCents / 100)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Qty:</span>
                                <span className="text-gray-900">{normalized.qtyDisplay}</span>
                              </div>
                              <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                                <span className="text-gray-900">Line Total:</span>
                                <span className="text-gray-900">{usd(normalized.lineTotalCents / 100)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
            )}

            {showShippingAddress && (
              <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Shipping Address</h3>
                {shippingAddressLines.map((line, index) => (
                  <p key={index} className={index === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Pricing Breakdown */}
            {items.length > 0 && (
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Subtotal</span>
                  <span className="text-gray-900">
                    {usd(pricing.subtotal / 100)}
                  </span>
                </div>
                {pricing.discountCents > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-green-600">{pricing.discountLabel || "Discount"}</span>
                    <span className="text-green-600">
                      -{usd(pricing.discountCents / 100)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Tax (6%)</span>
                  <span className="text-gray-900">
                    {usd(pricing.tax / 100)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                  <span className="text-xl font-semibold text-gray-900">Total Paid</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {usd(pricing.total / 100)}
                  </span>
                </div>
              </div>
            )}

            {/* Fallback for when no items data */}
            {items.length === 0 && (
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-semibold text-gray-900">Total Paid</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {total > 0 ? usd(total / 100) : 'Confirmed'}
                  </span>
                </div>
              </div>
            )}

            {/* Next Steps */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mt-6">
              <h3 className="font-semibold text-blue-900 mb-2">What's Next?</h3>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• We'll process your order and begin production</li>
                <li>• You'll receive tracking information once shipped</li>
                <li>• Questions? Contact us at support@bannersonthefly.com</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button onClick={() => navigate('/')} variant="outline" className="flex-1">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>

            <Button onClick={() => navigate('/design')} className="flex-1">
              <ArrowRight className="h-4 w-4 mr-2" />
              Order Again
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
