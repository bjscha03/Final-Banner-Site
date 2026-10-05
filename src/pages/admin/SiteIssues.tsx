import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Check, FlaskConical, RefreshCw } from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';
import { ISSUE_LABELS } from '@/lib/siteIssueSchema';
import { SITE_ISSUES_QUERY, useSiteIssues, type IssueRow } from '@/hooks/useSiteIssues';

export default function SiteIssues() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = !loading && !!user && isAdmin(user);
  const result = useSiteIssues(allowed);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('new');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  useEffect(() => { if (!loading && !allowed) navigate('/admin/setup', { replace: true }); }, [loading, allowed, navigate]);
  const issues = result.data?.issues || [];
  const newIssues = issues.filter(i => i.status === 'new' && i.traffic === 'customer');
  const displayed = issues.filter(i => filter === 'tests' ? i.traffic === 'test' : filter === 'all' ? i.traffic === 'customer' : i.traffic === 'customer' && i.status === 'new');
  async function review(issue: IssueRow) {
    setBusy(issue.id); setActionError('');
    try {
      const response = await adminFetch('/.netlify/functions/admin-site-issues', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: issue.key, status: issue.status === 'new' ? 'reviewed' : 'new' }) });
      if (!response.ok) throw new Error('Could not update this issue. Please retry.');
      await queryClient.invalidateQueries({ queryKey: SITE_ISSUES_QUERY });
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update issue.'); }
    finally { setBusy(''); }
  }
  async function sendTest() {
    setBusy('test'); setActionError(''); setNotice('');
    try {
      const id = crypto.randomUUID();
      const response = await adminFetch('/.netlify/functions/report-site-issue', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sessionId: crypto.randomUUID(), kind: 'monitor_test', occurredAt: new Date().toISOString(), page: '/admin/site-issues', traffic: 'test', online: navigator.onLine, details: { stage: 'admin_test' } }) });
      if (!response.ok) throw new Error('The monitoring test failed. Please retry.');
      setFilter('tests');
      const refreshed = await result.refetch();
      if (!refreshed.data?.issues.some(i => i.id === id)) throw new Error('Test was submitted, but could not yet be verified in the log. Refresh to check.');
      setNotice('Monitoring test received and verified in the issue log.');
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Monitoring test failed.'); }
    finally { setBusy(''); }
  }
  if (!allowed) return <Layout><p className="p-8 text-center">Checking admin access…</p></Layout>;
  return <Layout><div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><div className="mx-auto max-w-6xl">
    <Link to="/admin/orders" className="mb-5 inline-flex min-h-11 items-center font-semibold text-[#18448D]">← Back to orders</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-3 text-3xl font-bold text-[#0B1F3A]"><Activity />Site issues</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Upload failures, stalled uploads, technical checkout errors, and page crashes reported by the site. Updates every 30 seconds while admin is open.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={result.isFetching} onClick={() => void result.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <Button variant="outline" disabled={!!busy} onClick={sendTest}><FlaskConical className="mr-2 h-4 w-4" />Send monitoring test</Button></div></div>
    <div className={`my-6 rounded-xl border p-4 ${newIssues.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`} aria-live="polite">
      <p className="flex items-center gap-2 text-lg font-bold text-[#0B1F3A]"><AlertTriangle className="h-5 w-5" />{result.isError ? 'Monitoring refresh failed' : result.isPending ? 'Checking issues…' : `${newIssues.length}${result.data?.truncated ? '+' : ''} new reported issue${newIssues.length === 1 ? '' : 's'}`}</p>
      <p className="mt-1 text-sm text-slate-600">{result.data ? `Last checked ${new Date(result.data.checkedAt).toLocaleTimeString()}. ` : ''}Reports are kept for 30 days. Test traffic is separate.</p>
    </div>
    {(result.isError || actionError) && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError || 'Could not refresh monitoring. The previous results may be out of date.'}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Issue filters">{[['new', 'Needs review'], ['all', 'All customer reports'], ['tests', 'Tests']].map(([value, label]) => <Button key={value} variant={filter === value ? 'default' : 'outline'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div>
    {result.data?.truncated && <p className="mb-4 text-sm text-amber-800">Showing the latest 200 reports from the last 30 days.</p>}
    {!result.isPending && !result.isError && !displayed.length && <div className="rounded-xl border bg-white p-8 text-center text-slate-600">No reports in this view. Monitoring records new issues from the time it was enabled.</div>}
    <div className="space-y-4">{displayed.map(issue => <article key={issue.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-[#0B1F3A]">{ISSUE_LABELS[issue.kind]}</h2><p className="mt-1 text-sm text-slate-600">{new Date(issue.occurredAt).toLocaleString()} · {issue.device} · {issue.browser} / {issue.os}</p></div>
        <Button size="sm" variant="outline" disabled={busy === issue.id} onClick={() => void review(issue)}><Check className="mr-1 h-4 w-4" />{issue.status === 'new' ? 'Mark reviewed' : 'Reopen'}</Button></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded bg-slate-100 px-2 py-1">{issue.page}</span><span className="rounded bg-slate-100 px-2 py-1">{issue.status === 'reviewed' ? 'Reviewed' : 'Needs review'}</span>{issue.traffic === 'test' && <span className="rounded bg-violet-100 px-2 py-1 text-violet-900">Test traffic</span>}{!issue.online && <span className="rounded bg-amber-100 px-2 py-1">Browser was offline</span>}</div>
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[#18448D]">Diagnostic details</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries({ ...issue.details, session: issue.sessionId, report: issue.id, deploy: issue.deployId }).map(([key, value]) => <div key={key} className="min-w-0 rounded bg-slate-50 p-2"><dt className="text-xs font-semibold text-slate-500">{key}</dt><dd className="break-all font-mono text-xs text-slate-800">{String(value)}</dd></div>)}</dl></details>
    </article>)}</div>
    <p className="mt-6 text-xs leading-5 text-slate-500">A report signals a problem to investigate; it does not prove a lost order. Browser reports may arrive after connectivity returns. If a browser cannot run the site or contact the server, a report may not arrive. This page does not send email or push alerts.</p>
  </div></div></Layout>;
}
