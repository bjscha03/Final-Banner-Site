import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarSearch, CheckCircle2, ChevronLeft, ChevronRight,
  ExternalLink, Eye, LoaderCircle, Mail, RefreshCw, Send, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  getOutboundManualReviewLeads,
  reviewOutboundLead,
  sendOutboundReviewedLead,
  type OutboundManualReviewLead,
  type OutboundManualReviewQueue,
} from '@/lib/outboundSales';

const PAGE_SIZE = 50;
const VIEWS = ['pending', 'approved', 'sent', 'rejected', 'all'] as const;
type View = typeof VIEWS[number];

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
  if (lead.review.status === 'approved') return <Badge className="bg-[#18448D] text-white">Approved</Badge>;
  if (lead.review.status === 'rejected') return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">Rejected</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Needs review</Badge>;
}

function Score({ value }: { value: number | null }) {
  return (
    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-xl font-black text-emerald-800">
      {value ?? '—'}<span className="text-[9px] uppercase tracking-wider">fit score</span>
    </div>
  );
}

function LeadCard({
  lead, deliveryReady, reviewing, sending, onReview, onSend,
}: {
  lead: OutboundManualReviewLead;
  deliveryReady: boolean;
  reviewing: boolean;
  sending: boolean;
  onReview: (lead: OutboundManualReviewLead, status: 'approved' | 'rejected', evidence: string, notes: string, explicitOptIn: boolean) => void;
  onSend: (lead: OutboundManualReviewLead) => void;
}) {
  const [explicitOptIn, setExplicitOptIn] = useState(lead.review.permissionStatus === 'explicit_opt_in');
  const [evidence, setEvidence] = useState(lead.review.permissionEvidence);
  const [notes, setNotes] = useState(lead.review.notes);
  const [showPreview, setShowPreview] = useState(false);
  const sent = lead.review.sendState === 'sent';
  const approveReady = explicitOptIn && evidence.trim().length >= 8 && !sent;
  const sendReason = !deliveryReady
    ? 'Resend, sender identity, signing secret, site URL, or physical address still needs configuration.'
    : lead.review.status !== 'approved'
      ? 'Approve the lead and record explicit opt-in evidence first.'
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
        <section>
          <h3 className="flex items-center gap-2 font-black text-slate-950"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Manual qualification</h3>
          <label className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <Checkbox checked={explicitOptIn} onCheckedChange={(value) => setExplicitOptIn(value === true)} disabled={sent} className="mt-0.5" />
            <span><strong>I confirm this recipient explicitly opted in to marketing email from Banners On The Fly.</strong><span className="mt-1 block text-xs">A public email address or a good sales fit alone is not permission.</span></span>
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">Permission evidence
              <Textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} disabled={sent} maxLength={1000} placeholder="Example: Contact submitted the trade-show banner form on Aug 10, 2026." className="mt-1 min-h-24" />
            </label>
            <label className="text-sm font-bold text-slate-700">Review notes
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={sent} maxLength={1000} placeholder="Why this company is a strong fit, event timing, or rejection reason." className="mt-1 min-h-24" />
            </label>
          </div>
          {!sent && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => onReview(lead, 'approved', evidence, notes, explicitOptIn)} disabled={!approveReady || reviewing} className="bg-emerald-700 text-white hover:bg-emerald-800">
                {reviewing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Approve
              </Button>
              <Button type="button" variant="outline" onClick={() => onReview(lead, 'rejected', '', notes, false)} disabled={reviewing} className="border-red-300 text-red-800 hover:bg-red-50">
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
          )}
        </section>

        <aside className={cn('rounded-xl border p-4', lead.canSend && deliveryReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
          <h3 className="font-black text-slate-950">One-at-a-time send</h3>
          <p className="mt-1 text-sm text-slate-600">Approval never sends automatically. The final click rechecks permission, suppressions, contact quality, prior sends, and today’s 70-attempt cap.</p>
          {lead.technicalBlockers.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs font-semibold text-amber-900">
              {lead.technicalBlockers.map((blocker) => <li key={blocker}><AlertTriangle className="mr-1 inline h-3 w-3" /> {blocker}</li>)}
            </ul>
          )}
          {lead.review.sendState === 'sent' ? (
            <div className="mt-4 rounded-lg bg-white p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Sent {lead.review.sentAt ? new Date(lead.review.sentAt).toLocaleString() : ''}</div>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={!lead.canSend || !deliveryReady || sending} title={sendReason} className="mt-4 w-full bg-[#ff6b35] text-white hover:bg-[#e85a28]">
                  {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {sending ? 'Sending…' : 'Send'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send this marketing email now?</AlertDialogTitle>
                  <AlertDialogDescription>
                    One branded email will be sent to {lead.contact?.email} for {lead.businessName}. This cannot be recalled. The opt-out link and one-click unsubscribe header will be included automatically.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onSend(lead)} className="bg-[#ff6b35] text-white hover:bg-[#e85a28]">Send email</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
  const [view, setView] = useState<View>('pending');
  const [reviewingId, setReviewingId] = useState('');
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

  const visibleLeads = useMemo(() => (queue?.leads || []).filter((lead) => {
    if (view === 'all') return true;
    if (view === 'sent') return lead.review.sendState === 'sent';
    return lead.review.sendState !== 'sent' && lead.review.status === view;
  }), [queue, view]);

  const review = async (lead: OutboundManualReviewLead, status: 'approved' | 'rejected', evidence: string, notes: string, explicitOptIn: boolean) => {
    setReviewingId(lead.prospectId);
    try {
      await reviewOutboundLead({ prospectId: lead.prospectId, reviewStatus: status, explicitOptIn, permissionEvidence: evidence, notes });
      toast({ title: status === 'approved' ? 'Lead approved' : 'Lead rejected', description: `${lead.businessName} was updated. Nothing was sent.` });
      await load();
    } catch (requestError) {
      toast({ variant: 'destructive', title: 'Review not saved', description: requestError instanceof Error ? requestError.message : 'Try again.' });
    } finally {
      setReviewingId('');
    }
  };

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
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">High-value companies are ranked with direct trade-show, expo, conference, and upcoming-event evidence first. You verify the source, record explicit marketing permission, approve, then send one email at a time.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.total ?? '—'}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Leads</div></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.today.sent ?? '—'}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Sent today</div></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><div className="text-2xl font-black">{queue?.today.limit ?? 70}</div><div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Daily cap</div></div>
          </div>
        </div>
      </section>

      <section className={cn('rounded-xl border p-4 text-sm font-semibold', queue?.deliveryReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>
        {queue?.deliveryReady ? <><ShieldCheck className="mr-2 inline h-5 w-5" /> Manual Resend delivery is ready. Every send includes a physical address, footer opt-out, one-click unsubscribe, suppression recheck, and idempotency.</> : <><AlertTriangle className="mr-2 inline h-5 w-5" /> Review is available, but Send stays disabled until the Resend key, sender/reply identity, public site URL, unsubscribe signing secret, and physical business address are configured.</>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((option) => <Button key={option} type="button" size="sm" variant={view === option ? 'default' : 'outline'} onClick={() => { setView(option); setOffset(0); }} className={view === option ? 'bg-[#18448D] text-white hover:bg-[#12386f]' : ''}>{titleCase(option)}</Button>)}
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh</Button>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
      {!loading && queue && !queue.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="mr-2 inline h-5 w-5" /> Apply migration 029 to activate the Lead Review queue.</div>}
      {loading && !queue && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto mb-3 h-7 w-7 animate-spin" /> Loading high-value event prospects…</div>}
      {!loading && queue?.schemaReady && visibleLeads.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-black text-slate-900">No leads in this view</h2><p className="mt-1 text-sm text-slate-500">Try another review state or refresh after the next lead import.</p></div>}

      <div className="space-y-5">
        {visibleLeads.map((lead) => <LeadCard key={lead.prospectId} lead={lead} deliveryReady={queue?.deliveryReady === true} reviewing={reviewingId === lead.prospectId} sending={sendingId === lead.prospectId} onReview={(item, status, evidence, notes, optedIn) => void review(item, status, evidence, notes, optedIn)} onSend={(item) => void send(item)} />)}
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
