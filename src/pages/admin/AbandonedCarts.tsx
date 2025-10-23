import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin } from '../../lib/auth';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Mail, Loader2, RefreshCw, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { usd } from '@/lib/pricing';

interface AbandonedCart {
  id: string;
  email: string;
  phone: string;
  cart_contents: any[];
  total_value: number;
  recovery_status: string;
  recovery_emails_sent: number;
  discount_code: string | null;
  last_activity_at: string;
  abandoned_at: string | null;
  recovered_at: string | null;
  recovered_order_id: string | null;
  created_at: string;
}

interface RecoveryAnalytics {
  totalRecovered: number;
  totalRecoveredFromEmails: number;
  recoveredCount: number;
  recoveredFromEmailsCount: number;
}

const AbandonedCarts: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [analytics, setAnalytics] = useState<RecoveryAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) {
      setShowAccessDenied(true);
      return;
    }

    if (user && isAdmin(user)) {
      loadCarts();
    }
  }, [user, authLoading]);

  const loadCarts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/.netlify/functions/get-abandoned-carts');
      
      if (!response.ok) {
        throw new Error('Failed to fetch abandoned carts');
      }

      const data = await response.json();
      setCarts(data.carts || []);
      setAnalytics(data.analytics || null);
    } catch (error) {
      console.error('Error loading abandoned carts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load abandoned carts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendRecoveryEmail = async (cartId: string, sequenceNumber: number) => {
    try {
      setSendingEmail(prev => ({ ...prev, [cartId]: true }));

      const response = await fetch('/.netlify/functions/send-abandoned-cart-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId, sequenceNumber })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send email');
      }

      const result = await response.json();

      toast({
        title: 'Email Sent!',
        description: `Recovery email ${sequenceNumber} sent successfully${result.discountCode ? ` with discount code ${result.discountCode}` : ''}`,
      });

      await loadCarts();

    } catch (error) {
      console.error('Error sending recovery email:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send recovery email',
        variant: 'destructive'
      });
    } finally {
      setSendingEmail(prev => ({ ...prev, [cartId]: false }));
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getTimeSince = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  if (showAccessDenied) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-gray-600 mb-4">You need admin privileges to access this page.</p>
            <Button onClick={() => navigate('/')}>Go Home</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-[#18448D]" />
            <h1 className="text-2xl sm:text-3xl font-bold">Abandoned Carts</h1>
          </div>
          <Button onClick={loadCarts} disabled={loading} variant="outline" className="w-full sm:w-auto">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-600">Active Carts</div>
            <div className="text-2xl font-bold">{carts.filter(c => c.recovery_status !== 'recovered').length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-600">Active Value</div>
            <div className="text-2xl font-bold">
              {usd(carts.filter(c => c.recovery_status !== 'recovered').reduce((sum, cart) => sum + Number(cart.total_value), 0))}
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-sm text-green-700 font-medium">💰 Amount Recovered</div>
            <div className="text-2xl font-bold text-green-600">
              {analytics ? usd(analytics.totalRecovered) : '$0.00'}
            </div>
            <div className="text-xs text-green-600 mt-1">
              {analytics?.recoveredCount || 0} carts recovered
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700 font-medium">📧 From Email Campaigns</div>
            <div className="text-2xl font-bold text-blue-600">
              {analytics ? usd(analytics.totalRecoveredFromEmails) : '$0.00'}
            </div>
            <div className="text-xs text-blue-600 mt-1">
              {analytics?.recoveredFromEmailsCount || 0} via recovery emails
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#18448D]" />
          </div>
        ) : carts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600">No abandoned carts found</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden bg-white rounded-lg border overflow-hidden">
              {carts.map((cart) => (
                <AbandonedCartCard
                  key={cart.id}
                  cart={cart}
                  sendRecoveryEmail={sendRecoveryEmail}
                  sendingEmail={sendingEmail}
                  getTimeSince={getTimeSince}
                />
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Abandoned</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emails Sent</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {carts.map((cart) => {
                      const isRecovered = cart.recovery_status === 'recovered';
                      return (
                      <tr key={cart.id} className={`hover:bg-gray-50 ${isRecovered ? 'opacity-50 bg-gray-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{cart.email || 'No email'}</div>
                          {cart.phone && <div className="text-xs text-gray-500">{cart.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{cart.cart_contents?.length || 0}</td>
                        <td className="px-4 py-3 text-sm font-medium">{usd(Number(cart.total_value) || 0)}</td>
                        <td className="px-4 py-3 text-sm">{getTimeSince(cart.abandoned_at || cart.last_activity_at)}</td>
                        <td className="px-4 py-3 text-sm">{cart.recovery_emails_sent}</td>
                        <td className="px-4 py-3">
                          <Badge variant={
                            cart.recovery_status === 'recovered' ? 'default' : 
                            cart.recovery_status === 'abandoned' ? 'destructive' : 
                            'secondary'
                          } className={cart.recovery_status === 'recovered' ? 'bg-green-500' : ''}>
                            {cart.recovery_status === 'recovered' ? '✓ Recovered' : cart.recovery_status}
                          </Badge>
                          {cart.recovered_at && (
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(cart.recovered_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isRecovered ? (
                            <div className="text-xs text-green-600 font-medium">
                              ✓ Order Completed
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              {[1, 2, 3].map((seq) => (
                                <Button
                                  key={seq}
                                  size="sm"
                                  variant={cart.recovery_emails_sent >= seq ? 'outline' : 'default'}
                                  onClick={() => sendRecoveryEmail(cart.id, seq)}
                                  disabled={sendingEmail[cart.id] || !cart.email}
                                >
                                  {sendingEmail[cart.id] ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Mail className="h-3 w-3 mr-1" />
                                  )}
                                  {seq}
                                </Button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};


// Mobile Card Component for Abandoned Carts
interface AbandonedCartCardProps {
  cart: AbandonedCart;
  sendRecoveryEmail: (cartId: string, sequenceNumber: number) => void;
  sendingEmail: Record<string, boolean>;
  getTimeSince: (dateString: string) => string;
}

const AbandonedCartCard: React.FC<AbandonedCartCardProps> = ({
  cart,
  sendRecoveryEmail,
  sendingEmail,
  getTimeSince
}) => {
  const isRecovered = cart.recovery_status === 'recovered';
  
  return (
    <div className={`border-b border-gray-200 p-4 hover:bg-gray-50 ${isRecovered ? 'opacity-50 bg-gray-50' : ''}`}>
      {/* Customer Info */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {cart.email || 'No email'}
          </div>
          {cart.phone && (
            <div className="text-xs text-gray-500 mt-1">{cart.phone}</div>
          )}
        </div>
        <Badge variant={
          cart.recovery_status === 'recovered' ? 'default' : 
          cart.recovery_status === 'abandoned' ? 'destructive' : 
          'secondary'
        } className={cart.recovery_status === 'recovered' ? 'bg-green-500' : ''}>
          {cart.recovery_status === 'recovered' ? '✓ Recovered' : cart.recovery_status}
        </Badge>
      </div>

      {/* Cart Details */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-gray-500">Items</div>
          <div className="text-sm font-medium">{cart.cart_contents?.length || 0}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Value</div>
          <div className="text-sm font-bold text-[#18448D]">{usd(Number(cart.total_value) || 0)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Abandoned</div>
          <div className="text-sm">{getTimeSince(cart.abandoned_at || cart.last_activity_at)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Emails Sent</div>
          <div className="text-sm font-medium">{cart.recovery_emails_sent}</div>
        </div>
      </div>

      {/* Recovery Date */}
      {cart.recovered_at && (
        <div className="mb-3">
          <div className="text-xs text-green-600">
            Recovered on {new Date(cart.recovered_at).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        {isRecovered ? (
          <div className="text-sm text-green-600 font-medium text-center py-2">
            ✓ Order Completed
          </div>
        ) : (
          <div className="flex gap-2 justify-center">
            {[1, 2, 3].map((seq) => (
              <Button
                key={seq}
                size="sm"
                variant={cart.recovery_emails_sent >= seq ? 'outline' : 'default'}
                onClick={() => sendRecoveryEmail(cart.id, seq)}
                disabled={sendingEmail[cart.id] || !cart.email}
                className="flex-1"
              >
                {sendingEmail[cart.id] ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-3 w-3 mr-1" />
                    Email {seq}
                  </>
                )}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


export default AbandonedCarts;
