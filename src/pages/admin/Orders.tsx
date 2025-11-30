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
  ArrowLeft,
  Download,
  Edit3,
  Save,
  X,
  FileText,
  Mail,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Star, ShoppingCart } from 'lucide-react';
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
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const { toast } = useToast();
  const [pdfLoadingStates, setPdfLoadingStates] = useState<Record<string, boolean>>({});
  const [activeAdminTab, setActiveAdminTab] = useState<'orders' | 'events' | 'abandoned-carts'>('orders');
  useEffect(() => {

    // Show access denied message instead of immediate redirect
    if (!authLoading && (!user || !isAdmin(user))) {
      setShowAccessDenied(true);
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
      
      // DEBUG: Log what we got from database
      console.log('🔵 [Orders.tsx] loadOrders() received:', allOrders.length, 'orders');
      if (allOrders.length > 0) {
        console.log('🔵 [Orders.tsx] First order:', allOrders[0].id);
        console.log('🔵 [Orders.tsx] First order items:', allOrders[0].items);
        if (allOrders[0].items && allOrders[0].items.length > 0) {
          console.log('🔵 [Orders.tsx] First item overlay_image:', allOrders[0].items[0].overlay_image);
          console.log('🔵🔵🔵 CRITICAL: overlay_image from DB:', JSON.stringify(allOrders[0].items[0].overlay_image, null, 2));
          console.log('🔵🔵🔵 CRITICAL: overlay_image from DB:', JSON.stringify(allOrders[0].items[0].overlay_image, null, 2));
        }
      }
      
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

      // Update local state with tracking info and status change
      // Note: tracking_carrier is not stored in database, so we default to 'fedex'
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                tracking_carrier: 'fedex' as const, // Default carrier since not stored in DB
                tracking_number: trackingNumber,
                status: 'shipped' // Update status to shipped when tracking is added
              }
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

  const handleUpdateTracking = async (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => {
    try {
      const ordersAdapter = await getOrdersAdapter();
      await ordersAdapter.updateTracking(orderId, carrier, trackingNumber);

      // Update local state with new tracking info (don't change status)
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                tracking_carrier: 'fedex' as const, // Default carrier since not stored in DB
                tracking_number: trackingNumber,
                // Don't change status when updating existing tracking
              }
            : order
        )
      );

      toast({
        title: "Tracking Updated",
        description: `Tracking information updated for order #${orderId.slice(-8)}`,
      });
    } catch (error) {
      console.error('Error updating tracking:', error);
      toast({
        title: "Error",
        description: "Failed to update tracking information. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileDownload = async (fileKey: string, orderId: string, itemIndex: number) => {
    try {
      const fileName = fileKey?.split('/').pop() || `banner-design-${orderId.slice(-8)}-item-${itemIndex + 1}.txt`;

      toast({
        title: "Download Started",
        description: `Downloading ${fileName}...`,
      });

      // Use Netlify function for secure file downloads
      const downloadUrl = `/.netlify/functions/download-file?key=${encodeURIComponent(fileKey)}&order=${orderId}`;

      // Fetch the file content
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download Complete",
        description: `${fileName} has been downloaded successfully.`,
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Failed",
        description: "Could not download the file. It may not exist or be accessible.",
        variant: "destructive",
      });
    }
  };

  const handlePdfDownload = async (item: any, itemIndex: number, orderId: string) => {
    const loadingKey = `${orderId}-${itemIndex}`;
    
    try {
      // Set loading state for this specific PDF button
      setPdfLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      toast({
        title: "Generating Print-Ready PDF",
        description: "Creating high-quality PDF with proper dimensions and bleed...",
      });
      console.log("🟢 PDF Download - Item data:", item);
      console.log("🟢 PDF Download - overlay_image:", item.overlay_image);

      // Determine the best image source
      // For PDF/image uploads, check file_key first, then fall back to file_url
      const imageSource = item.print_ready_url || item.web_preview_url || item.file_key || item.file_url;
      const isCloudinaryKey = imageSource && !imageSource.startsWith('http');
      
      console.log('[PDF DEBUG] Image source resolution:', {
        print_ready_url: item.print_ready_url,
        web_preview_url: item.web_preview_url,
        file_key: item.file_key,
        file_url: item.file_url,
        final_imageSource: imageSource,
        isCloudinaryKey
      });

      const requestBody = {
        orderId: orderId,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        fileKey: isCloudinaryKey ? imageSource : null,
        imageUrl: isCloudinaryKey ? null : imageSource,
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        bleedIn: 0.125,
        targetDpi: 150,
        transform: item.transform || null,
        previewCanvasPx: item.preview_canvas_px || null,
        textElements: item.text_elements || [],
        overlayImage: item.overlay_image || null,
        overlayImages: item.overlay_images || null,
        canvasBackgroundColor: item.canvas_background_color || '#FFFFFF'
      };

      console.log('🔴 PDF REQUEST:', JSON.stringify(requestBody, null, 2));

      const response = await fetch('/.netlify/functions/render-order-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PDF generation failed:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Check if response is JSON (error) or PDF (success)
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        // Error response
        const result = await response.json();
        throw new Error(result.error || result.message || 'PDF generation failed');
      } else if (contentType?.includes('application/pdf')) {
        // Success - PDF binary response
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-${orderId.slice(-8)}-banner-${itemIndex + 1}-print-ready.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL
        window.URL.revokeObjectURL(url);

        toast({
          title: "PDF Downloaded",
          description: `Print-ready PDF ready for production.`,
        });
      } else {
        throw new Error('Unexpected response type: ' + contentType);
      }
    } catch (error) {
      console.error('PDF Download Error:', error);
      toast({
        title: "PDF Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      // Clear loading state for this PDF button
      setPdfLoadingStates(prev => ({ ...prev, [loadingKey]: false }));

    }
  };


  const handleSendShippingNotification = async (orderId: string) => {
    try {
      const response = await fetch('/.netlify/functions/send-shipping-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to send shipping notification');
      }

      // Update local state to mark notification as sent
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                shipping_notification_sent: true,
                shipping_notification_sent_at: new Date().toISOString()
              }
            : order
        )
      );

      toast({
        title: "Shipping Notification Sent",
        description: `Customer has been notified about order #${orderId.slice(-8)}`,
      });
    } catch (error) {
      console.error('Send shipping notification failed:', error);
      toast({
        title: "Failed to Send Notification",
        description: error.message || "Could not send shipping notification. Please try again.",
        variant: "destructive",
      });
    }
  };

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

  // Show access denied message if user is not authenticated or not admin
  if (showAccessDenied || (!authLoading && (!user || !isAdmin(user)))) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <Shield className="h-16 w-16 mx-auto text-red-600 mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Admin Access Required
              </h1>
              <p className="text-gray-600 mb-6">
                You need admin privileges to access this page. Please set up admin access first.
              </p>
              <div className="space-y-4">
                <Button
                  onClick={() => navigate('/admin/setup')}
                  className="w-full sm:w-auto"
                >
                  Set Up Admin Access
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="w-full sm:w-auto ml-0 sm:ml-4"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </div>

              {/* Debug info for production troubleshooting */}
              <details className="mt-8 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Debug Information (for troubleshooting)
                </summary>
                <div className="mt-2 p-4 bg-gray-50 rounded text-xs font-mono">
                  <div>Auth Loading: {authLoading ? 'true' : 'false'}</div>
                  <div>User: {user ? JSON.stringify({ id: user.id, email: user.email, is_admin: user.is_admin }) : 'null'}</div>
                  <div>Is Admin: {user ? isAdmin(user) ? 'true' : 'false' : 'N/A'}</div>
                  <div>Hostname: {typeof window !== 'undefined' ? window.location.hostname : 'unknown'}</div>
                  <div>Cookies: {typeof document !== 'undefined' ? document.cookie || 'none' : 'unavailable'}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </Layout>
    );
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

          {/* Admin Navigation */}
          <div className="mb-6">
            <Tabs value="orders" className="w-full">
              <TabsList>
                <TabsTrigger value="orders" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Orders
                </TabsTrigger>
                <TabsTrigger value="events" className="flex items-center gap-2" asChild>
                  <a href="/admin/events">
                    <Star className="h-4 w-4" />
                    Events
                  </a>
                </TabsTrigger>
                <TabsTrigger value="abandoned-carts" className="flex items-center gap-2" asChild>
                  <a href="/admin/abandoned-carts">
                    <ShoppingCart className="h-4 w-4" />
                    Abandoned Carts
                  </a>
                </TabsTrigger>
              </TabsList>
            </Tabs>
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
              <>
                {/* Mobile Card View */}
                <div className="block md:hidden">
                  {filteredOrders.map((order) => (
                    <AdminOrderCard
                      key={order.id}
                      order={order}
                      onAddTracking={handleAddTracking}
                      onUpdateTracking={handleUpdateTracking}
                      onFileDownload={handleFileDownload}
                      onPdfDownload={handlePdfDownload}
                      onSendShippingNotification={handleSendShippingNotification}
                      getStatusColor={getStatusColor}
                      pdfLoadingStates={pdfLoadingStates}
                      getItemsSummary={getItemsSummary}
                    />
                  ))}
                </div>
                
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Order
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Customer
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Date
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Items
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Total
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Status
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          PDF
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Tracking
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
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
                          onUpdateTracking={handleUpdateTracking}
                          onFileDownload={handleFileDownload}
                          onPdfDownload={handlePdfDownload}
                          onSendShippingNotification={handleSendShippingNotification}
                          getStatusColor={getStatusColor}
                          pdfLoadingStates={pdfLoadingStates}
                          getItemsSummary={getItemsSummary}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number) => void;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onSendShippingNotification: (orderId: string) => void;
  getStatusColor: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
}

const AdminOrderRow: React.FC<AdminOrderRowProps> = ({
  order,
  onAddTracking,
  onUpdateTracking,
  onFileDownload,
  onPdfDownload,
  onSendShippingNotification,
  getStatusColor,
  getItemsSummary,
  pdfLoadingStates
}) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isAddingTracking, setIsAddingTracking] = useState(false);
  // Helper function to get the best download URL for an item (AI or uploaded)
  const getBestDownloadUrl = (item) => {
    // For AI-generated items, prioritize print_ready_url for high-quality downloads
    if (item.print_ready_url) {
      return { url: item.print_ready_url, type: 'print_ready', isAI: true };
    }
    
    // Fallback to web_preview_url if available
    if (item.web_preview_url) {
      return { url: item.web_preview_url, type: 'web_preview', isAI: true };
    }
    
    // Fallback to original file_key for non-AI items
    if (item.file_key) {
      return { url: item.file_key, type: 'file_key', isAI: false };
    }
    
    return null;
  };

  // Helper function to get download label based on item type
  const getDownloadLabel = (item, index) => {
    const downloadInfo = getBestDownloadUrl(item);
    if (!downloadInfo) return `Item ${index + 1}`;
    
    if (downloadInfo.isAI) {
      return downloadInfo.type === 'print_ready' 
        ? `🎨 Print File ${index + 1}` 
        : `🎨 Preview ${index + 1}`;
    }
    
    return `Item ${index + 1}`;
  };

  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const handleAddTracking = () => {
    if (trackingNumber.trim()) {
      onAddTracking(order.id, 'fedex', trackingNumber.trim());
      setTrackingNumber('');
      setIsAddingTracking(false);
    }
  };

  const handleEditTracking = () => {
    setEditTrackingNumber(order.tracking_number || '');
    setIsEditingTracking(true);
  };

  const handleSaveTracking = () => {
    if (editTrackingNumber.trim()) {
      onUpdateTracking(order.id, 'fedex', editTrackingNumber.trim());
      setIsEditingTracking(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTrackingNumber('');
    setIsEditingTracking(false);
  };

  const handleSendNotification = async () => {
    setIsSendingNotification(true);
    try {
      await onSendShippingNotification(order.id);
    } finally {
      setIsSendingNotification(false);
    }
  };

  const getFilesWithDownload = () => {
    const filesWithDownload = order.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => 
        item.file_key || 
        item.print_ready_url || 
        item.web_preview_url ||
        (item.text_elements && item.text_elements.length > 0) ||
        item.overlay_image
      );

    return filesWithDownload;
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          #{order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN'}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-sm text-gray-900">
          {order.user_id ? (order.user_id.slice(0, 8) + '...') : 'Guest'}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-sm text-gray-900">
          {new Date(order.created_at).toLocaleDateString()}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-sm text-gray-900">
          {getItemsSummary(order)}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-900">
          {usd(order.total_cents / 100)}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <Badge className={`${getStatusColor(order.status)} capitalize`}>
          {order.status}
        </Badge>
      </td>
      {/* PDF Column */}
      <td className="px-3 py-3">
        <div className="flex flex-col space-y-1">
          {getFilesWithDownload().length > 0 ? (
            getFilesWithDownload().map(({ item, index }) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                onClick={() => onPdfDownload(item, index, order.id)}
                disabled={pdfLoadingStates[`${order.id}-${index}`]}
                className="text-xs h-6 px-2"
              >
                {pdfLoadingStates[`${order.id}-${index}`] ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3 mr-1" />
                    PDF
                  </>
                )}
              </Button>
            ))
          ) : (
            <div className="text-xs text-gray-500 flex items-center">
              <FileText className="h-3 w-3 mr-1" />
              No files
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {order.tracking_number ? (
          <div className="flex flex-col space-y-2">
            {isEditingTracking ? (
              <div className="flex items-center space-x-1">
                <Input
                  type="text"
                  value={editTrackingNumber}
                  onChange={(e) => setEditTrackingNumber(e.target.value)}
                  className="w-32 h-7 text-xs"
                />
                <Button size="sm" onClick={handleSaveTracking} className="h-7 px-2">
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEditTracking}
                  className="h-6 px-1"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              </div>
            )}
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
      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <OrderDetails
            order={order}
            trigger={
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
            }
          />

          {/* Send Shipping Notification Button */}
          {order.tracking_number && !order.shipping_notification_sent && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendNotification}
              disabled={isSendingNotification}
              className="text-xs"
            >
              {isSendingNotification ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-3 w-3 mr-1" />
                  Send Email
                </>
              )}
            </Button>
          )}

          {/* Show notification sent status */}
          {order.shipping_notification_sent && (
            <div className="text-xs text-green-600 flex items-center">
              <Mail className="h-3 w-3 mr-1" />
              Email Sent
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};


// Mobile Card Component for Orders
interface AdminOrderCardProps {
  order: Order;
  onAddTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => void;
  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number) => void;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onSendShippingNotification: (orderId: string) => void;
  getStatusColor: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
}

const AdminOrderCard: React.FC<AdminOrderCardProps> = ({
  order,
  onPdfDownload,
  getStatusColor,
  getItemsSummary,
  pdfLoadingStates
}) => {
  const getFilesWithDownload = () => {
    return order.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => 
        item.file_key || 
        item.print_ready_url || 
        item.web_preview_url ||
        (item.text_elements && item.text_elements.length > 0) ||
        item.overlay_image
      );
  };

  return (
    <div className="border-b border-gray-200 p-4 hover:bg-gray-50">
      {/* Order Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-mono text-sm font-semibold text-[#18448D]">
            #{order.id.slice(-8).toUpperCase()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {new Date(order.created_at).toLocaleDateString()}
          </div>
        </div>
        <Badge className={`${getStatusColor(order.status)} capitalize`}>
          {order.status}
        </Badge>
      </div>

      {/* Customer Info */}
      <div className="mb-3">
        <div className="text-xs text-gray-500">Customer</div>
        <div className="text-sm font-medium truncate">
          {order.user_id?.slice(0, 20) || 'Guest'}...
        </div>
      </div>

      {/* Items Summary */}
      <div className="mb-3">
        <div className="text-xs text-gray-500">Items</div>
        <div className="text-sm">{getItemsSummary(order)}</div>
      </div>

      {/* Total */}
      <div className="mb-3">
        <div className="text-xs text-gray-500">Total</div>
        <div className="text-lg font-bold text-[#18448D]">{usd(order.total_cents / 100)}</div>
      </div>

      {/* PDF Downloads */}
      {getFilesWithDownload().length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-2">Print Files</div>
          <div className="flex flex-wrap gap-2">
            {getFilesWithDownload().map(({ item, index }) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                onClick={() => onPdfDownload(item, index, order.id)}
                disabled={pdfLoadingStates[`${order.id}-${index}`]}
                className="text-xs h-8 px-3"
              >
                {pdfLoadingStates[`${order.id}-${index}`] ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3 mr-1" />
                    PDF {index + 1}
                  </>
                )}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Tracking Info */}
      {order.tracking_number && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Tracking</div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800">
              <Truck className="h-3 w-3 mr-1" />
              {order.tracking_carrier?.toUpperCase()}
            </Badge>
            <a
              href={fedexUrl(order.tracking_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate"
            >
              {order.tracking_number}
            </a>
          </div>
        </div>
      )}

      {/* View Details Button */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="w-full">
              <Eye className="h-3 w-3 mr-1" />
              View Full Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order #{order.id.slice(-8).toUpperCase()}</DialogTitle>
            </DialogHeader>
            <OrderDetails order={order} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};


export default AdminOrders;
