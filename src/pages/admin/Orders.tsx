import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin } from '../../lib/auth';
import { fetchAdminOrderDetail, fetchAdminOrdersReport } from '../../lib/orders/netlify-function';
import {
  Order,
  type AdminOrdersPagination,
} from '../../lib/orders/types';
import { usd, formatDimensions } from '@/lib/pricing';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Package,
  Search,
  Eye,
  ArrowLeft,
  Download,
  X,
  FileText,
  Mail,
  Loader2,
  Palette,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Star, ShoppingCart, UserCheck, UsersRound } from 'lucide-react';
import OrderDetails from '@/components/orders/OrderDetails';
import { getDisplayOrderTotalCents } from '@/lib/order-totals';
import { estimateOrderProfit } from '@/lib/admin-profit-estimate';
import { adminFetch } from '@/lib/serverAuth';
import { getOriginalArtworkSelection } from '@/lib/artworkFiles';
import { getFinalizedThumbnailCandidates, getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';
import GrommetOverlay from '@/components/preview/GrommetOverlay';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import { getGrommetLabel } from '@/lib/grommets';
import EditCustomerInfoDialog from '@/components/orders/EditCustomerInfoDialog';
import ReviewRequestAction from '@/components/orders/ReviewRequestAction';
import AdminRefundOrderAction from '@/components/orders/AdminRefundOrderAction';
import AdminTrackingManager from '@/components/orders/AdminTrackingManager';
import {
  adminOrderPeriodLabel,
  getAdminOrderPeriodBounds,
  type AdminBusinessMetrics,
  type AdminOrderPeriod,
} from '@/lib/admin-business-metrics';

const PAGE_SIZE = 20;

const emptyBusinessMetrics = (): AdminBusinessMetrics => ({
  totalOrders: 0,
  grossSalesCents: 0,
  averageOrderValueCents: 0,
  recordedRefundsCents: 0,
  netSalesCents: 0,
  newCustomers: 0,
  repeatCustomers: 0,
  repeatRate: 0,
  identifiedCustomers: 0,
});

const emptyPagination = (page = 1): AdminOrdersPagination => ({
  page,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 1,
  hasPrevious: page > 1,
  hasNext: false,
});

const toLocalDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const initialCustomRange = () => {
  const today = new Date();
  return {
    startDate: toLocalDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toLocalDateInput(today),
  };
};

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
  if (!parts.length) return order.admin_detail_loaded === false ? 'Item details not loaded' : 'No items';
  const unitsLabel = order.admin_detail_loaded === false ? 'Captured subset units' : 'Total Units';
  return `${parts.join(' · ')} · ${unitsLabel}: ${getTotalUnits(order)}`;
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

const toTitleCase = (value: string): string => value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

const stripAsciiControlCharacters = (value: string): string => Array.from(value)
  .filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 31 && codePoint !== 127;
  })
  .join('');

const getProductTitleLabel = (item: any): string => {
  const label = getProductTypeLabel(item);
  return label === 'PRODUCT' ? 'Product' : toTitleCase(label);
};

const getSafeOrderItems = (order: Pick<Order, 'items'>): any[] => Array.isArray(order.items) ? order.items : [];

const getOriginalFileEntries = (items: Order['items']) => items.flatMap((item, index) => {
  const selection = getOriginalArtworkSelection(item);
  return selection ? [{ item, index, selection }] : [];
});

const getOriginalFilename = (item: any): string | undefined => {
  const rawName = item?.artwork_manifest?.originalFilename || item?.original_filename || item?.file_name;
  if (!rawName) return undefined;
  const leafName = stripAsciiControlCharacters(String(rawName).split(/[\\/]/).pop() || '').trim();
  return leafName || undefined;
};

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
  const candidates = useMemo(() => [
    thumbUrl,
    ...getFinalizedThumbnailCandidates(item, large ? 1200 : 320),
  ].filter((value): value is string => Boolean(value)), [item, thumbUrl, large]);
  const candidateSignature = candidates.join('\n');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (candidates.length === 0) setReady(false);
    setFailed(false);
  }, [candidateSignature, candidates.length]);

  const loading = candidates.length > 0 && !ready && !failed;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white ${large ? 'max-h-[66vh]' : 'h-full'}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label={`${getProductTitleLabel(item)} finished preview`}
      aria-busy={loading}
      data-admin-product-preview="true"
      data-preview-ready={ready ? 'true' : 'false'}
      data-preview-failed={failed ? 'true' : 'false'}
    >
      {candidates.length > 0 && !failed ? (
        <StablePreviewImage
          sources={candidates}
          alt={`${getProductTitleLabel(item)} finished preview`}
          className="absolute inset-0 block h-full w-full object-contain"
          retainPreviousWhileLoading
          loadTimeoutMs={25_000}
          onReady={() => {
            setReady(true);
            setFailed(false);
          }}
          onExhausted={() => {
            setReady(false);
            setFailed(true);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 px-2 text-center text-xs font-medium text-gray-500">
          Preview unavailable
        </div>
      )}

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-white/90 text-[10px] font-semibold text-gray-600">
          Loading preview…
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        aria-hidden="true"
      >
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

const AdminOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [reportReady, setReportReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [period, setPeriod] = useState<AdminOrderPeriod>('this_month');
  const [customRange, setCustomRange] = useState(initialCustomRange);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const { toast } = useToast();
  const [pdfLoadingStates, setPdfLoadingStates] = useState<Record<string, boolean>>({});
  const [fileLoadingStates, setFileLoadingStates] = useState<Record<string, boolean>>({});
  const [detailLoadingStates, setDetailLoadingStates] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<AdminOrdersPagination>(() => emptyPagination());
  const [businessMetrics, setBusinessMetrics] = useState<AdminBusinessMetrics>(() => emptyBusinessMetrics());
  const reportAbortController = useRef<AbortController | null>(null);
  const reportRequestId = useRef(0);
  const detailAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const detailRequestIds = useRef<Map<string, number>>(new Map());
  const [globalOverview, setGlobalOverview] = useState({
    totalOrders: 0,
    inProductionOrders: 0,
    shippedOrders: 0,
    pendingOrders: 0,
    refundedOrders: 0,
    totalRevenueCents: 0,
    refundedRevenueCents: 0,
    abandonedCarts: 0,
    customQuotes: 0,
  });

  const [globalOverviewLoading, setGlobalOverviewLoading] = useState({
    orders: false,
    abandonedCarts: false,
    customQuotes: false,
  });

  const abortDetailRequests = () => {
    detailAbortControllers.current.forEach((controller) => controller.abort());
    detailAbortControllers.current.clear();
    setDetailLoadingStates({});
  };

  const loadGlobalOverview = async (adminEmail?: string) => {
    setGlobalOverviewLoading((current) => ({
      ...current,
      abandonedCarts: false,
      customQuotes: false,
    }));

    const [
      abandonedCartsResult,
      customQuotesResult,
    ] = await Promise.allSettled([
      adminFetch('/.netlify/functions/get-abandoned-carts?summary=1').then(async (response) => {
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

    if (abandonedCartsResult.status === 'rejected') {
      console.error('Error loading global abandoned carts total:', abandonedCartsResult.reason);
    }
    if (customQuotesResult.status === 'rejected') {
      console.error('Error loading global custom quotes total:', customQuotesResult.reason);
    }

    const abandonedCartsCount = abandonedCartsResult.status === 'fulfilled'
      ? Number(abandonedCartsResult.value?.analytics?.activeCount || 0)
        + Number(abandonedCartsResult.value?.analytics?.abandonedCount || 0)
      : 0;
    const customQuotesCount = customQuotesResult.status === 'fulfilled'
      ? (customQuotesResult.value?.quotes?.length ?? 0)
      : 0;

    setGlobalOverview((current) => ({
      ...current,
      abandonedCarts: abandonedCartsCount,
      customQuotes: customQuotesCount,
    }));

    setGlobalOverviewLoading((current) => ({
      ...current,
      abandonedCarts: true,
      customQuotes: true,
    }));
  };

  const loadOrders = async (pageToLoad: number = page) => {
    abortDetailRequests();
    const { start, endExclusive } = getAdminOrderPeriodBounds(period, customRange);
    if (period === 'custom' && (!start || !endExclusive)) {
      reportAbortController.current?.abort();
      reportRequestId.current += 1;
      setOrders([]);
      setPagination(emptyPagination(1));
      setBusinessMetrics(emptyBusinessMetrics());
      setReportReady(true);
      setLoading(false);
      return;
    }

    reportAbortController.current?.abort();
    const controller = new AbortController();
    reportAbortController.current = controller;
    const requestId = ++reportRequestId.current;

    try {
      setLoading(true);
      const report = await fetchAdminOrdersReport({
        page: pageToLoad,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        start: start?.toISOString() ?? null,
        endExclusive: endExclusive?.toISOString() ?? null,
      }, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== reportRequestId.current) return;

      setOrders(report.orders);
      setPagination(report.pagination);
      setBusinessMetrics(report.metrics);
      setReportReady(true);
      setGlobalOverview((current) => ({ ...current, ...report.overview }));
      setGlobalOverviewLoading((current) => ({ ...current, orders: true }));
    } catch (error) {
      if (controller.signal.aborted || requestId !== reportRequestId.current) return;
      console.error('Error loading orders:', error);
      setOrders([]);
      setPagination(emptyPagination(pageToLoad));
      setBusinessMetrics(emptyBusinessMetrics());
      setReportReady(false);
      toast({
        title: "Error Loading Orders",
        description: "There was an error loading orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (!controller.signal.aborted && requestId === reportRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Redirect to the admin login page (not the customer sign-in page) when
    // the visitor isn't an admin yet. This restores the legacy behavior where
    // hitting /admin/orders directly takes you to the admin password gate.
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/admin/setup', { replace: true });
      return;
    }

    if (user && isAdmin(user)) void loadGlobalOverview(user.email);
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (authLoading || !user || !isAdmin(user)) return undefined;
    void loadOrders(page);
    return () => {
      reportAbortController.current?.abort();
      abortDetailRequests();
    };
  }, [user, authLoading, page, period, customRange.startDate, customRange.endDate, debouncedSearch]);

  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  const goToPage = (newPage: number) => {
    setPage(newPage);
    // Scroll to top of orders section
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateOrderEverywhere = (orderId: string, updater: (order: Order) => Order) => {
    setOrders((current) => current.map((order) => order.id === orderId ? updater(order) : order));
  };

  const loadFullOrderDetails = async (orderId: string) => {
    if (detailAbortControllers.current.has(orderId)) return;
    const controller = new AbortController();
    const requestId = (detailRequestIds.current.get(orderId) || 0) + 1;
    detailRequestIds.current.set(orderId, requestId);
    detailAbortControllers.current.set(orderId, controller);
    setDetailLoadingStates((current) => ({ ...current, [orderId]: true }));
    try {
      const detail = await fetchAdminOrderDetail(orderId, { signal: controller.signal });
      if (controller.signal.aborted || detailRequestIds.current.get(orderId) !== requestId) return;
      setOrders((current) => current.map((summary) => summary.id === orderId ? (() => {
        const detailStatus = String(detail.status || '').toLowerCase();
        const summaryHasCompletedPayPal = Boolean(
          summary.paypal_capture_id
          || (String(summary.payment_method || '').toLowerCase() === 'paypal'
            && String(summary.payment_reconciliation_status || '').toLowerCase() === 'complete')
        );
        const effectiveDetailStatus = detailStatus === 'pending'
          && String(summary.status || '').toLowerCase() === 'paid'
          && summaryHasCompletedPayPal
          ? 'paid'
          : detail.status;
        return ({
          ...summary,
          ...detail,
          status: effectiveDetailStatus,
          reporting_customer_email: summary.reporting_customer_email || detail.reporting_customer_email || null,
          review_request_customer_email: summary.review_request_customer_email || detail.review_request_customer_email || null,
          review_request_last_sent_at: summary.review_request_last_sent_at || detail.review_request_last_sent_at || null,
          review_request_sent_count: Math.max(
            Number(summary.review_request_sent_count || 0),
            Number(detail.review_request_sent_count || 0),
          ),
          item_count: detail.items.length,
          items_truncated: false,
          admin_detail_loaded: true,
        });
      })() : summary));
    } catch (error) {
      if (controller.signal.aborted || detailRequestIds.current.get(orderId) !== requestId) return;
      console.error('Error loading full order details:', error);
      toast({
        title: 'Unable to Open Order',
        description: 'Full files and actions could not be loaded. Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (detailRequestIds.current.get(orderId) === requestId) {
        detailAbortControllers.current.delete(orderId);
        setDetailLoadingStates((current) => ({ ...current, [orderId]: false }));
      }
    }
  };

  const handleCustomerInfoUpdated = (updated: Order) => updateOrderEverywhere(updated.id, (order) => ({ ...order, ...updated }));
  const handleOrderRefunded = (updated: Order) => {
    updateOrderEverywhere(updated.id, (order) => ({ ...order, ...updated }));
    void loadOrders(page);
  };
  const handleReviewRequestSent = (orderId: string, update: { sentAt: string; customerEmail: string }) => {
    updateOrderEverywhere(orderId, (order) => ({
      ...order,
      review_request_last_sent_at: update.sentAt,
      review_request_customer_email: update.customerEmail,
      review_request_sent_count: Math.max(Number(order.review_request_sent_count || 0), 1),
    }));
  };

  const handleTrackingUpdated = (orderId: string, update: Partial<Order>) => {
    updateOrderEverywhere(orderId, (order) => ({ ...order, ...update }));
    void loadOrders(page);
  };

  const handleFileDownload = async (fileKey: string, orderId: string, itemIndex: number, originalFilename?: string) => {
    const stateKey = `${orderId}-${itemIndex}`;

    try {
      setFileLoadingStates((current) => ({ ...current, [stateKey]: true }));
      toast({
        title: "Downloading Original File",
        description: "Preparing the customer's uploaded file...",
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

      // Preserve the customer's original filename whenever it is available.
      const baseName = fileKey?.split('/').pop()?.split('.')[0] || `banner-${orderId.slice(-8)}-item-${itemIndex + 1}`;
      const originalLeafName = originalFilename?.split(/[\\/]/).pop();
      const safeOriginalFilename = originalLeafName
        ? stripAsciiControlCharacters(originalLeafName).trim()
        : undefined;
      const fileName = safeOriginalFilename || `${baseName}.${extension}`;

      // Force the authenticated original bytes through a download anchor. Do
      // not navigate to the object URL: images and PDFs would open in-browser.
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);

      toast({
        title: "Original File Downloaded",
        description: `${fileName} has been downloaded.`,
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Original File Unavailable",
        description: "Could not download the original file. It may not exist or be accessible.",
        variant: "destructive",
      });
    } finally {
      setFileLoadingStates((current) => ({ ...current, [stateKey]: false }));
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

      // The endpoint reloads the authoritative item scene after verifying the
      // Admin session and order ownership. Do not echo unbounded design JSON
      // from the list row back into this request.
      const requestBody = {
        orderId,
        itemId: item.id || null,
        itemIndex,
        format: 'pdf',
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
      updateOrderEverywhere(orderId, (order) => ({
        ...order,
        status: 'in_production' as const,
        production_email_sent: result.emailSent ?? true,
        production_email_sent_at: new Date().toISOString(),
      }));
      void loadOrders(page);

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
      updateOrderEverywhere(orderId, (order) => {
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
      });

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
      case 'delivered':
      case 'fulfilled':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-amber-100 text-amber-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_production':
        return 'bg-yellow-100 text-yellow-800';
      case 'refunded':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'in_production') return 'In Production';
    if (status === 'refunded') return 'Cancelled / Refunded';
    if (status === 'delivered') return 'Delivered';
    if (status === 'fulfilled') return 'Fulfilled';
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
        return `${itemCount} × Yard Sign 24"×18"${order.admin_detail_loaded === false ? ' (captured subset)' : ''}`;
      }
      return `${itemCount} × ${formatDimensions(item.width_in, item.height_in)} ${item.material}${order.admin_detail_loaded === false ? ' (captured subset)' : ''}`;
    }
    
    const productLabel = hasYardSigns ? 'items' : 'banners';
    return `${itemCount} ${productLabel} (${uniqueItems} designs${order.admin_detail_loaded === false ? ', captured subset' : ''})`;
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-start text-2xl font-bold text-gray-900 sm:items-center sm:text-3xl">
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
                className="w-full sm:w-auto"
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
                      <Badge className="ml-1 bg-[#C94E00] text-white">{globalOverview.customQuotes}</Badge>
                    )}
                  </a>
                </TabsTrigger>
                <TabsTrigger value="abandoned-carts" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/abandoned-carts">
                    <ShoppingCart className="h-4 w-4" />
                    Abandoned Carts
                  </a>
                </TabsTrigger>
                <TabsTrigger value="customers" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/customers">
                    <UsersRound className="h-4 w-4" />
                    Customers
                  </a>
                </TabsTrigger>
                <TabsTrigger value="email-templates" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/email-templates">
                    <Mail className="h-4 w-4" />
                    Email Templates
                  </a>
                </TabsTrigger>
                {/* Admin-gated AI Designer entry. Keep admin-only until customer rollout. */}
                <TabsTrigger value="ai-designer" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/ai-designer">
                    <Star className="h-4 w-4" />
                    AI Designer
                  </a>
                </TabsTrigger>
                <TabsTrigger value="ai-sales" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/sales">
                    <Bot className="h-4 w-4" />
                    AI Sales Engine
                  </a>
                </TabsTrigger>
                <TabsTrigger value="lead-review" className="flex items-center gap-2 min-w-0" asChild>
                  <a href="/admin/sales/lead-review">
                    <UserCheck className="h-4 w-4" />
                    Lead Review
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
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
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
                  label: 'Refunded',
                  value: globalOverview.refundedOrders.toLocaleString(),
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

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby="order-report-heading">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 id="order-report-heading" className="text-lg font-bold text-gray-900">Order performance</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-600">
                  Uses each order's creation date in your local calendar. Total Orders includes paid, in-production, and shipped orders. Gross also includes currently refunded records; Recorded Refunds removes those values from net. Test and unpaid orders are excluded.
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Order reporting period">
                {(['this_month', 'last_month', 'custom', 'all_time'] as AdminOrderPeriod[]).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={period === option ? 'default' : 'outline'}
                    className="h-9 text-xs"
                    onClick={() => {
                      setPage(1);
                      setPeriod(option);
                    }}
                    aria-pressed={period === option}
                  >
                    {adminOrderPeriodLabel(option)}
                  </Button>
                ))}
              </div>
            </div>

            {period === 'custom' && (
              <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2" data-admin-custom-period>
                <label className="space-y-1 text-xs font-semibold text-gray-700">
                  <span>Start date</span>
                  <Input type="date" value={customRange.startDate} max={customRange.endDate || undefined} onChange={(event) => {
                    setPage(1);
                    setCustomRange((current) => ({ ...current, startDate: event.target.value }));
                  }} />
                </label>
                <label className="space-y-1 text-xs font-semibold text-gray-700">
                  <span>End date</span>
                  <Input type="date" value={customRange.endDate} min={customRange.startDate || undefined} onChange={(event) => {
                    setPage(1);
                    setCustomRange((current) => ({ ...current, endDate: event.target.value }));
                  }} />
                </label>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" data-admin-period-metrics>
              {[
                { label: 'Total Orders', value: businessMetrics.totalOrders.toLocaleString() },
                { label: 'Gross Sales', value: usd(businessMetrics.grossSalesCents / 100) },
                { label: 'AOV', value: usd(businessMetrics.averageOrderValueCents / 100) },
                { label: 'Recorded Refunds', value: usd(businessMetrics.recordedRefundsCents / 100) },
                { label: 'Net Sales', value: usd(businessMetrics.netSalesCents / 100) },
                { label: 'New Customers', value: businessMetrics.newCustomers.toLocaleString() },
                { label: 'Repeat Customers', value: businessMetrics.repeatCustomers.toLocaleString() },
                { label: 'Repeat Rate', value: `${(businessMetrics.repeatRate * 100).toFixed(1)}%` },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] text-gray-600">{metric.label}</p>
                  <p className="mt-1 break-words text-base font-bold text-gray-900">
                    {!reportReady || loading ? 'Loading…' : metric.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-gray-500">
              AOV is net sales divided by successful orders. A new customer placed their first successful lifetime order in this period; a repeat customer placed a successful period order after an earlier successful order. Customer counts use valid, normalized email addresses and omit generated guest/preview addresses.
            </p>
          </section>

          {/* Search */}
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <Input
                  type="search"
                  placeholder={reportReady
                    ? 'Search order ID, customer name, or email...'
                    : 'Loading order report...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label="Search full order history"
                  disabled={!reportReady && loading}
                />
              </div>
              <p className="text-xs text-gray-600">
                {reportReady
                  ? `${pagination.totalItems.toLocaleString()} ${pagination.totalItems === 1 ? 'order' : 'orders'} · ${adminOrderPeriodLabel(period)}`
                  : 'Loading exact metrics, search results, and pagination…'}
              </p>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
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
                  {orders.map((order) => (
                    <AdminOrderCard
                      key={order.id}
                      order={order}
                      onTrackingUpdated={handleTrackingUpdated}
                      onFileDownload={handleFileDownload}
                      onPdfDownload={handlePdfDownload}
                      onMarkInProduction={handleMarkInProduction}
                      onOrderRefunded={handleOrderRefunded}
                      onUploadFinalPdf={handleUploadFinalPdf}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                      pdfLoadingStates={pdfLoadingStates}
                      fileLoadingStates={fileLoadingStates}
                      getItemsSummary={getItemsSummary}
                      onCustomerInfoUpdated={handleCustomerInfoUpdated}
                      onReviewRequestSent={handleReviewRequestSent}
                      onLoadDetails={loadFullOrderDetails}
                      detailLoading={Boolean(detailLoadingStates[order.id])}
                    />
                  ))}
                </div>
                
                {/* Desktop Card-Row View */}
                <div className="hidden md:block bg-gray-50 p-4 lg:p-5 space-y-3">
                  {orders.map((order) => (
                    <AdminOrderRow
                      key={order.id}
                      order={order}
                      onTrackingUpdated={handleTrackingUpdated}
                      onFileDownload={handleFileDownload}
                      onPdfDownload={handlePdfDownload}
                      onMarkInProduction={handleMarkInProduction}
                      onOrderRefunded={handleOrderRefunded}
                      onUploadFinalPdf={handleUploadFinalPdf}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                      pdfLoadingStates={pdfLoadingStates}
                      fileLoadingStates={fileLoadingStates}
                      getItemsSummary={getItemsSummary}
                      onCustomerInfoUpdated={handleCustomerInfoUpdated}
                      onReviewRequestSent={handleReviewRequestSent}
                      onLoadDetails={loadFullOrderDetails}
                      detailLoading={Boolean(detailLoadingStates[order.id])}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          {!loading && pagination.totalPages > 1 && (
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
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.totalPages}
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
  onTrackingUpdated: (orderId: string, update: Partial<Order>) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number, originalFilename?: string) => Promise<void>;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onMarkInProduction: (orderId: string) => void;
  onOrderRefunded: (updatedOrder: Order) => void;
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
  fileLoadingStates: Record<string, boolean>;
  onCustomerInfoUpdated: (order: Order) => void;
  onReviewRequestSent: (orderId: string, update: { sentAt: string; customerEmail: string }) => void;
  onLoadDetails: (orderId: string) => Promise<void>;
  detailLoading: boolean;
}

const AdminOrderRow: React.FC<AdminOrderRowProps> = ({
  order,
  onTrackingUpdated,
  onFileDownload,
  onPdfDownload,
  onMarkInProduction,
  onOrderRefunded,
  onUploadFinalPdf,
  getStatusColor,
  getStatusLabel,
  getItemsSummary,
  pdfLoadingStates,
  fileLoadingStates,
  onCustomerInfoUpdated,
  onReviewRequestSent,
  onLoadDetails,
  detailLoading,
}) => {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const orderItems = getSafeOrderItems(order);
  const detailRequired = order.admin_detail_loaded === false;
  const totalItemCount = Math.max(orderItems.length, Number(order.item_count || 0));
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

  const [isMarkingProduction, setIsMarkingProduction] = useState(false);

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
  const originalFiles = getOriginalFileEntries(orderItems);
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
              {detailRequired ? (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  Showing {orderItems.length} of {totalItemCount} line items. Open the full order for exact units and files.
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600"><span>Total units: <b>{getTotalUnits(order)}</b></span><span>Line items: <b>{orderItems.length}</b></span><span>Print files: <b>{getPrintFileCount({ ...order, items: orderItems } as Order)}</b></span></div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION */}
        <div className="min-w-0 space-y-3">
          <div><div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Total</div><div className={`text-lg font-bold ${ORDER_ACCENT_TEXT_CLASS}`}>{usd(getDisplayOrderTotalCents(order as any) / 100)}</div></div>
          {(() => {
            if (detailRequired) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                  Open the full order for exact production cost, shipping, profit, and margin.
                </div>
              );
            }
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
            {order.customer_info_admin_updated_at && <Badge className="bg-indigo-100 text-indigo-800 text-xs">Customer info updated by Admin</Badge>}
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
          {detailRequired ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Full order details required</div>
              <div className="text-xs text-amber-800">
                Load all {totalItemCount} line items and package tracking before using files or order actions.
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => void onLoadDetails(order.id)}
                disabled={detailLoading}
              >
                {detailLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                {detailLoading ? 'Loading full order...' : 'Load files & actions'}
              </Button>
            </div>
          ) : (
          <>
          <div data-admin-tracking-group>
            <AdminTrackingManager order={order} instanceSuffix="desktop" onUpdated={(update) => onTrackingUpdated(order.id, update)} />
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3" data-admin-file-group>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Files</div>
            {(originalFiles.length > 0 || filesWithDownload.length > 0 || finalPrintFiles.length > 0) ? (
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {originalFiles.map(({ item, index, selection }) => {
                  const loadingKey = `${order.id}-${index}`;
                  const loading = Boolean(fileLoadingStates[loadingKey]);
                  return (
                    <Button
                      key={`original-${index}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onFileDownload(selection.url, order.id, index, getOriginalFilename(item))}
                      disabled={loading}
                      className="h-9 w-full justify-center border-blue-200 bg-white px-2.5 text-xs text-[#18448D] hover:bg-blue-50"
                      data-admin-original-file
                    >
                      {loading ? (
                        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Downloading...</>
                      ) : (
                        <><Download className="mr-1.5 h-3.5 w-3.5" />{originalFiles.length > 1 ? `Original File ${index + 1}` : 'Original File'}</>
                      )}
                    </Button>
                  );
                })}
                {finalPrintFiles.map(({ item, index }) => (
                  <a
                    key={`final-pdf-${index}`}
                    href={item.final_print_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-purple-200 bg-purple-50 px-2.5 text-xs text-purple-700 hover:bg-purple-100"
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
                    className="h-9 w-full justify-center bg-white px-2.5 text-xs"
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
              <div className="flex items-center text-xs text-gray-500">
                <FileText className="h-3 w-3 mr-1" />
                No files
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-admin-action-group>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Actions</div>
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              <div className="w-full">
                <OrderDetails
                  order={order}
                  onUploadFinalPdf={onUploadFinalPdf}
                  adminCustomerEditor={<EditCustomerInfoDialog order={order} onUpdated={onCustomerInfoUpdated} />}
                  trigger={
                    <Button size="sm" className="h-9 w-full text-xs">
                      <Eye className="h-3 w-3 mr-1" />
                      View Order
                    </Button>
                  }
                />
              </div>
              <EditCustomerInfoDialog order={order} onUpdated={onCustomerInfoUpdated} compact />

              {order.status === 'paid' && !order.production_email_sent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkInProduction}
                  disabled={isMarkingProduction}
                  className="h-9 w-full border-yellow-400 text-xs text-yellow-700 hover:bg-yellow-50"
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

              <AdminRefundOrderAction order={order} onRefunded={onOrderRefunded} fullWidth />

            </div>
            <ReviewRequestAction order={order} onSent={onReviewRequestSent} fullWidth />

            {order.status === 'in_production' && order.production_email_sent_at && (
              <div className="text-xs text-yellow-700 flex items-center">
                <Package className="h-3 w-3 mr-1" />
                In Production {new Date(order.production_email_sent_at).toLocaleDateString()}
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>
      <Dialog open={Boolean(activePreview)} onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}>
        {activePreview && (
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-4 sm:p-6">
            <DialogHeader className="pr-8 text-left">
              <div>
                <Badge className={`${getProductBadgeClass(getProductTypeLabel(activePreview.item))} border text-xs font-bold`}>
                  {getProductTitleLabel(activePreview.item)}
                </Badge>
              </div>
              <DialogTitle>{getProductTitleLabel(activePreview.item)} Preview</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1 text-sm text-gray-600">
                  <div>{getItemSizeLabel(activePreview.item)}</div>
                  <div>Qty {activePreview.item.quantity || 0}</div>
                  <div>{getItemMaterialLabel(activePreview.item)}</div>
                  {getOptionRows(activePreview.item).map((row) => (
                    <div key={row.label}><span className="font-semibold">{row.label}:</span> {row.value}</div>
                  ))}
                </div>
              </DialogDescription>
            </DialogHeader>
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
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};


// Mobile Card Component for Orders
interface AdminOrderCardProps {
  order: Order;
  onTrackingUpdated: (orderId: string, update: Partial<Order>) => void;
  onFileDownload: (fileKey: string, orderId: string, itemIndex: number, originalFilename?: string) => Promise<void>;
  onPdfDownload: (item: any, itemIndex: number, orderId: string) => void;
  onMarkInProduction: (orderId: string) => void;
  onOrderRefunded: (updatedOrder: Order) => void;
  onUploadFinalPdf?: (orderId: string, itemIndex: number, file: File) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getItemsSummary: (order: Order) => string;
  pdfLoadingStates: Record<string, boolean>;
  fileLoadingStates: Record<string, boolean>;
  onCustomerInfoUpdated: (order: Order) => void;
  onReviewRequestSent: (orderId: string, update: { sentAt: string; customerEmail: string }) => void;
  onLoadDetails: (orderId: string) => Promise<void>;
  detailLoading: boolean;
}

const AdminOrderCard: React.FC<AdminOrderCardProps> = ({
  order,
  onTrackingUpdated,
  onFileDownload,
  onPdfDownload,
  onMarkInProduction,
  onOrderRefunded,
  onUploadFinalPdf,
  getStatusColor,
  getStatusLabel,
  getItemsSummary,
  pdfLoadingStates,
  fileLoadingStates,
  onCustomerInfoUpdated,
  onReviewRequestSent,
  onLoadDetails,
  detailLoading,
}) => {
  const [isMarkingProduction, setIsMarkingProduction] = useState(false);
  const orderItems = getSafeOrderItems(order);
  const detailRequired = order.admin_detail_loaded === false;
  const totalItemCount = Math.max(orderItems.length, Number(order.item_count || 0));
  const originalFiles = getOriginalFileEntries(orderItems);

  const handleMarkInProduction = async () => {
    setIsMarkingProduction(true);
    try {
      await onMarkInProduction(order.id);
    } finally {
      setIsMarkingProduction(false);
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
              {detailRequired ? (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  Showing {orderItems.length} of {totalItemCount} line items. Open the full order for exact units and files.
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600"><span>Total units: <b>{getTotalUnits(order)}</b></span><span>Line items: <b>{orderItems.length}</b></span><span>Print files: <b>{getPrintFileCount({ ...order, items: orderItems } as Order)}</b></span></div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-lg font-bold text-[#18448D]">{usd(getDisplayOrderTotalCents(order as any) / 100)}</div>
            {detailRequired ? (
              <div className="text-xs font-medium text-amber-700">Open the full order for exact cost, profit, and margin.</div>
            ) : (() => { const profit = estimateOrderProfit(order); return profit.needsReview ? (<div className="inline-flex rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Needs review</div>) : (<div className="text-xs text-slate-700">Rev {usd(profit.originalSubtotalCents/100)}{profit.discountsAppliedCents>0 ? ` · Disc -${usd(profit.discountsAppliedCents/100)}` : ''}{profit.adjustedRetailSubtotalCents !== profit.originalSubtotalCents ? ` · Adj ${usd(profit.adjustedRetailSubtotalCents/100)}` : ''} · Prod {usd(profit.productionCostCents/100)} · Ship {usd(profit.shippingCostCents/100)} · Total Cost {usd(profit.totalCostCents/100)} · <span className={`${profit.netProfitCents>=0?'text-green-700':'text-red-700'} font-semibold`}>Profit {usd(profit.netProfitCents/100)}</span> · <span className={`${profit.marginPct >= 50 ? 'text-green-700' : profit.marginPct >= 35 ? 'text-amber-700' : 'text-red-700'} font-semibold`}>Margin {profit.marginPct.toFixed(1)}%</span></div>); })()}
            </div>
          </div>
        </div>
      </div>

      {detailRequired ? (
        <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">Full order details required</div>
          <div className="text-xs text-amber-800">
            Load all {totalItemCount} line items and package tracking before using files or order actions.
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => void onLoadDetails(order.id)}
            disabled={detailLoading}
          >
            {detailLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {detailLoading ? 'Loading full order...' : 'Load files & actions'}
          </Button>
        </div>
      ) : (
      <>
      <div className="mt-3" data-admin-tracking-group>
        <AdminTrackingManager order={order} instanceSuffix="mobile" onUpdated={(update) => onTrackingUpdated(order.id, update)} />
      </div>

      {(originalFiles.length > 0 || getFilesWithDownload().length > 0 || orderItems.some(item => item.final_print_pdf_url)) && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3" data-admin-file-group>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Order Files</div>
          <div className="grid grid-cols-1 gap-2">
            {originalFiles.map(({ item, index, selection }) => {
              const loadingKey = `${order.id}-${index}`;
              const loading = Boolean(fileLoadingStates[loadingKey]);
              return (
                <Button
                  key={`original-${index}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onFileDownload(selection.url, order.id, index, getOriginalFilename(item))}
                  disabled={loading}
                  className="h-9 w-full justify-center border-blue-200 bg-white px-3 text-xs text-[#18448D] hover:bg-blue-50"
                  data-admin-original-file
                >
                  {loading ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Downloading...</>
                  ) : (
                    <><Download className="mr-1.5 h-3.5 w-3.5" />{originalFiles.length > 1 ? `Original File ${index + 1}` : 'Original File'}</>
                  )}
                </Button>
              );
            })}
            {orderItems
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.final_print_pdf_url)
              .map(({ item, index }) => (
                <a
                  key={`final-pdf-${index}`}
                  href={item.final_print_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-purple-200 bg-purple-50 px-3 text-xs font-medium text-purple-700 hover:bg-purple-100 hover:text-purple-900"
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
                className="h-9 w-full justify-center bg-white px-3 text-xs"
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

      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-admin-action-group>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Order Actions</div>
        <OrderDetails
          order={order}
          onUploadFinalPdf={onUploadFinalPdf}
          adminCustomerEditor={<EditCustomerInfoDialog order={order} onUpdated={onCustomerInfoUpdated} />}
          trigger={
            <Button size="sm" className="h-9 w-full text-xs">
              <Eye className="h-3 w-3 mr-1" />
              View Order
            </Button>
          }
        />
        <EditCustomerInfoDialog order={order} onUpdated={onCustomerInfoUpdated} compact />

        {order.status === 'paid' && !order.production_email_sent && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkInProduction}
            disabled={isMarkingProduction}
            className="h-9 w-full border-yellow-400 text-xs text-yellow-700 hover:bg-yellow-50"
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

        <AdminRefundOrderAction order={order} onRefunded={onOrderRefunded} fullWidth />

        <ReviewRequestAction order={order} onSent={onReviewRequestSent} fullWidth />
        {order.customer_info_admin_updated_at && <Badge className="w-full justify-center bg-indigo-100 text-indigo-800">Customer info updated by Admin</Badge>}
      </div>
      </>
      )}
    </div>
  );
};


export default AdminOrders;
