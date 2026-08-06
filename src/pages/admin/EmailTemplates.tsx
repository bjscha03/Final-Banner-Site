import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Save,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';
import { buildTradeShowEmail } from '@/lib/tradeShows/tradeShowEmail.mjs';

interface EventSummary {
  slug: string;
  name: string;
  shortName: string;
  startDate: string;
  endDate: string;
  dateRange: string;
  city: string;
  state: string;
  landingPagePath: string;
  landingPageUrl: string;
  discountCode: string | null;
  discountPercentage: number;
  emailTemplateStatus: 'Ready' | 'Inactive';
}

interface SendHistory {
  id: string;
  exhibitor_name: string;
  recipient_email: string;
  subject: string;
  discount_code: string;
  sending_admin_email: string | null;
  resend_message_id: string | null;
  status: 'processing' | 'sent' | 'error' | 'unsubscribed' | 'complained' | 'bounced' | 'suppressed';
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  unsubscribed_at: string | null;
  complained_at: string | null;
}

const endpoint = '/.netlify/functions/admin-trade-show-emails';

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function StatusBadge({ status }: { status: EventSummary['emailTemplateStatus'] }) {
  return status === 'Ready'
    ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ready</Badge>
    : <Badge variant="secondary">Inactive</Badge>;
}

function SendStatusBadge({ status }: { status: SendHistory['status'] }) {
  if (status === 'sent') return <Badge className="bg-emerald-100 text-emerald-800">Sent</Badge>;
  if (status === 'unsubscribed') return <Badge className="bg-amber-100 text-amber-900">Unsubscribed</Badge>;
  if (status === 'complained') return <Badge className="bg-red-100 font-black text-red-900">Spam complaint</Badge>;
  if (status === 'bounced') return <Badge className="bg-red-100 text-red-900">Bounced</Badge>;
  if (status === 'suppressed') return <Badge className="bg-red-100 text-red-900">Suppressed</Badge>;
  if (status === 'error') return <Badge className="bg-red-100 text-red-800">Error</Badge>;
  return <Badge variant="secondary">Processing</Badge>;
}

function TemplateList({ events, loading, error }: { events: EventSummary[]; loading: boolean; error: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => [event.name, event.city, event.state, event.discountCode, event.dateRange]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [events, query]);

  return (
    <Layout>
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Mail className="h-8 w-8 text-[#18448D]" />
                <h1 className="text-3xl font-black text-slate-950">Email Templates</h1>
              </div>
              <p className="mt-2 text-slate-600">Send personalized exhibitor emails for every trade show on the website.</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/admin/orders')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
            </Button>
          </div>

          <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by show, city, state, date, or discount code"
                className="pl-9"
              />
            </div>
          </section>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center rounded-2xl bg-white p-16 text-slate-600 ring-1 ring-slate-200">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading templates…
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="hidden grid-cols-[minmax(280px,1.5fr)_170px_150px_140px_100px] gap-4 border-b border-slate-200 bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 lg:grid">
                <span>Trade show</span><span>Dates</span><span>Location</span><span>Discount</span><span>Status</span>
              </div>
              {visible.map((event) => (
                <button
                  key={event.slug}
                  type="button"
                  onClick={() => navigate(`/admin/email-templates/${event.slug}`)}
                  className="grid w-full gap-3 border-b border-slate-100 px-5 py-5 text-left transition hover:bg-blue-50 lg:grid-cols-[minmax(280px,1.5fr)_170px_150px_140px_100px] lg:items-center lg:gap-4"
                >
                  <div>
                    <div className="font-black text-slate-950">{event.name}</div>
                    <div className="mt-1 truncate text-xs text-[#18448D]">{event.landingPageUrl}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4 lg:hidden" />{event.dateRange}</div>
                  <div className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 lg:hidden" />{event.city}, {event.state}</div>
                  <div><code className="rounded-md bg-orange-50 px-2 py-1 font-black text-[#b74600]">{event.discountCode || 'Not set'}</code></div>
                  <div><StatusBadge status={event.emailTemplateStatus} /></div>
                </button>
              ))}
              {!visible.length && <p className="p-12 text-center text-slate-500">No trade shows match your search.</p>}
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}

function TemplateDetail({ event, history, reload }: { event: EventSummary; history: SendHistory[]; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const [exhibitorName, setExhibitorName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [discountCode, setDiscountCode] = useState(event.discountCode || '');
  const [sending, setSending] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => setDiscountCode(event.discountCode || ''), [event.discountCode]);
  const previewName = exhibitorName.trim() || 'Exhibitor Name';
  const preview = useMemo(() => buildTradeShowEmail({
    event,
    exhibitorName: previewName,
    discountCode: event.discountCode || discountCode || '20OFF',
  }), [discountCode, event, previewName]);

  const validName = exhibitorName.trim().length >= 2;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailAddress.trim());

  const saveCode = async () => {
    setSavingCode(true);
    setNotice(null);
    try {
      const response = await adminFetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: event.slug, code: discountCode }),
      });
      await readResponse(response);
      await reload();
      setNotice({ type: 'success', message: `Discount code updated to ${discountCode.trim().toUpperCase()}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not update the discount code.' });
    } finally {
      setSavingCode(false);
    }
  };

  const sendEmail = async () => {
    if (!validName || !validEmail || sending) return;
    setSending(true);
    setNotice(null);
    const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const response = await adminFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
        body: JSON.stringify({ slug: event.slug, exhibitorName, email: emailAddress, idempotencyKey: key }),
      });
      const payload = await readResponse(response);
      setNotice({ type: 'success', message: `Email sent to ${emailAddress.trim().toLowerCase()}. Resend ID: ${payload.messageId}` });
      setExhibitorName('');
      setEmailAddress('');
      await reload();
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'The email could not be sent.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Button variant="ghost" className="mb-4 -ml-3" onClick={() => navigate('/admin/email-templates')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> All Email Templates
          </Button>

          <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#0f2d5c] to-[#18448D] p-6 text-white shadow-lg">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-blue-100"><ShieldCheck className="h-4 w-4" /> Admin email template</div>
                <h1 className="text-2xl font-black sm:text-3xl">{event.name}</h1>
                <p className="mt-2 text-blue-100">{event.dateRange} · {event.city}, {event.state}</p>
              </div>
              <a href={event.landingPageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 font-semibold text-white ring-1 ring-white/30 hover:bg-white/20">
                Open Planning Page <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {notice && (
            <div role="alert" className={`mb-5 flex items-start gap-3 rounded-xl border p-4 font-semibold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
              {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
              <span>{notice.message}</span>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <div>
                <h2 className="text-xl font-black text-slate-950">Personalize and send</h2>
                <p className="mt-1 text-sm text-slate-600">An email is sent only when you deliberately click the send button.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exhibitor-name">Exhibitor/Customer Name</Label>
                <Input id="exhibitor-name" value={exhibitorName} onChange={(e) => setExhibitorName(e.target.value)} maxLength={160} placeholder="Acme Apparel" autoComplete="organization" />
                {exhibitorName && !validName && <p className="text-xs font-semibold text-red-700">Enter at least two characters.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient-email">Email Address</Label>
                <Input id="recipient-email" type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} maxLength={254} placeholder="buyer@example.com" autoComplete="email" />
                {emailAddress && !validEmail && <p className="text-xs font-semibold text-red-700">Enter a valid email address.</p>}
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <Label htmlFor="discount-code" className="text-[#8f3700]">Trade Show Discount Code</Label>
                <div className="mt-2 flex gap-2">
                  <Input id="discount-code" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} maxLength={24} className="bg-white font-black tracking-wide" />
                  <Button variant="outline" onClick={saveCode} disabled={savingCode || discountCode.trim().toUpperCase() === event.discountCode}>
                    {savingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="sr-only sm:not-sr-only sm:ml-2">Save</span>
                  </Button>
                </div>
                <p className="mt-2 text-xs text-[#8f3700]">Provides 20% off and uses the existing best-discount-wins rule.</p>
              </div>
              <Button className="h-12 w-full bg-[#ff6a00] text-base font-black text-white hover:bg-[#df5900]" onClick={sendEmail} disabled={!validName || !validEmail || sending || event.emailTemplateStatus !== 'Ready'}>
                {sending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending…</> : <><Send className="mr-2 h-5 w-5" /> Send Email Template</>}
              </Button>
            </section>

            <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Subject preview</p>
                <p className="mt-1 break-words text-lg font-black text-slate-950">{preview.subject}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <iframe title="Personalized email body preview" srcDoc={preview.html} sandbox="" className="h-[720px] w-full bg-white" />
              </div>
            </section>
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-black text-slate-950">Recent Send History</h2></div>
            <div className="divide-y divide-slate-100">
              {history.map((item) => (
                <div key={item.id} className="grid gap-2 px-5 py-4 text-sm lg:grid-cols-[1fr_1.1fr_130px_180px] lg:items-center">
                  <div><p className="font-bold text-slate-900">{item.exhibitor_name}</p><p className="text-slate-500">{item.recipient_email}</p></div>
                  <p className="truncate text-slate-600" title={item.subject}>{item.subject}</p>
                  <div><SendStatusBadge status={item.status} /></div>
                  <div className="text-xs text-slate-500"><p>{new Date(item.created_at).toLocaleString()}</p>{item.resend_message_id && <p className="truncate" title={item.resend_message_id}>ID: {item.resend_message_id}</p>}{item.error_message && <p className="text-red-700">{item.error_message}</p>}</div>
                </div>
              ))}
              {!history.length && <p className="p-8 text-center text-slate-500">No emails have been sent for this event.</p>}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}

export default function AdminEmailTemplates() {
  const { slug } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [history, setHistory] = useState<SendHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user || !isAdmin(user)) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch(slug ? `${endpoint}?slug=${encodeURIComponent(slug)}` : endpoint);
      const payload = await readResponse(response);
      if (slug) {
        setSelectedEvent(payload.event);
        setHistory(payload.history || []);
      } else {
        setEvents(payload.events || []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load email templates.');
    } finally {
      setLoading(false);
    }
  }, [slug, user]);

  useEffect(() => { if (!authLoading && user && isAdmin(user)) void load(); }, [authLoading, load, user]);
  if (authLoading) return <Layout><div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#18448D]" /></div></Layout>;
  if (!user || !isAdmin(user)) return <Navigate to="/admin/setup" replace />;
  if (!slug) return <TemplateList events={events} loading={loading} error={error} />;
  if (loading && !selectedEvent) return <Layout><div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#18448D]" /></div></Layout>;
  if (error || !selectedEvent) return <Layout><main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 font-semibold text-red-800">{error || 'Trade show template not found.'}</div></main></Layout>;
  return <TemplateDetail event={selectedEvent} history={history} reload={load} />;
}
