import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Database,
  MailX,
  PauseCircle,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { microusdToDollars } from '@/lib/outboundSales';
import { useSalesContext } from './SalesContext';

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

export default function SalesDashboard() {
  const { status, loading } = useSalesContext();
  const controls = status?.controls;
  const metrics = status?.metrics;
  const costs = status?.monthlyCostsMicrousd;

  const cards = [
    { label: 'Prospects', value: metrics?.prospectsTotal ?? 0, detail: `${metrics?.readyForOutreach ?? 0} ready for outreach`, icon: Users },
    { label: 'Messages generated', value: metrics?.messagesGenerated ?? 0, detail: `${metrics?.messagesSent ?? 0} externally sent`, icon: Send },
    { label: 'Replies', value: metrics?.repliesTotal ?? 0, detail: 'Deterministic classification; review-only drafts', icon: Activity },
    { label: 'Orders generated', value: metrics?.attributedOrders ?? 0, detail: 'Paid, non-test attributed orders', icon: CircleDollarSign },
    { label: 'Revenue generated', value: money((metrics?.revenueGeneratedCents ?? 0) / 100), detail: 'Paid, non-test attributed revenue', icon: CircleDollarSign },
    { label: 'Active jobs', value: metrics?.activeJobs ?? 0, detail: `${metrics?.deadJobs ?? 0} dead-letter jobs`, icon: Database },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500">{label}</span>
              <span className="rounded-xl bg-[#18448D]/10 p-2 text-[#18448D]"><Icon className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 text-3xl font-black text-slate-950">{loading ? '—' : typeof value === 'number' ? value.toLocaleString() : value}</div>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      {!status?.schemaReady && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-black">Outbound migration is not applied on this deployment</h2>
              <p className="mt-1 text-sm">The dashboard is showing fail-closed defaults. All controls remain inactive and no background work can start.</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><ShieldCheck className="h-5 w-5 text-[#18448D]" /> Operational safeguards</h2>
            <p className="mt-1 text-sm text-slate-500">All subsystems are implemented behind independent gates; Live Sending remains code-locked off.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {[
              ['Environment kill switch', controls?.outboundSalesEnabled ? 'Enabled' : 'Disabled', controls?.outboundSalesEnabled ? CheckCircle2 : PauseCircle],
              ['Shadow Mode', controls?.shadowModeEnabled ? 'Enabled' : 'Disabled', Bot],
              ['Live sending', controls?.liveSendingEnabled ? 'Enabled' : 'Locked off', MailX],
              ['Emergency pause', controls?.emergencyPaused ? 'Active' : 'Not active', PauseCircle],
              ['Daily send ceiling', `${controls?.dailySendLimit ?? 30} maximum`, Send],
              ['Phase capability', 'Complete Shadow Mode; live send locked', ShieldCheck],
            ].map(([label, value, Icon]) => {
              const ItemIcon = Icon as typeof ShieldCheck;
              return (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <ItemIcon className="h-5 w-5 text-[#18448D]" />
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 font-black text-slate-900">{value}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><CircleDollarSign className="h-5 w-5 text-[#18448D]" /> Monthly cost guard</h2>
              <p className="mt-1 text-sm text-slate-500">Local ledger, independent of the AI Banner Designer.</p>
            </div>
            <Badge variant="outline">OpenAI</Badge>
          </div>
          <div className="mt-6 rounded-2xl bg-[#0b1f3a] p-5 text-white">
            <div className="text-sm font-semibold text-slate-300">Current recorded spend</div>
            <div className="mt-1 text-3xl font-black">{money(microusdToDollars(costs?.openAI ?? 0))}</div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-300">Local stop</span>
              <strong>{money((controls?.monthlyOpenAIBudgetCents ?? 800) / 100)}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-300">Recommended project limit</span>
              <strong>{money((controls?.openAIProjectLimitRecommendationCents ?? 1000) / 100)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Provider readiness</h2>
        <p className="mt-1 text-sm text-slate-500">Apollo discovery is installed for explicitly enabled test/staging use only. Configuration status never exposes secret values.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(status?.providers || []).map((provider) => (
            <div key={provider.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
              <div>
                <p className="font-bold text-slate-900">{provider.displayName}</p>
                <p className="text-xs text-slate-500">{provider.kind.replace('_', ' ')}</p>
              </div>
              <Badge variant={provider.configured ? 'success' : 'outline'}>{provider.configured ? 'Configured' : 'Not configured'}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
