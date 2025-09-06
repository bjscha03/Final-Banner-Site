import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin } from '../../lib/auth';
import { getOrdersAdapter } from '../../lib/orders/adapter';
import { Order, TrackingCarrier, fedexUrl } from '../../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Package, 
  Search, 
  Truck, 
  Eye, 
  Plus,
  ArrowLeft 
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import OrderDetails from '@/components/orders/OrderDetails';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const AdminOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Redirect if not authenticated or not admin
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/');
      return;
    }

    if (user && isAdmin(user)) {
      loadOrders();
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Filter orders based on search query
    if (searchQuery.trim() === '') {
      setFilteredOrders(orders);
    } else {
      const filtered = orders.filter(order => 
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.user_id?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredOrders(filtered);
    }
  }, [orders, searchQuery]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const ordersAdapter = await getOrdersAdapter();
      const allOrders = await ordersAdapter.listAll();
      setOrders(allOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: "Error Loading Orders",
        description: "There was an error loading orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTracking = async (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => {
    try {
      const ordersAdapter = await getOrdersAdapter();
      await ordersAdapter.appendTracking(orderId, carrier, trackingNumber);
      
      // Update local state
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, tracking_carrier: carrier, tracking_number: trackingNumber }
            : order
        )
      );

      toast({
        title: "Tracking Added",
        description: `Tracking information added for order #${orderId.slice(-8)}`,
      });
    } catch (error) {
      console.error('Error adding tracking:', error);
      toast({
        title: "Error Adding Tracking",
        description: "There was an error adding tracking information.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-amber-100 text-amber-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getItemsSummary = (order: Order): string => {
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueItems = order.items.length;
    
    if (uniqueItems === 1) {
      const item = order.items[0];
      return `${itemCount} × ${formatDimensions(item.width_in, item.height_in)} ${item.material}`;
    }
    
    return `${itemCount} banners (${uniqueItems} designs)`;
  };

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Don't render anything if user is not authenticated or not admin (will redirect)
  if (!user || !isAdmin(user)) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                  <Shield className="h-8 w-8 mr-3 text-red-600" />
                  Admin: Order Management
                </h1>
                <p className="text-gray-600 mt-2">
                  Manage all customer orders and tracking information
                </p>
              </div>
              
              <Button
                variant="outline"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center">
                <Package className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center">
                <Truck className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Shipped</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {orders.filter(o => o.tracking_number).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <div className="h-4 w-4 bg-amber-600 rounded-full"></div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {orders.filter(o => !o.tracking_number).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <div className="h-4 w-4 bg-green-600 rounded-full"></div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {usd(orders.reduce((sum, o) => sum + o.total_cents, 0) / 100)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by Order ID or User ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchQuery ? 'No orders found' : 'No orders yet'}
                </h3>
                <p className="text-gray-600">
                  {searchQuery ? 'Try adjusting your search query.' : 'Orders will appear here when customers place them.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tracking
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredOrders.map((order) => (
                      <AdminOrderRow 
                        key={order.id} 
                        order={order} 
                        onAddTracking={handleAddTracking}
                        getStatusColor={getStatusColor}
                        getItemsSummary={getItemsSummary}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

// Admin Order Row Component
interface AdminOrderRowProps {
  order: Order;
  onAddTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => void;
  getStatusColor: (status: string) => string;
  getItemsSummary: (order: Order) => string;
}

const AdminOrderRow: React.FC<AdminOrderRowProps> = ({ 
  order, 
  onAddTracking, 
  getStatusColor, 
  getItemsSummary 
}) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isAddingTracking, setIsAddingTracking] = useState(false);

  const handleAddTracking = () => {
    if (trackingNumber.trim()) {
      onAddTracking(order.id, 'fedex', trackingNumber.trim());
      setTrackingNumber('');
      setIsAddingTracking(false);
    }
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          #{order.id.slice(-8).toUpperCase()}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">
          {order.user_id ? order.user_id.slice(0, 8) + '...' : 'Guest'}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">
          {new Date(order.created_at).toLocaleDateString()}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-900">
          {getItemsSummary(order)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-900">
          {usd(order.total_cents / 100)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge className={`${getStatusColor(order.status)} capitalize`}>
          {order.status}
        </Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {order.tracking_number ? (
          <div className="flex items-center space-x-2">
            <Badge className="bg-green-100 text-green-800">
              <Truck className="h-3 w-3 mr-1" />
              {order.tracking_carrier?.toUpperCase()}
            </Badge>
            <a
              href={fedexUrl(order.tracking_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 font-mono underline"
            >
              {order.tracking_number}
            </a>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            {isAddingTracking ? (
              <>
                <Input
                  type="text"
                  placeholder="Tracking number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-32 h-8 text-xs"
                />
                <Button size="sm" onClick={handleAddTracking}>
                  Add
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setIsAddingTracking(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddingTracking(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Tracking
              </Button>
            )}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <OrderDetails 
          order={order}
          trigger={
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
          }
        />
      </td>
    </tr>
  );
};

export default AdminOrders;
