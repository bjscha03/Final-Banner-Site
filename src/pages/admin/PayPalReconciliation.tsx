import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { adminFetch } from '@/lib/serverAuth';

const filters = ['all','multiple_orders','multiple_captures','capture_without_paid_order','paid_without_capture','unmatched_webhook','amount_mismatch'];
export default function PayPalReconciliation() {
  const [filter, setFilter] = useState('all');
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { adminFetch(`/.netlify/functions/paypal-reconciliation-report?filter=${filter}`).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.message || body.error); setOrders(body.orders || []); }).catch((e) => setError(e.message)); }, [filter]);
  return <Layout><main className="container mx-auto py-8 px-4"><h1 className="text-2xl font-bold">PayPal Payment Reconciliation</h1><p className="text-sm text-gray-600 mb-4">Read-only, last 14 days. Review in PayPal before taking manual action; this tool never refunds.</p>
    <select className="border rounded p-2 mb-4" value={filter} onChange={(e) => setFilter(e.target.value)}>{filters.map((f) => <option key={f} value={f}>{f.replaceAll('_',' ')}</option>)}</select>
    {error && <p className="text-red-700">{error}</p>}<div className="space-y-4">{orders.map((o) => <section key={o.id} className="border rounded p-4"><div className="flex gap-4"><img src={o.artwork_thumbnail || '/placeholder.svg'} alt="Artwork" className="h-16 w-16 object-cover"/><div><h2 className="font-semibold">{o.order_number || o.id} — ${(o.total_cents/100).toFixed(2)}</h2><p>{o.customer_name || o.email} · Admin: {o.status} · Reconciliation: {o.payment_reconciliation_status}</p><p className="text-xs">Linked order: {o.linked_paypal_order_id || 'none'} · capture: {o.linked_paypal_capture_id || 'none'}</p></div></div>
      <table className="w-full text-xs mt-3"><thead><tr><th>Time</th><th>Source</th><th>PayPal order</th><th>Capture</th><th>Status</th><th>Reason / recommended action</th></tr></thead><tbody>{o.attempts.map((a:any, i:number)=><tr key={i}><td>{a.createdAt}</td><td>{a.source}</td><td>{a.paypalOrderId}</td><td>{a.captureId}</td><td>{a.captureStatus || a.orderStatus || a.processingStatus}</td><td>{a.reason || (a.duplicateSuspected ? 'Possible duplicate — compare completed captures in PayPal; review for manual refund.' : 'Verify identifiers; no action if linked and complete.')}</td></tr>)}</tbody></table>
    </section>)}</div></main></Layout>;
}
