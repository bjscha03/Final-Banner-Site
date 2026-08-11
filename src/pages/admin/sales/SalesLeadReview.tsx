import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarSearch, CheckCircle2, ChevronLeft, ChevronRight,
  Copy, ExternalLink, Eye, Filter, Image, LoaderCircle, Mail, MapPin, Phone, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, Upload, UserRound, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  getOutboundManualReviewLeads,
  prepareAtlantaEventBatch,
  saveOutboundLeadNote,
  sendOutboundReviewedLead,
  uploadOutboundManualArtwork,
  type OutboundLeadFilters,
  type OutboundManualReviewLead,
  type OutboundManualReviewQueue,
} from '@/lib/outboundSales';
import { buildOutboundBannerPrompt } from '@/lib/outboundBannerPrompt';

const PAGE_SIZE = 50;
const VIEWS = [
  ['today', "Today's Leads"],
  ['ready', 'Ready to Send'],
  ['sent', 'Sent'],
  ['all', 'All'],
] as const;
type View = typeof VIEWS[number][0];
type QueueSort = OutboundManualReviewQueue['sort'];

const EMPTY_FILTERS: OutboundLeadFilters = {};

function localDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function addressLabel(address: Record<string, string | null>) {
  return [address.city, address.state || address.region, address.country].filter(Boolean).join(', ');
}

function FilterSelect({
  id, label, value, placeholder, options, onChange,
}: {
  id: string;
  label: string;
  value?: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-black text-slate-700">{label}</Label>
      <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' ? '' : next)}>
        <SelectTrigger id={id} className="bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function titleCase(value: string | null | undefined) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventPreparationHasStalled(batch: OutboundManualReviewQueue['morningBatch']) {
  if (!batch) return false;
  if (batch.workerStalled === true) return true;
  const metadata = batch.runMetadata || {};
  const waitingForBackground = metadata.dispatchState === 'acknowledged'
    || ['queued', 'dispatching', 'dispatched'].includes(String(metadata.phase || ''));
  if (waitingForBackground && !metadata.backgroundReceivedAt) {
    const referenceAt = Date.parse(typeof metadata.dispatchAcknowledgedAt === 'string'
      ? metadata.dispatchAcknowledgedAt : batch.updatedAt);
    if (Number.isFinite(referenceAt) && Date.now() - referenceAt >= 90 * 1000) return true;
  }
  const action = ['import', 'finalize'].includes(String(metadata.backgroundAction || ''))
    ? String(metadata.backgroundAction) : null;
  const running = ['running', 'claim_deferred'].includes(String(metadata.backgroundState || ''));
  if (!action || !running) return false;
  const workerTimes = [
    Date.parse(typeof metadata.backgroundReceivedAt === 'string' ? metadata.backgroundReceivedAt : ''),
    Date.parse(batch.updatedAt),
  ].filter(Number.isFinite);
  if (!workerTimes.length) return false;
  const workerAt = Math.max(...workerTimes);
  const staleAfterMs = action === 'finalize' ? 6 * 60 * 1000 : 16 * 60 * 1000;
  return Number.isFinite(workerAt) && Date.now() - workerAt >= staleAfterMs;
}

function eventBadge(lead: OutboundManualReviewLead) {
  if (lead.eventFit.priority === 'trade_show') return 'border-orange-300 bg-orange-50 text-orange-900';
  if (lead.eventFit.priority === 'event_signal') return 'border-sky-300 bg-sky-50 text-sky-900';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function reviewBadge(lead: OutboundManualReviewLead) {
  if (lead.review.sendState === 'sent') return <Badge className="bg-emerald-700 text-white">Sent</Badge>;
  if (lead.review.recoveryStatus === 'retryable') return <Badge className="bg-amber-700 text-white">Retry available</Badge>;
  if (lead.review.sendState === 'processing') return <Badge className="bg-sky-700 text-white">Sending</Badge>;
  if (lead.canSend) return <Badge className="bg-[#18448D] text-white">Ready to send</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Needs attention</Badge>;
}

function mockupIsPresentationReady(lead: OutboundManualReviewLead) {
  const mockup = lead.mockup;
  return mockup?.presentationReady === true;
}

function Score({ value }: { value: number | null }) {
  return (
    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-xl font-black text-emerald-800">
      {value ?? '—'}<span className="text-[9px] uppercase tracking-wider">fit score</span>
    </div>
  );
}

function LeadCard({
  lead, deliveryReady, sending, uploadingArtwork, savingNote, onSend, onUploadArtwork, onSaveNote,
}: {
  lead: OutboundManualReviewLead;
  deliveryReady: boolean;
  sending: boolean;
  uploadingArtwork: boolean;
  savingNote: boolean;
  onSend: (lead: OutboundManualReviewLead) => void;
  onUploadArtwork: (lead: OutboundManualReviewLead, file: File) => void;
  onSaveNote: (lead: OutboundManualReviewLead, notes: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notes, setNotes] = useState(lead.review.notes || '');
  const uploadInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => setNotes(lead.review.notes || ''), [lead.review.notes]);
  const sent = lead.review.sendState === 'sent';
  const presentationReady = mockupIsPresentationReady(lead);
  const bannerPrompt = buildOutboundBannerPrompt(lead);
  const sendReason = uploadingArtwork
    ? 'Wait for the banner upload to finish before sending.'
    : !deliveryReady
    ? 'Email delivery is not ready. Refresh after the listed configuration issue is fixed.'
    : lead.technicalBlockers[0] || '';
  const retryableRecovery = lead.review.recoveryStatus === 'retryable';

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(bannerPrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      setShowPrompt(true);
    }
  };

  const acceptArtwork = (file: File | undefined) => {
    if (file) onUploadArtwork(lead, file);
  };

  return (
    <article id={`lead-${lead.prospectId}`} tabIndex={-1} className="scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm outline-none focus:ring-2 focus:ring-[#ff6b35]">
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
              {addressLabel(lead.address) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {addressLabel(lead.address)}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
              {lead.websiteUrl && <a href={lead.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[#18448D]"><ExternalLink className="h-3 w-3" /> Website</a>}
              {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[#18448D]"><ExternalLink className="h-3 w-3" /> Lead source</a>}
              <span className="text-slate-500">Imported via {titleCase(lead.sourceProviderId)}</span>
              <span className="text-slate-500">Imported {lead.importedBusinessDate || localDateTime(lead.discoveredAt)}</span>
              {lead.morningQueuePosition && <span className="text-slate-500">Morning queue #{lead.morningQueuePosition}</span>}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm xl:w-[360px]">
          <p className="font-black text-slate-900">Best contact</p>
          {lead.contact ? (
            <>
              <p className="mt-1 inline-flex items-center gap-1 font-bold text-slate-900"><UserRound className="h-3.5 w-3.5" /> {lead.contact.fullName || 'Contact name not supplied'}</p>
              {lead.contact.jobTitle && <p className="text-xs text-slate-500">{lead.contact.jobTitle}</p>}
              <p className="mt-1 break-all font-bold text-[#18448D]">{lead.contact.email}</p>
              {lead.phone && <a href={`tel:${lead.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-700"><Phone className="h-3 w-3" /> {lead.phone}</a>}
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
            <h3 className="flex items-center gap-2 font-black text-slate-950"><Mail className="h-4 w-4 text-[#18448D]" /> Email and banner</h3>
            {lead.message?.bodyHtml && presentationReady && <Button type="button" size="sm" variant="outline" onClick={() => setShowPreview((value) => !value)}><Eye className="mr-2 h-4 w-4" /> {showPreview ? 'Hide email' : 'Preview email'}</Button>}
          </div>
          {lead.message?.generationStatus === 'generated' ? (
            <>
              <p className="mt-3 text-sm"><strong>Subject:</strong> {lead.message.subject}</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{lead.message.bodyText}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">Send adds the 20% NEW20 offer, business address, footer unsubscribe link, and one-click unsubscribe header.</p>
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black text-blue-950"><Sparkles className="h-4 w-4 text-[#ff6b35]" /> Banner design prompt</p>
                    <p className="mt-1 text-xs text-blue-900">Copy this into your banner-image GPT. The company website and exact accuracy rules are already included.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => setShowPrompt((value) => !value)}>
                      <Eye className="mr-2 h-3.5 w-3.5" /> {showPrompt ? 'Hide prompt' : 'View prompt'}
                    </Button>
                    <Button type="button" size="sm" onClick={() => void copyPrompt()} className="bg-[#18448D] text-white hover:bg-[#12386f]">
                      <Copy className="mr-2 h-3.5 w-3.5" /> {promptCopied ? 'Copied' : 'Copy prompt'}
                    </Button>
                  </div>
                </div>
                {showPrompt && (
                  <Textarea readOnly value={bannerPrompt} aria-label={`Banner prompt for ${lead.businessName}`} className="mt-3 min-h-[300px] bg-white font-mono text-xs leading-5" onFocus={(event) => event.currentTarget.select()} />
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {lead.mockup?.previewUrl ? (
                  <div>
                    <img
                      src={lead.mockup.previewUrl}
                      alt={`Uploaded banner concept for ${lead.businessName}`}
                      className="aspect-video w-full bg-slate-50 object-contain"
                      loading="lazy"
                    />
                    <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[10px] font-medium text-slate-500">Concept visualization only.</p>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-disabled={sent || uploadingArtwork}
                    onClick={() => { if (!sent && !uploadingArtwork) uploadInput.current?.click(); }}
                    onKeyDown={(event) => { if (!sent && !uploadingArtwork && (event.key === 'Enter' || event.key === ' ')) uploadInput.current?.click(); }}
                    onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      if (!sent && !uploadingArtwork) acceptArtwork(event.dataTransfer.files?.[0]);
                    }}
                    className={cn('flex aspect-video items-center justify-center border-2 border-dashed p-6 text-center transition-colors', sent ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70' : 'cursor-pointer', dragActive ? 'border-[#ff6b35] bg-orange-50' : !sent && 'border-slate-300 bg-white hover:border-[#18448D] hover:bg-blue-50')}
                  >
                    <span>
                      {uploadingArtwork ? <LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-[#18448D]" /> : <Upload className="mx-auto mb-3 h-8 w-8 text-[#18448D]" />}
                      <strong className="block text-sm text-slate-900">{sent ? 'Sent image is locked' : uploadingArtwork ? 'Uploading and verifying…' : 'Drop the finished banner image here'}</strong>
                      <span className="mt-1 block text-xs text-slate-500">or click to choose a PNG, JPG, or WebP · 900×500 minimum · 4 MB maximum</span>
                    </span>
                  </div>
                )}
                <input
                  ref={uploadInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploadingArtwork || sending || sent}
                  onChange={(event) => {
                    acceptArtwork(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={cn('text-xs font-black', presentationReady ? 'text-emerald-800' : 'text-amber-800')}>{presentationReady ? 'Uploaded and ready for email preview' : 'Upload required before Send'}</p>
                    <p className="mt-1 max-w-xl text-[11px] text-slate-500">The exact stored image shown here is the image that will appear in and attach to this company&apos;s email.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => uploadInput.current?.click()} disabled={uploadingArtwork || sending || sent}>
                    {uploadingArtwork ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                    {sent ? 'Sent image locked' : presentationReady ? 'Replace image' : 'Choose image'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The personalized email is not ready. Generate it from the Prospect Queue before sending.</div>
          )}
        </section>
      </div>

      {showPreview && lead.message?.bodyHtml && (
        <div className="border-b border-slate-200 bg-slate-100 p-4">
          <iframe title={`Email preview for ${lead.businessName}`} srcDoc={lead.message.bodyHtml} sandbox="allow-same-origin" className="mx-auto h-[720px] w-full max-w-[720px] rounded-xl border border-slate-300 bg-white" />
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
          {(lead.technicalWarnings || []).length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
              {(lead.technicalWarnings || []).map((warning) => <li key={warning}><AlertTriangle className="mr-1 inline h-3 w-3" /> {warning}</li>)}
            </ul>
          )}
          {lead.review.sendState === 'sent' ? (
            <div className="mt-4 rounded-lg bg-white p-3 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="mr-2 inline h-4 w-4" /> Sent {localDateTime(lead.review.sentAt)}
              {lead.message?.deliveredAt && <p className="mt-1 text-xs font-semibold">Delivered {localDateTime(lead.message.deliveredAt)}</p>}
              {!lead.message?.deliveredAt && lead.message?.lastEventType && <p className="mt-1 text-xs font-semibold">Latest: {titleCase(lead.message.lastEventType)} · {localDateTime(lead.message.lastEventAt)}</p>}
            </div>
          ) : (
            <>
              {retryableRecovery && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950"><AlertTriangle className="mr-1 inline h-3 w-3" /> A prior attempt expired before completion. Retrying reuses the same provider idempotency key and does not consume another daily attempt.</p>}
              <Button type="button" onClick={() => onSend(lead)} disabled={!lead.canSend || !deliveryReady || sending || uploadingArtwork} title={sendReason} className="mt-4 w-full bg-[#ff6b35] text-white hover:bg-[#e85a28]">
                {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {sending ? 'Sending…' : retryableRecovery ? 'Retry safely' : 'Send'}
              </Button>
            </>
          )}
          {sendReason && !sent && <p className="mt-2 text-xs font-semibold text-slate-500">{sendReason}</p>}
        </aside>
      </div>

      <div className="border-t border-slate-200 bg-white p-5">
        <Label htmlFor={`lead-note-${lead.prospectId}`} className="font-black text-slate-900">Sales notes</Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            id={`lead-note-${lead.prospectId}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
            placeholder="Add qualification notes, booth needs, timing, or follow-up context…"
            className="min-h-[72px] flex-1"
          />
          <Button type="button" variant="outline" disabled={savingNote || notes === (lead.review.notes || '')} onClick={() => onSaveNote(lead, notes)}>
            {savingNote && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />} Save note
          </Button>
        </div>
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
  const [view, setView] = useState<View>('all');
  const [filters, setFilters] = useState<OutboundLeadFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<QueueSort>('priority');
  const [sendingId, setSendingId] = useState('');
  const [uploadingArtworkId, setUploadingArtworkId] = useState('');
  const [savingNoteId, setSavingNoteId] = useState('');
  const [preparingEvent, setPreparingEvent] = useState(false);
  const [advanceAfterSend, setAdvanceAfterSend] = useState(false);
  const eventPollCount = useRef(0);
  const eventStartInFlight = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError('');
    try {
      const nextQueue = await getOutboundManualReviewLeads({
        limit: PAGE_SIZE, offset, minimumScore: 60, view, filters, sort, signal: controller.signal,
      });
      if (!controller.signal.aborted) setQueue(nextQueue);
    } catch (requestError) {
      if ((requestError as Error)?.name !== 'AbortError') setError(requestError instanceof Error ? requestError.message : 'Unable to load lead review.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, offset, sort, view]);

  const startAtlantaBatch = useCallback(async () => {
    if (eventStartInFlight.current) return;
    eventStartInFlight.current = true;
    setPreparingEvent(true);
    eventPollCount.current = 0;
    try {
      const result = await prepareAtlantaEventBatch();
      if (result.alreadyReady) {
        setPreparingEvent(false);
        setView('today');
        toast({ title: 'Atlanta leads are ready', description: 'The finalized 70-lead queue and email drafts are ready. Add each banner manually before Send.' });
      } else {
        toast({ title: 'Atlanta lead preparation started', description: 'Official exhibitor data, company research, and email drafts are being prepared. No artwork is generated and nothing will be sent.' });
      }
      await load();
    } catch (requestError) {
      setPreparingEvent(false);
      toast({ variant: 'destructive', title: 'Atlanta batch could not start', description: requestError instanceof Error ? requestError.message : 'Try again.' });
    } finally {
      eventStartInFlight.current = false;
    }
  }, [load, toast]);

  useEffect(() => {
    void load();
    return () => requestController.current?.abort();
  }, [load]);

  useEffect(() => {
    if (preparingEvent || !queue?.morningBatch?.runMetadata?.eventKey
        || eventPreparationHasStalled(queue.morningBatch)) return;
    if (['discovering', 'preparing', 'partial'].includes(queue.morningBatch.status)
        && (Number(queue.morningBatch.runMetadata.finalizerPass) || 0) < 7) {
      eventPollCount.current = 0;
      setPreparingEvent(true);
    }
  }, [preparingEvent, queue?.morningBatch]);

  useEffect(() => {
    if (!preparingEvent || eventStartInFlight.current) return undefined;
    const batch = queue?.morningBatch;
    if (eventPreparationHasStalled(batch || null)) {
      setPreparingEvent(false);
      toast({
        variant: 'destructive',
        title: 'Atlanta preparation worker stopped',
        description: 'The worker stopped making progress before the queue was complete. No email was sent, and the saved batch is safe to retry.',
      });
      return undefined;
    }
    if (batch?.status === 'ready' && batch.messageReadyCount >= batch.targetCount) {
      setPreparingEvent(false);
      setView('today');
      toast({ title: 'Atlanta leads are ready', description: `${batch.messageReadyCount} qualified leads and email drafts are ready. Upload each banner, preview, and Send manually.` });
      return undefined;
    }
    const finalizerPass = Number(batch?.runMetadata?.finalizerPass) || 0;
    if (eventPollCount.current >= 180 || (['partial', 'failed'].includes(batch?.status || '') && finalizerPass >= 7)) {
      setPreparingEvent(false);
      toast({
        variant: 'destructive',
        title: 'Atlanta preparation finished below 70',
        description: `${batch?.messageReadyCount || 0} qualified leads have complete email drafts. No email was sent.`,
      });
      return undefined;
    }
    const timer = window.setTimeout(() => {
      eventPollCount.current += 1;
      void load();
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [preparingEvent, queue?.morningBatch, load, toast]);

  const visibleLeads = queue?.leads || [];

  useEffect(() => {
    if (!advanceAfterSend || loading) return;
    setAdvanceAfterSend(false);
    const next = queue?.leads?.[0];
    if (!next) return;
    window.requestAnimationFrame(() => document.getElementById(`lead-${next.prospectId}`)?.focus({ preventScroll: false }));
  }, [advanceAfterSend, loading, queue?.leads]);

  const send = async (lead: OutboundManualReviewLead) => {
    setSendingId(lead.prospectId);
    try {
      const result = await sendOutboundReviewedLead(lead.prospectId);
      toast({ title: result.duplicate ? 'Already sent' : 'Email sent', description: `${lead.businessName} · ${lead.contact?.email}` });
      setAdvanceAfterSend(true);
      await load();
    } catch (requestError) {
      toast({ variant: 'destructive', title: 'Email not sent', description: requestError instanceof Error ? requestError.message : 'Resend could not send this email.' });
    } finally {
      setSendingId('');
    }
  };

  const saveNote = async (lead: OutboundManualReviewLead, notes: string) => {
    setSavingNoteId(lead.prospectId);
    try {
      await saveOutboundLeadNote(lead.prospectId, notes);
      toast({ title: 'Note saved', description: lead.businessName });
      await load();
    } catch (requestError) {
      toast({ variant: 'destructive', title: 'Note not saved', description: requestError instanceof Error ? requestError.message : 'Try again.' });
    } finally {
      setSavingNoteId('');
    }
  };

  const updateFilter = <Key extends keyof OutboundLeadFilters>(key: Key, value: OutboundLeadFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setOffset(0);
  };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const eventPreparationStalled = eventPreparationHasStalled(queue?.morningBatch || null);

  const uploadArtwork = async (lead: OutboundManualReviewLead, file: File) => {
    setUploadingArtworkId(lead.prospectId);
    try {
      await uploadOutboundManualArtwork(
        lead.prospectId,
        file,
        lead.eventFit.evidence[0]?.label || lead.eventFit.label,
      );
      toast({ title: 'Banner uploaded', description: `${lead.businessName} · review the email preview, then Send when ready.` });
      await load();
    } catch (requestError) {
      toast({ variant: 'destructive', title: 'Banner not uploaded', description: requestError instanceof Error ? requestError.message : 'Try again.' });
    } finally {
      setUploadingArtworkId('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b2344] via-[#18448D] to-[#245ba8] p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-300"><Sparkles className="h-4 w-4" /> Event-first prospecting</div>
            <h1 className="mt-2 text-3xl font-black">Lead Review</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">High-value companies are ranked with direct trade-show, expo, conference, and upcoming-event evidence first. Copy the banner prompt, upload your finished image, preview the email, then click Send.</p>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 font-black text-slate-950"><CalendarSearch className="h-4 w-4 text-[#18448D]" /> Today&apos;s 8:00 AM sales queue</p>
            <p className="mt-1 text-sm text-slate-600">Lead and email preparation only—no banner is generated and nothing is sent automatically. You add the image and deliberately click Send.</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <Badge className={cn('w-fit text-sm', queue?.morningBatch?.status === 'ready' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white')}>
              {queue?.morningBatch ? titleCase(queue.morningBatch.status) : 'No batch reported today'}
            </Badge>
            <Button
              type="button"
              onClick={() => void startAtlantaBatch()}
              disabled={preparingEvent || (queue?.morningBatch?.status === 'ready' && (queue.morningBatch.messageReadyCount || 0) >= (queue.morningBatch.targetCount || 70))}
              className="bg-[#ff6b35] text-white hover:bg-[#e85a28]"
            >
              {preparingEvent ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CalendarSearch className="mr-2 h-4 w-4" />}
              {preparingEvent ? 'Loading and preparing…' : queue?.morningBatch?.status === 'ready' ? 'Atlanta leads ready' : eventPreparationStalled ? 'Retry Atlanta preparation' : 'Load Atlanta leads'}
            </Button>
            <p className="max-w-sm text-xs text-slate-500">Imports qualified leads and prepares email drafts only. It does not generate artwork or send email.</p>
          </div>
        </div>
        {Number(queue?.morningBatch?.runMetadata?.sourceRecordCount) > 0 && (
          <p className="mt-3 text-xs font-semibold text-slate-600">
            Source pool: {Number(queue?.morningBatch?.runMetadata?.primaryRecordCount) || 70} ranked exhibitors + {Number(queue?.morningBatch?.runMetadata?.reserveRecordCount) || 0} contact-quality backfills. The best 70 complete leads receive Today queue positions.
          </p>
        )}
        {eventPreparationStalled && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">
            The preparation worker stopped making progress. Your imported companies are still saved; use Retry Atlanta preparation to continue safely.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ['Target', queue?.morningBatch?.targetCount ?? 70],
            ['Fresh leads', queue?.morningBatch?.newProspectCount ?? 0],
            ['Qualified', queue?.morningBatch?.qualifiedCount ?? 0],
            ['Email ready', queue?.morningBatch?.messageReadyCount ?? 0],
            ['Images added', queue?.morningBatch?.mockupReadyCount ?? 0],
            ['Ready at', queue?.morningBatch?.readyAt ? new Date(queue.morningBatch.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xl font-black text-slate-950">{value}</p>
              <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>
        {queue?.morningBatch?.lastErrorCode && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Preparation needs attention: {titleCase(queue.morningBatch.lastErrorCode)}</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-orange-50 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 font-black text-slate-950"><Image className="h-4 w-4 text-[#ff6b35]" /> Manual personalized banner workflow</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Every lead includes a detailed company-specific prompt with its website URL. Create the image in your banner GPT, drop it into the lead, review the exact email preview, and hit Send.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <Badge className="bg-emerald-700 text-white">{queue?.mockups.ready ?? 0} images uploaded</Badge>
            <Badge variant="outline" className="border-orange-300 bg-white text-orange-900">{queue?.mockups.missing ?? 0} waiting for upload</Badge>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 border-[#18448D] bg-white px-4 py-2 text-[#18448D]">No automatic image generation</Badge>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {VIEWS.map(([option, label]) => <Button key={option} type="button" size="sm" variant={view === option ? 'default' : 'outline'} onClick={() => { setView(option); setOffset(0); }} className={view === option ? 'bg-[#18448D] text-white hover:bg-[#12386f]' : ''}>{label}</Button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700"><Filter className="mr-1 h-3 w-3" /> {activeFilterCount} active</Badge>
            <Button type="button" size="sm" variant="ghost" disabled={!activeFilterCount} onClick={() => { setFilters(EMPTY_FILTERS); setOffset(0); }}><X className="mr-1 h-4 w-4" /> Clear filters</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh</Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="lead-search" className="text-xs font-black text-slate-700">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input id="lead-search" value={filters.search || ''} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Company, contact, email, domain, or phone" className="pl-9" />
            </div>
          </div>
          <FilterSelect id="filter-event" label="Trade show / event" value={filters.event} placeholder="All events" options={(queue?.filterOptions?.events || []).map((value) => ({ value, label: value }))} onChange={(value) => updateFilter('event', value)} />
          <FilterSelect id="filter-source" label="Lead source" value={filters.source} placeholder="All sources" options={(queue?.filterOptions?.sources || []).map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => updateFilter('source', value)} />
          <FilterSelect id="filter-industry" label="Industry / category" value={filters.industry} placeholder="All industries" options={(queue?.filterOptions?.industries || []).map((value) => ({ value, label: value }))} onChange={(value) => updateFilter('industry', value)} />
          <div className="space-y-1.5">
            <Label htmlFor="filter-imported" className="text-xs font-black text-slate-700">Date imported</Label>
            <Input id="filter-imported" type="date" value={filters.importedDate || ''} onChange={(event) => updateFilter('importedDate', event.target.value)} />
          </div>
          <FilterSelect id="filter-qualified" label="Qualification" value={filters.qualification} placeholder="Any qualification" options={[{ value: 'qualified', label: 'Qualified' }, { value: 'unqualified', label: 'Unqualified' }]} onChange={(value) => updateFilter('qualification', value as OutboundLeadFilters['qualification'])} />
          <FilterSelect id="filter-readiness" label="Send readiness" value={filters.readiness} placeholder="Any readiness" options={[{ value: 'ready', label: 'Ready to send' }, { value: 'needs_attention', label: 'Needs attention' }]} onChange={(value) => updateFilter('readiness', value as OutboundLeadFilters['readiness'])} />
          <FilterSelect id="filter-contacted" label="Contacted previously" value={filters.contacted} placeholder="Either" options={[{ value: 'yes', label: 'Contacted' }, { value: 'no', label: 'Never contacted' }]} onChange={(value) => updateFilter('contacted', value as OutboundLeadFilters['contacted'])} />
          <FilterSelect id="filter-email" label="Has email" value={filters.hasEmail} placeholder="Either" options={[{ value: 'yes', label: 'Has email' }, { value: 'no', label: 'No email' }]} onChange={(value) => updateFilter('hasEmail', value as OutboundLeadFilters['hasEmail'])} />
          <FilterSelect id="filter-phone" label="Has phone" value={filters.hasPhone} placeholder="Either" options={[{ value: 'yes', label: 'Has phone' }, { value: 'no', label: 'No phone' }]} onChange={(value) => updateFilter('hasPhone', value as OutboundLeadFilters['hasPhone'])} />
          <FilterSelect id="filter-mockup" label="Banner upload" value={filters.mockup} placeholder="Any upload status" options={[{ value: 'ready', label: 'Image uploaded' }, { value: 'missing', label: 'Waiting for upload' }]} onChange={(value) => updateFilter('mockup', value as OutboundLeadFilters['mockup'])} />
          <FilterSelect id="filter-email-status" label="Email status" value={filters.emailStatus} placeholder="Any email status" options={[{ value: 'ready', label: 'Ready' }, { value: 'sent', label: 'Sent' }, { value: 'failed', label: 'Failed' }, { value: 'missing', label: 'Missing' }]} onChange={(value) => updateFilter('emailStatus', value as OutboundLeadFilters['emailStatus'])} />
          <FilterSelect id="queue-sort" label="Sort" value={sort} placeholder="Priority" options={[{ value: 'priority', label: 'Priority' }, { value: 'newest', label: 'Newest' }, { value: 'score_desc', label: 'Highest score' }, { value: 'company_asc', label: 'Company A–Z' }, { value: 'event_asc', label: 'Event A–Z' }]} onChange={(value) => { setSort((value || 'priority') as QueueSort); setOffset(0); }} />
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {Object.entries(filters).filter(([, value]) => value).map(([key, value]) => (
              <button key={key} type="button" onClick={() => updateFilter(key as keyof OutboundLeadFilters, '')} className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-900 hover:bg-blue-100">
                {titleCase(key)}: {String(value)} <X className="ml-1 h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
      {!loading && queue && !queue.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="mr-2 inline h-5 w-5" /> Apply the current Sales Admin database migrations to activate the morning queue.</div>}
      {loading && !queue && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto mb-3 h-7 w-7 animate-spin" /> Loading high-value event prospects…</div>}
      {!loading && queue?.schemaReady && visibleLeads.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 font-black text-slate-900">{view === 'today' && activeFilterCount === 0 ? 'No new leads imported today' : 'No leads in this view'}</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
            {view === 'today' && activeFilterCount === 0
              ? 'Your existing leads are still saved. Show all saved leads to view earlier imports, or refresh after today’s preparation finishes.'
              : 'Clear filters or show all saved leads to return to the complete queue.'}
          </p>
          {view !== 'all' && (
            <Button type="button" variant="outline" className="mt-4" onClick={() => { setView('all'); setFilters(EMPTY_FILTERS); setOffset(0); }}>
              Show all saved leads
            </Button>
          )}
        </div>
      )}

      <div className="space-y-5">
        {visibleLeads.map((lead) => <LeadCard key={lead.prospectId} lead={lead} deliveryReady={queue?.deliveryReady === true} sending={sendingId === lead.prospectId} uploadingArtwork={uploadingArtworkId === lead.prospectId} savingNote={savingNoteId === lead.prospectId} onSend={(item) => void send(item)} onUploadArtwork={(item, file) => void uploadArtwork(item, file)} onSaveNote={(item, notes) => void saveNote(item, notes)} />)}
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
