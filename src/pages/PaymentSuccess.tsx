import React from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Home, ArrowRight } from 'lucide-react';
import { usd, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

// Helper function to calculate unit price from order data
const calculateUnitPrice = (item: any) => {
  if (item.unit_price_cents) {
    return item.unit_price_cents; // Cart data has unit_price_cents
  }
  // Order data needs calculation
  const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
  const polePocketCost = item.pole_pockets ? Math.max(0, item.line_total_cents - ropeCost) * 0.1 : 0;
  return (item.line_total_cents - ropeCost - polePocketCost) / item.quantity;
};  const location = useLocation();
  
  const orderId = searchParams.get('orderId');
  const state = location.state as any;
  
  // Get data from navigation state or defaults
  const items = state?.items || [];
  const total = state?.total || 0;

  // Calculate pricing breakdown using the same logic as cart store
  const calculatePricingBreakdown = () => {
    if (items.length === 0) {
      return { subtotal: 0, tax: 0, total: 0 };
    }

    const flags = getFeatureFlags();

    if (flags.freeShipping || flags.minOrderFloor) {
      const pricingOptions = getPricingOptions();
      const pricingItems: PricingItem[] = items.map((item: any) => ({
        line_total_cents: item.line_total_cents
      }));
      const totals = computeTotals(pricingItems, 0.06, pricingOptions);
      return {
        subtotal: totals.adjusted_subtotal_cents,
        tax: totals.tax_cents,
        total: totals.total_cents
      };
    }

    // Fallback calculation
    const subtotalCents = items.reduce((sum: number, item: any) => sum + item.line_total_cents, 0);
    const taxCents = Math.round(subtotalCents * 0.06);
    const totalCents = subtotalCents + taxCents;

    return {
      subtotal: subtotalCents,
      tax: taxCents,
      total: totalCents
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
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Payment Successful! 🎉
            </h1>
            <p className="text-gray-600">
              Thank you for your payment. Your order has been processed successfully.
            </p>
          </div>

          {/* Payment Details */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <div className="border-b border-gray-200 pb-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">Banners On The Fly</h2>
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
                  {items.map((item: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">Custom Banner {item.width_in}"×{item.height_in}"</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {item.material} • Qty: {item.quantity}
                            {item.grommets && item.grommets !== "none" && ` • ${item.grommets} grommets`}
                            {item.rope_feet && item.rope_feet > 0 && ` • Rope: ${item.rope_feet.toFixed(1)}ft`}
                          </p>

                          {/* Cost Breakdown */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <h5 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h5>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base banner:</span>
                                <span className="text-gray-900">{usd(calculateUnitPrice(item) / 100)} × {item.quantity}</span>
                              </div>
                              {item.rope_feet && item.rope_feet > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rope ({item.rope_feet.toFixed(1)}ft):</span>
                                  <span className="text-gray-900">{usd(item.rope_feet * 2 * item.quantity)}</span>
                                </div>
                              )}
                              {(() => {
                                const baseCost = calculateUnitPrice(item) * item.quantity;
                                const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
                                const polePocketCost = item.line_total_cents - baseCost - ropeCost;
                                return polePocketCost > 0 ? (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Pole pockets:</span>
                                    <span className="text-gray-900">{usd(polePocketCost / 100)}</span>
                                  </div>
                                ) : null;
                              })()}
                              <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                                <span className="text-gray-900">Line total:</span>
                                <span className="text-gray-900">{usd(item.line_total_cents / 100)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
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
              Order More Banners
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
