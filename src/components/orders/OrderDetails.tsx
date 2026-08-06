import React, { useState } from 'react';
import { Order } from '../../lib/orders/types';
import { usd } from "@/lib/pricing";
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { ShoppingCart, Package, Calendar, CreditCard, Mail, User, Download, FileText, Sparkles, MapPin, Loader2, Palette, Phone, Upload, MessageSquare } from 'lucide-react';
import TrackingBadge from './TrackingBadge';
import OrderItemPreview from '@/components/preview/OrderItemPreview';
import EmailDeliveryStatus from './EmailDeliveryStatus';
import { getItemDisplayName, getProductLabel, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { formatShippingAddress, hasShippingAddress, normalizeShippingAddress } from '@/lib/shipping-address';
import { getDisplayOrderTotalCents } from '@/lib/order-totals';
import { estimateOrderProfit } from '@/lib/admin-profit-estimate';
import { authorizedHeaders } from '@/lib/serverAuth';
import { getOriginalArtworkSelection } from '@/lib/artworkFiles';
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
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
  adminCustomerEditor?: React.ReactNode;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, trigger, onUploadFinalPdf, adminCustomerEditor }) => {
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = user && isAdmin(user);
  const [pdfGenerating, setPdfGenerating] = useState<Record<number, boolean>>({});
  // Helper function to get the best download URL for an item (AI or uploaded)
  const getBestDownloadUrl = (item: any) => {
    return getOriginalArtworkSelection(item);
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

      // Use Netlify function for Cloudinary keys; fetch permanent HTTPS originals directly.
      const downloadUrl = `/.netlify/functions/download-file?key=${encodeURIComponent(fileKey)}&order=${order.id}`;

      // Fetch the file content
      const response = await fetch(downloadUrl, { headers: authorizedHeaders() });

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
  const handlePdfDownload = async (item: any, index: number, forceRegenerate = false) => {
    if (pdfGenerating[index]) {
      return;
    }

    try {
      setPdfGenerating(prev => ({ ...prev, [index]: true }));
      toast({
        title: "Generating Production PDF",
        description: "Creating the canonical print-ready PDF from the saved production scene...",
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 150000);
      const response = await fetch('/.netlify/functions/download-print-pdf', {
        method: 'POST',
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          orderId: order.id,
          itemIndex: index,
          itemId: item.id || item.order_item_id || null,
          productType: (item as any).product_type || 'banner',
          roundedCorners: (item as any).rounded_corners || null,
          bannerWidthIn: item.width_in,
          bannerHeightIn: item.height_in,
          canvasStateJson: item.canvas_state_json || null,
          finalRenderUrl: item.final_render_url || null,
          finalRenderFileKey: item.final_render_file_key || null,
          finalRenderWidthPx: item.final_render_width_px || null,
          finalRenderHeightPx: item.final_render_height_px || null,
          finalRenderDpi: item.final_render_dpi || null,
          fileKey: item.overlay_image?.fileKey || item.overlay_images?.[0]?.fileKey || item.file_key || null,
          imageUrl: item.file_url || item.web_preview_url || null,
          imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
          includeBleed: false,
          bleedIn: 0,
          targetDpi: 300,
          transform: item.transform || null,
          previewCanvasPx: item.preview_canvas_px || null,
          textElements: item.text_elements || [],
          overlayImage: item.overlay_image || null,
          overlayImages: item.overlay_images || null,
          canvasBackgroundColor: item.canvas_background_color || '#FFFFFF',
          imageScale: item.image_scale ?? 1,
          imagePosition: item.image_position || { x: 0, y: 0 },
          thumbnailUrl: item.thumbnail_url || null,
          format: 'pdf',
          forceRegenerate,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const contentType = response.headers.get('Content-Type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            errorMessage = (await response.text()) || errorMessage;
          }
        } catch (parseError) {
          console.error('[Production PDF Download] Error parsing error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const result = await response.json();
        const downloadUrl = result.downloadUrl || result.pdfUrl;
        if (!downloadUrl) throw new Error(result.error || 'Production PDF endpoint did not return a download URL.');
        const pdfResponse = await fetch(downloadUrl);
        if (!pdfResponse.ok) throw new Error(`Failed to download production PDF: ${pdfResponse.status}`);
        const blob = await pdfResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-${order.id.slice(-8)}-item-${index + 1}-production.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const blob = await response.blob();
        if (blob.size === 0) throw new Error('Downloaded production PDF is empty');
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-${order.id.slice(-8)}-item-${index + 1}-production.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

      toast({
        title: "Production PDF Downloaded",
        description: "The same canonical production PDF used by Admin Orders has been downloaded.",
      });
    } catch (error) {
      console.error('[Production PDF Download] Error:', error);
      toast({
        title: "Production PDF Failed",
        description: error instanceof Error ? error.message : "Failed to generate production PDF",
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
        {isAdminUser && adminCustomerEditor && <div className="flex items-center gap-2">{adminCustomerEditor}{order.customer_info_admin_updated_at && <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-800">Customer info updated by Admin</span>}</div>}

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

          {/* Admin-only email delivery failure banner. Renders only when
              one or more transactional emails (confirmation / in-production
              / shipped) failed via Resend. Includes a per-email retry. */}
          {isAdminUser && (
            <EmailDeliveryStatus order={order} />
          )}

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

          {/* Payment Information - Admin Only */}
          {isAdminUser && (order.payment_method || order.stripe_payment_intent_id || order.paypal_order_id) && (() => {
            const method = (order.payment_method || '').toLowerCase();
            const isStripe = method === 'stripe' || !!order.stripe_payment_intent_id;
            const isPayPal = method === 'paypal' || !!order.paypal_order_id;
            const wallet = (order.stripe_wallet_type || '').toLowerCase();
            const methodLabel = isStripe
              ? (wallet === 'apple_pay' ? 'Apple Pay (Stripe)'
                : wallet === 'google_pay' ? 'Google Pay (Stripe)'
                : wallet === 'link' ? 'Stripe Link'
                : 'Stripe / Card')
              : isPayPal ? 'PayPal'
              : (order.payment_method || 'Unknown');
            return (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <CreditCard className="h-5 w-5 text-indigo-600 mr-2" />
                  Payment Information
                </h3>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-gray-600">Method:</span>
                    <span className="font-semibold text-gray-900">{methodLabel}</span>
                  </div>
                  {order.stripe_payment_intent_id && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-gray-600">Payment Intent:</span>
                      <span className="font-mono text-xs text-gray-900 break-all">{order.stripe_payment_intent_id}</span>
                    </div>
                  )}
                  {order.stripe_charge_id && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-gray-600">Charge:</span>
                      <span className="font-mono text-xs text-gray-900 break-all">{order.stripe_charge_id}</span>
                    </div>
                  )}
                  {order.paypal_order_id && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-gray-600">PayPal Order:</span>
                      <span className="font-mono text-xs text-gray-900 break-all">{order.paypal_order_id}</span>
                    </div>
                  )}
                  {order.paypal_capture_id && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-gray-600">PayPal Capture:</span>
                      <span className="font-mono text-xs text-gray-900 break-all">{order.paypal_capture_id}</span>
                    </div>
                  )}
                  {order.customer_phone && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-gray-600">Phone:</span>
                      <span className="font-medium text-gray-900">{order.customer_phone}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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

                  {/* Uploaded Final Print File Section */}
                  <div className="bg-white/80 backdrop-blur rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-100 to-violet-100 border-b border-purple-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <p className="text-sm font-bold text-purple-800">Final Approved Production File</p>
                      </div>
                    </div>
                    <div className="p-4">
                      {item.final_print_pdf_url ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4">
                          <div className="p-3 bg-green-500 rounded-xl shadow-md">
                            <FileText className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-base font-bold text-green-800">✅ Uploaded File Ready for Print</p>
                            <p className="text-sm text-green-600">
                              Uploaded {item.final_print_pdf_uploaded_at
                                ? new Date(item.final_print_pdf_uploaded_at).toLocaleString()
                                : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFileDownload(item.final_print_pdf_url, itemIndex)}
                            className="w-full sm:w-auto justify-center px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 flex items-center gap-2 shadow-md transition-all duration-200"
                          >
                            <Download className="h-4 w-4" />
                            Download Final File
                          </button>
                        </div>
                      ) : (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg">
                              <span className="text-xl">⏳</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-base font-bold text-amber-800">Awaiting Uploaded Final File</p>
                              <p className="text-sm text-amber-700 mt-1">
                                Upload the final print-ready file once the design is complete and approved by the customer.
                              </p>
                            </div>
                          </div>
                          {onUploadFinalPdf && (
                            <label className="mt-4 inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-700 hover:to-violet-700 cursor-pointer transition-all duration-200 shadow-md">
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
              {order.items.map((item, index) => {
                  const normalized = normalizeOrderItemDisplay(item as NormalizableOrderItem);
                  return (
                <div key={index} className="border-2 border-slate-200 rounded-xl p-4 sm:p-5 bg-white shadow-sm hover:shadow-md transition-shadow overflow-x-clip">
                  <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <OrderItemPreview
                        item={item as any}
                        compactMaxSize={112}
                        expandedMaxSize={820}
                        ariaLabel={`Open expanded ${getProductLabel(item.product_type)} ${index + 1} preview`}
                        className="flex-shrink-0"
                      />
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
                      {normalized.productType === 'banner' ? (
                        <>
                          <p className="break-words">Grommets: {normalized.grommetsDisplay}</p>
                          <p className="break-words">Pole Pockets: {normalized.polePocketsDisplay}</p>
                          <p className="break-words">Rope: {normalized.ropeDisplay}</p>
                        </>
                      ) : null}
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

                    {isAdminUser && <div className="space-y-3">
                      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <p className="font-semibold text-emerald-900">Generated Production PDF</p>
                        <p className="mt-1 text-xs text-emerald-800">Status: {item.generated_print_pdf_url ? 'generated' : item.production_pdf_status || 'pending'}</p>
                        {(item.generated_print_pdf_metadata?.resolution || []).some((entry: any) => entry.status === 'fail') && <p className="mt-1 text-xs font-semibold text-red-700">Low-resolution warning: one or more raster assets are below 150 effective PPI.</p>}
                        {item.production_pdf_error && <p className="mt-1 text-xs text-red-700">{item.production_pdf_error}</p>}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button variant="outline" size="sm" onClick={() => handlePdfDownload(item, index, false)} disabled={!!pdfGenerating[index]}>{item.generated_print_pdf_url ? 'Download' : 'Generate'}</Button>
                          <Button variant="outline" size="sm" onClick={() => handlePdfDownload(item, index, true)} disabled={!!pdfGenerating[index]}>Regenerate</Button>
                        </div>
                      </section>
                    </div>}

                    <div className="space-y-2">
                      {isAdminUser && (() => {
                        const downloadInfo = getBestDownloadUrl(item);
                        return downloadInfo ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileDownload(downloadInfo.url, index)}
                            className="w-full justify-center"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download Original Artwork
                          </Button>
                        ) : null;
                      })()}


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
              {/* Subtotal - canonical server-computed value */}
              <div className="flex justify-between items-center py-2">
                <span className="text-base font-medium text-slate-700">Subtotal</span>
                <span className="text-lg font-semibold text-slate-900">
                  {usd((order.subtotal_cents || 0) / 100)}
                </span>
              </div>
              
              {/* Discount - from server-computed values */}
              {(order.applied_discount_cents ?? 0) > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-base font-medium text-green-600">
                    {order.applied_discount_label || order.discount_code || "Discount"}
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    -{usd((order.applied_discount_cents ?? 0) / 100)}
                  </span>
                </div>
              )}
              
              {(order.same_day_fee_cents || 0) > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-base font-medium text-slate-700">Same-Day Hit Service</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {usd((order.same_day_fee_cents || 0) / 100)}
                  </span>
                </div>
              )}

              {(order.saturday_fee_cents || 0) > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-base font-medium text-slate-700">Saturday Delivery</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {usd((order.saturday_fee_cents || 0) / 100)}
                  </span>
                </div>
              )}

              {/* Tax */}
              <div className="flex justify-between items-center py-2 border-b border-slate-300">
                <span className="text-base font-medium text-slate-700">Tax (6%)</span>
                <span className="text-lg font-semibold text-slate-900">
                  {usd((order.tax_cents || 0) / 100)}
                </span>
              </div>
              
              {/* Total - canonical server-computed total */}
              <div className="flex justify-between items-center pt-3 pb-1">
                <span className="text-xl font-bold text-[#18448D]">Total</span>
                <span className="text-2xl font-bold text-[#ff6b35]">
                  {usd(getDisplayOrderTotalCents(order as any) / 100)}
                </span>
              </div>
            </div>
          </div>

          {isAdminUser && (() => {
            const profit = estimateOrderProfit(order);
            return (
              <div className="mt-6 bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-emerald-800 mb-4">Profit Estimate</h3>
                {profit.needsReview ? (
                  <div className="inline-flex rounded bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800">Needs review</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Original Subtotal</span><span className="font-semibold">{usd(profit.originalSubtotalCents / 100)}</span></div>
                    {profit.discountsAppliedCents > 0 && <div className="flex justify-between"><span>Discounts Applied</span><span className="font-semibold text-red-700">-{usd(profit.discountsAppliedCents / 100)}</span></div>}
                    <div className="flex justify-between"><span>Adjusted Retail Subtotal (before tax)</span><span className="font-semibold">{usd(profit.adjustedRetailSubtotalCents / 100)}</span></div>
                    <div className="flex justify-between text-slate-700"><span>Production Cost</span><span className="font-semibold">{usd(profit.productionCostCents / 100)}</span></div>
                    <div className="flex justify-between text-slate-700"><span>Shipping/Handling Cost</span><span className="font-semibold">{usd(profit.shippingCostCents / 100)}</span></div>
                    <div className="flex justify-between text-slate-700"><span>Total Cost</span><span className="font-semibold">{usd(profit.totalCostCents / 100)}</span></div>
                    <div className="flex justify-between border-t pt-2"><span className="font-semibold">Estimated Net Profit</span><span className={`font-bold ${profit.netProfitCents >= 0 ? 'text-green-700' : 'text-red-700'}`}>{usd(profit.netProfitCents / 100)}</span></div>
                    <div className="flex justify-between"><span>Profit Margin %</span><span className={`font-semibold ${profit.marginPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>{profit.marginPct.toFixed(1)}%</span></div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetails;
