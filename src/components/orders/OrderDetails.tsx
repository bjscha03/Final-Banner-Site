import React from 'react';
import { Order } from '../../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { ShoppingCart, Package, Calendar, CreditCard } from 'lucide-react';
import TrackingBadge from './TrackingBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface OrderDetailsProps {
  order: Order;
  trigger?: React.ReactNode;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, trigger }) => {
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
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

  const handleReorder = (itemIndex: number) => {
    const item = order.items[itemIndex];
    
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
    
    toast({
      title: "Added to Cart",
      description: `${item.quantity} banner${item.quantity > 1 ? 's' : ''} added to your cart.`,
    });
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      View Details
    </Button>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order #{order.id.slice(-8).toUpperCase()}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Order Date</p>
                <p className="font-medium">{orderDate}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Tracking</p>
              <TrackingBadge 
                carrier={order.tracking_carrier} 
                trackingNumber={order.tracking_number} 
              />
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
            <div className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">
                        Custom Banner {formatDimensions(item.width_in, item.height_in)}
                      </h4>
                      <div className="text-sm text-gray-600 mt-2 grid grid-cols-2 gap-2">
                        <p>Material: {item.material}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Area: {(item.area_sqft || 0).toFixed(2)} sq ft</p>
                        {item.grommets && <p>Grommets: {item.grommets}</p>}
                        {item.rope_feet && item.rope_feet > 0 && (
                          <p>Rope: {(item.rope_feet || 0).toFixed(1)} ft</p>
                        )}
                        {item.file_key && <p>File: {item.file_key}</p>}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">
                        {usd((item.line_total_cents || 0) / 100)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {usd((item.unit_price_cents || 0) / 100)} each
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReorder(index)}
                        className="mt-2"
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Reorder
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Total */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
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
            <div className="flex justify-between items-center border-t border-gray-200 pt-2">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-xl font-bold text-gray-900">
                {usd(order.total_cents / 100)}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetails;
