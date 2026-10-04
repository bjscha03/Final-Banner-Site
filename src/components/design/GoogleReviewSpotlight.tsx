import { useEffect, useState } from 'react';
import { Star, Pause, Play } from 'lucide-react';
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

export default function GoogleReviewSpotlight({ compactMobile = false }: { compactMobile?: boolean }) {
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const syncVisibility = () => setVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);
  useEffect(() => {
    if (!visible || paused) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % reviews.length), 4000);
    return () => window.clearInterval(timer);
  }, [visible, paused]);
  return (
    <section data-testid="google-reviews" className={`google-review-spotlight${compactMobile ? ' google-review-spotlight--compact-mobile' : ''}`} aria-label="Customer Google reviews" aria-roledescription="carousel">
      {compactMobile && <div className="google-review-compact-inner">
        <div className="shrink-0" aria-label="Google reviews, 5 out of 5 stars">
          <p className="text-[10px] font-bold">Google reviews</p>
          <div className="flex text-[#B76B00]" aria-hidden="true">{[0, 1, 2, 3, 4].map(star => <Star key={star} size={12} fill="currentColor" />)}</div>
        </div>
        <div className="google-review-marquee" aria-live="off">
          <div className="google-review-marquee-track" style={{ animationPlayState: paused || !visible ? 'paused' : undefined }}>
            {[false, true].map(duplicate => <div key={String(duplicate)} className="google-review-marquee-set" aria-hidden={duplicate || undefined}>
              {reviews.map(review => <p key={review.name}>“{review.text}” <span className="text-slate-500">— {review.name}</span></p>)}
            </div>)}
          </div>
        </div>
        <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play Google reviews' : 'Pause Google reviews'} aria-pressed={paused} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-slate-500 focus-visible:ring-2 focus-visible:ring-orange-600">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>}
      <div className="google-review-inner">
        <div className="google-review-label">
          <span className="google-review-source">Google reviews</span>
          <span className="google-review-stars" aria-label="5 out of 5 stars">
            {[0, 1, 2, 3, 4].map(star => <Star key={star} size={16} fill="currentColor" aria-hidden="true" />)}
          </span>
        </div>
        <div className="google-review-slides" aria-live="off" aria-atomic="true">
          {reviews.map((review, index) => (
            <figure key={review.name} className={`google-review-slide${index === active ? ' is-active' : ''}`}
              aria-hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${reviews.length}`}>
              <blockquote>“{review.text}”</blockquote>
              <figcaption>— {review.name}</figcaption>
            </figure>
          ))}
        </div>

      </div>
    </section>
  );
}
