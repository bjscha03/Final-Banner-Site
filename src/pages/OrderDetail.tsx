import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, Calendar, Mail, CreditCard, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import Layout from '@/components/Layout';
import { useScrollToTop } from '@/components/ScrollToTop';
import { calculatePolePocketCostFromOrder, calculateUnitPriceFromOrder } from '@/lib/pricing';

interface OrderItem {
  width_in: number;
  height_in: number;
  quantity: number;
  material: string;
  grommets: string;
  rope_feet: number;
  pole_pockets: string;
  pole_pocket_position?: string;
  pole_pocket_size?: string;
  pole_pocket_cost_cents?: number;
  line_total_cents: number;
}

interface Order {
  id: string;
  order_number: string;
  email: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: string;
  tracking_number?: string;
  tracking_carrier?: string;
  created_at: string;
  items: OrderItem[];
}

const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { scrollToTop } = useScrollToTop();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scrollToTop();
    if (id) {
      fetchOrder(id);
    }
  }, [id]);

  const fetchOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/.netlify/functions/get-order?id=${orderId}`);
      const data = await response.json();
      
      if (data.ok && data.order) {
        setOrder(data.order);
      } else {
        setError(data.error || 'Order not found');
      }
    } catch (err) {
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'shipped':
        return <Truck className="h-5 w-5 text-orange-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Package className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'shipped':
        return 'bg-slate-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading order details...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h1>
              <p className="text-gray-600 mb-6">{error || 'The order you\'re looking for doesn\'t exist or has been removed.'}</p>
              <button
                onClick={() => navigate('/')}
                className="bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-[#18448D] transition-colors"
              >
                Return to Home
              </button>
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
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Order #{order.id.slice(-8).toUpperCase()}</h1>
                <p className="text-gray-600">Placed on {formatDate(order.created_at)}</p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(order.status)}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Email:</span>
                <span className="font-medium">{order.email}</span>
              </div>
              <div className="flex items-center space-x-2">
                <CreditCard className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Total:</span>
                <span className="font-medium">{formatCurrency(order.total_cents)}</span>
              </div>
              {order.tracking_number && (
                <div className="flex items-center space-x-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Tracking:</span>
                  <span className="font-medium">{order.tracking_number}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">
                        Custom Banner - {item.width_in}" × {item.height_in}"
                      </h3>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p><span className="font-medium">Material:</span> {item.material}</p>
                        <p><span className="font-medium">Quantity:</span> {item.quantity}</p>
                        <p><span className="font-medium">Grommets:</span> {item.grommets}</p>
                        {item.rope_feet > 0 && (
                          <p><span className="font-medium">Rope:</span> {item.rope_feet} feet</p>
                        )}
                        {(item.pole_pockets || item.pole_pocket_position) && (
                          <p><span className="font-medium">Pole Pockets:</span> {
                            item.pole_pocket_position && item.pole_pocket_position !== 'none' 
                              ? `${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
                              : item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== 'false'
                                ? 'Yes'
                                : 'None'
                          }</p>
                        )}
                      </div>

                      {/* Cost Breakdown */}
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h5>
                        <div className="space-y-1 text-sm">
                          {(() => {
                            // Use exact same logic as PaymentSuccess.tsx
                            // Use robust pole pocket calculation with proper field handling
                            // Use utility functions for consistent calculation
                            const polePocketCost = calculatePolePocketCostFromOrder(item);
                            const unitPrice = calculateUnitPriceFromOrder(item);
                            const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
                            return (                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Base banner:</span>
                                  <span className="text-gray-900">{formatCurrency(unitPrice)} × {item.quantity}</span>
                                </div>
                                {item.rope_feet && item.rope_feet > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Rope ({item.rope_feet.toFixed(1)}ft):</span>
                                    <span className="text-gray-900">{formatCurrency(ropeCost)}</span>
                                  </div>
                                )}
                                {polePocketCost > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Pole pockets:</span>
                                    <span className="text-gray-900">{formatCurrency(polePocketCost)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                                  <span className="text-gray-900">Line total:</span>
                                  <span className="text-gray-900">{formatCurrency(item.line_total_cents)}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCurrency(item.line_total_cents)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-2">
              {(() => {
                // Calculate correct subtotal and tax from line totals
                // Database subtotal_cents and tax_cents are incorrect, so calculate from line_total_cents
                const calculatedSubtotal = order.items.reduce((sum, item) => sum + item.line_total_cents, 0);
                const calculatedTax = Math.round(calculatedSubtotal * 0.06);
                const calculatedTotal = calculatedSubtotal + calculatedTax;
                
                return (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatCurrency(calculatedSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Tax</span>
                      <span>{formatCurrency(calculatedTax)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 mt-2">
                      <div className="flex justify-between text-lg font-semibold text-gray-900">
                        <span>Total</span>
                        <span>{formatCurrency(calculatedTotal)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/my-orders')}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-[#18448D] transition-colors mr-4"
            >
              View All Orders
            </button>
            <button
              onClick={() => navigate('/design')}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Order Another Banner
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default OrderDetail;
