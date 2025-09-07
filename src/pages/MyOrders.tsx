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
      console.log('Loading orders for user:', user.id, user.email);

      // Debug: Check what's in the database
      try {
        const debugResponse = await fetch('/.netlify/functions/test-auth');
        const debugData = await debugResponse.json();
        console.log('Database debug info:', debugData);
      } catch (debugError) {
        console.warn('Debug info not available:', debugError);
      }

      const ordersAdapter = getOrdersAdapter();
      console.log('Orders adapter:', ordersAdapter);

      // Debug: Check localStorage state before calling adapter
      console.log('Current user in localStorage:', localStorage.getItem('banners_current_user'));
      console.log('Orders in localStorage before call:', localStorage.getItem('banners_orders'));

      const userOrders = await ordersAdapter.listByUser(user.id);
      console.log('User orders loaded:', userOrders);

      // Debug: Check localStorage state after calling adapter
      console.log('Orders in localStorage after call:', localStorage.getItem('banners_orders'));
      setOrders(userOrders);

      // If no orders found, try to fetch all orders to see what's in the database
      if (userOrders.length === 0) {
        console.log('No orders found for user, checking all orders...');
        try {
          const allOrdersResponse = await fetch('/.netlify/functions/get-orders');
          const allOrders = await allOrdersResponse.json();
          console.log('All orders in database:', allOrders);
        } catch (allOrdersError) {
          console.warn('Could not fetch all orders:', allOrdersError);
        }
      }
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
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
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
      <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8 mr-2 sm:mr-3 text-blue-600" />
                  My Orders
                </h1>
                <p className="text-gray-600 mt-2 text-sm sm:text-base">
                  Track your custom banner orders and reorder your favorites
                </p>
                {user && (
                  <div className="mt-3 text-xs sm:text-sm text-gray-500">
                    <span className="font-medium">Account:</span>{' '}
                    {user.username ? (
                      <>
                        <span className="text-blue-600 font-medium">@{user.username}</span>
                        <span className="mx-2">•</span>
                        <span className="break-all">{user.email}</span>
                      </>
                    ) : (
                      <span className="break-all">{user.email}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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
