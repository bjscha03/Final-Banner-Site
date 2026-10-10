import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';

type Data = { enabled: boolean; mode: string; phoneNumber: string; limits: { daily: number; monthly: number; perConversation: number };
  budget: { daily_units: number; monthly_units: number; day: string; month: string } | null;
  sessions: { id: string; phone: string; step: string; revision: number; approved_revision: number | null; order_id: string | null;
    config: { width_in?: number; height_in?: number; material?: string; quantity?: number }; updated_at: string; error_code: string | null }[];
  issues: { id: string; phone: string; status: string; error_code: string; provider_sid: string | null }[];
  inboundIssues: { sid: string; phone: string; error_code: string }[];
  setup: { twilioAccount: boolean; twilioToken: boolean; artworkStorage: boolean } };
type Connection = { status: 'connected' | 'missing_credentials' | 'invalid_credentials' | 'authentication_failed' | 'unavailable';
  accountType?: string; accountActive?: boolean; numbers?: { phoneNumber: string; sms: boolean; mms: boolean }[];
  listMayBeIncomplete?: boolean; selectedNumberConfigured?: boolean; selectedNumberOwned?: boolean;
  selectedNumberCapable?: boolean; routingMatches?: boolean };
const connectionErrors = {
  missing_credentials: 'Twilio settings are missing from this deployment. Save the account SID and auth token for Functions, then redeploy.',
  invalid_credentials: 'The saved Twilio settings have an invalid format. Check the private values in Netlify, then redeploy.',
  authentication_failed: 'Twilio rejected the saved credentials. Check that the account SID and auth token belong to the same account.',
  unavailable: 'Twilio could not be checked right now. Please try again.',
};
export default function TextOrders() {
  const { user, loading } = useAuth(); const navigate = useNavigate();
  const allowed = !loading && !!user && isAdmin(user);
  const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null); const [checking, setChecking] = useState(false);
  useEffect(() => { if (!loading && !allowed) navigate('/admin/setup', { replace: true }); }, [allowed, loading, navigate]);
  async function refresh() {
    setBusy(true);
    try { const response = await adminFetch('/.netlify/functions/admin-text-orders'); if (!response.ok) throw new Error('Could not load text orders.'); setData(await response.json()); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Please retry.'); } finally { setBusy(false); }
  }
  async function checkConnection() {
    setChecking(true); setConnection(null);
    try {
      const response = await adminFetch('/.netlify/functions/admin-text-orders?check=connection');
      if (response.status === 401) throw new Error('Please sign in again to check the account.');
      const result = await response.json();
      if (!result.connection) throw new Error('Could not check Twilio. Please retry.');
      setConnection(result.connection); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please retry.'); }
    finally { setChecking(false); }
  }
  useEffect(() => { if (allowed) void refresh(); }, [allowed]);
  if (!allowed) return <Layout><p className="p-8 text-center">Checking admin access…</p></Layout>;
  return <Layout><main className="mx-auto max-w-6xl px-4 py-8"><Link to="/admin/orders" className="font-semibold text-blue-800">← Back to orders</Link>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold text-[#0B1F3A]">Text orders</h1><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Refresh</Button></div>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-900">{error}</p>}
    <section className="my-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Twilio connection</h2>
      <p className="mt-2 text-sm text-slate-600">Check the saved credentials and assigned numbers. This check does not send texts, buy a number, or change settings.</p>
      <Button className="mt-4 min-h-11" disabled={checking} onClick={() => void checkConnection()}>{checking ? 'Checking…' : 'Check Twilio connection'}</Button>
      {connection && <div className="mt-4" role="status" aria-live="polite">{connection.status === 'connected' ? <>
        <p className="font-semibold">Connection verified · {connection.accountType} account{connection.accountActive ? '' : ' · account inactive'}</p>
        {connection.accountType === 'Trial' && <p className="mt-2 text-sm">Website preparation can continue on the trial. Full custom text ordering requires an account upgrade and number approval.</p>}
        {connection.numbers?.length ? <ul className="mt-3 space-y-2">{connection.numbers.map(number => <li key={number.phoneNumber} className="rounded bg-slate-50 p-3">{number.phoneNumber} · SMS {number.sms ? 'yes' : 'no'} · MMS {number.mms ? 'yes' : 'no'}</li>)}</ul>
          : <p className="mt-2">No numbers are assigned to this Twilio account yet.</p>}
        {connection.listMayBeIncomplete && <p className="mt-2 text-sm">Showing up to 20 assigned numbers. Set the intended ordering number to check it directly.</p>}
        <p className="mt-2 text-sm">{!connection.selectedNumberConfigured ? 'Next: select an assigned SMS/MMS number and save the ordering settings.'
          : !connection.selectedNumberOwned ? 'The configured ordering number is not assigned to this account.'
          : !connection.selectedNumberCapable ? 'The configured number must support both SMS and MMS.'
          : connection.routingMatches ? 'Inbound routing matches this website. Number approval and an end-to-end phone test are still required before launch.'
          : 'Next: configure the number’s inbound routing after number approval.'}</p>
      </> : <p className="text-red-900">{connectionErrors[connection.status]}</p>}</div>}
    </section>
    {data && <><section className="my-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">{data.enabled ? `Enabled · ${data.mode}` : 'Setup pending · disabled'}</h2><p className="mt-2">Number: {data.phoneNumber || 'Not connected'}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-slate-600">Twilio account details</dt><dd className="font-semibold">{data.setup.twilioAccount && data.setup.twilioToken ? 'Added' : 'Pending'}</dd></div><div><dt className="text-sm text-slate-600">Artwork storage</dt><dd className="font-semibold">{data.setup.artworkStorage ? 'Configured' : 'Pending'}</dd></div></dl>
      {!data.enabled && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Website setup can be prepared on a free trial. Full text ordering requires a paid Twilio account, an approved texting number, and a successful phone test before launch.</p>}
      <p className="mt-2 text-sm text-slate-600">Outgoing limits: {data.limits.daily} segments/MMS per day, {data.limits.monthly} per month, {data.limits.perConversation} per conversation. These limits exclude incoming texts, number rental, and carrier charges.</p>
      {data.budget && <p className="mt-2 text-sm">Reserved outgoing usage: {data.budget.daily_units} on {String(data.budget.day).slice(0, 10)} · {data.budget.monthly_units} for {String(data.budget.month).slice(0, 7)}. Unknown deliveries reserve usage until investigated.</p>}</section>
      <section className="mb-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Messages needing attention</h2>
        {!data.issues.length && !data.inboundIssues.length ? <p className="mt-3 text-slate-600">No failed messages recorded.</p> : <ul className="mt-3 space-y-2">{data.issues.map(issue => <li key={issue.id} className="break-words rounded bg-amber-50 p-3 text-sm">{issue.phone} · {issue.status} · {issue.error_code} {issue.provider_sid && <a className="ml-2 text-blue-800 underline" href={`https://console.twilio.com/us1/monitor/logs/sms/${issue.provider_sid}`} target="_blank" rel="noopener noreferrer">Twilio message</a>}</li>)}{data.inboundIssues.map(issue => <li key={issue.sid} className="break-words rounded bg-amber-50 p-3 text-sm">{issue.phone} · incoming · {issue.error_code}</li>)}</ul>}
        <p className="mt-3 text-sm text-slate-600">Check unknown deliveries in Twilio before retrying. They may already have reached the customer.</p></section>
      <h2 className="mb-4 text-xl font-bold">Latest conversations</h2><div className="space-y-3">{data.sessions.map(session => <article key={session.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{session.phone}</h3><span className="rounded bg-slate-100 px-2 py-1 text-sm">{session.step}</span></div><p className="mt-2 text-sm">{session.config.width_in || '?'} × {session.config.height_in || '?'} in · {session.config.material || 'Material pending'} · qty {session.config.quantity || 1} · artwork revision {session.revision}{session.approved_revision === session.revision && session.revision > 0 ? ' (approved)' : ''}</p><p className="mt-1 text-xs text-slate-500">Updated {new Date(session.updated_at).toLocaleString()}{session.error_code && ` · ${session.error_code}`}</p>{session.order_id && <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800" to="/admin/orders">View saved order in Orders</Link>}</article>)}</div>
      {!data.sessions.length && <p className="rounded-xl border p-6 text-slate-600">Text conversations will appear here once the number is connected.</p>}</>}
  </main></Layout>;
}
