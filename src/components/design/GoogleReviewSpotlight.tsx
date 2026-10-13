import { useEffect, useState } from 'react';
import { Star, Pause, Play, ChevronRight } from 'lucide-react';
import './GoogleReviewSpotlight.css';

// Transcribed from the Google review screenshots supplied by the owner.
// Ellipses identify excerpts; stars describe each review, not an aggregate rating.
const reviews = [
  { name: 'Alma Sanchez', text: 'Great quality for the price! Will be ordering again from this company.' },
  { name: 'Greg Hood', text: 'Great quality banner supper fast to ship' },
  { name: 'Tasha Forrest', text: 'Delivered as quickly as stated. AWESOME BANNER! High Quality, should last years!' },
  { name: 'Nicole Tedesche', text: 'Both banners look amazing and super fast creating and shipping them Thank you very much I will be making more purchases' },
  { name: 'Ina M.', text: '…I have already shared this website to relatives and letting them know easy it was to order and fast delivery. …' },
  { name: 'Kochelle Denegall', text: 'Fast, Accurate and Amazing!!! Thanks Banners on the Fly!' },
  { name: 'janelle coulcher', text: 'I needed a banner fast for a retirement party for my brother in law out of state and they were great. He loved it and what a wonderful keepsake! 😊' },
];

/** Fade every owner-supplied review in place, reserving the tallest quote's height. */
export function FadingGoogleReviews() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);
  useEffect(() => {
    if (paused || !visible || reducedMotion) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % reviews.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused, visible, reducedMotion]);
  return <section data-testid="fading-google-reviews" className="google-review-fade border-t border-slate-200 px-1 pb-4 pt-2 text-[#061A31]" aria-label="Customer Google reviews" aria-roledescription="carousel">
    <div className="mb-1 flex items-center justify-between gap-2">
      <div>
        <span className="flex gap-0.5 text-amber-600" aria-label="5 out of 5 stars">{[0, 1, 2, 3, 4].map(star => <Star key={star} size={15} fill="currentColor" aria-hidden="true" />)}</span>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">Google reviews</p>
      </div>
      <div className="flex items-center text-slate-500">
        <span className="text-[11px] tabular-nums" aria-hidden="true">{active + 1} / {reviews.length}</span>
        {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play Google reviews' : 'Pause Google reviews'} aria-pressed={paused} className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-orange-600">{paused ? <Play size={15} /> : <Pause size={15} />}</button>}
        <button type="button" onClick={() => { setPaused(true); setActive(index => (index + 1) % reviews.length); }} aria-label="Next Google review" className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-orange-600"><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="google-review-slides" aria-live={paused || reducedMotion ? 'polite' : 'off'} aria-atomic="true">
      {reviews.map((review, index) => <figure key={review.name} className={`google-review-slide${index === active ? ' is-active' : ''}`} aria-hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${reviews.length}`}>
        <blockquote>“{review.text}”</blockquote><figcaption>— {review.name}</figcaption>
      </figure>)}
    </div>
  </section>;
}

/** A single-line review strip; artwork-page reviews keep their separate fading layout. */
export default function GoogleReviewSpotlight() {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const syncVisibility = () => setVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);
  return (
    <section data-testid="google-reviews" className="google-review-spotlight" aria-label="Customer Google reviews">
      <div className="google-review-compact-inner">
        <div className="flex shrink-0 items-center gap-2" aria-label="Google reviews, 5 out of 5 stars">
          <span className="text-[11px] font-bold">Google reviews</span>
          <span className="flex text-[#B76B00]" aria-hidden="true">{[0, 1, 2, 3, 4].map(star => <Star key={star} size={12} fill="currentColor" />)}</span>
        </div>
        <div className="google-review-marquee" aria-live="off">
          <div className="google-review-marquee-track" style={{ animationPlayState: paused || !visible ? 'paused' : undefined }}>
            {[false, true].map(duplicate => <div key={String(duplicate)} className="google-review-marquee-set" aria-hidden={duplicate || undefined}>
              {reviews.map(review => <p key={review.name}>“{review.text}” <span className="text-slate-500">— {review.name}</span></p>)}
            </div>)}
          </div>
        </div>
        <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play Google reviews' : 'Pause Google reviews'} aria-pressed={paused} className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-500 focus-visible:ring-2 focus-visible:ring-orange-600">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>
    </section>
  );
}
