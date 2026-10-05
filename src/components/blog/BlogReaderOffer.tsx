import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { gtag, trackFBLead } from '@/lib/analytics';
import { useUIStore } from '@/store/ui';

export const BLOG_OFFER_KEY = 'bof_blog_reader_offer_v1';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const CONSENT = 'Send me occasional offers and design tips from Banners On The Fly. Unsubscribe anytime.';
let sessionShown = false;

function suppressed() {
  if (sessionShown) return true;
  try {
    const saved = JSON.parse(localStorage.getItem(BLOG_OFFER_KEY) || '{}');
    return saved.claimed === true || Number(saved.until) > Date.now();
  } catch { return false; }
}

function remember(claimed = false) {
  sessionShown = true;
  try { localStorage.setItem(BLOG_OFFER_KEY, JSON.stringify({ claimed, until: Date.now() + COOLDOWN_MS })); } catch { /* Session guard still works. */ }
}

/** Mounted only inside a successfully loaded blog post, never the site layout. */
export default function BlogReaderOffer({ slug }: { slug: string }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const active = useRef(true);
  const isCartOpen = useUIStore(s => s.isCartOpen);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (suppressed()) return;
    let elapsed = false;
    const maybeShow = () => {
      if (!elapsed || suppressed() || document.visibilityState !== 'visible' || useUIStore.getState().isCartOpen) return;
      if (document.querySelector('[role="dialog"][data-state="open"], dialog[open]')) return;
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const article = document.querySelector('article .prose');
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const read = (window.innerHeight - rect.top) / Math.max(rect.height, 1);
      if (read < 0.35) return;
      remember();
      setVisible(true);
      gtag('event', 'blog_offer_view', { slug });
    };
    const timer = window.setTimeout(() => { elapsed = true; maybeShow(); }, 25000);
    window.addEventListener('scroll', maybeShow, { passive: true });
    document.addEventListener('visibilitychange', maybeShow);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', maybeShow);
      document.removeEventListener('visibilitychange', maybeShow);
    };
  }, [slug]);

  const close = () => { remember(Boolean(code)); setVisible(false); };
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { remember(Boolean(code)); setVisible(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, code]);

  useEffect(() => { if (expanded) emailInput.current?.focus(); }, [expanded]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const website = new FormData(event.currentTarget).get('website');
    sending.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch('/.netlify/functions/blog-reader-offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), marketingConsent: consent, slug, website }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.code) throw new Error(result.error || 'We could not email your code. Please try again.');
      remember(true);
      if (!active.current) return;
      setCode(result.code); setExpiresAt(result.expiresAt);
      gtag('event', 'blog_offer_claim', { slug, marketing_consent: consent });
      trackFBLead();
    } catch (err) {
      if (active.current) setError(err instanceof Error ? err.message : 'Please try again in a moment.');
    } finally { sending.current = false; if (active.current) setBusy(false); }
  }

  if (!visible || isCartOpen) return null;
  return (
    <aside aria-label="Blog reader discount" data-testid="blog-reader-offer" className="fixed bottom-3 left-3 right-3 z-40 max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_16px_60px_rgba(6,26,49,0.22)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[390px]" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <button type="button" onClick={close} aria-label="Dismiss discount offer" className="absolute right-1 top-1 z-10 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#18448D]"><X size={19} /></button>
      <div className={`${expanded || code ? '' : 'hidden sm:block'} p-6`}>
        {code ? (
          <div role="status">
            <span className="mb-3 inline-flex rounded-full bg-emerald-50 p-2 text-emerald-700"><Check size={21} /></span>
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">Your next big idea: 25% off.</h2>
            <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">We emailed your code to <strong>{email.trim()}</strong>. Use that email at checkout.</p>
            <button type="button" className="my-4 flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border border-dashed border-[#18448D]/40 bg-[#F2F6FB] px-4 text-lg font-bold tracking-wide text-[#18448D]" onClick={async () => {
              try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setError('Select and copy the code below.'); }
            }} aria-label={`Copy code ${code}`}><span className="select-all">{code}</span>{copied ? <Check size={18} /> : <Copy size={18} />}</button>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">One use. Expires {new Date(expiresAt).toLocaleDateString()}. Cannot be combined with other offers.</p>
            <Link to="/design" onClick={() => gtag('event', 'blog_offer_design_click', { slug })} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#18448D] px-4 font-semibold text-white hover:bg-[#12366F]">Bring my idea to life <ArrowRight size={17} /></Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#C34A13]">A little perk for our readers</p>
            <h2 className="pr-2 font-display text-[27px] font-bold leading-tight tracking-tight text-[#0B1F3A]">Good ideas deserve<br />a big debut.</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Take <strong className="text-[#18448D]">25% off your next order.</strong> We’ll email you a personal code, ready when inspiration strikes.</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div><label htmlFor="blog-offer-email" className="mb-1 block text-sm font-semibold text-slate-700">Email address</label><input ref={emailInput} id="blog-offer-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-[#18448D] focus:ring-2 focus:ring-[#18448D]/20" /></div>
              <div aria-hidden="true" className="hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-slate-600"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#18448D]" /><span>{CONSENT} <span className="text-slate-500">(Optional)</span></span></label>
              <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#18448D] px-4 font-semibold text-white hover:bg-[#12366F] disabled:opacity-70">{busy ? <><Loader2 size={17} className="animate-spin" /> Emailing your code…</> : <>Email my 25% off code <ArrowRight size={17} /></>}</button>
              <p className="text-[11px] leading-relaxed text-slate-500">One use · Valid for 14 days · Cannot be combined with other offers. By submitting, you request an email with your code. <Link to="/privacy" className="underline">Privacy policy</Link></p>
            </form>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
      {!expanded && !code && <div className="flex min-h-24 items-center gap-3 py-3 pl-4 pr-11 sm:hidden"><span className="text-[27px] font-black leading-none text-[#18448D]">25%<span className="block text-xs uppercase tracking-wider">off</span></span><div><p className="text-sm font-bold text-[#0B1F3A]">Your next big idea starts here.</p><button type="button" onClick={() => setExpanded(true)} className="mt-1 min-h-10 text-sm font-semibold text-[#18448D] underline underline-offset-4">Get my reader discount →</button></div></div>}
    </aside>
  );
}
