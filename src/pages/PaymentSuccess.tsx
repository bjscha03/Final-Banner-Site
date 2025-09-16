import React from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Home, ArrowRight } from 'lucide-react';
import { usd } from '@/lib/pricing';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  const orderId = searchParams.get('orderId');
  const state = location.state as any;
  
  // Get data from navigation state or defaults
  const items = state?.items || [];
  const total = state?.total || 0;

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
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                      <div>
                        <p className="font-medium">Custom Banner {item.width_in}"×{item.height_in}"</p>
                        <p className="text-sm text-gray-600">
                          {item.material} • Qty: {item.quantity}
                          {item.grommets && item.grommets !== 'none' && ` • ${item.grommets} grommets`}
                        </p>
                      </div>
                      <p className="font-medium">{usd(item.line_total_cents / 100)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-xl font-semibold text-gray-900">Total Paid</span>
                <span className="text-2xl font-bold text-gray-900">
                  {total > 0 ? usd(total / 100) : 'Confirmed'}
                </span>
              </div>
            </div>

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
