import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { Order } from '../lib/orders/types';
import Layout from '@/components/Layout';
import OrdersTable from '@/components/orders/OrdersTable';
import ScrollToTopLink from '@/components/ScrollToTopLink';
import { Button } from '@/components/ui/button';
import { Package, Plus, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MyOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Redirect to sign-in if not authenticated
    if (!authLoading && !user) {
      navigate('/sign-in?next=/my-orders');
      return;
    }

    if (user) {
      loadOrders();
    }
  }, [user, authLoading, navigate]);

  const loadOrders = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const ordersAdapter = await getOrdersAdapter();
      const userOrders = await ordersAdapter.listByUser(user.id);
      setOrders(userOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: "Error Loading Orders",
        description: "There was an error loading your orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Don't render anything if user is not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                  <Package className="h-8 w-8 mr-3 text-blue-600" />
                  My Orders
                </h1>
                <p className="text-gray-600 mt-2">
                  Track your custom banner orders and reorder your favorites
                </p>
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>

                <Button asChild className="bg-orange-500 hover:bg-orange-600">
                  <ScrollToTopLink to="/design">
                    <Plus className="h-4 w-4 mr-2" />
                    Order New Banner
                  </ScrollToTopLink>
                </Button>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
                <p className="text-gray-600">{user.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <OrdersTable orders={orders} loading={loading} />

          {/* Help Section */}
          {orders.length > 0 && (
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
              <div className="text-blue-800 text-sm space-y-1">
                <p>• Questions about your order? Contact us at support@bannersonthefly.com</p>
                <p>• Need to make changes? Contact us within 24 hours of placing your order</p>
                <p>• Track your shipment using the tracking links in your order details</p>
                <p>• Reorder any previous design by clicking the "Reorder" button</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default MyOrders;
