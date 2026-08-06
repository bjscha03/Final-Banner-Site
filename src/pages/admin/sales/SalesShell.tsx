import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bot,
  CircleDollarSign,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShoppingBag,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth, isAdmin } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { getOutboundStatus, type OutboundStatus } from '@/lib/outboundSales';
import { SalesContext } from './SalesContext';

const navigation = [
  { to: '/admin/sales', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/sales/prospects', label: 'Prospect Queue', icon: ClipboardList },
  { to: '/admin/sales/activity', label: 'Email Activity', icon: Activity },
  { to: '/admin/sales/replies', label: 'Replies', icon: Inbox },
  { to: '/admin/sales/orders', label: 'Orders & Revenue', icon: ShoppingBag },
  { to: '/admin/sales/performance', label: 'Performance', icon: BarChart3 },
  { to: '/admin/sales/costs', label: 'Cost Analytics', icon: CircleDollarSign },
  { to: '/admin/sales/errors', label: 'Error Logs', icon: ShieldAlert },
  { to: '/admin/sales/settings', label: 'Settings', icon: Settings },
];

function modeBadge(status: OutboundStatus | null) {
  const mode = status?.controls.mode || 'disabled';
  if (mode === 'live') return <Badge className="border-emerald-500/30 bg-emerald-400/15 text-emerald-100">Live Sending</Badge>;
  if (mode === 'shadow') return <Badge className="border-sky-400/30 bg-sky-400/15 text-sky-100">Shadow Mode</Badge>;
  if (mode === 'emergency_paused') return <Badge className="border-red-400/30 bg-red-400/15 text-red-100">Emergency Pause</Badge>;
  return <Badge className="border-slate-400/30 bg-slate-400/15 text-slate-200">Disabled</Badge>;
}

export default function SalesShell() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<OutboundStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    try {
      setStatus(await getOutboundStatus(controller.signal));
    } catch (requestError) {
      if ((requestError as Error)?.name !== 'AbortError') {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load AI Sales Engine status.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && isAdmin(user)) void refresh();
  }, [authLoading, user, refresh]);

  const context = useMemo(() => ({ status, loading, error, refresh }), [status, loading, error, refresh]);

  if (authLoading) {
    return <Layout><div className="flex min-h-[60vh] items-center justify-center text-slate-600">Verifying admin access…</div></Layout>;
  }
  if (!user || !isAdmin(user)) return <Navigate to="/admin/setup" replace />;

  return (
    <Layout>
      <main className="min-h-screen bg-[#f3f6fa]">
        <header className="border-b border-white/10 bg-[#0b1f3a] px-4 py-5 text-white sm:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                  <Bot className="h-4 w-4" /> AI Sales Engine
                </span>
                {modeBadge(status)}
                <Badge className="border-white/20 bg-white/10 text-white">Phase 2 Deterministic Discovery</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">Outbound Sales Command Center</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-300">
                Monitor licensed discovery, deterministic research, exclusions, lead scoring, and cost from one isolated Shadow Mode workspace.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void refresh()}
                disabled={loading}
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
              </Button>
              <Button asChild className="bg-[#ff6b35] text-white hover:bg-[#e85a28]">
                <a href="/admin/orders">Return to Orders</a>
              </Button>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white px-3 shadow-sm sm:px-6">
          <nav aria-label="AI Sales Engine navigation" className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto py-2">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn(
                  'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors',
                  isActive ? 'bg-[#18448D] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#18448D]',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <SalesContext.Provider value={context}>
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
                AI Sales Engine status could not be loaded: {error}
              </div>
            )}
            <Outlet />
          </div>
        </SalesContext.Provider>
      </main>
    </Layout>
  );
}
