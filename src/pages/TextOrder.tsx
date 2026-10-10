import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, LockKeyhole, Upload } from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';

type Order = { step: string; revision: number; approved: boolean; processing: boolean; optedOut: boolean; test: boolean;
  reference: string | null; previewUrl: string | null; errorCode: string | null;
  config: { width_in: number; height_in: number; material: string; quantity: number; fit_mode: string; grommets: string; pole_pockets: string; rope_placement: string | null };
  quote: { subtotal_cents: number; subtotal_after_discount_cents: number; tax_cents: number; total_cents: number; applied_discount_cents: number; applied_discount_label: string } | null };
const money = (value: number) => `$${(value / 100).toFixed(2)}`;
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

export default function TextOrder() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const api = useCallback(async (input?: Record<string, unknown>) => {
    const response = await fetch('/api/text-order', { method: input ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'We could not load your text order. Please try again.');
    return result;
  }, [token]);
  const refresh = useCallback(async () => {
    try { setOrder(await api()); setError(''); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load order.'); }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!order?.processing && order?.step !== 'PAYMENT') return;
    let attempts = 0;
    const timer = window.setInterval(() => { if (++attempts <= 60) void refresh(); else window.clearInterval(timer); }, 5000);
    return () => window.clearInterval(timer);
  }, [order?.processing, order?.step, refresh]);
  async function change(action: string) {
    if (!order) return;
    setBusy(action); setError(''); setNotice('');
    try { await api({ action, revision: order.revision, requestId: crypto.randomUUID() }); setNotice('Your order is updating. A text will arrive when it is ready.'); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); } finally { setBusy(''); }
  }
  async function upload(file?: File) {
    if (!file || !order) return;
    setBusy('upload'); setError(''); setNotice('');
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 50 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image smaller than 50MB.');
      const signed = await api({ action: 'upload-signature', revision: order.revision });
      const form = new FormData(); form.append('file', file); form.append('api_key', signed.apiKey); form.append('signature', signed.signature);
      Object.entries(signed.parameters).forEach(([key, value]) => form.append(key, String(value)));
      const uploaded = await fetch(signed.uploadUrl, { method: 'POST', body: form });
      const asset = await uploaded.json();
      if (!uploaded.ok || !asset.public_id) throw new Error('The upload failed. Please try again.');
      await api({ action: 'upload-commit', publicId: asset.public_id, revision: order.revision, requestId: crypto.randomUUID() });
      setNotice('Artwork uploaded. We are preparing your preview and will text it to you.'); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Upload failed.'); } finally { setBusy(''); }
  }
  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!order) return;
    setBusy('checkout'); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api({ action: 'checkout', revision: order.revision,
        customer: { fullName: data.get('name'), email: data.get('email') },
        shippingAddress: { name: data.get('name'), line1: data.get('line1'), line2: data.get('line2'),
          city: data.get('city'), state: data.get('state'), postalCode: data.get('zip'), country: 'US' } });
      const target = new URL(result.url);
      if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error('Could not open secure payment. Please try again.');
      window.location.assign(target.href);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare payment.'); setBusy(''); }
  }
  const locked = !!busy || !!order?.processing || !!order?.optedOut;
  const editable = order && ['ARTWORK', 'PREVIEW'].includes(order.step);
  return <Layout checkoutMode><Helmet><title>Your text order | Banners On The Fly</title><meta name="referrer" content="no-referrer" /></Helmet>
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold text-[#0B1F3A]">Your banner text order</h1>
      <p className="mt-2 text-slate-600">Review your artwork, approve it, and finish your order securely.</p>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-4 text-blue-900">{notice}</p>}
      {!order && !error && <p className="mt-8 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading your order…</p>}
      {order && <>
        {order.test && <p className="mt-5 rounded-lg bg-amber-50 p-4 font-semibold text-amber-900">Test order — no live payment or production.</p>}
        {order.optedOut && <p className="mt-5 rounded-lg bg-amber-50 p-4">You opted out of texts. Text START to resume ordering.</p>}
        {editable && order.errorCode?.startsWith('SMS_ARTWORK_') && <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4">Your last image could not be prepared. {order.errorCode === 'SMS_ARTWORK_LOW_RESOLUTION' ? 'It is too small for a clear print at this banner size. Please upload higher-resolution original artwork.' : 'Please upload a single JPG, PNG, or WebP original smaller than 50MB.'} {order.previewUrl && 'The preview below is your previously saved artwork.'}</p>}
        {order.step === 'PAID' ? <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6"><CheckCircle2 className="mb-3 text-emerald-700" /><h2 className="text-xl font-bold">Payment received — {order.reference}</h2><p className="mt-2">Your order is confirmed. Your email receipt will include the order details.</p></section> :
        order.step === 'CANCELED' ? <p className="mt-6 rounded-xl border p-6">This order was closed. Continue in your text conversation to start a new one.</p> : <>
          <section className="mt-6 rounded-xl border bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A]">Order details</h2>
            {order.quote ? <><p className="mt-3">{order.config.width_in} × {order.config.height_in} inches · {order.config.material} · Quantity {order.config.quantity}</p>
              <p className="mt-2 text-sm text-slate-600">Grommets: {order.config.grommets}. Pole pockets: {order.config.pole_pockets || 'none'}. Rope: {order.config.rope_placement || 'none'}.</p>
              <dl className="mt-5 space-y-2"><div className="flex justify-between"><dt>Banner total</dt><dd>{money(order.quote.subtotal_after_discount_cents)}</dd></div>
                {order.quote.applied_discount_cents > 0 && <div className="text-sm text-emerald-700">Discount included: {money(order.quote.applied_discount_cents)}</div>}
                <div className="flex justify-between"><dt>U.S. shipping</dt><dd>Included</dd></div><div className="flex justify-between"><dt>Sales tax</dt><dd>{money(order.quote.tax_cents)}</dd></div>
                <div className="flex justify-between border-t pt-3 text-xl font-bold"><dt>Total</dt><dd>{money(order.quote.total_cents)}</dd></div></dl></> : <p className="mt-3">Finish choosing your banner options in the text conversation.</p>}
          </section>
          {order.processing && <p role="status" className="mt-5 flex items-center gap-2 rounded-lg bg-blue-50 p-4"><Loader2 className="h-5 w-5 animate-spin" />Your order is updating. Please wait.</p>}
          {order.previewUrl && <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Artwork preview</h2>
            <img src={order.previewUrl} alt="Your current banner artwork preview" className="mt-4 h-auto w-full border bg-slate-50" referrerPolicy="no-referrer" />
            <p className="mt-3 text-sm text-slate-600">{order.config.fit_mode === 'fit' ? 'The full image is shown, with white space where needed.' : 'The image is cropped to fill your banner.'} Check text, spelling, and cropping. The approved design will be printed.</p>
            {order.step === 'PREVIEW' ? <div className="mt-4 flex flex-wrap gap-3"><Button disabled={locked} onClick={() => void change('approve')}>Approve this artwork</Button><Button variant="outline" disabled={locked} onClick={() => void change('fit')}>Show full image</Button><Button variant="outline" disabled={locked} onClick={() => void change('fill')}>Fill banner</Button></div> : order.approved && <p className="mt-4 flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Artwork approved</p>}
          </section>}
          {editable && <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Upload original artwork</h2><p className="mt-2 text-sm text-slate-600">Text messages can shrink images. Upload the original JPG, PNG, or WebP here for the best print quality. Maximum 50MB.</p>
            <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3"><Upload className="h-5 w-5" /><span>{busy === 'upload' ? 'Uploading…' : 'Choose artwork'}</span><input aria-label="Upload original artwork" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} className="min-w-0 flex-1 text-sm" onChange={event => void upload(event.target.files?.[0])} /></label>
          </section>}
          {['APPROVED', 'PAYMENT'].includes(order.step) && <section className="mt-6 rounded-xl border bg-white p-5 sm:p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><LockKeyhole className="h-5 w-5" />Shipping and payment</h2><p className="mt-2 text-sm text-slate-600">Shipping is included within the United States. Enter your details, then continue to secure payment.</p>
            <form onSubmit={pay} className="mt-5 grid gap-4 sm:grid-cols-2">{[['name', 'Full name', 'name', 'text'], ['email', 'Email for receipt', 'email', 'email'], ['line1', 'Street address', 'address-line1', 'text'], ['line2', 'Apt, suite, etc. (optional)', 'address-line2', 'text'], ['city', 'City', 'address-level2', 'text']].map(([name, label, complete, type]) => <label key={name} className="grid gap-1 text-sm font-semibold">{label}<input name={name} type={type} autoComplete={complete} required={name !== 'line2'} maxLength={200} className="min-h-11 rounded-lg border px-3 font-normal" /></label>)}
              <label className="grid gap-1 text-sm font-semibold">State<select name="state" autoComplete="address-level1" required className="min-h-11 rounded-lg border bg-white px-3 font-normal"><option value="">Choose a state</option>{STATES.map(state => <option key={state}>{state}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">ZIP code<input name="zip" autoComplete="postal-code" required pattern="[0-9]{5}(-[0-9]{4})?" className="min-h-11 rounded-lg border px-3 font-normal" /></label>
              <p className="text-sm leading-6 text-slate-600 sm:col-span-2">By placing your order, you approve this artwork and agree to our <Link className="text-blue-800 underline" to="/terms">terms</Link> and <Link className="text-blue-800 underline" to="/privacy">privacy policy</Link>. Never send payment-card details by text.</p>
              <Button type="submit" disabled={locked} className="min-h-12 sm:col-span-2">{busy === 'checkout' ? 'Preparing payment…' : order.step === 'PAYMENT' ? 'Continue secure payment' : `Continue to pay ${money(order.quote?.total_cents || 0)}`}</Button>
            </form></section>}
        </>}
      </>}
      <div className="mt-6 flex flex-wrap gap-4"><Button variant="outline" disabled={!!busy} onClick={() => void refresh()}>Refresh order</Button><Link to="/contact" className="flex min-h-11 items-center font-semibold text-blue-800">Need help?</Link></div>
    </main></Layout>;
}
