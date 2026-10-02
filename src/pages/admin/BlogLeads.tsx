import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';
import { quoteCsvCell } from '@/lib/admin-customer-csv';
import { Button } from '@/components/ui/button';

type Lead = { email: string; slug: string; createdAt: string; code: string; consent: boolean; consentAt: string | null; consentText: string; emailStatus: string; purchased: boolean; eligible: boolean; exclusionReason: string | null };
type Result = { ok: boolean; leads: Lead[]; total: number; page: number; pageSize: number; verificationAvailable: boolean; error?: string };

export default function BlogLeads() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const response = await adminFetch(`/.netlify/functions/admin-blog-leads?page=${page}`, { cache: 'no-store' });
    const data: Result = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load blog leads.');
    return data;
  }, [page]);
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setResult(await load()); } catch (err) { setResult(null); setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }, [load]);
  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin(user)) { navigate('/admin/setup', { replace: true }); return; }
    void refresh();
  }, [authLoading, user, navigate, refresh]);

  async function exportEligible() {
    setBusy(true); setError('');
    try {
      // Recheck purchases and unsubscribes at export time; never export stale UI rows.
      const current = await load(); setResult(current);
      if (!current.verificationAvailable) throw new Error('Subscription checks are unavailable. Please retry before exporting.');
      const rows = current.leads.filter(l => l.eligible);
      if (!rows.length) throw new Error('No eligible subscribers on this page.');
      const csv = [['Email', 'Article', 'Signup date', 'Consent date', 'Consent text', 'Discount code'], ...rows.map(l => [l.email, l.slug, l.createdAt, l.consentAt, l.consentText, l.code])].map(row => row.map(quoteCsvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url; a.download = `blog-subscribers-page-${page}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not export leads.'); }
    finally { setBusy(false); }
  }

  if (authLoading || !user || !isAdmin(user)) return <Layout><div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" aria-label="Loading" /></div></Layout>;
  return <Layout><main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><div className="mx-auto max-w-7xl">
    <Link to="/admin/customers" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#18448D]">← Customer analytics</Link>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-[#0B1F3A]">Blog reader leads</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Readers who requested a 25% code. Export includes only marketing subscribers with a confirmed code email, no purchase since signup, and no unsubscribe or suppression.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw size={16} className="mr-2" />Refresh</Button><Button disabled={busy || !result?.verificationAvailable} onClick={exportEligible}><Download size={16} className="mr-2" />Export eligible on this page</Button></div></div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {result && !result.verificationAvailable && <p className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Subscription checks are temporarily unavailable. Export is disabled until they recover.</p>}
    <p className="mb-3 text-sm text-slate-600">{result?.total ?? 0} total leads · {result?.leads.filter(l => l.eligible).length ?? 0} eligible on this page</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{['Email / signup', 'Article', 'Code email', 'Purchase', 'Follow-up eligibility'].map(label => <th key={label} className="p-4 font-semibold">{label}</th>)}</tr></thead><tbody>{result?.leads.map(l => <tr key={l.email} className="border-t border-slate-100"><td className="p-4"><span className="font-medium">{l.email}</span><span className="mt-1 block text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</span></td><td className="max-w-60 break-words p-4"><Link to={`/blog/${l.slug}`} className="text-[#18448D] underline">{l.slug}</Link></td><td className="p-4">{l.emailStatus}</td><td className="p-4">{l.purchased ? 'Purchased' : 'No purchase yet'}</td><td className="p-4"><span className={l.eligible ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{l.eligible ? 'Eligible subscriber' : l.exclusionReason}</span></td></tr>)}{!busy && !result?.leads.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No blog offer signups yet.</td></tr>}</tbody></table></div>
    <div className="mt-4 flex items-center justify-end gap-3"><Button variant="outline" disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={busy || !result || page * result.pageSize >= result.total} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    <p className="mt-6 text-xs text-slate-500">Purchases are matched by checkout email. This list does not automatically send follow-up campaigns or upload contacts to ad platforms.</p>
  </div></main></Layout>;
}
