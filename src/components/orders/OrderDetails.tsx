import React, { useState } from 'react';
import { Order } from '../../lib/orders/types';
import { usd, calculateUnitPriceFromOrder } from "@/lib/pricing";
import { formatDimensions } from "@/lib/order-pricing";
import OrderItemBreakdown from "./OrderItemBreakdown";
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText, Sparkles, Info, MapPin } from 'lucide-react';
import TrackingBadge from './TrackingBadge';
import PDFQualityCheck from '../admin/PDFQualityCheck';
import { isPrintPipelineEnabled } from '../../utils/printPipeline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';


// Helper function to calculate unit price from order data
    

interface OrderDetailsProps {
  order: Order;
  trigger?: React.ReactNode;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, trigger }) => {
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const { user } = useAuth();
  const [pdfGenerating, setPdfGenerating] = useState<Record<number, boolean>>({});
  const isAdminUser = user && isAdmin(user);
  const [qualityCheckOpen, setQualityCheckOpen] = useState(false);
  const [qualityCheckData, setQualityCheckData] = useState<any>(null);
  const printPipelineEnabled = isPrintPipelineEnabled();

  // Debug logging
  console.log('🔍 Print Pipeline Debug:', {
    printPipelineEnabled,
    isAdminUser,
    envVar: import.meta.env.VITE_ENABLE_PRINT_PIPELINE,
    user: user?.email
  });

  // Debug logging
  console.log('🔍 Print Pipeline Debug:', {
    printPipelineEnabled,
    isAdminUser,
    envVar: import.meta.env.VITE_ENABLE_PRINT_PIPELINE,
    user: user?.email
  });

  // Helper function to get the best download URL for an item (AI or uploaded)
  const getBestDownloadUrl = (item: any) => {
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
  const handlePdfDownload = async (item: any, itemIndex: number) => {
    if (pdfGenerating[itemIndex]) {
      return;
    }

    try {
      setPdfGenerating(prev => ({ ...prev, [itemIndex]: true }));
      
      toast({
        title: "Generating Print-Ready PDF",
        description: "Creating high-quality PDF with proper dimensions and bleed...",
      });

      // Determine the best image source
      const imageSource = item.print_ready_url || item.web_preview_url || item.file_key;
      const isCloudinaryKey = !imageSource?.startsWith('http');

      const requestBody = {
        orderId: order.id,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        fileKey: isCloudinaryKey ? imageSource : null,
        imageUrl: isCloudinaryKey ? null : imageSource,
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        bleedIn: 0.125, // Standard 1/8" bleed
        targetDpi: 150, // High quality for print
        transform: item.transform || null, // Use stored transform if available
        previewCanvasPx: item.preview_canvas_px || null,
        textElements: item.text_elements || [], // Include text layers for rendering
        overlayImage: item.overlay_image || null // Include overlay image (logo/graphic) if present
      };

      console.log('[PDF Download] Sending request:', requestBody);

      const response = await fetch('/.netlify/functions/render-order-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.pdfUrl) {
        // Download the PDF (works with both data URLs and regular URLs)
        const link = document.createElement('a');
        link.href = result.pdfUrl;
        link.download = `order-${order.id.slice(-8)}-banner-${itemIndex + 1}-print-ready.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: "PDF Downloaded",
          description: `Print-ready PDF (${result.dpi} DPI with ${result.bleedIn}" bleed) ready for production.`,
        });
      } else {
        throw new Error('No PDF URL in response');
      }
    } catch (error) {
      console.error('[PDF Download] Error:', error);
      toast({
        title: "PDF Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setPdfGenerating(prev => ({ ...prev, [itemIndex]: false }));
    }
  };

  // Handler for print-grade PDF download (Beta)
  const handlePrintGradePdfDownload = async (item: any, index: number) => {
    try {
      setPdfGenerating({ ...pdfGenerating, [index]: true });
      
      const response = await fetch('/.netlify/functions/render-print-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          fileKey: item.file_key,
          bannerWidthIn: item.width_in,
          bannerHeightIn: item.height_in,
          targetDpi: 150,
          bleedIn: 0.25,
          textElements: item.text_elements || [],
          applyColorCorrection: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate print-grade PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `banner-${order.id}-item-${index + 1}-print-grade.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Print-Grade PDF Downloaded',
        description: 'High-quality print-ready PDF generated successfully.',
      });
    } catch (error) {
      console.error('Error generating print-grade PDF:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate print-grade PDF',
        variant: 'destructive',
      });
    } finally {
      setPdfGenerating({ ...pdfGenerating, [index]: false });
    }
  };

  // Handler for quality check modal
  const handleQualityCheck = (item: any) => {
    setQualityCheckData({
      bannerWidthIn: item.width_in,
      bannerHeightIn: item.height_in,
      fileKey: item.file_key,
      logoKey: item.logo_key,
      aiImageKey: item.ai_image_key,
      targetDpi: 150,
    });
    setQualityCheckOpen(true);
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

          {/* Shipping Address - Admin Only */}
          {isAdminUser && (order.shipping_name || order.shipping_street) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <MapPin className="h-5 w-5 text-green-600 mr-2" />
                Shipping Address
              </h3>
              <div className="space-y-1">
                {order.shipping_name && (
                  <p className="font-medium text-gray-900">{order.shipping_name}</p>
                )}
                {order.shipping_street && (
                  <p className="text-gray-700">{order.shipping_street}</p>
                )}
                {(order.shipping_city || order.shipping_state || order.shipping_zip) && (
                  <p className="text-gray-700">
                    {order.shipping_city}{order.shipping_city && order.shipping_state ? ', ' : ''}{order.shipping_state} {order.shipping_zip}
                  </p>
                )}
                {order.shipping_country && order.shipping_country !== 'US' && (
                  <p className="text-gray-700">{order.shipping_country}</p>
                )}
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
                        <p className="break-words">Material: {item.material}</p>
                        <p className="break-words">Quantity: {item.quantity}</p>
                        <p className="break-words">Area: {(item.area_sqft || 0).toFixed(2)} sq ft</p>
                        {item.grommets && <p className="break-words">Grommets: {item.grommets}</p>}
                        {item.rope_feet && item.rope_feet > 0 && (
                          <p className="break-words">Rope: {(item.rope_feet || 0).toFixed(1)} ft</p>
                        )}
                        {(item.pole_pockets || item.pole_pocket_position) && (
                          <p className="break-words">
                            Pole Pockets: {
                              item.pole_pocket_position && item.pole_pocket_position !== 'none'
                                ? `${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
                                : item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== 'false'
                                  ? 'Yes'
                                  : 'None'
                            }
                          </p>
                        )}
                        {item.file_key && (
                          <p className="break-words overflow-hidden">
                            File: <a 
                              href="#" 
                              onClick={(e) => { e.preventDefault(); handleFileDownload(item.file_key!, index); }}
                              className="text-blue-600 hover:underline break-all"
                              title={item.file_name || item.file_key.split('/').pop() || 'Download File'}
                            >
                              {item.file_name || item.file_key.split('/').pop() || 'Download File'}
                            </a>
                          </p>
                        )}
                      </div>

                      {/* Cost Breakdown - Using Unified Pricing Module */}
                      <OrderItemBreakdown item={item} />
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">
                        {usd((item.line_total_cents || 0) / 100)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {usd((calculateUnitPriceFromOrder(item) || 0) / 100)} each
                      </p>
                      <div className="mt-2 space-y-2">
                        
                        {/* Admin PDF Download Button */}
                        {isAdminUser && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePdfDownload(item, index)}
                            disabled={pdfGenerating[index]}
                            className="w-full"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download PDF
                          </Button>
                        )}
                        
                        {/* Admin File Download Button */}
                        {isAdminUser && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const downloadInfo = getBestDownloadUrl(item);
                              if (downloadInfo) {
                                if (downloadInfo.isAI) {
                                  // For AI items, download directly from the URL
                                  const link = document.createElement('a');
                                  link.href = downloadInfo.url;
                                  link.download = `banner-${order.id}-item-${index + 1}-${downloadInfo.type}.${downloadInfo.type === 'print_ready' ? 'tiff' : 'jpg'}`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                } else {
                                  // For regular items, use the file download function
                                  handleFileDownload(downloadInfo.url, index);
                                }
                              }
                            }}
                            className="w-full"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download Image File
                          </Button>
                        )}
                        
                        {/* Print-Grade PDF Button (Beta) - Feature Flagged */}
                        {isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintGradePdfDownload(item, index)}
                            disabled={pdfGenerating[index]}
                            className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border-blue-300 hover:from-blue-100 hover:to-purple-100"
                          >
                            <Sparkles className="h-3 w-3 mr-1 text-blue-600" />
                            Print-Grade PDF (Beta)
                          </Button>
                        )}

                        {/* Quality Check Button - Feature Flagged */}
                        {isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleQualityCheck(item)}
                            className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Info className="h-3 w-3 mr-1" />
                            Quality Check
                          </Button>
                        )}
                        
                        {isAdminUser && !item.file_key && !item.print_ready_url && !item.web_preview_url && (
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
                {usd(order.subtotal_cents / 100)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Tax (6%)</span>
              <span className="text-gray-900">
                {usd(order.tax_cents / 100)}
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

      {/* Quality Check Modal */}
      {qualityCheckData && (
        <PDFQualityCheck
          isOpen={qualityCheckOpen}
          onClose={() => setQualityCheckOpen(false)}
          orderData={qualityCheckData}
        />
      )}
    </Dialog>
  );
};

export default OrderDetails;
