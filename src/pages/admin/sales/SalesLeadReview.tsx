import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarSearch, CheckCircle2, ChevronLeft, ChevronRight,
  ExternalLink, Eye, LoaderCircle, Mail, RefreshCw, Send, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  getOutboundManualReviewLeads,
  sendOutboundReviewedLead,
  type OutboundManualReviewLead,
  type OutboundManualReviewQueue,
} from '@/lib/outboundSales';

const PAGE_SIZE = 50;
const VIEWS = [
  ['ready', 'Ready to Send'],
  ['sent', 'Sent'],
  ['all', 'All'],
] as const;
type View = typeof VIEWS[number][0];

function titleCase(value: string | null | undefined) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventBadge(lead: OutboundManualReviewLead) {
  if (lead.eventFit.priority === 'trade_show') return 'border-orange-300 bg-orange-50 text-orange-900';
  if (lead.eventFit.priority === 'event_signal') return 'border-sky-300 bg-sky-50 text-sky-900';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function reviewBadge(lead: OutboundManualReviewLead) {
  if (lead.review.sendState === 'sent') return <Badge className="bg-emerald-700 text-white">Sent</Badge>;
  if (lead.review.sendState === 'processing') return <Badge className="bg-sky-700 text-white">Sending</Badge>;
  if (lead.canSend) return <Badge className="bg-[#18448D] text-white">Ready to send</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Needs attention</Badge>;
}

function Score({ value }: { value: number | null }) {
  return (
    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-xl font-black text-emerald-800">
      {value ?? '—'}<span className="text-[9px] uppercase tracking-wider">fit score</span>
    </div>
  );
}

function LeadCard({
  lead, deliveryReady, sending, onSend,
}: {
  lead: OutboundManualReviewLead;
  deliveryReady: boolean;
  sending: boolean;
  onSend: (lead: OutboundManualReviewLead) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const sent = lead.review.sendState === 'sent';
  const sendReason = !deliveryReady
    ? 'Email delivery is not ready. Refresh after the listed configuration issue is fixed.'
    : lead.technicalBlockers[0] || '';

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <Score value={lead.leadScore} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-950">{lead.businessName}</h2>
              {reviewBadge(lead)}
              <Badge variant="outline" className={eventBadge(lead)}>
                <CalendarSearch className="mr-1 h-3 w-3" /> {lead.eventFit.label}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {lead.industry || lead.businessType || 'Industry not supplied'}</span>
              <span>{lead.canonicalDomain || 'No company domain'}</span>
              <span>{titleCase(lead.prospectStatus)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
              {lead.websiteUrl && <a href={lead.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[#18448D]"><ExternalLink className="h-3 w-3" /> Website</a>}
              {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[#18448D]"><ExternalLink className="h-3 w-3" /> Lead source</a>}
              <span className="text-slate-500">Imported via {titleCase(lead.sourceProviderId)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm xl:w-[360px]">
          <p className="font-black text-slate-900">Best contact</p>
          {lead.contact ? (
            <>
              <p className="mt-1 break-all font-bold text-[#18448D]">{lead.contact.email}</p>
              <p className="mt-1 text-xs text-slate-500">Quality {lead.contact.contactQualityScore}/100 · MX {titleCase(lead.contact.mxStatus)} · {titleCase(lead.contact.verificationStatus)}</p>
              {lead.contact.sourceUrl && <a href={lead.contact.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#18448D]"><ExternalLink className="h-3 w-3" /> Verify public source</a>}
            </>
          ) : <p className="mt-1 text-slate-500">No active business email.</p>}
        </div>
      </div>

      <div className="grid gap-4 border-y border-slate-200 bg-slate-50/70 p-5 lg:grid-cols-2">
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <h3 className="flex items-center gap-2 font-black text-orange-950"><CalendarSearch className="h-4 w-4" /> Event and trade-show evidence</h3>
          {lead.eventFit.evidence.length ? (
            <ul className="mt-3 space-y-2 text-sm text-orange-950">
              {lead.eventFit.evidence.map((item, index) => (
                <li key={`${item.code || item.label || 'signal'}-${index}`} className="rounded-lg bg-white/70 p-3">
                  <strong>{item.label || titleCase(item.code)}</strong>
                  {(item.evidence || item.detail) && <p className="mt-1 text-orange-900">{item.evidence || item.detail}</p>}
                  {(item.sourceUrl || item.sourceUrls?.[0]) && <a href={item.sourceUrl || item.sourceUrls?.[0]} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#18448D]"><ExternalLink className="h-3 w-3" /> Evidence source</a>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-orange-900">No direct upcoming-event evidence was captured. Treat this as a general high-value lead and verify manually.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-black text-slate-950"><Mail className="h-4 w-4 text-[#18448D]" /> New branded email</h3>
            {lead.message?.bodyHtml && <Button type="button" size="sm" variant="outline" onClick={() => setShowPreview((value) => !value)}><Eye className="mr-2 h-4 w-4" /> {showPreview ? 'Hide' : 'Preview'}</Button>}
          </div>
          {lead.message?.generationStatus === 'generated' ? (
            <>
              <p className="mt-3 text-sm"><strong>Subject:</strong> {lead.message.subject}</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{lead.message.bodyText}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">Send adds the 20% NEW20 offer, business address, footer unsubscribe link, and one-click unsubscribe header.</p>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The personalized email is not ready. Generate it from the Prospect Queue before sending.</div>
          )}
        </section>
      </div>

      {showPreview && lead.message?.bodyHtml && (
        <div className="border-b border-slate-200 bg-slate-100 p-4">
          <iframe title={`Email preview for ${lead.businessName}`} srcDoc={lead.message.bodyHtml} sandbox="" className="mx-auto h-[720px] w-full max-w-[720px] rounded-xl border border-slate-300 bg-white" />
        </div>
      )}

      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_390px]">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-black text-slate-950"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Automatic send checks</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">When you click Send, the system verifies the email domain and rechecks prior customers, previous sends, suppressions, email quality, and the daily limit before contacting anyone.</p>
        </section>

        <aside className={cn('rounded-xl border p-4', lead.canSend && deliveryReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
          <h3 className="font-black text-slate-950">Send this email</h3>
          <p className="mt-1 text-sm text-slate-600">One click sends the branded email to this contact. The opt-out link and one-click unsubscribe header are added automatically.</p>
          {lead.technicalBlockers.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs font-semibold text-amber-900">
              {lead.technicalBlockers.map((blocker) => <li key={blocker}><AlertTriangle className="mr-1 inline h-3 w-3" /> {blocker}</li>)}
            </ul>
          )}
          {lead.review.sendState === 'sent' ? (
            <div className="mt-4 rounded-lg bg-white p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Sent {lead.review.sentAt ? new Date(lead.review.sentAt).toLocaleString() : ''}</div>
          ) : (
            <Button type="button" onClick={() => onSend(lead)} disabled={!lead.canSend || !deliveryReady || sending} title={sendReason} className="mt-4 w-full bg-[#ff6b35] text-white hover:bg-[#e85a28]">
              {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {sending ? 'Sending…' : 'Send'}
            </Button>
          )}
          {sendReason && !sent && <p className="mt-2 text-xs font-semibold text-slate-500">{sendReason}</p>}
        </aside>
      </div>
    </article>
  );
}

export default function SalesLeadReview() {
  const { toast } = useToast();
  const [queue, setQueue] = useState<OutboundManualReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>('ready');
  const [sendingId, setSendingId] = useState('');

  const load = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    try {
      setQueue(await getOutboundManualReviewLeads({ limit: PAGE_SIZE, offset, minimumScore: 60, view, signal: controller.signal }));
    } catch (requestError) {
      if ((requestError as Error)?.name !== 'AbortError') setError(requestError instanceof Error ? requestError.message : 'Unable to load lead review.');
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [offset, view]);

  useEffect(() => { void load(); }, [load]);

  const visibleLeads = queue?.leads || [];

  const send = async (lead: OutboundManualReviewLead) => {
    setSendingId(lead.prospectId);
    try {
      const result = await sendOutboundReviewedLead(lead.prospectId);
      toast({ title: result.duplicate ? 'Already sent' : 'Email sent', description: `${lead.businessName} · ${lead.contact?.email}` });
      await load();
    } catch (requestError) {
      toast({ variant: 'destructive', title: 'Email not sent', description: requestError instanceof Error ? requestError.message : 'Resend could not send this email.' });
    } finally {
      setSendingId('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b2344] via-[#18448D] to-[#245ba8] p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-300"><Sparkles className="h-4 w-4" /> Event-first prospecting</div>
            <h1 className="mt-2 text-3xl font-black">Lead Review</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">High-value companies are ranked with direct trade-show, expo, conference, and upcoming-event evidence first. Review the company and email preview, then click Send.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.total ?? '—'}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Leads</div></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.today.sent ?? '—'}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Sent today</div></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.today.limit ?? 70}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Daily cap</div></div>
          </div>
        </div>
      </section>

      <section className={cn('rounded-xl border p-4 text-sm font-semibold', queue?.deliveryReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>
        {queue?.deliveryReady ? <><ShieldCheck className="mr-2 inline h-5 w-5" /> Resend delivery is ready. Every send includes a physical address, footer opt-out, one-click unsubscribe, suppression recheck, and duplicate protection.</> : <><AlertTriangle className="mr-2 inline h-5 w-5" /> Email delivery is not ready{queue?.deliveryIssues?.length ? `: ${queue.deliveryIssues.join(', ')}.` : '.'}</>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {VIEWS.map(([option, label]) => <Button key={option} type="button" size="sm" variant={view === option ? 'default' : 'outline'} onClick={() => { setView(option); setOffset(0); }} className={view === option ? 'bg-[#18448D] text-white hover:bg-[#12386f]' : ''}>{label}</Button>)}
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh</Button>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
      {!loading && queue && !queue.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="mr-2 inline h-5 w-5" /> Apply migration 029 to activate the Lead Review queue.</div>}
      {loading && !queue && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto mb-3 h-7 w-7 animate-spin" /> Loading high-value event prospects…</div>}
      {!loading && queue?.schemaReady && visibleLeads.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-black text-slate-900">No leads in this view</h2><p className="mt-1 text-sm text-slate-500">Try another view or refresh after the next lead import.</p></div>}

      <div className="space-y-5">
        {visibleLeads.map((lead) => <LeadCard key={lead.prospectId} lead={lead} deliveryReady={queue?.deliveryReady === true} sending={sendingId === lead.prospectId} onSend={(item) => void send(item)} />)}
      </div>

      {queue && queue.total > PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
          <span className="text-sm font-bold text-slate-600">{offset + 1}–{Math.min(offset + PAGE_SIZE, queue.total)} of {queue.total}</span>
          <Button variant="outline" disabled={offset + PAGE_SIZE >= queue.total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
