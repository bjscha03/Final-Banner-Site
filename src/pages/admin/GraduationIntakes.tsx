import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, GraduationCap, RefreshCcw, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth, isAdmin } from '@/lib/auth';
import { usd } from '@/lib/pricing';

interface IntakeRow {
  id: string;
  customer_name: string;
  customer_email: string;
  product_type: string;
  status: string;
  design_fee_paid: boolean;
  final_payment_paid: boolean;
  estimated_product_total_cents?: number | null;
  final_product_amount_cents?: number | null;
  latest_proof_version?: number | null;
  created_at: string;
  graduate_info: { graduateName?: string; schoolName?: string };
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Pending Deposit',
  design_paid: 'Design Requested',
  deposit_paid: 'Design Requested',
  proof_sent: 'Proof Sent',
  revision_requested: 'Revision Requested',
  approved_awaiting_payment: 'Awaiting Final Payment',
  paid_ready_for_production: 'Ready for Production',
  in_production: 'In Production',
  completed: 'Completed',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending_payment: 'outline',
  design_paid: 'secondary',
  deposit_paid: 'secondary',
  proof_sent: 'default',
  revision_requested: 'destructive',
  approved_awaiting_payment: 'default',
  paid_ready_for_production: 'default',
  in_production: 'default',
  completed: 'secondary',
};

const PRODUCT_LABELS: Record<string, string> = {
  banner: 'Banner',
  yard_sign: 'Yard Sign',
  car_magnet: 'Car Magnet',
};

/**
 * Admin list of all designer-assisted (graduation) intakes.
 *
 * Lives at /admin/graduation-intakes and is linked from the existing /admin
 * orders page. Renders newest first; each row links to the per-intake detail
 * page where the admin can upload + send proofs and review the full intake.
 */
const AdminGraduationIntakes: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);

  const load = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/admin-graduation-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load intakes');
      setIntakes(data.intakes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intakes');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/admin/orders');
      return;
    }
    if (user?.email) load();
  }, [user, authLoading, navigate, load]);

  return (
    <Layout>
      <Helmet>
        <title>Graduation Intakes · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="bg-[#F7F7F7] min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 text-[#FF6A00]">
                <GraduationCap className="h-6 w-6" />
                <span className="text-xs uppercase tracking-wide font-bold">Designer Assisted</span>
              </div>
              <h1 className="text-2xl font-extrabold text-[#0B1F3A] mt-1">Graduation Intakes</h1>
              <p className="text-sm text-gray-500 mt-1">All graduation designer-assisted requests, newest first.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCcw className="h-4 w-4 mr-2" />Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/orders')}>
                ← All Orders
              </Button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF6A00] mx-auto" />
              </div>
            ) : error ? (
              <div className="py-10 text-center text-red-700 text-sm">{error}</div>
            ) : intakes.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">No graduation intakes yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Graduate / School</th>
                    <th className="text-left p-3">Product</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Proof</th>
                    <th className="text-right p-3">Estimated</th>
                    <th className="text-right p-3">Final</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {intakes.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-[#0B1F3A]">{r.customer_name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.customer_email}</div>
                      </td>
                      <td className="p-3 text-[#0B1F3A]">
                        {r.graduate_info?.graduateName || '—'}
                        {r.graduate_info?.schoolName && (
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.graduate_info.schoolName}</div>
                        )}
                      </td>
                      <td className="p-3 text-[#0B1F3A]">{PRODUCT_LABELS[r.product_type] || r.product_type}</td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>{STATUS_LABEL[r.status] || r.status}</Badge>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {r.latest_proof_version ? `v${r.latest_proof_version}` : '—'}
                      </td>
                      <td className="p-3 text-right text-[#0B1F3A]">
                        {r.estimated_product_total_cents != null ? usd(r.estimated_product_total_cents / 100) : '—'}
                      </td>
                      <td className="p-3 text-right text-[#0B1F3A]">
                        {r.final_payment_paid ? (
                          <span className="text-green-700 font-semibold">
                            {r.final_product_amount_cents != null ? usd(r.final_product_amount_cents / 100) : 'paid'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <Link to={`/admin/graduation/${r.id}`} className="text-[#FF6A00] inline-flex items-center text-sm font-semibold">
                          Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminGraduationIntakes;
