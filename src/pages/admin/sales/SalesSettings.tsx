import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, KeyRound, LockKeyhole, PauseCircle, Save, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { updateOutboundSettings } from '@/lib/outboundSales';
import { useSalesContext } from './SalesContext';

export default function SalesSettings() {
  const { status, loading, refresh } = useSalesContext();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [shadowModeEnabled, setShadowModeEnabled] = useState(true);
  const [emergencyPaused, setEmergencyPaused] = useState(false);
  const [dailySendLimit, setDailySendLimit] = useState(30);
  const [monthlyBudgetDollars, setMonthlyBudgetDollars] = useState(8);

  useEffect(() => {
    if (!status) return;
    setShadowModeEnabled(status.settings.shadowModeEnabled);
    setEmergencyPaused(status.settings.emergencyPaused);
    setDailySendLimit(status.settings.dailySendLimit);
    setMonthlyBudgetDollars(status.settings.monthlyOpenAIBudgetCents / 100);
  }, [status]);

  const controlsAvailable = Boolean(status?.schemaReady && !loading);

  const save = async () => {
    if (!status) return;
    setSaving(true);
    try {
      await updateOutboundSettings(status.settings.settingsVersion, {
        shadowModeEnabled: true,
        liveSendingEnabled: false,
        emergencyPaused,
        dailySendLimit,
        monthlyOpenAIBudgetCents: Math.round(monthlyBudgetDollars * 100),
      });
      await refresh();
      toast({ title: 'AI Sales Engine settings saved', description: 'The outbound audit history recorded this settings change.' });
    } catch (error) {
      toast({
        title: 'Settings were not saved',
        description: error instanceof Error ? error.message : 'Refresh and try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const secretRows = [
    ['Outbound OpenAI', status?.secretStatus.openAI],
    ['Outbound Resend', status?.secretStatus.resend],
    ['Resend webhook signing', status?.secretStatus.resendWebhook],
    ['Email verification', status?.secretStatus.emailVerification],
    ['Apollo discovery', status?.secretStatus.apolloDiscovery],
  ] as const;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-black text-slate-950">Global controls</h2>
          <p className="mt-1 text-sm text-slate-500">All controls are server-authenticated, versioned, and written to the outbound audit history.</p>
        </div>
        <div className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex gap-3">
              <Bot className="mt-0.5 h-5 w-5 text-sky-700" />
              <div><Label className="font-black text-sky-950">Shadow Mode</Label><p className="mt-1 text-sm text-sky-800">Build the queue, research, score, verify, and preview without sending externally.</p></div>
            </div>
            <Switch checked={shadowModeEnabled} disabled aria-label="Shadow Mode locked on" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-80">
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 text-slate-600" />
              <div><Label className="font-black text-slate-900">Live Sending</Label><p className="mt-1 text-sm text-slate-600">Locked off in Phase 2. A future phase still requires your explicit admin activation.</p></div>
            </div>
            <Switch checked={false} disabled aria-label="Live Sending locked" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-red-700" />
              <div><Label className="font-black text-red-950">Emergency Pause</Label><p className="mt-1 text-sm text-red-800">Overrides all automation state. The environment kill switch remains independently authoritative.</p></div>
            </div>
            <Switch checked={emergencyPaused} onCheckedChange={setEmergencyPaused} disabled={!controlsAvailable || saving} aria-label="Emergency Pause" className="data-[state=checked]:bg-red-700" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="daily-send-limit" className="flex items-center gap-2"><Send className="h-4 w-4" /> Daily send limit</Label>
              <Input id="daily-send-limit" type="number" min={0} max={30} step={1} value={dailySendLimit} onChange={(event) => setDailySendLimit(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} disabled={!controlsAvailable || saving} />
              <p className="text-xs text-slate-500">Hard maximum: 30 per day.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-openai-budget">Monthly OpenAI stop</Label>
              <div className="relative"><span className="absolute left-3 top-2.5 font-bold text-slate-500">$</span><Input id="monthly-openai-budget" type="number" min={0} max={1000} step="0.01" className="pl-7" value={monthlyBudgetDollars} onChange={(event) => setMonthlyBudgetDollars(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))} disabled={!controlsAvailable || saving} /></div>
              <p className="text-xs text-slate-500">Default local stop: $8. Recommended project hard limit: $10.</p>
            </div>
          </div>

          <Button onClick={() => void save()} disabled={!controlsAvailable || saving} className="w-full bg-[#18448D] text-white hover:bg-[#12386f]">
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving safely…' : 'Save global controls'}
          </Button>
          {!status?.schemaReady && <p className="text-center text-sm font-semibold text-amber-700">The outbound migrations are not present on this database; controls remain fail-closed.</p>}
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><KeyRound className="h-5 w-5 text-[#18448D]" /> Server configuration</h2>
          <p className="mt-1 text-sm text-slate-500">Only configured/not-configured status is returned. Secret names and values are never browser-editable.</p>
          <div className="mt-4 space-y-3">
            {secretRows.map(([label, configured]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <span className="text-sm font-bold text-slate-800">{label}</span>
                <Badge variant={configured ? 'success' : 'outline'}>{configured ? <><CheckCircle2 className="mr-1 h-3 w-3" /> Configured</> : 'Not configured'}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-slate-950">Provider configuration</h2><Badge variant="outline">Pluggable</Badge></div>
          <p className="mt-1 text-sm text-slate-500">Apollo is test/staging-only, disabled by default, and has no browser-editable credential path.</p>
          <div className="mt-4 space-y-3">
            {(status?.providers || []).map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div><p className="text-sm font-bold text-slate-900">{provider.displayName}</p><p className="text-xs text-slate-500">Adapter {provider.adapterInstalled ? 'installed' : 'not installed'} · {provider.executionScope === 'test_staging_only' ? 'test/staging only' : 'inactive'}</p></div>
                <Badge variant={provider.configured ? 'success' : 'outline'}>{provider.configured ? 'Configured' : 'Not configured'}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex gap-3"><PauseCircle className="mt-0.5 h-5 w-5" /><div><h2 className="font-black">Safe Phase 2 state</h2><p className="mt-1 text-sm">Licensed discovery can run only through explicit test/staging invocation. No OpenAI path, scheduler, worker entrypoint, Resend sender, reply receiver, or production provider execution is installed.</p></div></div>
        </section>
      </div>
    </div>
  );
}
