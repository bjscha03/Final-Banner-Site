import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign,
  ExternalLink, FileDown, Globe2, Mail, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  downloadOutboundProspectsCsv,
  getOutboundProspects,
  microusdToDollars,
  type OutboundProspectQueue,
  type OutboundQueueProspect,
} from '@/lib/outboundSales';

const PAGE_SIZE = 50;
const FILTERS = [
  ['', 'All statuses'], ['discovered', 'Discovered'], ['qualified', 'Qualified'],
  ['ready_for_outreach', 'Ready for Outreach'], ['rejected', 'Rejected'], ['suppressed', 'Suppressed'],
] as const;

function titleCase(value: string | null | undefined) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusStyle(status: string) {
  if (status === 'ready_for_outreach') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'qualified') return 'border-sky-300 bg-sky-50 text-sky-800';
  if (status === 'rejected') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (status === 'suppressed') return 'border-red-300 bg-red-50 text-red-800';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function Score({ value }: { value: number | null }) {
  const score = value ?? 0;
  return (
    <div className={cn(
      'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-lg font-black',
      score >= 60 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : score >= 45 ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-slate-50 text-slate-700',
    )}>
      {value ?? '—'}<span className="text-[9px] font-bold uppercase tracking-wide">score</span>
    </div>
  );
}

function ProspectCard({ prospect }: { prospect: OutboundQueueProspect }) {
  const contact = prospect.primaryContact;
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <Score value={prospect.leadScore} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-black text-slate-950">{prospect.businessName}</h3>
              <Badge variant="outline" className={statusStyle(prospect.status)}>{titleCase(prospect.status)}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" /> {prospect.canonicalDomain || 'No canonical domain'}</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {prospect.industry || prospect.businessType || 'Industry not supplied'}</span>
              <span>Source: {titleCase(prospect.sourceProviderId)}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:w-[420px]">
          {[
            ['Research', titleCase(prospect.researchState)],
            ['Contact', titleCase(prospect.contactState)],
            ['Cache', titleCase(prospect.researchCacheStatus || 'pending')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-bold uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 font-black text-slate-800">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {(prospect.suppressionReason || prospect.rejectionReason) && (
        <div className={cn('border-y px-5 py-3 text-sm font-semibold', prospect.suppressionReason ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {prospect.suppressionReason ? `Suppressed: ${prospect.suppressionReason}` : `Qualification note: ${prospect.rejectionReason}`}
        </div>
      )}

      <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 font-black text-slate-900"><Mail className="h-4 w-4 text-[#18448D]" /> Public business email</div>
          {contact ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="break-all font-bold text-slate-800">{contact.email}</div>
              <div className="text-slate-500">{titleCase(contact.verificationStatus)} · MX {titleCase(contact.mxStatus)} · quality {contact.contactQualityScore}/100</div>
              <div className="text-xs font-semibold text-slate-500">Syntax {contact.syntaxValid ? 'valid' : 'invalid'} · business domain {contact.domainMatches ? 'matches' : 'does not match'} · {contact.isFreeMailbox ? 'free mailbox' : 'business mailbox'}</div>
              {contact.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-[#18448D]"><ExternalLink className="h-3 w-3" /> Public source</a>}
              {contact.isRoleAddress && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Role address — blocked</Badge>}
              <p className="text-xs text-slate-500">{contact.verificationReason}</p>
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">No public business email found.</p>}
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 font-black text-slate-900"><Search className="h-4 w-4 text-[#18448D]" /> Research evidence</div>
          <p className="mt-2 text-sm text-slate-600">{String(prospect.researchFacts.description || prospect.researchFacts.title || 'No public description extracted.')}</p>
          <p className="mt-2 text-xs text-slate-500">Freshness: {prospect.websiteFreshnessScore ?? '—'}/100 · {prospect.sourceUrls.length} source page(s)</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-2 font-black text-sky-950"><ShieldCheck className="h-4 w-4" /> Shadow-only outcome</div>
          <p className="mt-2 text-sm text-sky-900">No subject or email is generated in Phase 2. No external email can be sent, and every contact remains send-ineligible.</p>
        </div>
      </div>

      <details className="group p-5">
        <summary className="cursor-pointer list-none font-black text-[#18448D]">View score explanation and source URLs</summary>
        <div className="mt-4 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {(prospect.scoreExplanation.length ? prospect.scoreExplanation : [{ factor: 'none', points: 0, label: 'No score evidence', detail: 'Qualification has not completed.' }]).map((item, index) => (
              <div key={`${item.factor}-${index}`} className="grid gap-2 border-b border-slate-200 p-3 last:border-b-0 sm:grid-cols-[70px_190px_1fr]">
                <span className={cn('font-black', item.points > 0 ? 'text-emerald-700' : 'text-slate-500')}>{item.points > 0 ? '+' : ''}{item.points}</span>
                <span className="font-bold text-slate-900">{item.label}</span>
                <span className="text-sm text-slate-600">{item.detail}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {prospect.sourceUrls.length ? prospect.sourceUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 break-all rounded-lg border border-slate-200 p-3 text-sm font-semibold text-[#18448D] hover:bg-slate-50">
                <ExternalLink className="h-4 w-4 shrink-0" /> {url}
              </a>
            )) : <p className="text-sm text-slate-500">No source URL is available.</p>}
          </div>
        </div>
      </details>
    </article>
  );
}

export default function SalesProspects() {
  const [queue, setQueue] = useState<OutboundProspectQueue | null>(null);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      setQueue(await getOutboundProspects({ status: status || undefined, limit: PAGE_SIZE, offset, signal }));
    } catch (requestError) {
      if ((requestError as Error)?.name !== 'AbortError') setError(requestError instanceof Error ? requestError.message : 'Unable to load prospects.');
    } finally {
      setLoading(false);
    }
  }, [status, offset]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try { await downloadOutboundProspectsCsv(status || undefined); } finally { setExporting(false); }
  };
  const totalProviderCost = (queue?.providerUsage || []).reduce((sum, usage) => sum + usage.costMicrousd, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge className="bg-sky-700 text-white">Phase 2</Badge><Badge variant="outline" className="border-sky-300">Shadow Mode</Badge><Badge variant="outline" className="border-sky-300">0 external sends</Badge></div>
            <h2 className="mt-3 text-2xl font-black">Deterministic Prospect Queue</h2>
            <p className="mt-1 max-w-3xl text-sm text-sky-900">Licensed discovery records, canonical deduplication, public website evidence, email DNS handling, exclusions, and explainable scores. No AI or email execution exists in this phase.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 p-3"><div className="text-xs font-bold uppercase text-sky-700">Queue</div><div className="text-2xl font-black">{queue?.total ?? 0}</div></div>
            <div className="rounded-xl bg-white/70 p-3"><div className="text-xs font-bold uppercase text-sky-700">Ready</div><div className="text-2xl font-black">{queue?.statusCounts.ready_for_outreach ?? 0}</div></div>
            <div className="col-span-2 rounded-xl bg-white/70 p-3 sm:col-span-1"><div className="flex items-center gap-1 text-xs font-bold uppercase text-sky-700"><CircleDollarSign className="h-3 w-3" /> Provider cost</div><div className="text-2xl font-black">{microusdToDollars(totalProviderCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div></div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-3 text-sm font-bold text-slate-700">
          Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3">
            {FILTERS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh</Button>
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || !queue?.schemaReady}><FileDown className="mr-2 h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}</Button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
      {!loading && queue && !queue.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><AlertTriangle className="mr-2 inline h-5 w-5" /> Phase 2 migrations are not present on this database. The queue is safely empty.</div>}
      {loading && !queue && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">Loading the Shadow Mode queue…</div>}
      {!loading && queue?.schemaReady && queue.prospects.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-black text-slate-900">No prospects in this view</h3><p className="mt-1 text-sm text-slate-500">Discovery is not scheduled in Phase 2; validated staging runs populate this monitor.</p></div>}
      <div className="space-y-4">{queue?.prospects.map((prospect) => <ProspectCard key={prospect.id} prospect={prospect} />)}</div>

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
