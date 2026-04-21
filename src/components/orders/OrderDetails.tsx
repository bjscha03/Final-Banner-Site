import React, { useState } from 'react';
import { Order } from '../../lib/orders/types';
import { usd } from "@/lib/pricing";
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText, Sparkles, MapPin, Loader2, Palette, Phone, Upload, MessageSquare } from 'lucide-react';
import TrackingBadge from './TrackingBadge';
import { getItemDisplayName, getProductLabel, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { formatShippingAddress, hasShippingAddress, normalizeShippingAddress } from '@/lib/shipping-address';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
const isCloudinaryUploadUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/upload/');
  } catch {
    return false;
  }
};

const isHttpUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};


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
    if (!item.thumbnail_url) return null;
    const thumbUrl = item.thumbnail_url;
    if (isCloudinaryUploadUrl(thumbUrl)) {
      return thumbUrl.replace("/upload/", `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
    }
    if (isHttpUrl(thumbUrl) && !isCloudinaryUploadUrl(thumbUrl)) {
      return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${thumbUrl}`;
    }
    return thumbUrl;
  };

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const shippingAddress = normalizeShippingAddress({
    ...(order.shippingAddress || {}),
    shipping_name: order.shipping_name,
    shipping_street: order.shipping_street,
    shipping_street2: order.shipping_street2,
    shipping_city: order.shipping_city,
    shipping_state: order.shipping_state,
    shipping_zip: order.shipping_zip,
    shipping_country: order.shipping_country,
    customer_name: order.customer_name,
  });
  const customerName = order.customer_name || shippingAddress.name || 'Not provided';
  const customerEmail = order.email || 'Not provided';
  const hasAddress = hasShippingAddress(shippingAddress);
  const shippingAddressLines = formatShippingAddress(shippingAddress);

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
      const baseName = fileKey?.split('/').pop()?.split('.')[0] || `order-${order.id.slice(-8)}-item-${itemIndex + 1}`;
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

  // Download design service asset with correct filename and extension
  const handleAssetDownload = async (asset: { url: string; name: string; type: string }) => {
    try {
      toast({
        title: "Download Started",
        description: `Preparing ${asset.name} for download...`,
      });

      const isPdf = asset.type === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
      console.log('[Asset Download] Starting download:', { name: asset.name, type: asset.type, isPdf, url: asset.url });

      // For Cloudinary raw resources (like PDFs), we need to fetch directly
      // The fl_attachment transformation doesn't work well for raw resources
      // Instead, we fetch the file and create a blob download
      const response = await fetch(asset.url);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get the blob with correct MIME type
      const blob = await response.blob();

      // For PDFs, ensure the blob has the correct MIME type
      const finalBlob = isPdf
        ? new Blob([blob], { type: 'application/pdf' })
        : blob;

      console.log('[Asset Download] Blob created:', { size: finalBlob.size, type: finalBlob.type });

      // Create object URL and trigger download
      const blobUrl = window.URL.createObjectURL(finalBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = asset.name; // Use the original filename which includes extension
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);

      toast({
        title: "Download Complete",
        description: `Successfully downloaded ${asset.name}`,
      });
    } catch (error) {
      console.error('[Asset Download] Error:', error);
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
    };

    addFromQuote(quoteData);
    
    toast({
      title: "Added to Cart",
      description: `${item.quantity} ${getProductLabel((item as any).product_type)}${item.quantity > 1 ? 's' : ''} added to your cart.`,
    });
  };
  const handlePdfDownload = async (item: any, index: number) => {
    if (pdfGenerating[index]) {
      return;
    }

    try {
      setPdfGenerating(prev => ({ ...prev, [index]: true }));
      
      toast({
        title: "Generating Print-Ready File",
        description: "Creating high-quality JPEG with proper dimensions and bleed...",
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
        productType: (item as any).product_type || 'banner',
        roundedCorners: (item as any).rounded_corners || null,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        // PRIORITY 0: Design state for true server-side re-render from original assets
        canvasStateJson: item.canvas_state_json || null,
        // PRIORITY 1: Use final_render if available (pixel-perfect snapshot of customer design)
        finalRenderUrl: item.final_render_url || null,
        finalRenderFileKey: item.final_render_file_key || null,
        finalRenderWidthPx: item.final_render_width_px || null,
        finalRenderHeightPx: item.final_render_height_px || null,
        finalRenderDpi: item.final_render_dpi || null,
        // FALLBACK: Reconstruction data for older orders without final_render
        fileKey: isUsingOverlayAsMain ? null : (isCloudinaryKey ? imageSource : null),
        imageUrl: isUsingOverlayAsMain ? null : (isCloudinaryKey ? null : imageSource),
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        includeBleed: false,
        bleedIn: 0,
        targetDpi: 300, // Print-ready 300 DPI
        // CRITICAL: When overlay is main image, DON'T use stored transform (it's for overlay positioning, not full-banner)
        transform: isUsingOverlayAsMain ? null : (item.transform || null),
        previewCanvasPx: isUsingOverlayAsMain ? null : (item.preview_canvas_px || null),
        textElements: isUsingOverlayAsMain ? [] : (item.text_elements || []), // Text elements not relevant for overlay-as-main
        // Always pass overlayImage - when used as main, fileKey/imageUrl are null so PDF creates blank canvas
        overlayImage: item.overlay_image || null, // Always pass overlay image for correct positioning
        overlayImages: item.overlay_images || null,
        canvasBackgroundColor: item.canvas_background_color || '#FFFFFF', // Canvas background color
        imageScale: item.image_scale ?? 1,
        imagePosition: item.image_position || { x: 0, y: 0 },
        thumbnailUrl: item.thumbnail_url || null,
        format: 'jpeg'  // Return JPEG directly instead of PDF
      };

      // DEBUG: Log what source will be used for export
      console.log('[JPEG_EXPORT_DEBUG] ======= ADMIN DOWNLOAD REQUEST =======');
      console.log('[JPEG_EXPORT_DEBUG] Order ID:', order.id);
      console.log('[JPEG_EXPORT_DEBUG] Banner size:', item.width_in, '×', item.height_in, 'inches');
      console.log('[JPEG_EXPORT_DEBUG] finalRenderUrl:', item.final_render_url ? item.final_render_url.substring(0, 80) + '...' : 'NONE');
      console.log('[JPEG_EXPORT_DEBUG] finalRenderFileKey:', item.final_render_file_key || 'NONE');
      console.log('[JPEG_EXPORT_DEBUG] finalRenderWidthPx:', item.final_render_width_px || 'NONE');
      console.log('[JPEG_EXPORT_DEBUG] finalRenderHeightPx:', item.final_render_height_px || 'NONE');
      console.log('[JPEG_EXPORT_DEBUG] thumbnailUrl:', item.thumbnail_url ? item.thumbnail_url.substring(0, 80) + '...' : 'NONE');
      console.log('[JPEG_EXPORT_DEBUG] Using final_render:', !!(item.final_render_url || item.final_render_file_key));
      console.log('[JPEG_EXPORT_DEBUG] ====================================');
      console.log('[PDF Download] Sending request:', requestBody);

      // Retry logic for transient 504 timeouts (matches Orders.tsx)
      let response: Response | null = null;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            toast({
              title: "Retrying Print File Generation",
              description: `Attempt ${attempt + 1} of ${maxRetries + 1}...`,
            });
          }
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 150000); // 150s client timeout
          response = await fetch('/.netlify/functions/render-order-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          // If we get a 504, retry
          if (response.status === 504 && attempt < maxRetries) {
            console.warn(`PDF generation got 504 on attempt ${attempt + 1}, retrying...`);
            continue;
          }
          break;
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            if (attempt < maxRetries) {
              console.warn(`PDF generation timed out on attempt ${attempt + 1}, retrying...`);
              continue;
            }
            throw new Error('Print file generation timed out. Please try again.');
          }
          throw fetchError;
        }
      }

      if (!response || !response.ok) {
        let errorMessage = `HTTP ${response?.status || 'unknown'}`;
        try {
          if (response) {
            const contentType = response.headers.get('Content-Type');
            if (contentType?.includes('application/json')) {
              const errorData = await response.json();
              errorMessage = errorData.message || errorData.error || errorMessage;
            } else {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            }
          }
        } catch (parseError) {
          console.error('[PDF Download] Error parsing error response:', parseError);
        }
        console.error('[PDF Download] HTTP Error:', response?.status, errorMessage);
        throw new Error(errorMessage);
      }

      // Response is JSON with Cloudinary download URL (JPEG format)
      const result = await response.json();
      if (result.error) {
        // Handle specific print pipeline errors with descriptive messages
        if (result.error === 'low_resolution') {
          throw new Error(`⚠️ Low Resolution: ${result.message}`);
        }
        if (result.error === 'no_print_source') {
          throw new Error(`⚠️ No Print Source: ${result.message}`);
        }
        throw new Error(result.error || 'Print file generation failed');
      }

      const dpi = result.dpi || 300;
      const bleed = result.bleed || 0;

      if (result.downloadUrl) {
        // High-res JPEG hosted on Cloudinary - fetch as blob to force download
        let imgResponse = await fetch(result.downloadUrl);
        if (!imgResponse.ok && result.rawUrl) {
          console.warn('Transformed URL failed, falling back to raw URL');
          imgResponse = await fetch(result.rawUrl);
        }
        if (!imgResponse.ok) throw new Error('Failed to download image: ' + imgResponse.status);
        const productSlug = isYardSignItem(item) ? 'yard-sign' : 'banner';
        const blob = await imgResponse.blob();
        if (blob.size === 0) throw new Error('Downloaded file is empty');
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-${order.id.slice(-8)}-${productSlug}-${index + 1}-print-ready.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else if (result.pdfBase64) {
        // Legacy base64 fallback
        const productSlug = isYardSignItem(item) ? 'yard-sign' : 'banner';
        const binaryString = atob(result.pdfBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-${order.id.slice(-8)}-${productSlug}-${index + 1}-print-ready.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        throw new Error("No print file data in response");
      }

      toast({
        title: "Print File Downloaded",
        description: `Print-ready JPEG (${dpi} DPI with ${bleed}" bleed) ready for production.`,
      });
    } catch (error) {
      console.error('[PDF Download] Error:', error);
      toast({
        title: "File Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate print file",
        variant: "destructive",
      });
    } finally {
      setPdfGenerating(prev => ({ ...prev, [index]: false }));
    }
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
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="border-b-2 border-[#18448D] pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl font-bold text-[#18448D] min-w-0">
            <Package className="h-6 w-6" />
            <span className="break-all">Order #{order.id.slice(-8).toUpperCase()}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info - Redesigned */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 shadow-sm">
            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div className="min-w-0">
                <p className="text-sm text-gray-600">Order Date</p>
                <p className="font-medium break-words">{orderDate}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 min-w-0">
              <CreditCard className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
            </div>
            
            <div className="min-w-0">
              <p className="text-sm text-gray-600">Tracking</p>
              <TrackingBadge 
                carrier={order.tracking_carrier} 
                trackingNumber={order.tracking_number} 
              />
            </div>
          </div>

          {/* Customer Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <User className="h-5 w-5 text-blue-600 mr-2" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="min-w-0 rounded-md border border-blue-100 bg-white/70 p-3 flex items-start gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Customer Name</p>
                    <p className="font-semibold text-gray-900 break-words">{customerName}</p>
                  </div>
                </div>
                <div className="min-w-0 rounded-md border border-blue-100 bg-white/70 p-3 flex items-start gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium text-gray-900 break-all">
                      {customerEmail}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 rounded-md border border-blue-100 bg-white/70 p-3 flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Address</p>
                    {hasAddress ? (
                      <>
                        {shippingAddressLines.map((line, index) => (
                          <p key={index} className={index === 0 ? 'font-medium text-gray-900' : 'text-sm text-gray-900'}>
                            {line}
                          </p>
                        ))}
                      </>
                    ) : (
                      <p className="font-medium text-gray-900">Not provided</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

          {/* Shipping Address - Admin Only */}
          {isAdminUser && hasAddress && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <MapPin className="h-5 w-5 text-green-600 mr-2" />
                Shipping Address
              </h3>
              <div className="space-y-1">
                {shippingAddressLines.map((line, index) => (
                  <p key={index} className={index === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}>
                    {line}
                  </p>
                ))}
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
                    <div className="flex flex-wrap items-start gap-3">
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
                      <div className="w-full sm:w-auto sm:ml-auto px-4 py-2 bg-purple-100 rounded-lg">
                        <p className="text-sm font-bold text-purple-800 break-all">{item.design_draft_contact}</p>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {item.design_uploaded_assets.map((asset, assetIdx) => (
                            <button
                              key={assetIdx}
                              onClick={() => handleAssetDownload(asset)}
                              className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200 group shadow-sm hover:shadow-md text-left"
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
                              <Download className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Final Print File (JPEG) Section */}
                  <div className="bg-white/80 backdrop-blur rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-100 to-violet-100 border-b border-purple-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <p className="text-sm font-bold text-purple-800">Final Print File (JPEG)</p>
                      </div>
                    </div>
                    <div className="p-4">
                      {item.final_print_pdf_url ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4">
                          <div className="p-3 bg-green-500 rounded-xl shadow-md">
                            <FileText className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-base font-bold text-green-800">✅ JPEG Ready for Print</p>
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
                            className="w-full sm:w-auto justify-center px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 flex items-center gap-2 shadow-md transition-all duration-200"
                          >
                            <Download className="h-4 w-4" />
                            Download JPEG
                          </a>
                        </div>
                      ) : (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg">
                              <span className="text-xl">⏳</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-base font-bold text-amber-800">Awaiting Final JPEG</p>
                              <p className="text-sm text-amber-700 mt-1">
                                Upload the final print-ready JPEG once the design is complete and approved by the customer.
                              </p>
                            </div>
                          </div>
                          {onUploadFinalPdf && (
                            <label className="mt-4 inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-700 hover:to-violet-700 cursor-pointer transition-all duration-200 shadow-md">
                              <Upload className="h-4 w-4" />
                              Upload Final JPEG
                              <input
                                type="file"
                                accept=".jpg,.jpeg,image/jpeg"
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
              {order.items.map((item, index) => {
                  const normalized = normalizeOrderItemDisplay(item as NormalizableOrderItem);
                  return (
                <div key={index} className="border-2 border-slate-200 rounded-xl p-4 sm:p-5 bg-white shadow-sm hover:shadow-md transition-shadow overflow-x-clip">
                  <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      {getThumbnailUrl(item) && (
                        <div className="flex-shrink-0">
                          <img
                            src={getThumbnailUrl(item, 150)}
                            alt={`${getProductLabel(item.product_type)} ${index + 1} preview`}
                            className="w-28 h-20 object-cover rounded-lg border border-slate-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base sm:text-lg font-bold text-slate-900 break-words">
                          {getItemDisplayName(item)}
                          {normalized.productType === 'yard-sign' && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-200 text-orange-900">Yard Sign</span>
                          )}
                        </h4>
                      </div>
                      <div className="shrink-0 rounded-lg bg-[#18448D] px-3 py-2 text-right text-white">
                        <p className="text-[11px] font-medium opacity-90">Line Total</p>
                        <p className="text-lg font-bold">{usd(normalized.lineTotalCents / 100)}</p>
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 space-y-1">
                      <p className="break-words">Size: {normalized.sizeDisplay}</p>
                      <p className="break-words">Material: {normalized.materialDisplay}</p>
                      <p className="break-words">Print: {normalized.printDisplay}</p>
                      <p className="break-words">Qty: {normalized.qtyDisplay}</p>
                      {normalized.uploadedDesignsCount ? <p className="break-words">Uploaded Designs: {normalized.uploadedDesignsCount}</p> : null}
                      {normalized.stepStakesQty ? <p className="break-words">Step Stakes: {normalized.stepStakesQty}</p> : null}
                      {normalized.grommetsDisplay ? <p className="break-words">Grommets: {normalized.grommetsDisplay}</p> : null}
                      {normalized.polePocketsDisplay ? <p className="break-words">Pole Pockets: {normalized.polePocketsDisplay}</p> : null}
                      {normalized.ropeDisplay ? <p className="break-words">Rope: {normalized.ropeDisplay}</p> : null}
                      {normalized.roundedCornersDisplay ? <p className="break-words">Rounded Corners: {normalized.roundedCornersDisplay}</p> : null}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Unit Price</span>
                        <span className="text-gray-900">{usd(normalized.unitPriceCents / 100)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Qty</span>
                        <span className="text-gray-900">{normalized.qtyDisplay}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                        <span className="text-gray-900">Line Total</span>
                        <span className="text-gray-900">{usd(normalized.lineTotalCents / 100)}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {isAdminUser && !item.design_service_enabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const downloadInfo = getBestDownloadUrl(item);
                            if (downloadInfo) {
                              if (downloadInfo.isAI) {
                                const link = document.createElement('a');
                                link.href = downloadInfo.url;
                                link.download = `banner-${order.id}-item-${index + 1}-${downloadInfo.type}.${downloadInfo.type === 'print_ready' ? 'tiff' : 'jpg'}`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              } else {
                                handleFileDownload(downloadInfo.url, index);
                              }
                            }
                          }}
                          className="w-full justify-center"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Print File
                        </Button>
                      )}

                      {isAdminUser && !item.file_key && !item.print_ready_url && !item.web_preview_url && (
                        <div className="text-xs text-gray-500 text-center py-1">
                          <FileText className="h-3 w-3 inline mr-1" />
                          No file uploaded
                        </div>
                      )}

                      {!isAdminUser && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReorder(index)}
                          className="w-full justify-center"
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Reorder
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                  );
              })}
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
              
              {/* Discount - from server-computed values */}
              {(order.applied_discount_cents ?? 0) > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-base font-medium text-green-600">
                    {order.applied_discount_label || "Discount"}
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    -{usd((order.applied_discount_cents ?? 0) / 100)}
                  </span>
                </div>
              )}
              
              {/* Tax */}
              <div className="flex justify-between items-center py-2 border-b border-slate-300">
                <span className="text-base font-medium text-slate-700">Tax (6%)</span>
                <span className="text-lg font-semibold text-slate-900">
                  {usd(Math.round((order.items.reduce((sum, item) => sum + (item.line_total_cents || 0), 0) - (order.applied_discount_cents || 0)) * 0.06) / 100)}
                </span>
              </div>
              
              {/* Total - Uses server-computed total (includes discount) */}
              <div className="flex justify-between items-center pt-3 pb-1">
                <span className="text-xl font-bold text-[#18448D]">Total</span>
                <span className="text-2xl font-bold text-[#ff6b35]">
                  {(() => { const sub = order.items.reduce((s, i) => s + (i.line_total_cents || 0), 0); const disc = order.applied_discount_cents || 0; const after = sub - disc; const tax = Math.round(after * 0.06); return usd((after + tax) / 100); })()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetails;
