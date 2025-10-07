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

      // Get orders adapter with error handling
      let ordersAdapter;
      try {
        ordersAdapter = getOrdersAdapter();
        console.log('Orders adapter obtained:', ordersAdapter);
      } catch (adapterError) {
        console.error('Failed to get orders adapter:', adapterError);
        toast({
          title: "System Error",
          description: "Unable to initialize orders system. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }

      // Attempt to load orders with multiple fallback strategies
      let userOrders: Order[] = [];
      let loadAttempts = 0;
      const maxAttempts = 3;

      while (loadAttempts < maxAttempts && userOrders.length === 0) {
        loadAttempts++;
        console.log(`Orders load attempt ${loadAttempts}/${maxAttempts}`);

        try {
          userOrders = await ordersAdapter.listByUser(user.id);
          console.log(`Attempt ${loadAttempts}: Loaded ${userOrders.length} orders`);

          if (userOrders.length > 0) {
            break; // Success!
          }
        } catch (loadError) {
          console.warn(`Attempt ${loadAttempts} failed:`, loadError);

          // If this is the last attempt, try a different approach
          if (loadAttempts === maxAttempts) {
            console.log('All direct attempts failed, trying fallback methods...');

            // Try to fetch via Netlify function directly if available
            try {
              const response = await fetch(`/.netlify/functions/get-orders?user_id=${user.id}`);
              if (response.ok) {
                userOrders = await response.json();
                console.log('Fallback method succeeded:', userOrders.length, 'orders');
              }
            } catch (fallbackError) {
              console.warn('Fallback method also failed:', fallbackError);
            }
          } else {
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      setOrders(userOrders);
      console.log('Final orders set:', userOrders.length);

      // Debug: If no orders found, try to fetch all orders to see what's in the database
      if (userOrders.length === 0) {
        console.log('No orders found for user, checking all orders...');
        try {
          const allOrdersResponse = await fetch('/.netlify/functions/get-orders');
          if (allOrdersResponse.ok) {
            const allOrders = await allOrdersResponse.json();
            console.log('All orders in database:', allOrders.length, 'total orders');

            // Check if any orders belong to this user but weren't returned
            const userOrdersInAll = allOrders.filter((order: Order) => order.user_id === user.id);
            if (userOrdersInAll.length > 0) {
              console.warn('Found user orders in all orders but not in user-specific query:', userOrdersInAll);
              setOrders(userOrdersInAll);
            }
          }
        } catch (allOrdersError) {
          console.warn('Could not fetch all orders:', allOrdersError);
        }
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: "Error Loading Orders",
        description: "There was an error loading your orders. Please try refreshing the page.",
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
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
                  <Package className="h-6 w-6 sm:h-8 sm:w-8 mr-2 sm:mr-3 text-orange-500" />
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
                        <span className="text-orange-500 font-medium">@{user.username}</span>
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
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
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
            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-lg p-6">
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
