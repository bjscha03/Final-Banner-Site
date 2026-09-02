import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Clock3,
  Download,
  Loader2,
  MailCheck,
  MailX,
  Repeat2,
  Search,
  Send,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';
import { buildCustomerCsv } from '@/lib/admin-customer-csv';
import {
  adminCustomerSegmentUrlValue,
  resolveAdminCustomerSegment,
  type AdminCustomerSegment as Segment,
  withAdminCustomerSegment,
} from '@/lib/admin-customer-segment';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Period = 'all_time' | 'this_month' | 'last_month' | 'custom';

type CustomerOrder = {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  status: string;
  totalCents: number;
  completed: boolean;
};

type Customer = {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  completedOrderCount: number;
  lifetimeRevenueCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  periodOrderCount: number;
  periodRevenueCents: number;
  segment: 'first_time' | 'repeat' | 'no_completed_order';
  isLapsed: boolean;
  marketingEligible: boolean;
  suppressionReason: string;
  suppressionReasons: string[];
  septemberDealStatus: 'not_sent' | 'processing' | 'sent' | 'error' | 'unsubscribed' | 'complained' | 'bounced' | 'suppressed';
  septemberDealSentAt: string | null;
  septemberDealUpdatedAt: string | null;
};

type FilteredSummary = {
  total: number;
  marketingEligible: number;
  marketingExcluded: number;
  lifetimeRevenueCents: number;
  periodRevenueCents: number;
};

type ListPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type CustomerResponse = {
  ok: boolean;
  error?: string;
  customers: Customer[];
  stats: {
    all: number;
    firstTime: number;
    repeat: number;
    lapsed: number;
    marketingEligible: number;
    marketingExcluded: number;
    lifetimeRevenueCents: number;
    periodRevenueCents: number;
  };
  filteredSummary: FilteredSummary;
  exportSummary: {
    eligible: number;
    excluded: number;
    suppressionDataComplete: boolean;
    unavailableSources: string[];
  };
  pagination: ListPagination;
};

type CustomerDetailResponse = {
  ok: boolean;
  error?: string;
  customer: Pick<Customer, 'email' | 'marketingEligible' | 'suppressionReason' | 'suppressionReasons' | 'septemberDealStatus' | 'septemberDealSentAt' | 'septemberDealUpdatedAt'>;
  orders: CustomerOrder[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean };
};

type CustomerExportResponse = {
  ok: boolean;
  error?: string;
  customers: Customer[];
  pagination: { pageSize: number; nextCursor: string | null; hasMore: boolean };
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const formatMoney = (cents: number) => money.format((Number(cents) || 0) / 100);
const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : '—';
const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  : '—';

const utcDateInput = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const displaySuppressionReason = (reason: string) => reason
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const customerLabel = (customer: Customer) => customer.fullName || customer.email;

const CustomerSegmentBadges = ({ customer }: { customer: Customer }) => (
  <div className="flex flex-wrap gap-1.5">
    {customer.segment === 'repeat' && <Badge className="bg-[#18448D] text-white">Repeat</Badge>}
    {customer.segment === 'first_time' && <Badge variant="secondary">New customer</Badge>}
    {customer.segment === 'no_completed_order' && <Badge variant="outline">No completed order</Badge>}
    {customer.isLapsed && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Lapsed</Badge>}
  </div>
);

const MarketingBadge = ({ customer }: { customer: Customer }) => customer.marketingEligible ? (
  <Badge className="gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
    <MailCheck className="h-3 w-3" /> Eligible
  </Badge>
) : (
  <Badge className="gap-1 bg-rose-100 text-rose-900 hover:bg-rose-100">
    <MailX className="h-3 w-3" /> Suppressed
  </Badge>
);

const DetailStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-black text-slate-900">{value}</p>
  </div>
);

const SeptemberDealAction = ({
  customer,
  sending,
  onSend,
}: {
  customer: Customer;
  sending: boolean;
  onSend: (customer: Customer) => void;
}) => {
  const sent = customer.septemberDealStatus === 'sent';
  const processing = sending || customer.septemberDealStatus === 'processing';
  const blocked = !customer.marketingEligible
    || ['unsubscribed', 'complained', 'bounced', 'suppressed'].includes(customer.septemberDealStatus);
  return (
    <div className="min-w-[150px]">
      <Button
        type="button"
        size="sm"
        variant={sent || blocked ? 'outline' : 'default'}
        disabled={sent || processing || blocked}
        onClick={() => onSend(customer)}
        className={sent
          ? 'w-full border-emerald-300 bg-emerald-50 text-emerald-800 disabled:opacity-100'
          : blocked
            ? 'w-full disabled:opacity-70'
            : 'w-full bg-[#ff5a1f] font-extrabold text-white hover:bg-[#e94d12]'}
      >
        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : sent ? <MailCheck className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
        {sent ? 'Sept Deal Sent' : processing ? 'Sending…' : blocked ? 'Promo blocked' : customer.septemberDealStatus === 'error' ? 'Retry Sept Deal' : 'Send Sept Deal'}
      </Button>
      {sent && customer.septemberDealSentAt && (
        <p className="mt-1 text-center text-[11px] font-medium text-emerald-800">{formatDateTime(customer.septemberDealSentAt)}</p>
      )}
    </div>
  );
};

const emptyStats: CustomerResponse['stats'] = {
  all: 0,
  firstTime: 0,
  repeat: 0,
  lapsed: 0,
  marketingEligible: 0,
  marketingExcluded: 0,
  lifetimeRevenueCents: 0,
  periodRevenueCents: 0,
};

const emptyFilteredSummary: FilteredSummary = {
  total: 0,
  marketingEligible: 0,
  marketingExcluded: 0,
  lifetimeRevenueCents: 0,
  periodRevenueCents: 0,
};

const emptyPagination: ListPagination = {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

const AdminCustomers: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const today = useMemo(() => new Date(), []);
  const rawSegment = searchParams.get('segment');
  const segment = resolveAdminCustomerSegment(rawSegment);
  const [period, setPeriod] = useState<Period>('all_time');
  const [lapsedDays, setLapsedDays] = useState('180');
  const [startDate, setStartDate] = useState(utcDateInput(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))));
  const [endDate, setEndDate] = useState(utcDateInput(today));
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerResponse['stats']>(emptyStats);
  const [filteredSummary, setFilteredSummary] = useState<FilteredSummary>(emptyFilteredSummary);
  const [pagination, setPagination] = useState<ListPagination>(emptyPagination);
  const [exportSummary, setExportSummary] = useState<CustomerResponse['exportSummary']>({
    eligible: 0,
    excluded: 0,
    suppressionDataComplete: true,
    unavailableSources: [],
  });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOrders, setDetailOrders] = useState<CustomerOrder[]>([]);
  const [detailPagination, setDetailPagination] = useState<CustomerDetailResponse['pagination'] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [sendingEmails, setSendingEmails] = useState<Set<string>>(() => new Set());
  const previousSegment = useRef(segment);

  const selectSegment = useCallback((nextSegment: Segment) => {
    setPage(1);
    setSearchParams(withAdminCustomerSegment(searchParams, nextSegment));
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const canonicalValue = adminCustomerSegmentUrlValue(segment);
    const normalizedRaw = String(rawSegment || '').trim().toLowerCase();
    if (normalizedRaw === (canonicalValue || '')) return;
    setSearchParams(withAdminCustomerSegment(searchParams, segment), { replace: true });
  }, [rawSegment, searchParams, segment, setSearchParams]);

  useEffect(() => {
    if (previousSegment.current === segment) return;
    previousSegment.current = segment;
    setPage(1);
  }, [segment]);

  const customerFilterQueryString = useMemo(() => {
    const params = new URLSearchParams({
      segment,
      period,
      lapsed_days: lapsedDays,
    });
    if (appliedQuery) params.set('q', appliedQuery);
    if (period === 'custom') {
      params.set('start', startDate);
      params.set('end', endDate);
    }
    return params.toString();
  }, [appliedQuery, endDate, lapsedDays, period, segment, startDate]);

  const customerQueryString = useMemo(() => {
    const params = new URLSearchParams(customerFilterQueryString);
    params.set('page', String(page));
    params.set('page_size', '50');
    return params.toString();
  }, [customerFilterQueryString, page]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) navigate('/admin/setup', { replace: true });
  }, [authLoading, navigate, user]);

  const loadCustomers = useCallback(async () => {
    const requestId = ++listRequestId.current;
    if (!user || !isAdmin(user)) return;
    if (period === 'custom' && (!startDate || !endDate)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const response = await adminFetch(`/.netlify/functions/admin-customers?${customerQueryString}`, {
        cache: 'no-store',
      });
      const data = await response.json() as CustomerResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load customers');
      if (requestId !== listRequestId.current) return;
      setCustomers(data.customers || []);
      setStats(data.stats || emptyStats);
      setFilteredSummary(data.filteredSummary || emptyFilteredSummary);
      setPagination(data.pagination || emptyPagination);
      if (data.pagination?.page && data.pagination.page !== page) setPage(data.pagination.page);
      setExportSummary(data.exportSummary || {
        eligible: 0,
        excluded: 0,
        suppressionDataComplete: true,
        unavailableSources: [],
      });
    } catch (error) {
      if (requestId !== listRequestId.current) return;
      const message = error instanceof Error ? error.message : 'Please try again.';
      setLoadError(message);
      setCustomers([]);
      setFilteredSummary(emptyFilteredSummary);
      setPagination(emptyPagination);
      toast({ title: 'Unable to load customers', description: message, variant: 'destructive' });
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [customerQueryString, endDate, page, period, startDate, toast, user]);

  useEffect(() => {
    void loadCustomers();
    return () => { listRequestId.current += 1; };
  }, [loadCustomers]);

  const loadCustomerHistory = useCallback(async (customer: Customer, orderPage = 1, append = false) => {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const params = new URLSearchParams({
        mode: 'detail',
        email: customer.email,
        order_page: String(orderPage),
        order_page_size: '50',
      });
      const response = await adminFetch(`/.netlify/functions/admin-customers?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json() as CustomerDetailResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load customer history');
      if (requestId !== detailRequestId.current) return;
      setDetailOrders((current) => append ? [...current, ...(data.orders || [])] : (data.orders || []));
      setDetailPagination(data.pagination);
      setSelectedCustomer((current) => current?.email === customer.email
        ? { ...current, ...data.customer }
        : current);
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setDetailError(error instanceof Error ? error.message : 'Customer history is unavailable.');
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  const openCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailOrders([]);
    setDetailPagination(null);
    setDetailError(null);
    void loadCustomerHistory(customer, 1, false);
  }, [loadCustomerHistory]);

  const updateSeptemberDealState = useCallback((email: string, status: Customer['septemberDealStatus'], sentAt: string | null = null) => {
    const update = (customer: Customer) => customer.email === email
      ? {
          ...customer,
          septemberDealStatus: status,
          septemberDealSentAt: sentAt ?? customer.septemberDealSentAt,
          septemberDealUpdatedAt: new Date().toISOString(),
        }
      : customer;
    setCustomers((current) => current.map(update));
    setSelectedCustomer((current) => current ? update(current) : current);
  }, []);

  const sendSeptemberDeal = useCallback(async (customer: Customer) => {
    const email = customer.email;
    setSendTarget(null);
    setSendingEmails((current) => new Set(current).add(email));
    updateSeptemberDealState(email, 'processing');
    const requestKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '_')
      : `sept_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    try {
      const response = await adminFetch('/.netlify/functions/admin-send-september-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': requestKey },
        body: JSON.stringify({ email, customerName: customer.fullName || customer.firstName || email }),
        cache: 'no-store',
      });
      const data = await response.json() as {
        ok?: boolean; error?: string; status?: Customer['septemberDealStatus']; sentAt?: string | null; duplicate?: boolean;
      };
      if (!response.ok || !data.ok) {
        updateSeptemberDealState(email, data.status === 'processing' ? 'processing' : 'error');
        throw new Error(data.error || 'The September deal email could not be sent.');
      }
      updateSeptemberDealState(email, 'sent', data.sentAt || new Date().toISOString());
      toast({
        title: data.duplicate ? 'September deal already sent' : 'September deal sent',
        description: `${customerLabel(customer)} (${email}) received the 25% large-banner promotion.`,
      });
    } catch (error) {
      toast({
        title: 'September deal not sent',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmails((current) => {
        const next = new Set(current);
        next.delete(email);
        return next;
      });
    }
  }, [toast, updateSeptemberDealState]);

  const downloadCsv = async () => {
    setExporting(true);
    try {
      if (exportSummary.suppressionDataComplete !== true) {
        toast({
          title: 'Export blocked',
          description: 'Suppression verification is incomplete. Try again after all suppression sources are available.',
          variant: 'destructive',
        });
        return;
      }

      const records = new Map<string, Customer>();
      let cursor: string | null = null;
      let exportPages = 0;
      do {
        const params = new URLSearchParams(customerFilterQueryString);
        params.set('mode', 'export');
        params.set('page_size', '250');
        if (cursor) params.set('cursor', cursor);
        const response = await adminFetch(`/.netlify/functions/admin-customers?${params.toString()}`, { cache: 'no-store' });
        const data = await response.json() as CustomerExportResponse;
        if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load the next export batch');
        for (const customer of data.customers || []) records.set(customer.email, customer);
        const nextCursor = data.pagination?.nextCursor || null;
        if (nextCursor && nextCursor === cursor) throw new Error('Customer export did not advance safely');
        cursor = nextCursor;
        exportPages += 1;
        if (exportPages > 10_000) throw new Error('Customer export exceeded its safe page limit');
      } while (cursor);

      if (records.size === 0) {
        toast({
          title: 'No customers to export',
          description: 'No verified marketing-eligible customers match these filters.',
        });
        return;
      }

      // Re-check every selected address in bounded batches immediately before
      // creating the file. This catches opt-outs that arrived while earlier
      // export pages were being collected.
      const allRecords = Array.from(records.values());
      const verifiedEmails = new Set<string>();
      for (let offset = 0; offset < allRecords.length; offset += 250) {
        const emails = allRecords.slice(offset, offset + 250).map((customer) => customer.email);
        const response = await adminFetch('/.netlify/functions/admin-customers?mode=verify_export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails }),
          cache: 'no-store',
        });
        const data = await response.json() as { ok: boolean; error?: string; eligible?: string[] };
        if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to complete the final suppression check');
        for (const email of data.eligible || []) verifiedEmails.add(email);
      }

      const verifiedRecords = allRecords.filter((customer) => verifiedEmails.has(customer.email));
      const result = buildCustomerCsv(verifiedRecords, { marketingOnly: true });
      if (result.exported === 0) {
        toast({
          title: 'No customers to export',
          description: 'All matching customers became ineligible during the final suppression check.',
        });
        return;
      }
      const blob = new Blob(['\uFEFF', result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give Safari and other WebKit browsers time to start consuming the blob
      // before releasing it. Revoking synchronously can cancel the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast({
        title: `Exported ${result.exported} customer${result.exported === 1 ? '' : 's'}`,
        description: filteredSummary.marketingExcluded + (allRecords.length - verifiedRecords.length) > 0
          ? `${filteredSummary.marketingExcluded + (allRecords.length - verifiedRecords.length)} suppressed customer addresses were excluded.`
          : undefined,
      });
    } catch (error) {
      toast({
        title: 'Unable to export customers',
        description: error instanceof Error ? error.message : 'Suppression data could not be refreshed.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || (!user || !isAdmin(user))) {
    return <Layout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#18448D]" /></div></Layout>;
  }

  return (
    <Layout>
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <Shield className="h-7 w-7 text-[#18448D]" />
                <h1 className="text-3xl font-black text-slate-900">Customer Analytics</h1>
              </div>
              <p className="mt-1 text-slate-600">Segment customers, review lifetime history, and export suppression-aware lists.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/abandoned-carts')}>Abandoned Carts</Button>
              <Button variant="outline" onClick={() => navigate('/admin/orders')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Orders
              </Button>
            </div>
          </div>

          <section aria-label="Customer segments" className="mb-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="All customers" value={stats.all} icon={Users} active={segment === 'all'} onClick={() => selectSegment('all')} />
              <StatCard label="New customers" value={stats.firstTime} icon={UserPlus} active={segment === 'first_time'} onClick={() => selectSegment('first_time')} />
              <StatCard label="Repeat customers" value={stats.repeat} icon={Repeat2} active={segment === 'repeat'} onClick={() => selectSegment('repeat')} />
              <StatCard label={`Lapsed (${lapsedDays}d)`} value={stats.lapsed} icon={Clock3} active={segment === 'lapsed'} onClick={() => selectSegment('lapsed')} />
            </div>
            <p className="mt-2 text-sm text-slate-600" aria-live="polite">
              {segment === 'repeat'
                ? 'Showing repeat customers with at least two completed orders.'
                : segment === 'first_time'
                  ? 'Showing new customers with exactly one completed order.'
                  : segment === 'lapsed'
                    ? `Showing customers whose latest completed order was more than ${lapsedDays} days ago.`
                    : 'Showing all customers with settled order history.'}
            </p>
          </section>

          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_180px_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { setAppliedQuery(query.trim()); setPage(1); } }}
                  placeholder="Customer, email, or order number"
                  aria-label="Search customers"
                />
              </div>
              <Select value={period} onValueChange={(value) => { setPeriod(value as Period); setPage(1); }}>
                <SelectTrigger aria-label="Order period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All time</SelectItem>
                  <SelectItem value="this_month">This month (UTC)</SelectItem>
                  <SelectItem value="last_month">Last month (UTC)</SelectItem>
                  <SelectItem value="custom">Custom dates (UTC)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={lapsedDays} onValueChange={(value) => { setLapsedDays(value); setPage(1); }}>
                <SelectTrigger aria-label="Lapsed threshold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">Lapsed after 90 days</SelectItem>
                  <SelectItem value="180">Lapsed after 180 days</SelectItem>
                  <SelectItem value="365">Lapsed after 365 days</SelectItem>
                </SelectContent>
              </Select>
              <Select value={segment} onValueChange={(value) => selectSegment(value as Segment)}>
                <SelectTrigger aria-label="Customer segment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="first_time">New customers</SelectItem>
                  <SelectItem value="repeat">Repeat customers</SelectItem>
                  <SelectItem value="lapsed">Lapsed customers</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => { setAppliedQuery(query.trim()); setPage(1); }}>Apply</Button>
            </div>
            {period === 'custom' && (
              <div className="mt-3 grid gap-3 sm:max-w-lg sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Start date<Input className="mt-1" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label>
                <label className="text-sm font-semibold text-slate-700">End date<Input className="mt-1" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Order-period boundaries use UTC.</p>
          </section>

          <section className="mb-6 grid gap-3 md:grid-cols-3">
            <SummaryCard label="Revenue in selected period" value={formatMoney(filteredSummary.periodRevenueCents)} />
            <SummaryCard label="Marketing eligible" value={String(filteredSummary.marketingEligible)} tone="green" />
            <SummaryCard label="Suppressed / excluded" value={String(filteredSummary.marketingExcluded)} tone="red" />
          </section>

          <section className="mb-4 flex flex-col justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <MailCheck className="h-4 w-4 text-emerald-700" />
                Marketing-safe export
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {filteredSummary.marketingExcluded} suppressed {filteredSummary.marketingExcluded === 1 ? 'address is' : 'addresses are'} excluded from the current filtered export.
              </p>
              {!exportSummary.suppressionDataComplete && (
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  Suppression verification is incomplete, so unverified addresses are excluded by default.
                </p>
              )}
            </div>
            <Button onClick={() => void downloadCsv()} disabled={loading || exporting || filteredSummary.total === 0} className="bg-[#18448D] hover:bg-[#12366f]">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? 'Verifying…' : 'Export CSV'}
            </Button>
          </section>

          {loadError && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
              Unable to load customer analytics. {loadError}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#18448D]" /></div>
            ) : customers.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No customers match the selected filters.</div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Segment</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Lifetime revenue</TableHead>
                        <TableHead>First order</TableHead>
                        <TableHead>Last order</TableHead>
                        <TableHead>Marketing</TableHead>
                        <TableHead>September deal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow
                          key={customer.email}
                          tabIndex={0}
                          aria-haspopup="dialog"
                          aria-label={`View customer ${customerLabel(customer)}`}
                          className="cursor-pointer hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#18448D]"
                          onClick={() => openCustomer(customer)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openCustomer(customer);
                            }
                          }}
                        >
                          <TableCell><p className="font-bold text-slate-900">{customer.fullName || 'Name unavailable'}</p><p className="text-sm text-slate-500">{customer.email}</p></TableCell>
                          <TableCell><CustomerSegmentBadges customer={customer} /></TableCell>
                          <TableCell className="text-right font-bold">{customer.completedOrderCount}</TableCell>
                          <TableCell className="text-right font-bold">{formatMoney(customer.lifetimeRevenueCents)}</TableCell>
                          <TableCell>{formatDate(customer.firstOrderAt)}</TableCell>
                          <TableCell>{formatDate(customer.lastOrderAt)}</TableCell>
                          <TableCell><MarketingBadge customer={customer} /></TableCell>
                          <TableCell
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <SeptemberDealAction
                              customer={customer}
                              sending={sendingEmails.has(customer.email)}
                              onSend={setSendTarget}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="divide-y divide-slate-200 md:hidden">
                  {customers.map((customer) => (
                    <div key={customer.email} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="break-words font-black text-slate-900">{customer.fullName || customer.email}</p>{customer.fullName && <p className="break-all text-sm text-slate-500">{customer.email}</p>}</div>
                        <div className="shrink-0"><MarketingBadge customer={customer} /></div>
                      </div>
                      <div className="mt-3"><CustomerSegmentBadges customer={customer} /></div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <span><strong>{customer.completedOrderCount}</strong> completed orders</span>
                        <span className="text-right font-bold">{formatMoney(customer.lifetimeRevenueCents)}</span>
                        <span className="text-slate-500">First: {formatDate(customer.firstOrderAt)}</span>
                        <span className="text-right text-slate-500">Last: {formatDate(customer.lastOrderAt)}</span>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button type="button" variant="outline" className="w-full" onClick={() => openCustomer(customer)}>View customer</Button>
                        <SeptemberDealAction
                          customer={customer}
                          sending={sendingEmails.has(customer.email)}
                          onSend={setSendTarget}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} customers
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading || !pagination.hasPrevious}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading || !pagination.hasNext}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <Dialog
        open={Boolean(selectedCustomer)}
        onOpenChange={(open) => {
          if (open) return;
          detailRequestId.current += 1;
          setSelectedCustomer(null);
          setDetailOrders([]);
          setDetailPagination(null);
          setDetailError(null);
          setDetailLoading(false);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle>{customerLabel(selectedCustomer)}</DialogTitle>
                <DialogDescription>{selectedCustomer.email}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailStat label="Completed orders" value={String(selectedCustomer.completedOrderCount)} />
                <DetailStat label="Lifetime revenue" value={formatMoney(selectedCustomer.lifetimeRevenueCents)} />
                <DetailStat label="First order" value={formatDate(selectedCustomer.firstOrderAt)} />
                <DetailStat label="Last order" value={formatDate(selectedCustomer.lastOrderAt)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <CustomerSegmentBadges customer={selectedCustomer} />
                <MarketingBadge customer={selectedCustomer} />
                {!selectedCustomer.marketingEligible && <span className="text-sm text-slate-600">{selectedCustomer.suppressionReasons.map(displaySuppressionReason).join(', ')}</span>}
                <div className="ml-auto">
                  <SeptemberDealAction
                    customer={selectedCustomer}
                    sending={sendingEmails.has(selectedCustomer.email)}
                    onSend={setSendTarget}
                  />
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-base font-black text-slate-900">Order history</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  {detailLoading && detailOrders.length === 0 ? (
                    <div className="flex min-h-36 items-center justify-center" aria-label="Loading customer order history">
                      <Loader2 className="h-6 w-6 animate-spin text-[#18448D]" />
                    </div>
                  ) : detailOrders.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No order history is available for this customer.</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {detailOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-xs font-semibold">{order.orderNumber}</TableCell>
                            <TableCell>{formatDate(order.createdAt)}</TableCell>
                            <TableCell><Badge variant={order.completed ? 'secondary' : 'outline'}>{displaySuppressionReason(order.status)}</Badge></TableCell>
                            <TableCell className="text-right font-semibold">{formatMoney(order.totalCents)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {detailError && (
                  <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {detailError}
                  </div>
                )}
                {detailPagination?.hasMore && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Loaded {detailOrders.length} of {detailPagination.total} orders.</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={detailLoading}
                      onClick={() => void loadCustomerHistory(selectedCustomer, detailPagination.page + 1, true)}
                    >
                      {detailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load more orders
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">Lifetime revenue and completed-order counts exclude test, unpaid, failed, and refunded orders.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(sendTarget)} onOpenChange={(open) => { if (!open) setSendTarget(null); }}>
        <AlertDialogContent>
          {sendTarget && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Send September 25% promotion?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3 text-left">
                  <span className="block">Confirming will immediately send the finished September large-banner promotion through the live email system.</span>
                  <span className="block rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                    <strong className="block">{customerLabel(sendTarget)}</strong>
                    <span className="break-all">{sendTarget.email}</span>
                  </span>
                  <span className="block font-semibold text-slate-700">Offer: 25% off banners 6′ × 3′ or larger with code BIG25, valid through September 8.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#ff5a1f] font-extrabold text-white hover:bg-[#e94d12]"
                  onClick={() => void sendSeptemberDeal(sendTarget)}
                >
                  Send Sept Deal Now
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

const StatCard = ({ label, value, icon: Icon, active, onClick }: { label: string; value: number; icon: React.ElementType; active: boolean; onClick: () => void }) => (
  <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-2xl p-4 text-left shadow-sm ring-1 transition ${active ? 'bg-[#18448D] text-white ring-[#18448D]' : 'bg-white text-slate-900 ring-slate-200 hover:bg-blue-50'}`}>
    <div className="flex items-center justify-between"><span className="text-sm font-bold">{label}</span><Icon className="h-5 w-5" /></div>
    <p className="mt-2 text-3xl font-black">{value}</p>
  </button>
);

const SummaryCard = ({ label, value, tone = 'blue' }: { label: string; value: string; tone?: 'blue' | 'green' | 'red' }) => {
  const toneClass = tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-rose-700' : 'text-[#18448D]';
  return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-sm font-bold text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black ${toneClass}`}>{value}</p></div>;
};

export default AdminCustomers;
