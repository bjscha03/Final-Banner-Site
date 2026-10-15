import React, { useId, useRef, useState } from 'react';
import { Loader2, ReceiptText } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import { usd } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const moneyCents = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : null;

export default function AdminPartialRefundAction({ order, onUpdated }: { order: Order; onUpdated: (order: Order) => void }) {
  const id = useId();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [tax, setTax] = useState('0.00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const original = useRef({ amount: 0, tax: 0 });
  const recorded = Number(order.partial_refund_cents || 0);
  const remainingPaid = order.status === 'refunded' ? 0 : Math.max(0, Number(order.total_cents) - recorded);
  const canEdit = ['paid', 'in_production', 'shipped', 'delivered', 'fulfilled'].includes(order.status);
  if (!canEdit && !recorded) return null;
  const openForm = () => {
    original.current = { amount: recorded, tax: Number(order.partial_refund_tax_cents || 0) };
    setAmount(recorded ? (recorded / 100).toFixed(2) : '');
    setTax((original.current.tax / 100).toFixed(2));
    setNote(''); setError(''); setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const amountCents = moneyCents(amount), taxCents = moneyCents(tax);
    if (amountCents === null || taxCents === null || amountCents >= Number(order.total_cents) || taxCents > amountCents) {
      setError('Enter a valid partial refund below the order total. Tax cannot exceed the refund.'); return;
    }
    savingRef.current = true; setSaving(true); setError('');
    try {
      const response = await adminFetch('/.netlify/functions/admin-record-partial-refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, amountCents, taxCents, previousAmountCents: original.current.amount, previousTaxCents: original.current.tax, note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.order) throw new Error(result.error || 'Unable to save the refund record.');
      onUpdated({ ...order, ...result.order });
      setOpen(false);
      toast({ title: 'Refund record saved', description: `${usd(amountCents / 100)} total refunded. Money metrics have been refreshed.` });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save the refund record.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2" data-partial-refund>
    {recorded > 0 && <div className="mb-2 text-xs text-rose-800"><strong>Partial refund recorded: {usd(recorded / 100)}</strong><div>Remaining paid: {usd(remainingPaid / 100)}</div></div>}
    {canEdit && <Button type="button" size="sm" variant="outline" onClick={openForm} className="h-auto min-h-9 w-full whitespace-normal text-xs"><ReceiptText className="mr-1.5 h-4 w-4 shrink-0" />{recorded ? 'Edit Partial Refund Record' : 'Record Partial Refund'}</Button>}
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Record a partial refund</DialogTitle><DialogDescription>For refunds already issued in Stripe or PayPal. This records the amount only; it does not issue a payment or email the customer.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Order #{order.id.slice(-8).toUpperCase()}</strong><div>{order.customer_name || order.email}</div><div>Original payment: {usd(Number(order.total_cents) / 100)}</div><div>Already recorded: {usd(recorded / 100)}</div></div>
          <div><label htmlFor={`${id}-amount`} className="text-sm font-semibold">Total refunded to date ($)</label><Input id={`${id}-amount`} type="text" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} disabled={saving} placeholder="25.00" /><p className="mt-1 text-xs text-slate-600">Enter the total of all partial refunds for this order. Saving replaces the recorded total; it does not add it again.</p></div>
          <details><summary className="cursor-pointer text-sm text-slate-700">Tax included in the refund</summary><label htmlFor={`${id}-tax`} className="mt-2 block text-xs">Total tax refunded ($)</label><Input id={`${id}-tax`} inputMode="decimal" value={tax} onChange={e => setTax(e.target.value)} disabled={saving} /><p className="mt-1 text-xs text-slate-600">Leave at $0.00 for a goodwill credit with no tax adjustment. Enter the tax portion shown by your payment provider to keep profit accurate.</p></details>
          <div><label htmlFor={`${id}-note`} className="text-sm font-semibold">Internal note (optional)</label><Input id={`${id}-note`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} disabled={saving} placeholder="Delivery issue — refunded in Stripe" /></div>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Recorded refunds reduce net sales and profit. Review-request emails are disabled while a partial refund is recorded.</p>
          {order.partial_refund_history?.length ? <details><summary className="cursor-pointer text-xs text-slate-600">Recent record changes</summary>{order.partial_refund_history.slice(-5).reverse().map((entry, index) => <div key={index} className="mt-2 border-t pt-2 text-xs text-slate-600">{new Date(entry.recorded_at).toLocaleString()} — {usd(entry.amount_cents / 100)}{entry.note && <div>{entry.note}</div>}</div>)}</details> : null}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Refund Record</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
