import React from 'react';
import { Order } from '../../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText } from 'lucide-react';
import TrackingBadge from './TrackingBadge';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';


// Helper function to calculate unit price from order data
const calculateUnitPrice = (item: any) => {
  if (item.unit_price_cents) {
    return item.unit_price_cents; // Cart data has unit_price_cents
  }
  // Order data needs calculation
  const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
  const polePocketCost = 0; // Will be calculated separately
  return (item.line_total_cents - ropeCost - polePocketCost) / item.quantity;
};interface OrderDetailsProps {
  order: Order;
  trigger?: React.ReactNode;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, trigger }) => {
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = user && isAdmin(user);





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

  const handleFileDownload = async (fileKey: string, itemIndex: number) => {
    try {
      const fileName = fileKey?.split('/').pop() || `banner-design-${order.id.slice(-8)}-item-${itemIndex + 1}.txt`;

      toast({
        title: "Download Started",
        description: `Downloading ${fileName}...`,
      });

      // Use Netlify function for secure file downloads
      const downloadUrl = `/.netlify/functions/download-file?key=${encodeURIComponent(fileKey)}&order=${order.id}`;

      // Fetch the file content
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Check if response is JSON (error) or file content
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        // Handle JSON error response
        const result = await response.json();
        throw new Error(result.error || 'Download failed');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create a temporary download link
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: `Successfully downloaded ${fileName}`,
      });

    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Failed",
        description: error.message || "Could not download the file. Please try again.",
        variant: "destructive",
      });
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

          {/* Customer Information - Admin Only */}
          {isAdminUser && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <User className="h-5 w-5 text-blue-600 mr-2" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium text-gray-900">
                      {order.email || 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Customer ID</p>
                    <p className="font-medium text-gray-900 font-mono text-sm">
                      {order.user_id ? order.user_id.slice(0, 8) + '...' : 'Guest Order'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                        {item.file_key && (
                          <p>
                            File: <a 
                              href="#" 
                              onClick={(e) => { e.preventDefault(); handleFileDownload(item.file_key!, index); }}
                              className="text-blue-600 hover:underline"
                            >
                              {item.file_name || item.file_key.split('/').pop() || 'Download File'}
                            </a>
                          </p>
                        )}
                      </div>

                      {/* Cost Breakdown */}
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Base banner:</span>
                            <span className="text-gray-900">{usd(calculateUnitPrice(item) / 100)} × {item.quantity}</span>
                          </div>
                          {item.rope_feet && item.rope_feet > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Rope ({item.rope_feet.toFixed(1)}ft):</span>
                              <span className="text-gray-900">{usd(item.rope_feet * 2 * item.quantity)}</span>
                            </div>
                          )}
                          {(() => {
                            const baseCost = calculateUnitPrice(item) * item.quantity;
                            const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100;
                            const polePocketCost = item.line_total_cents - baseCost - ropeCost;
                            return polePocketCost > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Pole pockets:</span>
                                <span className="text-gray-900">{usd(polePocketCost / 100)}</span>
                              </div>
                            ) : null;
                          })()}
                          <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                            <span className="text-gray-900">Line total:</span>
                            <span className="text-gray-900">{usd(item.line_total_cents / 100)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">
                        {usd((item.line_total_cents || 0) / 100)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {usd((calculateUnitPrice(item) || 0) / 100)} each
                      </p>
                      <div className="mt-2 space-y-2">
                        {/* Admin File Download Button */}
                        {isAdminUser && item.file_key && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileDownload(item.file_key!, index)}
                            className="w-full"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download File
                          </Button>
                        )}
                        {isAdminUser && !item.file_key && (
                          <div className="text-xs text-gray-500 text-center py-1">
                            <FileText className="h-3 w-3 inline mr-1" />
                            No file uploaded
                          </div>
                        )}
                        {/* Reorder Button - Show for non-admin users only */}
                        {!isAdminUser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReorder(index)}
                            className="w-full"
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Reorder
                          </Button>
                        )}
                      </div>
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
