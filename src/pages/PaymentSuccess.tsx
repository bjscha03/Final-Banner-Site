import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle, CircleAlert, Home, Loader2 } from 'lucide-react';
import { usd } from '@/lib/pricing';
import { getItemDisplayName, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { formatShippingAddress, hasShippingAddress, normalizeShippingAddress } from '@/lib/shipping-address';
import { getDisplayOrderTotalCents } from '@/lib/order-totals';
import { authorizedHeaders } from '@/lib/serverAuth';
import OrderItemPreview from '@/components/preview/OrderItemPreview';
import { attemptCanonicalPurchaseTracking } from '@/lib/canonicalPurchaseTracking';
import {
  readOrderConfirmationToken,
  removeOrderConfirmationToken,
} from '@/lib/orderConfirmationStorage';
import { verifiedPaidOrderId } from '@/lib/paymentSuccessGate';

type ConfirmationState = 'verifying' | 'verified' | 'unavailable';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  const orderId = searchParams.get('orderId');
  const state = location.state as {
    orderConfirmationToken?: string | null;
    orderAccessRecovery?: 'confirmation_email_or_account' | null;
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
  const [storedOrderConfirmationToken] = useState(() => (
    orderId ? readOrderConfirmationToken(orderId) : null
  ));
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
    orderId ? 'verifying' : 'unavailable',
  );
  const [verificationFailure, setVerificationFailure] = useState(
    orderId
      ? ''
      : 'This confirmation link is incomplete because it does not identify an order.',
  );
  const [loadedOrder, setLoadedOrder] = useState<{
    id?: string;
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
    discount_code?: string | null;
    same_day_fee_cents?: number;
    saturday_fee_cents?: number;
    shipping_cents?: number;
    status?: string;
    order_number?: string | null;
    paypal_order_id?: string | null;
    paypal_capture_id?: string | null;
    is_test_order?: boolean | null;
  } | null>(null);
  
  const orderConfirmationToken = state?.orderConfirmationToken || storedOrderConfirmationToken || null;
  // Confirmation content is canonical-only. Navigation state helps carry the
  // signed access token, but it is never accepted as proof of payment or price.
  const items = loadedOrder?.items || [];
  const total = Number(loadedOrder?.total_cents || 0);
  const discountCode = loadedOrder?.discount_code ? { code: loadedOrder.discount_code } : null;
  const serverPricing = loadedOrder ? {
    applied_discount_type: loadedOrder.applied_discount_type,
    applied_discount_label: loadedOrder.applied_discount_label,
    subtotal_cents: loadedOrder.subtotal_cents,
    tax_cents: loadedOrder.tax_cents,
    total_cents: loadedOrder.total_cents,
    applied_discount_cents: loadedOrder.applied_discount_cents,
    same_day_fee_cents: loadedOrder.same_day_fee_cents,
    saturday_fee_cents: loadedOrder.saturday_fee_cents,
    shipping_cents: loadedOrder.shipping_cents,
  } : null;
  const loadedShippingAddress = normalizeShippingAddress(loadedOrder?.shippingAddress || {});
  const normalizedShippingAddress = loadedShippingAddress;
  const showShippingAddress = hasShippingAddress(normalizedShippingAddress);
  const shippingAddressLines = formatShippingAddress(normalizedShippingAddress);

  useEffect(() => {
    if (!orderId) {
      setLoadedOrder(null);
      setConfirmationState('unavailable');
      setVerificationFailure('This confirmation link is incomplete because it does not identify an order.');
      return;
    }
    let cancelled = false;
    const loadOrder = async () => {
      setLoadedOrder(null);
      setConfirmationState('verifying');
      setVerificationFailure('');
      const maxAttempts = 6;
      for (let attempt = 1; attempt <= maxAttempts && !cancelled; attempt += 1) {
        try {
          const headers = authorizedHeaders(orderConfirmationToken
            ? { 'X-Order-Confirmation-Token': orderConfirmationToken }
            : {});
          const response = await fetch(`/.netlify/functions/get-order?id=${encodeURIComponent(orderId)}`, { headers });
          if (response.ok) {
            const data = await response.json();
            const canonicalOrderId = verifiedPaidOrderId(orderId, data);
            if (canonicalOrderId && data?.order) {
              if (!cancelled) {
                setLoadedOrder(data.order);
                setConfirmationState('verified');
              }
              return;
            }
          }
        } catch (error) {
          if (attempt === maxAttempts) console.warn('Unable to load order for payment success address block', error);
        }
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(500 * attempt, 2500)));
        }
      }
      if (!cancelled) {
        setLoadedOrder(null);
        setConfirmationState('unavailable');
        setVerificationFailure('We could not verify an authorized paid order from this link. No successful payment status has been assumed.');
      }
    };
    loadOrder();
    return () => { cancelled = true; };
  }, [orderId, orderConfirmationToken]);

  // Calculate pricing breakdown using the same logic as cart store

  // Track purchase event for analytics from canonical server-loaded order data.
  useEffect(() => {
    const canonicalOrderId = loadedOrder?.id || null;
    if (confirmationState !== 'verified' || !canonicalOrderId || !loadedOrder) return;
    void attemptCanonicalPurchaseTracking(canonicalOrderId, loadedOrder, window.location.href).then((result) => {
      if (import.meta.env.DEV) {
        console.log('[PaymentSuccess] Purchase tracking result', result);
      }
    });
  }, [confirmationState, loadedOrder]);
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
        shippingCents: serverPricing.shipping_cents || 0,
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
  const verifiedOrderId = confirmationState === 'verified' ? loadedOrder?.id || null : null;
  const confirmationDisplayId = String(loadedOrder?.order_number || verifiedOrderId || '');
  const leaveSuccessPage = (destination: string) => {
    const credentialOrderId = verifiedOrderId || orderId;
    if (credentialOrderId) removeOrderConfirmationToken(credentialOrderId);
    navigate(destination);
  };

  if (confirmationState !== 'verified' || !loadedOrder || !verifiedOrderId) {
    const verifying = confirmationState === 'verifying';
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" role={verifying ? 'status' : 'alert'} aria-live={verifying ? 'polite' : 'assertive'}>
              <div className="mb-4 flex justify-center">
                {verifying
                  ? <Loader2 className="h-12 w-12 animate-spin text-[#18448D]" aria-hidden="true" />
                  : <CircleAlert className="h-12 w-12 text-amber-600" aria-hidden="true" />}
              </div>
              <h1 className="text-2xl font-bold text-slate-950">
                {verifying ? 'Verifying your payment' : 'We could not verify this payment here'}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-700">
                {verifying
                  ? 'We are securely loading the paid order. This page will show a confirmation only after the order is verified.'
                  : verificationFailure}
              </p>
              {!verifying ? (
                <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-slate-800">
                  Do not submit another payment until you confirm its status in your confirmation email or My Orders. If you still need help, contact support@bannersonthefly.com.
                </p>
              ) : null}
              {!verifying ? (
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  {orderId ? (
                    <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                      Try verification again
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => navigate('/my-orders')}>
                    View My Orders
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate('/')}>
                    Go Home
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

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
            {state?.orderAccessRecovery === 'confirmation_email_or_account' && (
              <p className="mt-2 text-sm text-gray-600">
                Your payment is complete. Use your confirmation email or sign in to view this order again.
              </p>
            )}
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
                  <p className="font-mono font-semibold">{confirmationDisplayId.slice(-8).toUpperCase()}</p>
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
                        <OrderItemPreview
                          item={item as any}
                          compactMaxSize={112}
                          expandedMaxSize={820}
                          ariaLabel={`Open expanded ${normalized.productLabel} preview from payment confirmation`}
                          className="flex-shrink-0"
                        />
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
            <Button onClick={() => leaveSuccessPage('/')} variant="outline" className="flex-1">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>

            <Button onClick={() => leaveSuccessPage('/design')} className="flex-1">
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
