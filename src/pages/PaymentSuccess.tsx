import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Home, ArrowRight } from 'lucide-react';
import { usd } from '@/lib/pricing';
import { trackPurchase, trackFBPurchase, trackGoogleAdsPurchaseConversion } from '@/lib/analytics';
import { getItemDisplayName, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { formatShippingAddress, hasShippingAddress, normalizeShippingAddress } from '@/lib/shipping-address';
import { getDisplayOrderTotalCents } from '@/lib/order-totals';

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
      same_day_fee_cents?: number;
      saturday_fee_cents?: number;
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
    subtotal_cents?: number;
    tax_cents?: number;
    total_cents?: number;
    applied_discount_cents?: number;
    applied_discount_label?: string;
    applied_discount_type?: string;
    same_day_fee_cents?: number;
    saturday_fee_cents?: number;
    shipping_cents?: number;
    status?: string;
  } | null>(null);
  
  // Get data from navigation state or defaults
  const items = loadedOrder?.items || state?.items || [];
  const total = state?.total || 0;
  const discountCode = state?.discountCode || null;
  const serverPricing = loadedOrder
    ? {
        applied_discount_type: loadedOrder.applied_discount_type,
        applied_discount_label: loadedOrder.applied_discount_label,
        subtotal_cents: loadedOrder.subtotal_cents,
        tax_cents: loadedOrder.tax_cents,
        total_cents: loadedOrder.total_cents,
        applied_discount_cents: loadedOrder.applied_discount_cents,
        same_day_fee_cents: loadedOrder.same_day_fee_cents,
        saturday_fee_cents: loadedOrder.saturday_fee_cents,
        shipping_cents: loadedOrder.shipping_cents,
      }
    : (state?.serverPricing || null); // Prefer canonical DB pricing
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

  const canonicalOrderItems = useMemo(() => loadedOrder?.items || [], [loadedOrder?.items]);
  const canonicalOrderStatus = String(loadedOrder?.status || '').toLowerCase();
  const canonicalOrderIsPaid = ['paid', 'completed', 'complete', 'succeeded'].includes(canonicalOrderStatus);
  const canonicalOrderTotalCents = loadedOrder ? getDisplayOrderTotalCents(loadedOrder as any) : 0;
  const canonicalOrderTaxCents = Number(loadedOrder?.tax_cents || 0);
  const canonicalOrderShippingCents = Number((loadedOrder as any)?.shipping_cents || 0);

  // Calculate pricing breakdown using the same logic as cart store

  // Track purchase event for analytics from canonical server-loaded order data.
  useEffect(() => {
    if (!orderId) {
      console.log('[PaymentSuccess] Waiting for order data: missing orderId');
      return;
    }

    if (!loadedOrder) {
      console.log('[PaymentSuccess] Waiting for order data before purchase tracking', { orderId });
      return;
    }

    if (!canonicalOrderIsPaid) {
      console.log('[PaymentSuccess] Purchase tracking skipped because order not paid', {
        orderId,
        status: loadedOrder.status,
      });
      return;
    }

    if (!canonicalOrderItems.length) {
      console.log('[PaymentSuccess] Waiting for order items before purchase tracking', { orderId });
      return;
    }

    if (!Number.isFinite(canonicalOrderTotalCents) || canonicalOrderTotalCents <= 0) {
      console.log('[PaymentSuccess] Waiting for final server pricing before purchase tracking', {
        orderId,
        total_cents: loadedOrder.total_cents,
      });
      return;
    }

    const trackedKey = `purchase_tracked_${orderId}`;
    try {
      const alreadyTracked =
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(trackedKey))
        || (typeof localStorage !== 'undefined' && localStorage.getItem(trackedKey));
      if (alreadyTracked) {
        console.log('[PaymentSuccess] Purchase tracking skipped because duplicate', { orderId });
        return;
      }
    } catch (_e) {
      // Storage unavailable — GA4 transaction_id still provides provider-side dedupe.
    }

    const analyticsItems = canonicalOrderItems.map((item, index) => {
      const quantity = Number(item.quantity || 1) || 1;
      const lineTotalCents = Number(item.line_total_cents || 0);
      const unitPriceCents = quantity > 0 ? Math.round(lineTotalCents / quantity) : lineTotalCents;
      const width = item.width_in || 'Custom';
      const height = item.height_in || 'Size';
      const material = item.material || item.product_type || 'Banner';
      const itemId = String(
        item.id
        || (item as any).item_id
        || (item as any).file_key
        || `${orderId}-item-${index + 1}`
      );

      return {
        item_id: itemId,
        item_name: getItemDisplayName(item) || `${width}x${height} ${material} Banner`,
        item_category: item.product_type || 'Banner',
        item_variant: item.material || item.product_type || 'banner',
        price: unitPriceCents,
        quantity,
      };
    });

    trackPurchase({
      transaction_id: orderId,
      value: canonicalOrderTotalCents,
      tax: canonicalOrderTaxCents,
      shipping: canonicalOrderShippingCents,
      items: analyticsItems,
    });

    // Track Facebook Pixel Purchase
    trackFBPurchase({
      value: canonicalOrderTotalCents,
      transaction_id: orderId,
    });

    // Track Google Ads purchase conversion (no-op if env vars not configured)
    trackGoogleAdsPurchaseConversion({
      transaction_id: orderId,
      value: canonicalOrderTotalCents,
      currency: 'USD',
    });

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(trackedKey, '1');
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(trackedKey, '1');
      }
    } catch (_e) {
      // ignore storage failures after dispatch
    }

    console.log('[PaymentSuccess] Purchase tracking fired', {
      orderId,
      value_cents: canonicalOrderTotalCents,
      tax_cents: canonicalOrderTaxCents,
      shipping_cents: canonicalOrderShippingCents,
      item_count: analyticsItems.length,
    });
  }, [
    orderId,
    loadedOrder,
    canonicalOrderItems,
    canonicalOrderIsPaid,
    canonicalOrderTotalCents,
    canonicalOrderTaxCents,
    canonicalOrderShippingCents,
  ]);
  const calculatePricingBreakdown = () => {
    if (items.length === 0) {
      return { subtotal: 0, tax: 0, total: 0, discountCents: 0, discountLabel: "", shippingCents: 0, sameDayFeeCents: 0, saturdayFeeCents: 0 };
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
        total: getDisplayOrderTotalCents(serverPricing as any),
        discountCents: serverPricing.applied_discount_cents || 0,
        discountLabel,
        shippingCents: 0,
        sameDayFeeCents: (serverPricing as any).same_day_fee_cents || 0,
        saturdayFeeCents: (serverPricing as any).saturday_fee_cents || 0,
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
      shippingCents: 0,
      sameDayFeeCents: 0,
      saturdayFeeCents: 0,
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
                          {normalized.productType === 'banner' ? (
                            <>
                              <p className="text-sm text-gray-600">Grommets: {normalized.grommetsDisplay}</p>
                              <p className="text-sm text-gray-600">Pole Pockets: {normalized.polePocketsDisplay}</p>
                              <p className="text-sm text-gray-600">Rope: {normalized.ropeDisplay}</p>
                            </>
                          ) : null}

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
                  <span className="text-gray-700">Shipping</span>
                  <span className="text-gray-900">
                    {pricing.shippingCents > 0 ? usd(pricing.shippingCents / 100) : 'FREE'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Tax (6%)</span>
                  <span className="text-gray-900">
                    {usd(pricing.tax / 100)}
                  </span>
                </div>
                {pricing.sameDayFeeCents > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Same-Day Hit Service</span>
                    <span className="text-gray-900">
                      {usd(pricing.sameDayFeeCents / 100)}
                    </span>
                  </div>
                )}
                {pricing.saturdayFeeCents > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Saturday Delivery</span>
                    <span className="text-gray-900">
                      {usd(pricing.saturdayFeeCents / 100)}
                    </span>
                  </div>
                )}
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
