import React, { useState } from 'react';
import { Order } from '../../lib/orders/types';
import { usd, calculateUnitPriceFromOrder } from "@/lib/pricing";
import { formatDimensions } from "@/lib/order-pricing";
import OrderItemBreakdown from "./OrderItemBreakdown";
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText, Sparkles, Info, MapPin, Loader2, Palette, Phone, Upload, ExternalLink, MessageSquare } from 'lucide-react';
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
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, trigger, onUploadFinalPdf }) => {
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
    
    // CRITICAL: overlay_image.fileKey contains the ORIGINAL uploaded file (no grommets)
    // file_key is the THUMBNAIL (has grommets baked in) - use overlay_image.fileKey first!
    const overlayImageFileKey = item.overlay_image?.fileKey;
    const overlayImagesFileKey = item.overlay_images?.[0]?.fileKey;
    
    // Prioritize clean original image over thumbnail with grommets
    if (overlayImageFileKey) {
      return { url: overlayImageFileKey, type: 'overlay_image', isAI: false };
    }
    
    if (overlayImagesFileKey) {
      return { url: overlayImagesFileKey, type: 'overlay_images', isAI: false };
    }
    
    // Last resort: file_key (may have grommets baked in for older orders)
    if (item.file_key) {
      return { url: item.file_key, type: 'file_key', isAI: false };
    }
    
    return null;
  };

  // Generate thumbnail URL from order item image sources
  const getThumbnailUrl = (item: any, maxWidth: number = 200) => {
    // CRITICAL: Use thumbnail_url first - it contains the accurate rendered design
    // with correct image positioning, overlays, text elements, and grommets
    if (item.thumbnail_url) {
      const thumbUrl = item.thumbnail_url;
      if (thumbUrl.includes("res.cloudinary.com") && thumbUrl.includes("/upload/")) {
        return thumbUrl.replace("/upload/", `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
      }
      if (thumbUrl.startsWith("http") && !thumbUrl.includes("res.cloudinary.com")) {
        return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${thumbUrl}`;
      }
      return thumbUrl;
    }

    // Fallback to raw image sources (legacy orders without thumbnail_url)
    let imageUrl: string | null = null;
    
    if (item.web_preview_url) {
      imageUrl = item.web_preview_url;
    } else if (item.print_ready_url) {
      imageUrl = item.print_ready_url;
    } else if (item.overlay_image?.fileKey) {
      const fileKey = item.overlay_image.fileKey;
      imageUrl = fileKey.startsWith('http') 
        ? fileKey 
        : `https://res.cloudinary.com/dtrxl120u/image/upload/${fileKey}`;
    } else if (item.file_key) {
      const fileKey = item.file_key;
      imageUrl = fileKey.startsWith('http') 
        ? fileKey 
        : `https://res.cloudinary.com/dtrxl120u/image/upload/${fileKey}`;
    }
    
    if (!imageUrl) return null;
    
    // Apply Cloudinary transformation for thumbnail sizing
    if (imageUrl.includes('res.cloudinary.com') && imageUrl.includes('/upload/')) {
      return imageUrl.replace('/upload/', `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
    }
    
    if (imageUrl.startsWith('http') && !imageUrl.includes('res.cloudinary.com')) {
      return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${imageUrl}`;
    }
    
    return imageUrl;
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
      toast({
        title: "Download Started",
        description: "Preparing file download...",
      });

      // Use Netlify function for secure file downloads
      const downloadUrl = `/.netlify/functions/download-file?key=${encodeURIComponent(fileKey)}&order=${order.id}`;

      // Fetch the file content
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Check if response is JSON (error) or file content
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      if (contentType.includes('application/json')) {
        // Handle JSON error response
        const result = await response.json();
        throw new Error(result.error || 'Download failed');
      }

      // Determine file extension from content type
      let extension = 'jpg';
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('gif')) extension = 'gif';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('pdf')) extension = 'pdf';
      else if (contentType.includes('tiff')) extension = 'tiff';

      // Build a proper filename with extension
      const baseName = fileKey?.split('/').pop()?.split('.')[0] || `banner-${order.id.slice(-8)}-item-${itemIndex + 1}`;
      const fileName = `${baseName}.${extension}`;

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
      
      
      console.log('[PDF Download] ======= OVERLAY-AS-MAIN DEBUG =======');
      console.log('[PDF Download] imageSource:', imageSource);
      console.log('[PDF Download] overlayImageFileKey:', overlayImageFileKey);
      console.log('[PDF Download] isUsingOverlayAsMain:', isUsingOverlayAsMain);
      console.log('[PDF Download] Will set fileKey to:', isUsingOverlayAsMain ? 'NULL (blank canvas)' : imageSource);
      console.log('[PDF Download] Will pass overlayImage:', item.overlay_image ? 'YES with scale=' + item.overlay_image.scale : 'NO');
      console.log('[PDF Download] =====================================');
      // CRITICAL: When using overlay as main, the stored transform was for overlay positioning,
      // NOT for full-banner scaling. We must reset these so the PDF renders correctly.
      const requestBody = {
        orderId: order.id,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        fileKey: isUsingOverlayAsMain ? null : (isCloudinaryKey ? imageSource : null),
        imageUrl: isUsingOverlayAsMain ? null : (isCloudinaryKey ? null : imageSource),
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        bleedIn: 0.125, // Standard 1/8" bleed
        targetDpi: 150, // High quality for print
        // CRITICAL: When overlay is main image, DON'T use stored transform (it's for overlay positioning, not full-banner)
        transform: isUsingOverlayAsMain ? null : (item.transform || null),
        previewCanvasPx: isUsingOverlayAsMain ? null : (item.preview_canvas_px || null),
        textElements: isUsingOverlayAsMain ? [] : (item.text_elements || []), // Text elements not relevant for overlay-as-main
        // Always pass overlayImage - when used as main, fileKey/imageUrl are null so PDF creates blank canvas
        overlayImage: item.overlay_image || null, // Always pass overlay image for correct positioning
        canvasBackgroundColor: item.canvas_background_color || '#FFFFFF', // Canvas background color
        imageScale: item.image_scale ?? 1,
        imagePosition: item.image_position || { x: 0, y: 0 }
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

          {/* Design Service Section - Admin Only (for design service orders) */}
          {isAdminUser && order.items.some(item => item.design_service_enabled) && (
            <div className="bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50 border-2 border-purple-300 rounded-2xl p-6 shadow-lg">
              {/* Header with gradient accent */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-purple-200">
                <div className="p-2.5 bg-gradient-to-br from-purple-600 to-violet-600 rounded-xl shadow-md">
                  <Palette className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-purple-900">Design Service Request</h3>
                  <p className="text-sm text-purple-600">Customer requested our team to create their design</p>
                </div>
                <span className="px-3 py-1.5 text-sm font-bold bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-full shadow-md">
                  ✨ We Design It
                </span>
              </div>

              {order.items.map((item, itemIndex) => ({ item, itemIndex }))
                .filter(({ item }) => item.design_service_enabled)
                .map(({ item, itemIndex }) => (
                <div key={itemIndex} className="space-y-5">
                  {/* Contact Info Card */}
                  <div className="bg-white/80 backdrop-blur rounded-xl p-4 border border-purple-200 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${item.design_draft_preference === 'email' ? 'bg-blue-100' : 'bg-green-100'}`}>
                        {item.design_draft_preference === 'email' ? (
                          <Mail className="h-5 w-5 text-blue-600" />
                        ) : (
                          <Phone className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Send Draft Via</p>
                        <p className="text-lg font-bold text-gray-900">
                          {item.design_draft_preference === 'email' ? '📧 Email' : '📱 Text Message'}
                        </p>
                      </div>
                      <div className="ml-auto px-4 py-2 bg-purple-100 rounded-lg">
                        <p className="text-sm font-bold text-purple-800">{item.design_draft_contact}</p>
                      </div>
                    </div>
                  </div>

                  {/* Design Description Card */}
                  <div className="bg-white/80 backdrop-blur rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-100 to-violet-100 border-b border-purple-200">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-purple-600" />
                        <p className="text-sm font-bold text-purple-800">Customer's Design Description</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-gray-800 text-sm leading-relaxed border border-gray-200">
                        {item.design_request_text || 'No description provided'}
                      </div>
                    </div>
                  </div>

                  {/* Uploaded Assets Card */}
                  {item.design_uploaded_assets && item.design_uploaded_assets.length > 0 && (
                    <div className="bg-white/80 backdrop-blur rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-purple-100 to-violet-100 border-b border-purple-200">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-purple-600" />
                          <p className="text-sm font-bold text-purple-800">
                            Customer's Assets ({item.design_uploaded_assets.length} files)
                          </p>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {item.design_uploaded_assets.map((asset, assetIdx) => (
                            <a
                              key={assetIdx}
                              href={asset.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200 group shadow-sm hover:shadow-md"
                            >
                              {asset.type.startsWith('image/') ? (
                                <img
                                  src={asset.url}
                                  alt={asset.name}
                                  className="w-12 h-12 object-cover rounded-lg border-2 border-white shadow"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center border-2 border-white shadow">
                                  <FileText className="h-6 w-6 text-purple-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{asset.name}</p>
                                <p className="text-xs text-gray-500">{(asset.size / 1024).toFixed(1)} KB</p>
                              </div>
                              <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Final Print PDF Section */}
                  <div className="bg-white/80 backdrop-blur rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-100 to-violet-100 border-b border-purple-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <p className="text-sm font-bold text-purple-800">Final Print PDF</p>
                      </div>
                    </div>
                    <div className="p-4">
                      {item.final_print_pdf_url ? (
                        <div className="flex items-center gap-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4">
                          <div className="p-3 bg-green-500 rounded-xl shadow-md">
                            <FileText className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-base font-bold text-green-800">✅ PDF Ready for Print</p>
                            <p className="text-sm text-green-600">
                              Uploaded {item.final_print_pdf_uploaded_at
                                ? new Date(item.final_print_pdf_uploaded_at).toLocaleString()
                                : ''}
                            </p>
                          </div>
                          <a
                            href={item.final_print_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 flex items-center gap-2 shadow-md transition-all duration-200"
                          >
                            <Download className="h-4 w-4" />
                            Download PDF
                          </a>
                        </div>
                      ) : (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg">
                              <span className="text-xl">⏳</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-base font-bold text-amber-800">Awaiting Final PDF</p>
                              <p className="text-sm text-amber-700 mt-1">
                                Upload the final print-ready PDF once the design is complete and approved by the customer.
                              </p>
                            </div>
                          </div>
                          {onUploadFinalPdf && (
                            <label className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-700 hover:to-violet-700 cursor-pointer transition-all duration-200 shadow-md">
                              <Upload className="h-4 w-4" />
                              Upload Final PDF
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    onUploadFinalPdf(order.id, itemIndex, file);
                                    e.target.value = ''; // Reset input
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
                  <div className="flex gap-4">
                    {/* Banner Thumbnail */}
                    {getThumbnailUrl(item) && (
                      <div className="flex-shrink-0">
                        <img 
                          src={getThumbnailUrl(item, 150)} 
                          alt={`Banner ${index + 1} preview`}
                          className="w-32 h-24 object-cover rounded-lg border border-slate-200 shadow-sm"
                          onError={(e) => {
                            // Hide image on error
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 flex justify-between items-start">
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
