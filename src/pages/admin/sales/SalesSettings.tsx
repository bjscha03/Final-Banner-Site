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
  const [shadowGenerationEnabled, setShadowGenerationEnabled] = useState(false);
  const [emergencyPaused, setEmergencyPaused] = useState(false);
  const [dailySendLimit, setDailySendLimit] = useState(30);
  const [monthlyBudgetDollars, setMonthlyBudgetDollars] = useState(8);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [replyIngestionEnabled, setReplyIngestionEnabled] = useState(false);
  const [replyAIFallbackEnabled, setReplyAIFallbackEnabled] = useState(false);
  const [attributionEnabled, setAttributionEnabled] = useState(false);
  const [learningEnabled, setLearningEnabled] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);

  useEffect(() => {
    if (!status) return;
    setShadowModeEnabled(status.settings.shadowModeEnabled);
    setShadowGenerationEnabled(status.settings.shadowGenerationEnabled);
    setEmergencyPaused(status.settings.emergencyPaused);
    setDailySendLimit(status.settings.dailySendLimit);
    setMonthlyBudgetDollars(status.settings.monthlyOpenAIBudgetCents / 100);
    setAutomationEnabled(status.settings.automationEnabled);
    setReplyIngestionEnabled(status.settings.replyIngestionEnabled);
    setReplyAIFallbackEnabled(status.settings.replyAIFallbackEnabled);
    setAttributionEnabled(status.settings.attributionEnabled);
    setLearningEnabled(status.settings.learningEnabled);
    setMonitoringEnabled(status.settings.monitoringEnabled);
  }, [status]);

  const controlsAvailable = Boolean(status?.schemaReady && !loading);

  const save = async () => {
    if (!status) return;
    setSaving(true);
    try {
      await updateOutboundSettings(status.settings.settingsVersion, {
        shadowModeEnabled: true,
        // A deployment that loses its approved staging context or credential
        // can always fail closed when another setting is saved.
        shadowGenerationEnabled: shadowGenerationAvailable ? shadowGenerationEnabled : false,
        liveSendingEnabled: false,
        emergencyPaused,
        dailySendLimit,
        monthlyOpenAIBudgetCents: Math.round(monthlyBudgetDollars * 100),
        automationEnabled: automationAvailable ? automationEnabled : false,
        replyIngestionEnabled: replyIngestionAvailable ? replyIngestionEnabled : false,
        replyAIFallbackEnabled: replyAIFallbackAvailable ? replyAIFallbackEnabled : false,
        suggestedReplyGenerationEnabled: false,
        deliveryWebhookEnabled: replyIngestionAvailable ? replyIngestionEnabled : false,
        attributionEnabled,
        learningEnabled,
        monitoringEnabled,
        minimumLearningSample: status.settings.minimumLearningSample,
        explorationPercent: status.settings.explorationPercent,
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
    ['Unsubscribe signing', status?.secretStatus.unsubscribeSigning],
    ['Shadow automation signing', status?.secretStatus.automation],
    ['Sender identity & postal address', status?.secretStatus.deliveryIdentity],
    ['Email verification', status?.secretStatus.emailVerification],
    ['Apollo discovery', status?.secretStatus.apolloDiscovery],
  ] as const;
  const shadowGenerationAvailable = Boolean(
    controlsAvailable && status?.controls.shadowGenerationAvailable && status?.secretStatus.openAI,
  );
  const automationAvailable = Boolean(controlsAvailable && status?.controls.automationAvailable);
  const replyIngestionAvailable = Boolean(controlsAvailable && status?.controls.replyIngestionAvailable && status?.secretStatus.resendWebhook && status?.secretStatus.resend);
  const replyAIFallbackAvailable = Boolean(
    replyIngestionAvailable && status?.controls.replyAIFallbackAvailable && status?.secretStatus.openAI,
  );

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
            <Switch checked={shadowModeEnabled} disabled aria-label="Shadow Mode locked on" className="data-[state=checked]:bg-sky-700" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-80">
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 text-slate-600" />
              <div><Label className="font-black text-slate-900">Live Sending</Label><p className="mt-1 text-sm text-slate-600">Code-locked off. Activation requires a separately reviewed release after production credentials, DNS, compliance, and deliverability checks.</p></div>
            </div>
            <Switch checked={false} disabled aria-label="Live Sending locked" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex gap-3">
              <Bot className="mt-0.5 h-5 w-5 text-violet-700" />
              <div><Label className="font-black text-violet-950">Shadow Generation</Label><p className="mt-1 text-sm text-violet-800">Allows authenticated, admin-triggered personalized previews in approved test or staging deployments only. It never enables sending.</p></div>
            </div>
            <Switch checked={shadowGenerationEnabled} onCheckedChange={setShadowGenerationEnabled} disabled={!shadowGenerationAvailable || saving} aria-label="Shadow Generation" className="data-[state=checked]:bg-violet-700" />
          </div>
          {!shadowGenerationAvailable && <p className="-mt-3 text-xs font-semibold text-violet-700">Requires migration 023, the dedicated outbound key, and an explicitly approved non-production deployment context.</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Shadow automation', automationEnabled, setAutomationEnabled, automationAvailable, 'Runs discovery, generation, planning, attribution, and metrics in approved staging only.'],
              ['Reply ingestion', replyIngestionEnabled, setReplyIngestionEnabled, replyIngestionAvailable, 'Signed Resend inbound events; suggested drafts remain review-only.'],
              ['AI fallback classification', replyAIFallbackEnabled, setReplyAIFallbackEnabled, replyAIFallbackAvailable, 'Used only for genuinely unclear replies after deterministic rules; never sends a response.'],
              ['Order attribution', attributionEnabled, setAttributionEnabled, controlsAvailable, 'Reads paid orders and writes only outbound attribution records.'],
              ['Learning', learningEnabled, setLearningEnabled, controlsAvailable, 'Requires minimum samples and preserves controlled exploration.'],
              ['Monitoring', monitoringEnabled, setMonitoringEnabled, controlsAvailable, 'Creates redacted alerts for budgets, queues, and safety rates.'],
            ].map(([label, checked, setter, available, description]) => (
              <div key={String(label)} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div><Label className="font-black text-slate-900">{label}</Label><p className="mt-1 text-xs text-slate-500">{description}</p></div>
                <Switch checked={Boolean(checked)} onCheckedChange={setter as (value: boolean) => void} disabled={!available || saving} aria-label={String(label)} />
              </div>
            ))}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-75"><div><Label className="font-black text-slate-900">Automatic replies</Label><p className="mt-1 text-xs text-slate-500">Not installed. Deterministic suggested replies always require admin review.</p></div><Switch checked={false} disabled aria-label="Automatic replies locked" /></div>
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

        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5" /><div><h2 className="font-black">Outbound delivery provider compliance lock</h2><p className="mt-1 text-sm">Resend's current Acceptable Use Policy prohibits cold outreach. The outbound Resend transport is independently code-blocked unless written provider authorization is reviewed, or a compliant provider adapter is installed. Existing transactional Resend email is unchanged.</p></div></div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex gap-3"><PauseCircle className="mt-0.5 h-5 w-5" /><div><h2 className="font-black">Production-ready Shadow state</h2><p className="mt-1 text-sm">The full subsystem is implemented behind independent gates. Production provider, OpenAI, inbound, automation, and live-send execution remain code-blocked or disabled; no scheduler is registered and no automatic reply path exists.</p></div></div>
        </section>
      </div>
    </div>
  );
}
