import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, isAdmin } from '../../lib/auth';
import { getOrdersAdapter } from '../../lib/orders/adapter';
import { Order, TrackingCarrier } from '../../lib/orders/types';
import type { TrackingEntry } from '../../lib/orders/tracking';
import { fedexUrl, normalizeTrackingEntries, DEFAULT_TRACKING_CARRIER } from '../../lib/orders/tracking';
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
  Loader2,
  Palette,
  Upload,
  ChevronLeft,
  ChevronRight,
  Copy,
  ChevronDown,
  ChevronUp,
  Trash2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, ShoppingCart } from 'lucide-react';
import OrderDetails from '@/components/orders/OrderDetails';
import { getDisplayOrderTotalCents } from '@/lib/order-totals';
import { estimateOrderProfit } from '@/lib/admin-profit-estimate';
import { adminFetch } from '@/lib/serverAuth';
import { getOriginalArtworkSelection } from '@/lib/artworkFiles';
import { getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';
import GrommetOverlay from '@/components/preview/GrommetOverlay';
import { getGrommetLabel } from '@/lib/grommets';

const PAGE_SIZE = 20;

const PRODUCT_BADGE_CLASSES: Record<string, string> = {
  'BANNER': 'bg-blue-100 text-blue-800 border-blue-200',
  'MESH BANNER': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'CAR MAGNET': 'bg-purple-100 text-purple-800 border-purple-200',
  'YARD SIGN': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'POSTER': 'bg-amber-100 text-amber-800 border-amber-200',
};

const getProductTypeLabel = (item: any): string => {
  const raw = String(item?.product_type || item?.product_name || item?.name || item?.sku || '').toLowerCase().replace(/[_-]/g, ' ');
  const material = String(item?.material || '').toLowerCase();
  if (raw.includes('mesh') || material.includes('mesh')) return 'MESH BANNER';
  if (raw.includes('magnet')) return 'CAR MAGNET';
  if (raw.includes('yard') || raw.includes('sign')) return 'YARD SIGN';
  if (raw.includes('poster')) return 'POSTER';
  if (raw.includes('banner') || item?.width_in || item?.height_in) return 'BANNER';
  return 'PRODUCT';
};

const getItemSizeLabel = (item: any): string => {
  if (item?.width_in && item?.height_in) return formatDimensions(Number(item.width_in), Number(item.height_in));
  return item?.size || item?.dimensions || item?.selected_size || 'Custom size';
};

const getItemMaterialLabel = (item: any): string => item?.material || item?.selected_material || item?.product_material || 'Material not specified';
const getProductBadgeClass = (label: string): string => PRODUCT_BADGE_CLASSES[label] || 'bg-gray-100 text-gray-800 border-gray-200';

const getOrderItemsSummary = (order: Order): string => {
  const groups = new Map<string, { qty: number; lines: number }>();
  (order.items || []).forEach((item: any) => {
    const label = getProductTypeLabel(item).replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\bAnd\b/g, 'and');
    const current = groups.get(label) || { qty: 0, lines: 0 };
    current.qty += Number(item.quantity || 0);
    current.lines += 1;
    groups.set(label, current);
  });
  const parts = Array.from(groups.entries()).map(([label, info]) => {
    if (info.lines > 1 && label.includes('Banner')) return `${info.lines} ${label} Designs`;
    return `${label} (Qty ${info.qty})`;
  });
  return parts.length ? `${parts.join(' · ')} · Total Units: ${getTotalUnits(order)}` : 'No items';
};

const getTotalUnits = (order: Order): number => (order.items || []).reduce((sum, item: any) => sum + Number(item.quantity || 0), 0);
const getPrintFileCount = (order: Order): number => (order.items || []).filter((item: any) => item.final_print_pdf_url || item.file_key || item.print_ready_url || item.web_preview_url || item.final_render_url || item.final_render_file_key || item.thumbnail_url || item.overlay_image || (item.text_elements && item.text_elements.length > 0)).length;

const getPaypalStatusLabel = (order: Order): string | null => {
  const method = (order.payment_method || '').toLowerCase();
  if (method !== 'paypal' && !order.paypal_order_id) return null;
  if (order.status === 'refunded') return 'PayPal Refunded';
  if (order.status === 'failed' || order.status === 'canceled' || order.status === 'cancelled') return 'PayPal Failed';
  if (order.status === 'pending') return 'PayPal Pending';
  return 'PayPal Paid';
};

const getPrintFileLabel = (item: any, index: number, fallbackPrefix = 'PDF'): string => {
  const label = getProductTitleLabel(item);
  return label === 'Product' ? `${fallbackPrefix} ${index + 1}` : `${label} Print File`;
};

const copyText = async (text: string) => {
  await navigator.clipboard?.writeText(text);
};

const toTitleCase = (value: string): string => value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

const getProductTitleLabel = (item: any): string => {
  const label = getProductTypeLabel(item);
  return label === 'PRODUCT' ? 'Product' : toTitleCase(label);
};

const getSafeOrderItems = (order: Pick<Order, 'items'>): any[] => Array.isArray(order.items) ? order.items : [];

const getPreviewDimensions = (item: any): { width: number; height: number } => {
  const width = Number(item?.width_in) || 24;
  const height = Number(item?.height_in) || 18;
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
};

const getOptionRows = (item: any): Array<{ label: string; value: string }> => {
  const rows: Array<{ label: string; value: string }> = [];
  const grommets = getGrommetLabel(item?.grommets);
  if (grommets && grommets !== 'None') rows.push({ label: 'Grommets', value: grommets });
  if (item?.pole_pockets && item.pole_pockets !== 'none') rows.push({ label: 'Pole Pockets', value: String(item.pole_pocket_position || item.pole_pockets) });
  if (Number(item?.rope_feet) > 0) rows.push({ label: 'Rope', value: `${item.rope_feet} ft` });
  if (item?.rounded_corners && item.rounded_corners !== 'none') rows.push({ label: 'Rounded Corners', value: String(item.rounded_corners) });
  const sided = item?.sides || item?.printed_sides || item?.side_count || item?.print_sides;
  if (sided) rows.push({ label: 'Sides', value: String(sided).replace(/_/g, ' ') });
  return rows;
};

const ProductPreviewFrame: React.FC<{ item: any; thumbUrl: string | null; large?: boolean; idSuffix: string }> = ({ item, thumbUrl, large = false, idSuffix }) => {
  const { width, height } = getPreviewDimensions(item);
  const grommets = item?.grommets || 'none';
  return (
    <div className={`w-full ${large ? 'max-h-[66vh]' : ''} flex items-center justify-center p-2`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`block max-w-full ${large ? 'h-[min(66vh,620px)]' : 'h-full'} drop-shadow-sm`}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${getProductTitleLabel(item)} finished preview`}
      >
        <rect x="0" y="0" width={width} height={height} rx={item?.rounded_corners && item.rounded_corners !== 'none' ? Math.min(width, height) * 0.05 : 0} fill="#ffffff" stroke="#cbd5e1" strokeWidth={Math.max(0.04, Math.min(width, height) * 0.006)} />
        {thumbUrl ? (
          <image href={thumbUrl} x="0" y="0" width={width} height={height} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(1.5, Math.min(width, height) * 0.08)} fill="#94a3b8">No preview</text>
        )}
        <GrommetOverlay widthIn={width} heightIn={height} option={grommets} idSuffix={idSuffix} />
      </svg>
    </div>
  );
};

// Compact payment-method descriptor for admin order rows. Stripe orders
// can also have a wallet type (apple_pay / google_pay / link) which we
// surface so admins can see at a glance what the customer paid with.
type PaymentMethodInfo = {
  label: string;
  className: string;
};

const getPaymentMethodInfo = (order: Order): PaymentMethodInfo | null => {
  const method = (order.payment_method || '').toLowerCase();
  if (method === 'paypal' || order.paypal_order_id) {
    return {
      label: getPaypalStatusLabel(order) || 'PayPal',
      className: 'bg-[#FFC439] text-[#003087] border border-[#003087]/20',
    };
  }
  if (method === 'stripe' || order.stripe_payment_intent_id) {
    const wallet = (order.stripe_wallet_type || '').toLowerCase();
    if (wallet === 'apple_pay') {
      return { label: 'Apple Pay', className: 'bg-black text-white' };
    }
    if (wallet === 'google_pay') {
      return { label: 'Google Pay', className: 'bg-white text-gray-900 border border-gray-300' };
    }
    if (wallet === 'link') {
      return { label: 'Stripe Link', className: 'bg-[#00d66f]/10 text-[#0a6b3b] border border-[#00d66f]/30' };
    }
    return { label: 'Stripe / Card', className: 'bg-[#635BFF]/10 text-[#3a32d6] border border-[#635BFF]/30' };
  }
  if (method === 'admin_deploy_preview_test') {
    return { label: 'Admin Test', className: 'bg-red-100 text-red-800 border border-red-200' };
  }
  if (!method) return null;
  return { label: method.charAt(0).toUpperCase() + method.slice(1), className: 'bg-gray-100 text-gray-700' };
};

const isHiddenStripeAttempt = (order: Order): boolean => {
  const method = (order.payment_method || '').toLowerCase();
  const isStripe = method === 'stripe' || !!order.stripe_payment_intent_id;
  if (!isStripe) return false;
  return order.status === 'pending' || order.status === 'failed' || order.status === 'canceled' || order.status === 'cancelled';
};

const AdminOrders: React.FC = () => {
  const navigate = useNavigate();
  const [routeSearchParams] = useSearchParams();
  const requestedOrderId = routeSearchParams.get('order') || '';
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const { toast } = useToast();
  const [pdfLoadingStates, setPdfLoadingStates] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [globalOverview, setGlobalOverview] = useState({
    totalOrders: 0,
    inProductionOrders: 0,
    shippedOrders: 0,
    pendingOrders: 0,
    totalRevenueCents: 0,
    abandonedCarts: 0,
    customQuotes: 0,
  });

  const [globalOverviewLoading, setGlobalOverviewLoading] = useState({
    orders: false,
    abandonedCarts: false,
    customQuotes: false,
  });
  useEffect(() => {

    // Redirect to the admin login page (not the customer sign-in page) when
    // the visitor isn't an admin yet. This restores the legacy behavior where
    // hitting /admin/orders directly takes you to the admin password gate.
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/admin/setup', { replace: true });
      return;
    }

    if (user && isAdmin(user)) {
      loadOrders();
      loadGlobalOverview(user.email);
    }
  }, [user, authLoading, navigate]);

  const loadAllOrdersForOverview = async () => {
    const ordersAdapter = await getOrdersAdapter();
    const allOrders: Order[] = [];
    let pageToLoad = 1;

    while (true) {
      const pageOrders = await ordersAdapter.listAll(pageToLoad);
      if (!pageOrders.length) break;
      allOrders.push(...pageOrders);
      if (pageOrders.length < PAGE_SIZE) break;
      pageToLoad += 1;
      if (pageToLoad > 5000) {
        console.warn('Global overview order pagination hit safety limit at 5000 pages');
        break;
      }
    }

    return allOrders;
  };

  const loadGlobalOverview = async (adminEmail?: string) => {
    setGlobalOverviewLoading({
      orders: false,
      abandonedCarts: false,
      customQuotes: false,
    });

    const [
      ordersResult,
      abandonedCartsResult,
      customQuotesResult,
    ] = await Promise.allSettled([
      loadAllOrdersForOverview(),
      adminFetch('/.netlify/functions/get-abandoned-carts').then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch abandoned carts');
        return response.json();
      }),
      adminEmail
        ? adminFetch(`/.netlify/functions/admin-custom-quotes?status=New&email=${encodeURIComponent(adminEmail)}`).then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.ok) throw new Error(data?.error || 'Failed to fetch custom quotes');
            return data;
          })
        : Promise.resolve({ quotes: [] }),
    ]);

    const allOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    if (ordersResult.status === 'rejected') {
      console.error('Error loading global order totals:', ordersResult.reason);
    }
    if (abandonedCartsResult.status === 'rejected') {
      console.error('Error loading global abandoned carts total:', abandonedCartsResult.reason);
    }
    if (customQuotesResult.status === 'rejected') {
      console.error('Error loading global custom quotes total:', customQuotesResult.reason);
    }

    const abandonedCartsCount = abandonedCartsResult.status === 'fulfilled'
      ? (abandonedCartsResult.value?.carts?.length ?? 0)
      : 0;
    const customQuotesCount = customQuotesResult.status === 'fulfilled'
      ? (customQuotesResult.value?.quotes?.length ?? 0)
      : 0;

    setGlobalOverview({
      totalOrders: allOrders.length,
      inProductionOrders: allOrders.filter((o) => o.status === 'in_production').length,
      shippedOrders: allOrders.filter((o) => o.status === 'shipped').length,
      pendingOrders: allOrders.filter((o) => o.status === 'pending').length,
      totalRevenueCents: allOrders.filter((o) => !o.is_test_order).reduce((sum, o) => sum + o.total_cents, 0),
      abandonedCarts: abandonedCartsCount,
      customQuotes: customQuotesCount,
    });

    setGlobalOverviewLoading({
      orders: true,
      abandonedCarts: true,
      customQuotes: true,
    });
  };

  useEffect(() => {
    if (requestedOrderId) setSearchQuery(requestedOrderId.slice(-8));
  }, [requestedOrderId]);

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

  const loadOrders = async (pageToLoad: number = page) => {
    try {
      setLoading(true);
      const ordersAdapter = await getOrdersAdapter();
      const allOrders = await ordersAdapter.listAll(pageToLoad);
      
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
      
      const visibleOrders = allOrders.filter((order) => !isHiddenStripeAttempt(order));
      setHasMore(allOrders.length === PAGE_SIZE);
      setOrders(visibleOrders);
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

  const goToPage = (newPage: number) => {
    setPage(newPage);
    loadOrders(newPage);
    // Scroll to top of orders section
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddTracking = async (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => {
    try {
      const ordersAdapter = await getOrdersAdapter();
      const savedTrackingNumbers = trackingNumbers || [{ carrier, trackingNumber, label: 'Package 1' }];
      await ordersAdapter.appendTracking(orderId, carrier, trackingNumber, savedTrackingNumbers);

      // Update local state with tracking info and status change
      // Note: tracking_carrier is not stored in database, so we default to 'fedex'
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                tracking_carrier: 'fedex' as const, // Default carrier since not stored in DB
                tracking_number: savedTrackingNumbers[0]?.trackingNumber || null,
                tracking_numbers: savedTrackingNumbers,
                trackingNumbers: savedTrackingNumbers,
                status: order.status === 'shipped' && !order.shipping_notification_sent
                  ? (order.production_email_sent ? 'in_production' : 'paid')
                  : order.status,
                shipping_notification_sent: false,
                shipping_notification_sent_at: null,
                shipping_notification_status: 'pending'
              }
            : order
        )
      );

      toast({
        title: "Tracking Saved",
        description: `Tracking number saved for order #${orderId.slice(-8)}. No email was sent.`,
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

  const handleUpdateTracking = async (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => {
    try {
      const ordersAdapter = await getOrdersAdapter();
      const savedTrackingNumbers = trackingNumbers || [{ carrier, trackingNumber, label: 'Package 1' }];
      await ordersAdapter.updateTracking(orderId, carrier, trackingNumber, savedTrackingNumbers);

      // Update local state with new tracking info (don't change status)
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                tracking_carrier: 'fedex' as const, // Default carrier since not stored in DB
                tracking_number: savedTrackingNumbers[0]?.trackingNumber || null,
                tracking_numbers: savedTrackingNumbers,
                trackingNumbers: savedTrackingNumbers,
                status: order.status === 'shipped' && !order.shipping_notification_sent
                  ? (order.production_email_sent ? 'in_production' : 'paid')
                  : order.status,
                shipping_notification_sent: false,
                shipping_notification_sent_at: null,
                shipping_notification_status: 'pending',
                // Don't change status when updating existing tracking
              }
            : order
        )
      );

      toast({
        title: "Tracking Saved",
        description: `Tracking number saved for order #${orderId.slice(-8)}. No email was sent.`,
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

  const handleDeleteTracking = async (orderId: string) => {
    if (!window.confirm('Delete all tracking numbers for this order? The tracking email status will also be reset.')) return;
    try {
      const ordersAdapter = await getOrdersAdapter();
      await ordersAdapter.updateTracking(orderId, 'fedex', '', []);
      setOrders((current) => current.map((order) => {
        if (order.id !== orderId) return order;
        const nextStatus = order.status === 'shipped'
          ? (order.production_email_sent ? 'in_production' : 'paid')
          : order.status;
        return {
          ...order,
          tracking_number: null,
          tracking_numbers: [],
          trackingNumbers: [],
          tracking_carrier: null,
          status: nextStatus as Order['status'],
          shipping_notification_sent: false,
          shipping_notification_sent_at: null,
          shipping_notification_status: 'pending',
        };
      }));
      toast({ title: 'Tracking Deleted', description: `Tracking was removed from order #${orderId.slice(-8).toUpperCase()}.` });
    } catch (error) {
      console.error('Delete tracking failed:', error);
      toast({
        title: 'Unable to Delete Tracking',
        description: error instanceof Error ? error.message : 'Tracking could not be deleted.',
        variant: 'destructive',
      });
    }
  };

  const handleFileDownload = async (fileKey: string, orderId: string, itemIndex: number) => {
    try {
      toast({
        title: "Download Started",
        description: "Preparing file download...",
      });

      // Use Netlify function for secure file downloads
      const downloadUrl = `/.netlify/functions/download-file?key=${encodeURIComponent(fileKey)}&order=${orderId}`;

      // Fetch the file content
      const response = await adminFetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get content type to determine file extension
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      let extension = 'jpg';
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('gif')) extension = 'gif';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('pdf')) extension = 'pdf';
      else if (contentType.includes('tiff')) extension = 'tiff';

      // Build a proper filename with extension
      const baseName = fileKey?.split('/').pop()?.split('.')[0] || `banner-${orderId.slice(-8)}-item-${itemIndex + 1}`;
      const fileName = `${baseName}.${extension}`;

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

      console.log('[ADMIN_PDF] ============================================');
      console.log('[ADMIN_PDF] Print PDF download requested');
      console.log('[ADMIN_PDF] Order ID:', orderId);
      console.log('[ADMIN_PDF] Order item ID:', item.id || 'unknown');
      console.log('[ADMIN_PDF] Order item index:', itemIndex);
      console.log('[ADMIN_PDF] Banner size:', item.width_in, '×', item.height_in, 'in');
      console.log('[ADMIN_PDF] Cached generated_print_pdf_url:', item.generated_print_pdf_url || 'NONE');
      console.log('[ADMIN_PDF] ============================================');

      // Always route the download through the backend admin endpoint.
      // The backend will:
      //   - serve the cached PDF if it can be fetched (using a signed
      //     Cloudinary URL when direct delivery is restricted), OR
      //   - regenerate the PDF on the fly if the cached asset returns
      //     401/403/404 (no more "Failed to fetch cached PDF: 401" in the UI).
      // We never fetch the raw Cloudinary URL from the browser anymore, which
      // is what was producing the 401 error for protected/authenticated assets.
      toast({
        title: item.generated_print_pdf_url ? 'Downloading Print PDF' : 'Generating Print-Ready PDF',
        description: item.generated_print_pdf_url
          ? 'Fetching previously generated print-ready PDF...'
          : 'Creating high-quality PDF with proper dimensions...',
      });
      console.log('[ADMIN_PDF] Routing through /.netlify/functions/download-print-pdf (backend proxy)');

      // Determine the best image source
      // CRITICAL: overlay_image.fileKey contains the ORIGINAL uploaded file (no grommets)
      // file_key is the THUMBNAIL (has grommets baked in) - use overlay_image.fileKey first!
      const overlayImageFileKey = item.overlay_image?.fileKey;
      const overlayImagesFileKey = item.overlay_images?.[0]?.fileKey;

      // CRITICAL FIX: Prioritize overlay_image.fileKey (original upload) over file_key (thumbnail with grommets)
      const imageSource = item.print_ready_url || overlayImageFileKey || overlayImagesFileKey || item.file_url || item.web_preview_url || item.file_key;
      const isCloudinaryKey = imageSource && !imageSource.startsWith('http');

      console.log('[ADMIN_PDF] Image source resolution:', {
        print_ready_url: item.print_ready_url,
        web_preview_url: item.web_preview_url,
        file_key: item.file_key,
        file_url: item.file_url,
        final_imageSource: imageSource,
        isCloudinaryKey,
      });

      // Check if user designed with OVERLAY positioning (blank canvas + positioned image)
      const hasOverlayWithPosition = item.overlay_image && item.overlay_image.position && item.overlay_image.scale;

      // CRITICAL FIX: If user has overlay_image with position/scale, that IS their design!
      const isOverlayOnlyDesign = hasOverlayWithPosition && !item.print_ready_url && !item.web_preview_url;

      const requestBody = {
        orderId: orderId,
        itemId: item.id || null,
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
        fileKey: isOverlayOnlyDesign ? null : (isCloudinaryKey ? imageSource : null),
        imageUrl: isOverlayOnlyDesign ? null : (isCloudinaryKey ? null : imageSource),
        imageSource: item.print_ready_url ? 'print_ready' : (item.web_preview_url ? 'web_preview' : 'uploaded'),
        includeBleed: false,
        bleedIn: 0,
        targetDpi: 300,
        transform: isOverlayOnlyDesign ? null : (item.transform || null),
        previewCanvasPx: isOverlayOnlyDesign ? null : (item.preview_canvas_px || null),
        textElements: item.text_elements || [],
        overlayImage: item.overlay_image || null,
        overlayImages: item.overlay_images || null,
        canvasBackgroundColor: item.canvas_background_color || '#FFFFFF',
        imageScale: item.image_scale ?? 1,
        imagePosition: item.image_position || { x: 0, y: 0 },
        thumbnailUrl: item.thumbnail_url || null,
        format: 'pdf', // Production print download is PDF
      };

      // Retry logic for transient 504 timeouts
      let response: Response | null = null;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            toast({
              title: 'Retrying Print PDF Generation',
              description: `Attempt ${attempt + 1} of ${maxRetries + 1}...`,
            });
          }
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 150000); // 150s client timeout
          response = await adminFetch('/.netlify/functions/download-print-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          // If we get a 504, retry
          if (response.status === 504 && attempt < maxRetries) {
            console.warn(`[ADMIN_PDF] PDF generation got 504 on attempt ${attempt + 1}, retrying...`);
            continue;
          }
          break;
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            if (attempt < maxRetries) {
              console.warn(`[ADMIN_PDF] PDF generation timed out on attempt ${attempt + 1}, retrying...`);
              continue;
            }
            throw new Error('Print PDF generation timed out. Please try again.');
          }
          throw fetchError;
        }
      }

      if (!response || !response.ok) {
        // The backend returns JSON {error} on failure; surface it nicely.
        const status = response?.status;
        const contentType = response?.headers.get('content-type') || '';
        let errorMessage = `HTTP ${status || 'unknown'}`;
        if (response) {
          try {
            const errJson = await response.clone().json();
            console.error('[ADMIN_PDF] PDF endpoint failed', {
              status,
              contentType,
              json: errJson,
            });
            if (errJson && errJson.error) errorMessage = String(errJson.error);
          } catch {
            try {
              const text = await response.text();
              console.error('[ADMIN_PDF] PDF endpoint failed', { status, contentType, body: text.slice(0, 500) });
              errorMessage = text || errorMessage;
            } catch { /* ignore */ }
          }
        } else {
          console.error('[ADMIN_PDF] PDF endpoint failed: no response object');
        }
        console.error('[ADMIN_PDF] PDF download failed:', errorMessage);
        throw new Error(errorMessage);
      }

      // Backend always returns the PDF bytes directly with
      // Content-Type: application/pdf and Content-Disposition: attachment.
      const source = response.headers.get('X-Print-PDF-Source') || 'unknown';
      const responseContentType = response.headers.get('content-type') || '';
      console.log('[ADMIN_PDF] ✅ Backend delivered response', {
        status: response.status,
        contentType: responseContentType,
        source,
      });

      // If backend unexpectedly returned JSON instead of a PDF, parse it and
      // honor a `downloadUrl` field per the standardized contract.
      if (!responseContentType.includes('application/pdf')) {
        let json: any = null;
        try {
          json = await response.clone().json();
        } catch {
          /* not JSON */
        }
        console.log('[ADMIN_PDF] Non-PDF response body:', json);
        const downloadUrl = json && (json.downloadUrl || json.pdfUrl);
        if (json && json.success !== false && downloadUrl) {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = json.fileName || `order-${orderId.slice(-8)}-banner-${itemIndex + 1}-print.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast({
            title: 'Print PDF Downloaded',
            description: 'Print-ready PDF download started.',
          });
          return;
        }
        throw new Error(
          (json && json.error) ||
            `Unexpected response (content-type: ${responseContentType || 'unknown'})`
        );
      }

      const blob = await response.blob();
      console.log('[ADMIN_PDF] PDF blob received', { size: blob.size, type: blob.type });
      if (blob.size === 0) throw new Error('Downloaded PDF is empty');
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `order-${orderId.slice(-8)}-banner-${itemIndex + 1}-print.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast({
        title: 'Print PDF Downloaded',
        description: source === 'regenerated'
          ? 'Print-ready PDF generated and downloaded successfully.'
          : 'Reused previously generated print-ready PDF.',
      });
    } catch (error) {
      console.error('[ADMIN_PDF] Print PDF Download Error:', error);
      toast({
        title: 'Print PDF Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate print PDF',
        variant: 'destructive',
      });
    } finally {
      // Clear loading state for this PDF button
      setPdfLoadingStates(prev => ({ ...prev, [loadingKey]: false }));

    }
  };


  const handleSendShippingNotification = async (orderId: string) => {
    try {
      const response = await adminFetch('/.netlify/functions/resend-tracking-email', {
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
                shipping_notification_sent_at: new Date().toISOString(),
                shipping_notification_status: 'sent',
                status: 'shipped' as const
              }
            : order
        )
      );

      toast({
        title: result.wasResend ? 'Tracking email resent successfully' : 'Tracking email sent successfully',
        description: `Customer has been notified about order #${orderId.slice(-8)}`,
      });
    } catch (error) {
      console.error('Send shipping notification failed:', error);
      toast({
        title: "Unable to send email",
        description: error instanceof Error ? error.message : 'Unable to send email. Please try again.',
        variant: "destructive",
      });
    }
  };

  const handleMarkInProduction = async (orderId: string) => {
    try {
      const response = await adminFetch('/.netlify/functions/mark-in-production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to mark order as in production');
      }

      // Update local state immediately
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                status: 'in_production' as const,
                production_email_sent: result.emailSent === true,
                production_email_sent_at: result.emailSent ? new Date().toISOString() : null,
                production_email_status: result.emailSent ? 'sent' : 'error'
              }
            : order
        )
      );

      if (result.emailSent === false) {
        toast({
          title: "Order In Production",
          description: "Order status updated, but the notification email could not be sent.",
          variant: "default",
        });
      } else {
        toast({
          title: "✅ Email Sent — Order In Production",
          description: "Production email sent to customer successfully.",
        });
      }
    } catch (error) {
      console.error('Mark in production failed:', error);
      toast({
        title: "Failed to Update Status",
        description: error instanceof Error ? error.message : "Could not update order status. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handler for uploading Final Print PDF for design service orders
  const handleUploadFinalPdf = async (orderId: string, itemIndex: number, file: File) => {
    try {
      toast({
        title: "Uploading Final Print File",
        description: "Please wait while the file is being uploaded...",
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);
      formData.append('itemIndex', itemIndex.toString());
      const targetItemId = orders.find((candidate) => candidate.id === orderId)?.items?.[itemIndex]?.id;
      if (targetItemId) formData.append('itemId', targetItemId);

      const response = await adminFetch('/.netlify/functions/upload-final-print-pdf', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to upload file');
      }

      // Update local state with the new PDF URL
      setOrders(prevOrders =>
        prevOrders.map(order => {
          if (order.id !== orderId) return order;
          const newItems = [...order.items];
          if (newItems[itemIndex]) {
            newItems[itemIndex] = {
              ...newItems[itemIndex],
              final_print_pdf_url: result.url,
              final_print_pdf_file_key: result.fileKey,
              final_print_pdf_uploaded_at: result.uploadedAt,
            };
          }
          return { ...order, items: newItems };
        })
      );

      toast({
        title: "Print File Uploaded",
        description: "Final print file has been uploaded successfully.",
      });
    } catch (error) {
      console.error('Upload Final Print File failed:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Could not upload print file. Please try again.",
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
      case 'in_production':
        return 'bg-yellow-100 text-yellow-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'in_production') return 'In Production';
    return status;
  };

  const getItemsSummary = (order: Order): string => {
    const safeItems = getSafeOrderItems(order);
    const itemCount = safeItems.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueItems = safeItems.length;
    
    // Check if any items are yard signs
    const hasYardSigns = safeItems.some(item => (item as any).product_type === 'yard_sign');
    
    if (uniqueItems === 1) {
      const item = safeItems[0];
      if ((item as any).product_type === 'yard_sign') {
        return `${itemCount} × Yard Sign 24"×18"`;
      }
      return `${itemCount} × ${formatDimensions(item.width_in, item.height_in)} ${item.material}`;
    }
    
    const productLabel = hasYardSigns ? 'items' : 'banners';
    return `${itemCount} ${productLabel} (${uniqueItems} designs)`;
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

  // Show nothing while we redirect non-admin visitors to /admin/setup. The
  // useEffect above handles the actual navigation; rendering null here just
  // prevents a flash of an "access denied" screen before the redirect runs.
  if (showAccessDenied || (!authLoading && (!user || !isAdmin(user)))) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12 overflow-x-clip">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-clip">
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
              <TabsList className="w-full h-auto flex flex-wrap gap-2 justify-start">
                <TabsTrigger value="orders" className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4" />
                  Orders
                </TabsTrigger>
                <TabsTrigger value="custom-quotes" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/custom-quotes">
                    <FileText className="h-4 w-4" />
                    Custom Quotes
                    {globalOverview.customQuotes > 0 && (
                      <Badge className="ml-1 bg-[#FF6A00] text-white">{globalOverview.customQuotes}</Badge>
                    )}
                  </a>
                </TabsTrigger>
                <TabsTrigger value="abandoned-carts" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/abandoned-carts">
                    <ShoppingCart className="h-4 w-4" />
                    Abandoned Carts
                  </a>
                </TabsTrigger>
                {/* Admin-gated AI Designer entry. Keep admin-only until customer rollout. */}
                <TabsTrigger value="ai-designer" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/ai-designer">
                    <Star className="h-4 w-4" />
                    AI Designer
                  </a>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Stats */}
          <div className="mb-4 rounded-2xl border border-[#18448D]/20 bg-gradient-to-r from-[#18448D] to-[#0f2d5c] p-4 sm:p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm sm:text-base font-semibold tracking-wide text-white uppercase">
                All Admin Overview
              </h2>
              <span className="text-[11px] sm:text-xs text-white/80">
                Global totals across admin sections
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              {[
                {
                  label: 'Total Orders',
                  value: globalOverview.totalOrders.toLocaleString(),
                  ready: globalOverviewLoading.orders,
                },
                {
                  label: 'In Production',
                  value: globalOverview.inProductionOrders.toLocaleString(),
                  ready: globalOverviewLoading.orders,
                },
                {
                  label: 'Shipped',
                  value: globalOverview.shippedOrders.toLocaleString(),
                  ready: globalOverviewLoading.orders,
                },
                {
                  label: 'Pending',
                  value: globalOverview.pendingOrders.toLocaleString(),
                  ready: globalOverviewLoading.orders,
                },
                {
                  label: 'Total Revenue',
                  value: usd(globalOverview.totalRevenueCents / 100),
                  ready: globalOverviewLoading.orders,
                },
                {
                  label: 'Abandoned Carts',
                  value: globalOverview.abandonedCarts.toLocaleString(),
                  ready: globalOverviewLoading.abandonedCarts,
                },
                {
                  label: 'New Quotes',
                  value: globalOverview.customQuotes.toLocaleString(),
                  ready: globalOverviewLoading.customQuotes,
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                  <p className="text-[11px] sm:text-xs text-white/80">{metric.label}</p>
                  <p className="text-base sm:text-lg font-bold text-white mt-1 break-words">{metric.ready ? metric.value : 'Loading…'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <div className="h-4 w-4 bg-yellow-600 rounded-full"></div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">In Production</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {orders.filter(o => o.status === 'in_production').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center">
                <Truck className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Shipped</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {orders.filter(o => o.status === 'shipped').length}
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
                    {orders.filter(o => o.status === 'pending').length}
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
                    {usd(orders.filter((o) => !o.is_test_order).reduce((sum, o) => sum + o.total_cents, 0) / 100)}
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
                  <div className="block md:hidden overflow-x-clip">
                  {filteredOrders.map((order) => (
                    <AdminOrderCard
                      key={order.id}
                      order={order}
                      onAddTracking={handleAddTracking}
                      onUpdateTracking={handleUpdateTracking}
                       onDeleteTracking={handleDeleteTracking}
                      onFileDownload={handleFileDownload}
                      onPdfDownload={handlePdfDownload}
                      onSendShippingNotification={handleSendShippingNotification}
                      onMarkInProduction={handleMarkInProduction}
                      onUploadFinalPdf={handleUploadFinalPdf}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                      pdfLoadingStates={pdfLoadingStates}
                      getItemsSummary={getItemsSummary}
                    />
                  ))}
                </div>
                
                {/* Desktop Card-Row View */}
                <div className="hidden md:block bg-gray-50 p-4 lg:p-5 space-y-3">
                  {filteredOrders.map((order) => (
                    <AdminOrderRow
                      key={order.id}
                      order={order}
                      onAddTracking={handleAddTracking}
                      onUpdateTracking={handleUpdateTracking}
                       onDeleteTracking={handleDeleteTracking}
                      onFileDownload={handleFileDownload}
                      onPdfDownload={handlePdfDownload}
                      onSendShippingNotification={handleSendShippingNotification}
                      onMarkInProduction={handleMarkInProduction}
                      onUploadFinalPdf={handleUploadFinalPdf}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                      pdfLoadingStates={pdfLoadingStates}
                      getItemsSummary={getItemsSummary}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          {!loading && (page > 1 || hasMore) && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page}
              </span>
              <Button
                variant="outline"
                onClick={() => goToPage(page + 1)}
                disabled={!hasMore}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

// Admin Order Row Component
interface AdminOrderRowProps {
  order: Order;
  onAddTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;
  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;
  onDeleteTracking: (orderId: string) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number) => void;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onSendShippingNotification: (orderId: string) => void;
  onMarkInProduction: (orderId: string) => void;
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
}

const AdminOrderRow: React.FC<AdminOrderRowProps> = ({
  order,
  onAddTracking,
  onUpdateTracking,
  onDeleteTracking,
  onFileDownload,
  onPdfDownload,
  onSendShippingNotification,
  onMarkInProduction,
  onUploadFinalPdf,
  getStatusColor,
  getStatusLabel,
  getItemsSummary,
  pdfLoadingStates
}) => {
  const [trackingRows, setTrackingRows] = useState<TrackingEntry[]>([{ carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: '', label: 'Package 1' }]);
  const [isAddingTracking, setIsAddingTracking] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const orderItems = getSafeOrderItems(order);
  // Helper function to get the best download URL for an item (AI or uploaded)
  const getBestDownloadUrl = (item) => {
    return getOriginalArtworkSelection(item);
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

  const previewItems = useMemo(() => orderItems.map((item: any, index) => ({ item, index, thumbUrl: getFinalizedThumbnailUrl(item, 720) })), [orderItems]);

  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const existingTrackingRows = normalizeTrackingEntries(order);
  const displayedTrackingRows = existingTrackingRows.length ? existingTrackingRows : [];
  const validateRows = (rows: TrackingEntry[]) => {
    const trimmed = rows.map((row, index) => ({ carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: row.trackingNumber.trim(), label: row.label?.trim() || `Package ${index + 1}` }));
    if (trimmed.some(row => !row.trackingNumber)) throw new Error('Blank tracking rows are not allowed.');
    const keys = trimmed.map(row => row.trackingNumber.toLowerCase());
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate tracking numbers are not allowed.');
    return trimmed;
  };
  const updateTrackingRow = (index: number, patch: Partial<TrackingEntry>) => setTrackingRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const addTrackingRow = () => setTrackingRows(rows => [...rows, { carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: '', label: `Package ${rows.length + 1}` }]);
  const removeTrackingRow = (index: number) => setTrackingRows(rows => rows.filter((_, rowIndex) => rowIndex !== index));
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [isMarkingProduction, setIsMarkingProduction] = useState(false);

  const handleAddTracking = () => {
    try {
      const rows = validateRows(trackingRows);
      onAddTracking(order.id, 'fedex', rows[0]?.trackingNumber || '', rows);
      setTrackingRows([{ carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: '', label: 'Package 1' }]);
      setIsAddingTracking(false);
    } catch (error) { alert(error instanceof Error ? error.message : 'Invalid tracking rows'); }
  };

  const handleEditTracking = () => {
    setTrackingRows(existingTrackingRows.length ? existingTrackingRows : [{ carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: '', label: 'Package 1' }]);
    setIsEditingTracking(true);
  };

  const handleSaveTracking = () => {
    try {
      const rows = validateRows(trackingRows);
      onUpdateTracking(order.id, 'fedex', rows[0]?.trackingNumber || '', rows);
      setIsEditingTracking(false);
    } catch (error) { alert(error instanceof Error ? error.message : 'Invalid tracking rows'); }
  };

  const handleCancelEdit = () => {
    setTrackingRows([{ carrier: DEFAULT_TRACKING_CARRIER, trackingNumber: '', label: 'Package 1' }]);
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

  const handleMarkInProduction = async () => {
    setIsMarkingProduction(true);
    try {
      await onMarkInProduction(order.id);
    } finally {
      setIsMarkingProduction(false);
    }
  };
  const getFilesWithDownload = () => {
    const filesWithDownload = orderItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => 
        item.file_key || 
        item.print_ready_url || 
        item.web_preview_url ||
        item.final_render_url ||
        item.final_render_file_key ||
        item.thumbnail_url ||
        (item.text_elements && item.text_elements.length > 0) ||
        item.overlay_image
      );

    return filesWithDownload;
  };

  const filesWithDownload = getFilesWithDownload();
  const finalPrintFiles = orderItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.final_print_pdf_url);
  const activePreview = previewIndex === null ? null : previewItems[previewIndex];
  const ORDER_ACCENT_TEXT_CLASS = 'text-[#18448D]';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.95fr)_minmax(300px,1.1fr)] xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)_minmax(360px,1.15fr)] lg:items-start">
        {/* LEFT SECTION */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="space-y-2">
            {previewItems.map(({ item, index, thumbUrl }) => (
              <div key={index} className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
                <button type="button" onClick={() => setPreviewIndex(index)} className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#18448D]" aria-label={`Open ${getProductTypeLabel(item)} preview`}>
                  <ProductPreviewFrame item={item} thumbUrl={thumbUrl} idSuffix={`row-${order.id}-${index}`} />
                </button>
                <div className="min-w-0">
                  <Badge className={`${getProductBadgeClass(getProductTypeLabel(item))} border text-[10px] font-bold`}>{getProductTitleLabel(item)}</Badge>
                  <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{getItemSizeLabel(item)}</div>
                  <div className="text-xs text-gray-600">Qty {item.quantity || 0}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="min-w-0 space-y-1">
            <div className={`font-mono text-sm font-semibold ${ORDER_ACCENT_TEXT_CLASS}`}>
              #{order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN'}
            </div>
            {order.is_test_order && (
              <Badge className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold">
                TEST ORDER
              </Badge>
            )}
            <div className="text-xs text-gray-500">
              {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <div className="text-sm font-medium text-gray-900 break-words" title={order.customer_name || order.shipping_name || "Guest Customer"}>
              {order.customer_name || order.shipping_name || 'Guest Customer'}
            </div>
            <div className="text-xs text-gray-600 break-all" title={order.email || (order.user_id ? `${order.user_id.slice(0, 8)}...` : "No email")}>
              {order.email || (order.user_id ? `${order.user_id.slice(0, 8)}...` : 'No email')}
            </div>
            <div className="pt-2">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Details</div>
              <div className="text-sm text-gray-900 break-words">{getOrderItemsSummary(order)}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600"><span>Total units: <b>{getTotalUnits(order)}</b></span><span>Line items: <b>{orderItems.length}</b></span><span>Print files: <b>{getPrintFileCount({ ...order, items: orderItems } as Order)}</b></span></div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION */}
        <div className="min-w-0 space-y-3">
          <div><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Total</div><div className={`text-lg font-bold ${ORDER_ACCENT_TEXT_CLASS}`}>{usd(getDisplayOrderTotalCents(order as any) / 100)}</div></div>
          {(() => {
            const profit = estimateOrderProfit(order);
            return (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs"> 
                {profit.needsReview ? (
                  <div className="inline-flex rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800">Needs review</div>
                ) : (
                  <>
                    <div className="text-slate-700">Revenue: <span className="font-semibold">{usd(profit.originalSubtotalCents / 100)}</span></div>
                    {profit.discountsAppliedCents > 0 && <div className="text-slate-700">Discounts: <span className="font-semibold text-red-700">-{usd(profit.discountsAppliedCents / 100)}</span></div>}
                    {profit.adjustedRetailSubtotalCents !== profit.originalSubtotalCents && <div className="text-slate-700">Adjusted Subtotal: <span className="font-semibold">{usd(profit.adjustedRetailSubtotalCents / 100)}</span></div>}
                    <div className="text-gray-600">Production Cost: <span className="font-semibold">{usd(profit.productionCostCents / 100)}</span></div>
                    <div className="text-gray-600">Shipping/Handling Cost: <span className="font-semibold">{usd(profit.shippingCostCents / 100)}</span></div>
                    <div className="text-gray-600">Total Cost: <span className="font-semibold">{usd(profit.totalCostCents / 100)}</span></div>
                    <div className="pt-1 text-sm text-slate-800">Net Profit: <span className={`text-base font-bold ${profit.netProfitCents >= 0 ? 'text-green-700' : 'text-red-700'}`}>{usd(profit.netProfitCents / 100)}</span></div>
                    <div className="text-slate-700">Margin: <span className={`font-semibold ${profit.marginPct >= 50 ? 'text-green-700' : profit.marginPct >= 35 ? 'text-amber-700' : 'text-red-700'}`}>{profit.marginPct.toFixed(1)}%</span></div>
                    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setShowCostBreakdown((value) => !value); }} className="mt-2 inline-flex items-center text-xs font-semibold text-[#18448D] hover:underline">
                      {showCostBreakdown ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />} {showCostBreakdown ? 'Hide Cost Breakdown' : 'View Cost Breakdown'}
                    </button>
                    {showCostBreakdown && (
                      <div className="mt-2 space-y-2 rounded border border-slate-200 bg-white p-2">
                        {Array.isArray((profit as any).lines) && (profit as any).lines.length > 0 ? (profit as any).lines.map((line: any, idx: number) => (
                          <div key={idx} className="text-gray-700">
                            <div className="font-semibold">{[line.productLabel || getProductTitleLabel(orderItems[idx]), line.sizeLabel, line.material].filter(Boolean).join(' — ')}</div>
                            {line.reviewRequired ? (
                              <div className="text-gray-600">Detailed line-item cost data is unavailable for this item.</div>
                            ) : (
                              <>
                                <div>Qty {line.quantity}{Number.isFinite(Number(line.unitCostCents)) ? ` × ${usd(Number(line.unitCostCents) / 100)}` : ''} = {usd(Number(line.lineCostCents || line.productionCostCents || 0) / 100)}</div>
                                {Array.isArray(line.addOnCosts) && line.addOnCosts.map((addOn: any) => <div key={addOn.label} className="pl-3 text-gray-600">{addOn.label}: {usd(Number(addOn.costCents || 0) / 100)}</div>)}
                              </>
                            )}
                          </div>
                        )) : <div className="text-gray-600">Detailed line-item cost data is unavailable for this order.</div>}
                        <div className="border-t border-slate-100 pt-2 text-gray-700"><div className="font-semibold">Production Cost Total: {usd(profit.productionCostCents / 100)}</div></div>
                        <div className="border-t border-slate-100 pt-2 text-gray-700"><div className="font-semibold">Supplier Shipping</div>{orderItems.length} line items × {usd(10)} = {usd(profit.shippingCostCents / 100)}</div>
                        <div className="border-t border-slate-100 pt-2 font-semibold text-gray-800">Total Cost: {usd(profit.totalCostCents / 100)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-1.5">
            <Badge className={`${getStatusColor(order.status)} capitalize`}>
              {getStatusLabel(order.status)}
            </Badge>
            {(() => {
              const pm = getPaymentMethodInfo(order);
              return pm ? (
                <Badge className={`${pm.className} text-xs font-semibold`}>
                  {pm.label}
                </Badge>
              ) : null;
            })()}
            {orderItems.some(item => item.design_service_enabled) && (
              <Badge className="bg-purple-100 text-purple-800 text-xs">
                <Palette className="h-3 w-3 mr-1" />
                Design Service
              </Badge>
            )}
            {order.same_day_hit_service && (
              <Badge className="bg-amber-100 text-amber-800 text-xs">
                Same-Day Hit Service
              </Badge>
            )}
            {order.saturday_delivery && (
              <Badge className="bg-purple-200 text-purple-900 text-xs">
                Saturday Delivery
              </Badge>
            )}
            {(() => {
              // Surface a compact failure badge in the row when any of the
              // transactional emails for this order failed delivery (error
              // / bounced / complained). Full details + retry buttons live
              // in the OrderDetails modal via <EmailDeliveryStatus />.
              const FAILURE_STATUSES = new Set(['error', 'bounced', 'complained']);
              const anyFailed =
                FAILURE_STATUSES.has(order.confirmation_email_status || '') ||
                FAILURE_STATUSES.has(order.production_email_status || '') ||
                FAILURE_STATUSES.has(order.shipping_notification_status || '');
              return anyFailed ? (
                <Badge
                  className="bg-red-100 text-red-800 text-xs border border-red-300"
                  title="Email delivery failed – customer did NOT receive notifications"
                >
                  <Mail className="h-3 w-3 mr-1" />
                  Email Failed
                </Badge>
              ) : null;
            })()}
          </div>
        </div>

        {/* RIGHT SECTION */}
        <div className="min-w-0 space-y-3">
          <>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Tracking</div>
            {displayedTrackingRows.length ? (
              <div className="space-y-2 rounded-md border border-green-100 bg-green-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">
                    <Truck className="h-3 w-3 mr-1" />
                    FEDEX
                  </Badge>
                  {!isEditingTracking && (
                    <>
                      <Button size="sm" variant="ghost" onClick={handleEditTracking} className="h-7 px-2 text-xs">
                        <Edit3 className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDeleteTracking(order.id)} className="h-7 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800">
                        <Trash2 className="h-3 w-3 mr-1" />Delete
                      </Button>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-700">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">Tracking Numbers:</span>{displayedTrackingRows.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={async () => { await copyText(displayedTrackingRows.map((row) => row.trackingNumber).join('\n')); setCopiedKey('all'); setTimeout(() => setCopiedKey(null), 2000); }} className="h-7 px-2 text-xs"><Copy className="mr-1 h-3 w-3" />{copiedKey === 'all' ? 'Copied' : 'Copy All'}</Button>}</div>
                  <div className="mt-1 space-y-1">{displayedTrackingRows.map((row, index) => (
                    <div key={`${row.trackingNumber}-${index}`} className="flex flex-wrap items-center gap-2"><span className="font-semibold">{row.label || `Package ${index + 1}`}:</span>{' '}
                      <a href={fedexUrl(row.trackingNumber)} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 underline hover:text-blue-800 break-all">{row.trackingNumber}</a>
                      <Button type="button" size="sm" variant="ghost" onClick={async () => { await copyText(row.trackingNumber); setCopiedKey(`row-${index}`); setTimeout(() => setCopiedKey(null), 2000); }} className="h-7 px-2 text-xs"><Copy className="mr-1 h-3 w-3" />{copiedKey === `row-${index}` ? 'Copied' : 'Copy'}</Button>
                    </div>
                  ))}</div>
                </div>
                <div className="text-xs text-gray-700">
                  <span className="font-semibold">Last Email Sent:</span>{' '}
                  {order.shipping_notification_sent_at
                    ? new Date(order.shipping_notification_sent_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Not sent yet'}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddingTracking(true)}
                className="h-8 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Tracking
              </Button>
            )}
            {(isEditingTracking || isAddingTracking) && (
              <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50 p-2">
                {trackingRows.length === 0 && (
                  <div className="rounded-md border border-dashed border-blue-200 bg-white p-3 text-xs text-gray-600">
                    No tracking numbers added.
                  </div>
                )}
                {trackingRows.map((row, index) => (
                  <div key={index} className="relative space-y-2 rounded-lg border border-blue-200 bg-white p-3 pr-11">
                    <Badge className="bg-green-100 text-green-800"><Truck className="h-3 w-3 mr-1" />FedEx</Badge>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeTrackingRow(index)} className="absolute right-2 top-2 h-7 px-2 text-xs" aria-label="Remove package"><X className="h-3 w-3" /></Button>
                    <label className="block text-xs font-semibold text-gray-700">Tracking Number</label>
                    <Input type="text" placeholder="Enter FedEx tracking number" value={row.trackingNumber} onChange={(e) => updateTrackingRow(index, { trackingNumber: e.target.value })} className="h-9 w-full text-xs" />
                    <label className="block text-xs font-semibold text-gray-700">Package Label</label>
                    <Input type="text" placeholder={`Package ${index + 1} label (optional)`} value={row.label || ''} onChange={(e) => updateTrackingRow(index, { label: e.target.value })} className="h-9 w-full text-xs" />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={addTrackingRow} className="h-8 px-3 text-xs"><Plus className="h-3 w-3 mr-1" />{trackingRows.length === 0 ? 'Add Tracking' : 'Add Another Tracking Number'}</Button>
                  <Button size="sm" onClick={isEditingTracking ? handleSaveTracking : handleAddTracking} className="h-8 px-3 text-xs"><Save className="h-3 w-3 mr-1" />Save Tracking</Button>
                  <Button size="sm" variant="ghost" onClick={isEditingTracking ? handleCancelEdit : () => setIsAddingTracking(false)} className="h-8 px-3 text-xs"><X className="h-3 w-3 mr-1" />Cancel</Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Print Files</div>
            {(filesWithDownload.length > 0 || finalPrintFiles.length > 0) ? (
              <div className="flex flex-wrap gap-2">
                {finalPrintFiles.map(({ item, index }) => (
                  <a
                    key={`final-pdf-${index}`}
                    href={item.final_print_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-md border border-purple-200 bg-purple-50 px-2.5 text-xs text-purple-700 hover:bg-purple-100"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    {getPrintFileLabel(item, index, 'Final')}
                  </a>
                ))}
                {filesWithDownload.map(({ item, index }) => (
                  <Button
                    key={`pdf-${index}`}
                    size="sm"
                    variant="outline"
                    onClick={() => onPdfDownload(item, index, order.id)}
                    disabled={pdfLoadingStates[`${order.id}-${index}`]}
                    className="h-8 px-2.5 text-xs"
                  >
                    {pdfLoadingStates[`${order.id}-${index}`] ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3 mr-1" />
                        {getPrintFileLabel(item, index)}
                      </>
                    )}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                No files
              </div>
            )}
          </div>
          </>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Actions</div>
            <div className="flex flex-wrap items-center gap-2">
              <OrderDetails
                order={order}
                onUploadFinalPdf={onUploadFinalPdf}
                trigger={
                  <Button size="sm" className="h-8 text-xs">
                    <Eye className="h-3 w-3 mr-1" />
                    View Order
                  </Button>
                }
              />

              {order.status === 'paid' && !order.production_email_sent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkInProduction}
                  disabled={isMarkingProduction}
                  className="h-8 text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                >
                  {isMarkingProduction ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Package className="h-3 w-3 mr-1" />
                      Mark In Production
                    </>
                  )}
                </Button>
              )}

              <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendNotification}
                  disabled={isSendingNotification || displayedTrackingRows.length === 0}
                  className="h-8 text-xs"
                >
                  {isSendingNotification ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-3 w-3 mr-1" />
                      {isSendingNotification ? 'Sending…' : order.shipping_notification_sent ? 'Resend Tracking Email' : 'Send Tracking Email'}
                    </>
                  )}
                </Button>
            </div>

            {order.status === 'in_production' && order.production_email_sent_at && (
              <div className="text-xs text-yellow-700 flex items-center">
                <Package className="h-3 w-3 mr-1" />
                In Production {new Date(order.production_email_sent_at).toLocaleDateString()}
              </div>
            )}
            {order.shipping_notification_sent && (
              <div className="text-xs text-green-600 flex items-center">
                <Mail className="h-3 w-3 mr-1" />
                Email Sent
              </div>
            )}
          </div>
        </div>
      </div>
      {activePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Badge className={`${getProductBadgeClass(getProductTypeLabel(activePreview.item))} border text-xs font-bold`}>{getProductTitleLabel(activePreview.item)}</Badge>
                <h3 className="mt-2 text-lg font-bold text-gray-900">{getProductTitleLabel(activePreview.item)} Preview</h3>
                <div className="mt-1 space-y-1 text-sm text-gray-600"><div>{getItemSizeLabel(activePreview.item)}</div><div>Qty {activePreview.item.quantity || 0}</div><div>{getItemMaterialLabel(activePreview.item)}</div>{getOptionRows(activePreview.item).map((row) => <div key={row.label}><span className="font-semibold">{row.label}:</span> {row.value}</div>)}</div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewIndex(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-gray-100 p-3">
              <ProductPreviewFrame item={activePreview.item} thumbUrl={activePreview.thumbUrl} large idSuffix={`lightbox-${order.id}-${activePreview.index}`} />
            </div>
            {previewItems.length > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => setPreviewIndex((previewIndex! - 1 + previewItems.length) % previewItems.length)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
                <span className="text-sm text-gray-600">{previewIndex! + 1} of {previewItems.length}</span>
                <Button type="button" variant="outline" onClick={() => setPreviewIndex((previewIndex! + 1) % previewItems.length)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// Mobile Card Component for Orders
interface AdminOrderCardProps {
  order: Order;
  onAddTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;
  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;
  onDeleteTracking: (orderId: string) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number) => void;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onSendShippingNotification: (orderId: string) => void;
  onMarkInProduction: (orderId: string) => void;
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
}

const AdminOrderCard: React.FC<AdminOrderCardProps> = ({
  order,
  onPdfDownload,
  onDeleteTracking,
  onSendShippingNotification,
  onMarkInProduction,
  onUploadFinalPdf,
  getStatusColor,
  getStatusLabel,
  getItemsSummary,
  pdfLoadingStates
}) => {
  const [isMarkingProduction, setIsMarkingProduction] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const orderItems = getSafeOrderItems(order);
  const displayedTrackingRows = normalizeTrackingEntries(order);

  const handleMarkInProduction = async () => {
    setIsMarkingProduction(true);
    try {
      await onMarkInProduction(order.id);
    } finally {
      setIsMarkingProduction(false);
    }
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
    return orderItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => 
        item.file_key || 
        item.print_ready_url || 
        item.web_preview_url ||
        item.final_render_url ||
        item.final_render_file_key ||
        item.thumbnail_url ||
        (item.text_elements && item.text_elements.length > 0) ||
        item.overlay_image
      );
  };

  const previewItems = useMemo(() => orderItems.map((item: any, index) => ({ item, index, thumbUrl: getFinalizedThumbnailUrl(item, 720) })), [orderItems]);

  return (
    <div className="border-b border-gray-200 p-4 hover:bg-gray-50 overflow-x-clip">
      <div className="space-y-3 min-w-0">
        <div className="grid grid-cols-1 gap-2">
          {previewItems.map(({ item, index, thumbUrl }) => (
            <div key={index} className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
              <div className="h-14 w-16 flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-white">
                {thumbUrl ? <img src={thumbUrl} alt={`${getProductTypeLabel(item)} preview`} className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No img</span>}
              </div>
              <div className="min-w-0">
                <Badge className={`${getProductBadgeClass(getProductTypeLabel(item))} border text-[10px] font-bold`}>{getProductTitleLabel(item)}</Badge>
                <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{getItemSizeLabel(item)}</div>
                <div className="text-xs text-gray-600">Qty {item.quantity || 0}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-[#18448D] break-all">#{order.id.slice(-8).toUpperCase()}</div>
              {order.is_test_order && (
                <Badge className="mt-1 bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold">
                  TEST ORDER
                </Badge>
              )}
              <div className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</div>
              <div className="text-sm font-medium text-gray-900 break-words">{order.customer_name || order.shipping_name || 'Not provided'}</div>
              <div className="text-xs text-gray-600 break-all">{order.email || 'No email'}</div>
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <Badge className={`${getStatusColor(order.status)} capitalize`}>
                {getStatusLabel(order.status)}
              </Badge>
              {(() => {
                const pm = getPaymentMethodInfo(order);
                return pm ? (
                  <Badge className={`${pm.className} text-xs font-semibold`}>
                    {pm.label}
                  </Badge>
                ) : null;
              })()}
              {orderItems.some(item => item.design_service_enabled) && (
                <Badge className="bg-purple-100 text-purple-800 text-xs">
                  <Palette className="h-3 w-3 mr-1" />
                  Design
                </Badge>
              )}
              {order.same_day_hit_service && (
                <Badge className="bg-amber-100 text-amber-800 text-xs">
                  Same-Day
                </Badge>
              )}
              {order.saturday_delivery && (
                <Badge className="bg-purple-200 text-purple-900 text-xs">
                  Saturday
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <div className="text-xs text-gray-500">Items</div>
              <div className="text-sm text-gray-800 break-words">{getOrderItemsSummary(order)}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600"><span>Total units: <b>{getTotalUnits(order)}</b></span><span>Line items: <b>{orderItems.length}</b></span><span>Print files: <b>{getPrintFileCount({ ...order, items: orderItems } as Order)}</b></span></div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-lg font-bold text-[#18448D]">{usd(getDisplayOrderTotalCents(order as any) / 100)}</div>
            {(() => { const profit = estimateOrderProfit(order); return profit.needsReview ? (<div className="inline-flex rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Needs review</div>) : (<div className="text-xs text-slate-700">Rev {usd(profit.originalSubtotalCents/100)}{profit.discountsAppliedCents>0 ? ` · Disc -${usd(profit.discountsAppliedCents/100)}` : ''}{profit.adjustedRetailSubtotalCents !== profit.originalSubtotalCents ? ` · Adj ${usd(profit.adjustedRetailSubtotalCents/100)}` : ''} · Prod {usd(profit.productionCostCents/100)} · Ship {usd(profit.shippingCostCents/100)} · Total Cost {usd(profit.totalCostCents/100)} · <span className={`${profit.netProfitCents>=0?'text-green-700':'text-red-700'} font-semibold`}>Profit {usd(profit.netProfitCents/100)}</span> · <span className={`${profit.marginPct >= 50 ? 'text-green-700' : profit.marginPct >= 35 ? 'text-amber-700' : 'text-red-700'} font-semibold`}>Margin {profit.marginPct.toFixed(1)}%</span></div>); })()}
            </div>
            {displayedTrackingRows.length > 0 && (
              <div className="min-w-0">
                <div className="text-xs text-gray-500 mb-1">Tracking</div>
                <div className="space-y-1">
                  {displayedTrackingRows.map((row, index) => (
                    <div key={`${row.trackingNumber}-${index}`} className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-green-100 text-green-800"><Truck className="h-3 w-3 mr-1" />FEDEX</Badge>
                      <span className="text-xs font-semibold text-gray-700">{row.label || `Package ${index + 1}`}</span>
                      <a href={fedexUrl(row.trackingNumber)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{row.trackingNumber}</a><Button type="button" size="sm" variant="ghost" onClick={async () => { await copyText(row.trackingNumber); setCopiedKey(`row-${index}`); setTimeout(() => setCopiedKey(null), 2000); }} className="h-7 px-2 text-xs"><Copy className="mr-1 h-3 w-3" />{copiedKey === `row-${index}` ? 'Copied' : 'Copy'}</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {(getFilesWithDownload().length > 0 || orderItems.some(item => item.final_print_pdf_url)) && (
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-2">Print Files</div>
          <div className="grid grid-cols-1 gap-2">
            {orderItems
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.final_print_pdf_url)
              .map(({ item, index }) => (
                <a
                  key={`final-pdf-${index}`}
                  href={item.final_print_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center text-xs text-purple-700 hover:text-purple-900 font-medium bg-purple-50 border border-purple-200 px-3 py-2 rounded"
                >
                  <Download className="h-3 w-3 mr-1" />
                  {getPrintFileLabel(item, index, 'Final')}
                </a>
              ))}
            {getFilesWithDownload().map(({ item, index }) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                onClick={() => onPdfDownload(item, index, order.id)}
                disabled={pdfLoadingStates[`${order.id}-${index}`]}
                className="text-xs h-9 px-3 w-full justify-center"
              >
                {pdfLoadingStates[`${order.id}-${index}`] ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3 mr-1" />
                    {getPrintFileLabel(item, index)}
                  </>
                )}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
        {order.status === 'paid' && !order.production_email_sent && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkInProduction}
            disabled={isMarkingProduction}
            className="w-full text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-50"
          >
            {isMarkingProduction ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Package className="h-3 w-3 mr-1" />
                Mark as In Production
              </>
            )}
          </Button>
        )}

        {order.status === 'in_production' && order.production_email_sent_at && (
          <div className="text-xs text-yellow-700 flex items-center justify-center text-center">
            <Package className="h-3 w-3 mr-1" />
            In Production since {new Date(order.production_email_sent_at).toLocaleDateString()}
          </div>
        )}


        {displayedTrackingRows.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => onDeleteTracking(order.id)} className="w-full border-red-200 text-xs text-red-700 hover:bg-red-50">
            <Trash2 className="mr-1 h-3 w-3" />Delete Tracking
          </Button>
        )}

        <Button
            size="sm"
            variant="outline"
            onClick={handleSendNotification}
            disabled={isSendingNotification || displayedTrackingRows.length === 0}
            className="w-full text-xs"
          >
            {isSendingNotification ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</> : <><Mail className="h-3 w-3 mr-1" />{order.shipping_notification_sent ? 'Resend Tracking Email' : 'Send Tracking Email'}</>}
          </Button>

        <OrderDetails
          order={order}
          onUploadFinalPdf={onUploadFinalPdf}
          trigger={
            <Button
              size="sm"
              variant="outline"
              className="w-full"
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
          }
        />
      </div>
    </div>
  );
};


export default AdminOrders;
