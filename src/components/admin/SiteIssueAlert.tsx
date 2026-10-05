import { Link } from 'react-router-dom';
import { AlertTriangle, Activity } from 'lucide-react';
import { useAuth, isAdmin } from '@/lib/auth';
import { useSiteIssues } from '@/hooks/useSiteIssues';

export default function SiteIssueAlert() {
  const { user, loading } = useAuth();
  const allowed = !loading && !!user && isAdmin(user);
  const { data, isError } = useSiteIssues(allowed);
  if (!allowed) return null;
  const count = data?.issues.filter(i => i.status === 'new' && i.traffic === 'customer').length || 0;
  return <div className={`border-b px-4 py-3 text-sm ${count || isError ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700'}`} role={count || isError ? 'status' : undefined}>
    <Link to="/admin/site-issues" className="mx-auto flex max-w-7xl items-center justify-between gap-3 font-semibold">
      <span className="flex items-center gap-2">{count || isError ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Activity className="h-4 w-4 shrink-0" />}
        {isError ? 'Site monitoring could not refresh' : count ? `${count}${data?.truncated ? '+' : ''} new site issue${count === 1 ? '' : 's'} to review` : data ? 'Site monitoring · No new reported issues' : 'Checking site issues…'}</span>
      <span className="shrink-0 underline">View issue log</span>
    </Link>
  </div>;
}
