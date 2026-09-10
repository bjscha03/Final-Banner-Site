import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, CircleDollarSign, FileDown, MailX, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  downloadOutboundMessagesCsv,
  getOutboundPersonalizationActivity,
  microusdToDollars,
  type OutboundPersonalizationActivity,
  type OutboundPersonalizationActivityMessage,
} from '@/lib/outboundSales';

function moneyMicrousd(value: number) {
  return microusdToDollars(value).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4,
  });
}

function titleCase(value: string | null | undefined) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Not recommended';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recommended' : date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return 'Not planned';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not planned' : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function MessageCard({ message }: { message: OutboundPersonalizationActivityMessage }) {
  const generated = message.generationStatus === 'generated';
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-slate-950">{message.businessName}</h3>
            <Badge variant="outline">{titleCase(message.messageKind || 'initial')}</Badge>
            <Badge variant="outline" className={cn(
              generated ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800',
            )}>{titleCase(message.generationStatus)}</Badge>
            <Badge variant="outline">{message.sentAt ? 'Delivery recorded' : 'Never sent'}</Badge>
            <Badge variant="outline">{titleCase(message.deliveryState || 'not_planned')}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{message.industry || 'Industry unavailable'} · score {message.leadScore ?? '—'} · {message.model || 'No model call'}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-black text-slate-900">{moneyMicrousd(message.actualOpenAICostMicrousd ?? message.estimatedOpenAICostMicrousd)}</p>
          <p className="text-xs text-slate-500">{message.inputTokens.toLocaleString()} in · {message.outputTokens.toLocaleString()} out</p>
          <p className="mt-1 text-xs text-slate-500">Suggested follow-up {displayDate(message.recommendedFollowUpAt)} · planning only</p>
          <p className="mt-1 text-xs text-slate-500">Would send {displayDateTime(message.plannedSendAt)} · Shadow Mode</p>
        </div>
      </div>

      {generated ? (
        <div className="grid gap-5 p-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-[#18448D]/20 bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#18448D]">Exact Shadow Mode preview</p>
            <p className="mt-3 border-b border-slate-200 pb-3 text-sm"><strong>Subject:</strong> {message.subject}</p>
            <div className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{message.bodyText}</div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-black text-slate-900">Research summary</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{message.researchSummary}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-black text-slate-900">Grounding evidence</p>
              <div className="mt-2 space-y-2">
                {message.personalizationEvidence.map((evidence, index) => (
                  <div key={`${evidence.id || 'evidence'}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <strong className="text-slate-900">{evidence.id || `Evidence ${index + 1}`}</strong> {evidence.evidence || evidence.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-black text-slate-900">Controlled variation assignment</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(message.variantAssignments).map(([key, value]) => <Badge key={key} variant="outline">{titleCase(key)}: {titleCase(value)}</Badge>)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 text-sm text-amber-900">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Generation did not complete. Safe code: {message.generationErrorCode || 'not generated'}.
        </div>
      )}
    </article>
  );
}

export default function SalesActivity() {
  const [activity, setActivity] = useState<OutboundPersonalizationActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      setActivity(await getOutboundPersonalizationActivity({ limit: 100, signal }));
    } catch (requestError) {
      if ((requestError as Error)?.name !== 'AbortError') setError(requestError instanceof Error ? requestError.message : 'Unable to load Shadow Mode activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try { await downloadOutboundMessagesCsv(); } finally { setExporting(false); }
  };

  const summary = activity?.summary;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge className="bg-sky-700 text-white">Personalization</Badge><Badge variant="outline">Shadow Mode</Badge><Badge variant="outline"><MailX className="mr-1 h-3 w-3" /> Sending unavailable</Badge></div>
            <h2 className="mt-3 text-2xl font-black">Personalized Outreach Previews</h2>
            <p className="mt-1 max-w-3xl text-sm">Every draft shown here is grounded in stored public evidence, cost-accounted, cached by research hash, and disconnected from live delivery by the checked-in phase lock.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh</Button>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || !activity?.schemaReady}><FileDown className="mr-2 h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Generated', summary?.generated ?? 0, CheckCircle2],
          ['Failed / blocked', (summary?.failed ?? 0) + (summary?.blocked ?? 0), ShieldCheck],
          ['Monthly AI spend', moneyMicrousd(summary?.actualCostMicrousd ?? 0), CircleDollarSign],
          ['Average per draft', moneyMicrousd(summary?.averageCostMicrousd ?? 0), Bot],
        ].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof Bot;
          return <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ItemIcon className="h-5 w-5 text-[#18448D]" /><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>;
        })}
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
      {!loading && activity && !activity.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><AlertTriangle className="mr-2 inline h-5 w-5" /> Migration 023 is not present on this database. Personalization remains safely unavailable.</div>}
      {loading && !activity && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">Loading Shadow Mode previews…</div>}
      {!loading && activity?.schemaReady && activity.messages.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Bot className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-black text-slate-900">No previews generated yet</h3><p className="mt-1 text-sm text-slate-500">Eligible staging prospects can be generated from the Prospect Queue when the explicit Shadow Generation control is enabled.</p></div>}
      <div className="space-y-4">{activity?.messages.map((message) => <MessageCard key={message.id} message={message} />)}</div>
    </div>
  );
}
