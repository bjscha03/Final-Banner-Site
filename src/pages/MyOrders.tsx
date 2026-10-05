import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { Order } from '../lib/orders/types';
import Layout from '@/components/Layout';
import BOFAccountCard from '@/components/BOFAccountCard';
import OrdersTable from '@/components/orders/OrdersTable';
import ScrollToTopLink from '@/components/ScrollToTopLink';
import { Button } from '@/components/ui/button';
import { Package, Plus, ArrowLeft } from 'lucide-react';
import { CreditPurchasesList } from '@/components/orders/CreditPurchasesList';
import { authorizedHeaders } from '@/lib/serverAuth';

const MyOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [creditPurchases, setCreditPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;

  const loadCreditPurchases = useCallback(async () => {
    if (!user) return;
    const requestedUserId = user.id;
    try {
      const response = await fetch(`/.netlify/functions/get-credit-purchases?user_id=${encodeURIComponent(user.id)}`, {
        headers: authorizedHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Credit purchase history could not be loaded.');
      const purchases = await response.json();
      if (currentUserId.current === requestedUserId) setCreditPurchases(Array.isArray(purchases) ? purchases : []);
    } catch (error) {
      console.warn('Credit purchase history unavailable:', error);
    }
  }, [user?.id]);

  const loadOrders = useCallback(async (page = 1) => {
    if (!user) return;
    const requestedUserId = user.id;
    page === 1 ? setLoading(true) : setLoadingMore(true);
    setOrdersError('');
    try {
      const rows = await getOrdersAdapter().listByUser(user.id, page);
      if (currentUserId.current !== requestedUserId) return;
      setOrders((previous) => page === 1 ? rows : [...previous, ...rows.filter((row) => !previous.some((existing) => existing.id === row.id))]);
      setHasMoreOrders(rows.length === 20);
      setNextPage(page + 1);
    } catch (error) {
      if (currentUserId.current !== requestedUserId) return;
      console.warn('Order history unavailable:', error);
      setOrdersError('Your order history could not be loaded. Please try again.');
    } finally {
      if (currentUserId.current === requestedUserId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/sign-in?next=/my-orders');
      return;
    }
    setOrders([]);
    setCreditPurchases([]);
    setHasMoreOrders(false);
    setNextPage(2);
    if (user) {
      void loadOrders();
      void loadCreditPurchases();
    }
  }, [user?.id, authLoading, navigate, loadOrders, loadCreditPurchases]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) void loadCreditPurchases();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, loadCreditPurchases]);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Layout showFooterBanner={false}>
        <div className="min-h-[calc(100vh-4rem)] bg-[#F7F7F7] py-8">
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
    <Layout showFooterBanner={false}>
      <div className="min-h-[calc(100vh-4rem)] bg-[#F7F7F7] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="flex items-center font-display text-2xl font-bold text-[#0B1F3A] sm:text-3xl">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8 mr-2 sm:mr-3 text-orange-500" />
                  My Orders
                </h1>
                <p className="text-gray-600 mt-2 text-sm sm:text-base">
                  Your past orders using this verified email appear here, including guest checkouts.
                </p>
                {user && (
                  <div className="mt-3 text-xs sm:text-sm text-gray-500">
                    <span className="font-medium">Account:</span>{' '}
                    {user.username && !/^bof_[a-f0-9]{12}$/i.test(user.username) ? (
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

                <Button asChild className="bg-orange-500 text-white hover:bg-orange-600 hover:text-white">
                  <ScrollToTopLink to="/design">
                    <Plus className="h-4 w-4 mr-2" />
                    Order New Banner
                  </ScrollToTopLink>
                </Button>
              </div>
            </div>
          </div>

          <BOFAccountCard userId={user.id} />

          {/* Account Info */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
                <p className="break-all text-gray-600">{user.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">{hasMoreOrders ? 'Orders shown' : 'Total Orders'}</p>
                <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
              </div>
            </div>
          </div>

          {/* Credit Purchases */}
          {creditPurchases.length > 0 && (
            <div className="mb-8">
              <CreditPurchasesList purchases={creditPurchases} />
            </div>
          )}

          {/* Orders Table */}
          {ordersError && (
            <div role="alert" className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-slate-800">
              <p>{ordersError}</p>
              <Button className="mt-3" variant="outline" onClick={() => void loadOrders(orders.length ? nextPage : 1)} disabled={loading || loadingMore}>
                Try again
              </Button>
            </div>
          )}
          {(!ordersError || orders.length > 0) && <OrdersTable orders={orders} loading={loading} />}
          {hasMoreOrders && !ordersError && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => void loadOrders(nextPage)} disabled={loadingMore}>
                {loadingMore ? 'Loading older orders…' : 'Load more orders'}
              </Button>
            </div>
          )}

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
