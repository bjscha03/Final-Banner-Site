import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { gtag } from '@/lib/analytics';
export function PromoPopup({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      const response = await fetch('/.netlify/functions/newsletter-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'site_popup' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('Could not send your code. Please try again.');
      setSuccess(true);
      // GA4 key event candidate: email_signup (enable in GA4 admin only after verification).
      gtag('event', 'email_signup', { method: 'popup', offer: 'SAVE20' });
    } catch { setError('Could not send your code. Please try again.'); }
    finally { setPending(false); }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="email-popup-title" className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-700"><X /></button>
      <p className="text-sm font-bold uppercase text-[#E85D26]">First-order savings</p>
      <h2 id="email-popup-title" className="mt-3 pr-8 text-2xl font-extrabold text-slate-900">Get your 20% off code by email</h2>
      {success ? <p role="status" className="mt-5 text-slate-700">Check your inbox for SAVE20. You can also use SAVE20 at checkout.</p> : <>
        <p className="mt-3 text-slate-600">Enter your email and we'll send you SAVE20 for 20% off your first order.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label htmlFor="popup-email" className="block text-sm font-semibold">Email address</label>
          <input id="popup-email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3" placeholder="you@example.com" />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={pending} className="min-h-12 w-full rounded-lg bg-[#E85D26] px-5 py-3 font-bold text-white disabled:opacity-60">{pending ? 'Sending…' : 'Email My 20% Off Code'}</button>
        </form>
        <p className="mt-4 text-xs text-slate-500">Subscribe for occasional offers. See our <a href="/privacy" className="underline">privacy policy</a>.</p>
      </>}
    </section>
  </div>;
}
