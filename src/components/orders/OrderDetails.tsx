import React, { useState } from 'react';
import { Order } from '../../lib/orders/types';
import { usd, calculateUnitPriceFromOrder } from "@/lib/pricing";
import { formatDimensions } from "@/lib/order-pricing";
import OrderItemBreakdown from "./OrderItemBreakdown";
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText, Sparkles, Info, MapPin, Loader2 } from 'lucide-react';
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
  const [printPdfGenerating, setPrintPdfGenerating] = useState<Record<number, boolean>>({});
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
  const handlePdfDownload = async (item: any, index: number) => {
    if (pdfGenerating[index]) {
      return;
    }

    try {
      setPdfGenerating(prev => ({ ...prev, [index]: true }));
      
      toast({
        title: "Generating Print-Ready PDF",
        description: "Creating high-quality PDF with proper dimensions and bleed...",
      });

      // Determine the best image source
      // CRITICAL: overlay_image.fileKey contains the ORIGINAL uploaded file (no grommets)
      // file_key is the THUMBNAIL (has grommets baked in) - use overlay_image.fileKey first!
      const overlayImageFileKey = item.overlay_image?.fileKey;
      const overlayImagesFileKey = item.overlay_images?.[0]?.fileKey;
      
      console.log('[PDF Download] Item image sources:', {
        overlay_image_fileKey: overlayImageFileKey,
        overlay_images_0_fileKey: overlayImagesFileKey,
        print_ready_url: item.print_ready_url,
        file_key: item.file_key,
        file_url: item.file_url,
        web_preview_url: item.web_preview_url
      });
      
      // CRITICAL FIX: Prioritize overlay_image.fileKey (original upload) over file_key (thumbnail with grommets)
      const imageSource = item.print_ready_url || overlayImageFileKey || overlayImagesFileKey || item.file_url || item.web_preview_url;
      
      if (!imageSource) {
        throw new Error('No image source available for this order item. Please contact support.');
      }
      
      const isCloudinaryKey = !imageSource?.startsWith('http');
      
      console.log('[PDF Download] Selected image source:', imageSource, 'isCloudinaryKey:', isCloudinaryKey);

      // CRITICAL: If using overlay_image.fileKey as main image, DON'T also pass overlayImage
      // Otherwise we get double-rendering (main image + overlay = same image twice!)
      const isUsingOverlayAsMain = imageSource === overlayImageFileKey || imageSource === overlayImagesFileKey;
      
      // CRITICAL: When using overlay as main, the stored transform was for overlay positioning,
      // NOT for full-banner scaling. We must reset these so the PDF renders correctly.
      const requestBody = {
        orderId: order.id,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        fileKey: isCloudinaryKey ? imageSource : null,
        imageUrl: isCloudinaryKey ? null : imageSource,
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        bleedIn: 0.125, // Standard 1/8" bleed
        targetDpi: 150, // High quality for print
        // CRITICAL: When overlay is main image, DON'T use stored transform (it's for overlay positioning, not full-banner)
        transform: isUsingOverlayAsMain ? null : (item.transform || null),
        previewCanvasPx: isUsingOverlayAsMain ? null : (item.preview_canvas_px || null),
        textElements: isUsingOverlayAsMain ? [] : (item.text_elements || []), // Text elements not relevant for overlay-as-main
        // CRITICAL: Skip overlayImage if we're already using it as the main image source
        overlayImage: isUsingOverlayAsMain ? null : (item.overlay_image || null),
        canvasBackgroundColor: item.canvas_background_color || '#FFFFFF' // Canvas background color
      };

      console.log('[PDF Download] Sending request:', requestBody);

      const response = await fetch('/.netlify/functions/render-order-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const contentType = response.headers.get('Content-Type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
        } catch (parseError) {
          console.error('[PDF Download] Error parsing error response:', parseError);
        }
        console.error('[PDF Download] HTTP Error:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      // Get PDF metadata from headers
      const dpi = response.headers.get('X-PDF-DPI') || '150';
      const bleed = response.headers.get('X-PDF-Bleed') || '0.125';

      // Handle binary PDF response
      const blob = await response.blob();
      console.log('[PDF Download] Received PDF blob:', blob.size, 'bytes');

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `order-${order.id.slice(-8)}-banner-${index + 1}-print-ready.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded",
        description: `Print-ready PDF (${dpi} DPI with ${bleed}" bleed) ready for production.`,
      });
    } catch (error) {
      console.error('[PDF Download] Error:', error);
      toast({
        title: "PDF Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setPdfGenerating(prev => ({ ...prev, [index]: false }));
    }
  };

  // Handler for print-grade PDF download (Beta)
  const handlePrintGradePdfDownload = async (item: any, index: number) => {
    try {
      setPrintPdfGenerating(prev => ({ ...prev, [index]: true }));
      
      // Determine the best image source (same logic as regular PDF download)
      // CRITICAL FIX: Prioritize file_key (clean original) over file_url (may have grommets)
      const imageSource = item.print_ready_url || item.file_key || item.file_url || item.web_preview_url;
      const isCloudinaryKey = !imageSource?.startsWith('http');
      
      console.log('[Print PDF] Image source:', imageSource, 'isCloudinaryKey:', isCloudinaryKey);
      
      const response = await fetch('/.netlify/functions/render-print-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          fileKey: isCloudinaryKey ? imageSource : null,
          imageUrl: isCloudinaryKey ? null : imageSource,
          bannerWidthIn: item.width_in,
          bannerHeightIn: item.height_in,
          targetDpi: 150,
          bleedIn: 0.25,
          textElements: item.text_elements || [],
          applyColorCorrection: true,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate print-grade PDF';
        try {
          const contentType = response.headers.get('Content-Type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
        } catch (parseError) {
          console.error('[Print-Grade PDF] Error parsing error response:', parseError);
        }
        throw new Error(errorMessage);
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
      setPrintPdfGenerating(prev => ({ ...prev, [index]: false }));
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
        <DialogHeader className="border-b-2 border-[#18448D] pb-4">
          <DialogTitle className="flex items-center space-x-3 text-2xl font-bold text-[#18448D]">
            <Package className="h-6 w-6" />
            <span>Order #{order.id.slice(-8).toUpperCase()}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info - Redesigned */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
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

          {/* Order Items - Redesigned */}
          <div>
            <h3 className="text-xl font-bold text-[#18448D] mb-4 flex items-center border-b-2 border-[#18448D] pb-2">
              <Package className="h-5 w-5 mr-2" />
              Items
            </h3>
            <div className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="border-2 border-slate-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-slate-900 mb-3">
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
                    <div className="text-right ml-4 min-w-[120px]">
                      <div className="bg-[#18448D] text-white px-4 py-2 rounded-lg mb-2">
                        <p className="text-xs font-medium opacity-90">Total</p>
                        <p className="text-xl font-bold">
                          {usd((item.line_total_cents || 0) / 100)}
                        </p>
                      </div>
                      <p className="text-sm text-slate-600 font-medium">
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
                            className="min-w-[60px]"
                          >
                            {pdfGenerating[index] ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3 mr-1" />
                            )}
                            {pdfGenerating[index] ? 'Generating...' : 'PDF'}
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
                            className="min-w-[60px]"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Image
                          </Button>
                        )}
                        
                        {/* Print-Grade PDF Button (Beta) - Feature Flagged */}
                        {isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintGradePdfDownload(item, index)}
                            disabled={printPdfGenerating[index]}
                            className="min-w-[60px] bg-gradient-to-r from-blue-50 to-purple-50 border-blue-300 hover:from-blue-100 hover:to-purple-100"
                          >
                            {printPdfGenerating[index] ? (
                              <Loader2 className="h-3 w-3 mr-1 text-blue-600 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3 mr-1 text-blue-600" />
                            )}
                            {printPdfGenerating[index] ? 'Generating...' : 'Print PDF'}
                          </Button>
                        )}

                        {/* Quality Button - Feature Flagged */}
                        {isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleQualityCheck(item)}
                            className="min-w-[60px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Info className="h-3 w-3 mr-1" />
                            Quality
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
                            className="min-w-[60px]"
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

          {/* Order Total - Redesigned */}
          <div className="mt-6 bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#18448D] mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Order Summary
            </h3>
            
            <div className="space-y-3">
              {/* Subtotal - Calculated from line items */}
              <div className="flex justify-between items-center py-2">
                <span className="text-base font-medium text-slate-700">Subtotal</span>
                <span className="text-lg font-semibold text-slate-900">
                  {usd(order.items.reduce((sum, item) => sum + (item.line_total_cents || 0), 0) / 100)}
                </span>
              </div>
              
              {/* Tax */}
              <div className="flex justify-between items-center py-2 border-b border-slate-300">
                <span className="text-base font-medium text-slate-700">Tax (6%)</span>
                <span className="text-lg font-semibold text-slate-900">
                  {usd(order.tax_cents / 100)}
                </span>
              </div>
              
              {/* Total - Calculated from line items + tax */}
              <div className="flex justify-between items-center pt-3 pb-1">
                <span className="text-xl font-bold text-[#18448D]">Total</span>
                <span className="text-2xl font-bold text-[#ff6b35]">
                  {usd((order.items.reduce((sum, item) => sum + (item.line_total_cents || 0), 0) + order.tax_cents) / 100)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Quality Modal */}
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
