import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { Order } from '../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Printer, Package, ArrowRight, Home } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useScrollToTop } from '@/components/ScrollToTop';

// Helper function to calculate unit price from order data
const calculateUnitPrice = (item: any) => {
  if (item.unit_price_cents) {
    return item.unit_price_cents; // Cart data has unit_price_cents
  }
  // Order data needs calculation
  const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
  const polePocketCost = item.pole_pockets ? Math.max(0, item.line_total_cents - ropeCost) * 0.1 : 0;
  return (item.line_total_cents - ropeCost - polePocketCost) / item.quantity;
};
const OrderConfirmation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { scrollToTop } = useScrollToTop();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const orderId = searchParams.get('orderId');

  // Ensure page starts at top and focus title for accessibility
  useEffect(() => {
    scrollToTop();
    if (titleRef.current) {
      // Focus title for accessibility and to prevent mobile offset retention
      setTimeout(() => {
        titleRef.current?.focus();
      }, 100);
    }
  }, [scrollToTop]);

  useEffect(() => {
    const loadOrder = async () => {
      if (!orderId) {
        setLoading(false);
        return;
      }

      try {
        // First try to get from sessionStorage (just created)
        const storedOrder = sessionStorage.getItem('order_confirmation');
        if (storedOrder) {
          const parsedOrder = JSON.parse(storedOrder);
          if (parsedOrder.id === orderId) {
            setOrder(parsedOrder);
            setLoading(false);
            return;
          }
        }

        // Fallback to fetching from adapter
        const ordersAdapter = await getOrdersAdapter();
        const fetchedOrder = await ordersAdapter.get(orderId);
        setOrder(fetchedOrder);
      } catch (error) {
        console.error('Error loading order:', error);
        toast({
          title: "Error Loading Order",
          description: "Could not load order details. Please check your order ID.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderId, toast]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading order details...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">Order Not Found</h2>
              <p className="mt-2 text-gray-600">
                {orderId ? `Order #${orderId} could not be found.` : 'No order ID provided.'}
              </p>
              <Button 
                onClick={() => navigate('/')}
                className="mt-6"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Success Header */}
          <div className="text-center mb-8 print:mb-6">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="text-3xl font-bold text-gray-900 mb-2"
            >
              Order Confirmed! 🎉
            </h1>
            <p className="text-gray-600">
              Thank you for your order. We'll get started on your custom banners right away.
            </p>
          </div>

          {/* Invoice */}
          <div className="bg-white rounded-2xl shadow-lg p-8 print:shadow-none print:rounded-none">
            {/* Invoice Header */}
            <div className="border-b border-gray-200 pb-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">Banners On The Fly</h2>
                  <p className="text-gray-600 mt-1">Custom Banner Invoice</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Order #</p>
                  <p className="font-mono font-semibold">{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-sm text-gray-600 mt-2">{orderDate}</p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
              <div className="space-y-4">
                {order.items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">
                          Custom Banner {formatDimensions(item.width_in, item.height_in)}
                        </h4>
                        <div className="text-sm text-gray-600 mt-2 space-y-1">
                          <p>Material: {item.material}</p>
                          <p>Area: {item.area_sqft.toFixed(2)} sq ft</p>
                          {item.grommets && <p>Grommets: {item.grommets}</p>}
                          {item.rope_feet && item.rope_feet > 0 && (
                            <p>Rope: {item.rope_feet.toFixed(1)} ft</p>
                          )}
                          {item.file_key && <p>File: {item.file_key}</p>}
                        </div>

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
                      <div className="text-right ml-4">
                        <p className="font-semibold text-gray-900">
                          {usd(item.line_total_cents / 100)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Qty: {item.quantity} × {usd(calculateUnitPrice(item) / 100)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Total */}
            <div className="border-t border-gray-200 pt-6 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Subtotal</span>
                <span className="text-gray-900">
                  {usd((order.subtotal_cents || order.total_cents) / 100)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Tax (6%)</span>
                <span className="text-gray-900">
                  {usd((order.tax_cents || 0) / 100)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                <span className="text-xl font-semibold text-gray-900">Total Paid</span>
                <span className="text-2xl font-bold text-gray-900">
                  {usd(order.total_cents / 100)}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Status: <span className="font-medium text-green-600 capitalize">{order.status}</span>
              </p>
            </div>

            {/* Next Steps */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6 print:bg-gray-50 print:border-gray-300">
              <h3 className="font-semibold text-blue-900 mb-2">What's Next?</h3>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• You'll receive tracking information once shipped</li>
                <li>• Questions? Contact us at support@bannersonthefly.com</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8 print:hidden">
            <Button onClick={handlePrint} variant="outline" className="flex-1">
              <Printer className="h-4 w-4 mr-2" />
              Print Invoice
            </Button>
            
            <Button onClick={() => navigate('/my-orders')} variant="outline" className="flex-1">
              <Package className="h-4 w-4 mr-2" />
              View My Orders
            </Button>

            <Button onClick={() => navigate('/design')} className="flex-1">
              <ArrowRight className="h-4 w-4 mr-2" />
              Order More Banners
            </Button>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          .print\\:bg-gray-50 {
            background-color: #f9fafb !important;
          }
          .print\\:border-gray-300 {
            border-color: #d1d5db !important;
          }
          .print\\:mb-6 {
            margin-bottom: 1.5rem !important;
          }
        }
      `}</style>
    </Layout>
  );
};

export default OrderConfirmation;
