import { useEffect, useState } from 'react';
import { Bot, CircleDollarSign, Coins, Database, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getOutboundAnalytics, getOutboundPersonalizationActivity, microusdToDollars, type OutboundPersonalizationActivity } from '@/lib/outboundSales';
import { useSalesContext } from './SalesContext';

function money(value: number, precision = 2) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: precision, maximumFractionDigits: precision });
}

interface CostDetail {
  openAIUsage: Array<Record<string, number | string>>;
  providerUsage: Array<Record<string, number | string>>;
  resendUsage: Array<Record<string, number | string>>;
  ledger: Array<Record<string, number | string>>;
}

export default function SalesCosts() {
  const { status } = useSalesContext();
  const [activity, setActivity] = useState<OutboundPersonalizationActivity | null>(null);
  const [detail, setDetail] = useState<CostDetail | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getOutboundPersonalizationActivity({ limit: 1, signal: controller.signal }).then(setActivity).catch(() => null);
    void getOutboundAnalytics<CostDetail>('costs', { signal: controller.signal }).then((result) => setDetail(result.data)).catch(() => null);
    return () => controller.abort();
  }, []);

  const recordedSpend = microusdToDollars(status?.monthlyCostsMicrousd.openAI ?? 0);
  const averageDraftCost = microusdToDollars(activity?.summary.averageCostMicrousd ?? 0);
  const localStop = (status?.controls.monthlyOpenAIBudgetCents ?? 800) / 100;
  const utilization = localStop > 0 ? Math.min(100, (recordedSpend / localStop) * 100) : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black text-slate-950">Cost Analytics</h2><p className="mt-1 text-sm text-slate-500">Outbound AI usage is isolated from the AI Banner Designer and recorded in micro-dollars from actual token counts.</p></div><Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" /> Local $8 stop</Badge></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Discovery & verification provider usage</h3>
          <div className="mt-4 space-y-3">{detail?.providerUsage.map((row, index) => <div key={`${row.provider_id}-${row.operation}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><div><p className="font-bold">{String(row.provider_id)} · {String(row.operation)}</p><p className="text-xs text-slate-500">{Number(row.requests).toLocaleString()} requests · {Number(row.results).toLocaleString()} results · {Number(row.credits).toLocaleString()} credits</p></div><strong>{money(microusdToDollars(Number(row.cost_microusd)), 4)}</strong></div>)}{!detail?.providerUsage.length && <p className="text-sm text-slate-500">No provider usage recorded this month.</p>}</div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Resend delivery usage</h3>
          <div className="mt-4 space-y-3">{detail?.resendUsage.map((row) => <div key={String(row.event_type)} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold capitalize">{String(row.event_type).replace(/_/g, ' ')}</span><strong>{Number(row.events).toLocaleString()}</strong></div>)}{!detail?.resendUsage.length && <p className="text-sm text-slate-500">Zero outbound delivery events. Live Sending remains locked.</p>}</div>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Monthly OpenAI spend', money(recordedSpend, 4), CircleDollarSign],
          ['Average generated draft', money(averageDraftCost, 4), Bot],
          ['Input tokens', (activity?.summary.inputTokens ?? 0).toLocaleString(), Database],
          ['Output tokens', (activity?.summary.outputTokens ?? 0).toLocaleString(), Coins],
        ].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof Bot;
          return <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ItemIcon className="h-5 w-5 text-[#18448D]" /><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>;
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h3 className="font-black text-slate-950">Monthly budget utilization</h3><span className="text-sm font-bold text-slate-600">{utilization.toFixed(1)}%</span></div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#18448D]" style={{ width: `${utilization}%` }} /></div>
          <div className="mt-3 flex justify-between text-sm text-slate-500"><span>{money(recordedSpend, 4)} recorded</span><span>{money(localStop)} local stop</span></div>
        </article>
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 shadow-sm">
          <h3 className="font-black">Independent project controls</h3>
          <p className="mt-2 text-sm leading-6">Recommended OpenAI project limit: {money((status?.controls.openAIProjectLimitRecommendationCents ?? 1000) / 100)}. The application also rejects any single draft projected above $0.01 and reserves budget before an API call.</p>
          <p className="mt-3 text-xs font-semibold">Cached research and generation keys prevent repeat calls for unchanged website evidence.</p>
        </article>
      </section>
    </div>
  );
}
