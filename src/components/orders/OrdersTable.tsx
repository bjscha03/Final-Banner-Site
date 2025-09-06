import React from 'react';
import { Order } from '../../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { Eye, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import TrackingBadge from './TrackingBadge';
import OrderDetails from './OrderDetails';

interface OrdersTableProps {
  orders: Order[];
  loading?: boolean;
}

const OrdersTable: React.FC<OrdersTableProps> = ({ orders, loading = false }) => {
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();

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

  const handleReorderAll = (order: Order) => {
    let totalItems = 0;

    order.items.forEach(item => {
      // Convert order item back to quote format for cart
      const quoteData = {
        widthIn: item.width_in,
        heightIn: item.height_in,
        quantity: item.quantity,
        material: item.material,
        grommets: item.grommets || 'none',
        polePockets: 'none',
        addRope: item.rope_feet > 0,
        previewScalePct: 150,
        file: item.file_key ? { name: item.file_key, type: '', size: 0 } : undefined,
        set: () => {},
        setFromQuickQuote: () => {},
      };

      addFromQuote(quoteData);
      totalItems += item.quantity;
    });

    toast({
      title: "Added to Cart",
      description: `${totalItems} banner${totalItems > 1 ? 's' : ''} from order #${order.id.slice(-8)} added to your cart.`,
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex space-x-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-gray-400 mb-4">
          <ShoppingCart className="h-12 w-12 mx-auto" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Yet</h3>
        <p className="text-gray-600 mb-4">You haven't placed any orders yet.</p>
        <Button onClick={() => window.location.href = '/design'}>
          Start Designing
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order
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
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    #{order.id.slice(-8).toUpperCase()}
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
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TrackingBadge
                    carrier={order.tracking_carrier}
                    trackingNumber={order.tracking_number}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <OrderDetails
                    order={order}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReorderAll(order)}
                  >
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    Reorder
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-gray-200">
        {orders.map((order) => (
          <div key={order.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-medium text-gray-900">
                  #{order.id.slice(-8).toUpperCase()}
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
            </div>

            <div className="mb-3">
              <p className="text-sm text-gray-900 mb-1">{getItemsSummary(order)}</p>
              <p className="text-lg font-semibold text-gray-900">
                {usd(order.total_cents / 100)}
              </p>
            </div>

            <div className="mb-3">
              <TrackingBadge
                carrier={order.tracking_carrier}
                trackingNumber={order.tracking_number}
              />
            </div>

            <div className="flex space-x-2">
              <OrderDetails
                order={order}
                trigger={
                  <Button variant="outline" size="sm" className="flex-1">
                    <Eye className="h-4 w-4 mr-1" />
                    View Details
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReorderAll(order)}
                className="flex-1"
              >
                <ShoppingCart className="h-4 w-4 mr-1" />
                Reorder
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrdersTable;
