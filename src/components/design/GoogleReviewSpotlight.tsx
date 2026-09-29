import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Star } from 'lucide-react';
import './GoogleReviewSpotlight.css';

// Transcribed from the five Google review screenshots supplied by the owner.
// Ellipses identify excerpts; stars describe each review, not an aggregate rating.
const reviews = [
  { name: 'Tasha Forrest', text: 'Delivered as quickly as stated. AWESOME BANNER! High Quality, should last years!' },
  { name: 'Nicole Tedesche', text: 'Both banners look amazing and super fast creating and shipping them Thank you very much I will be making more purchases' },
  { name: 'Ina M.', text: '…I have already shared this website to relatives and letting them know easy it was to order and fast delivery. …' },
  { name: 'Kochelle Denegall', text: 'Fast, Accurate and Amazing!!! Thanks Banners on the Fly!' },
  { name: 'janelle coulcher', text: 'I needed a banner fast for a retirement party for my brother in law out of state and they were great. He loved it and what a wonderful keepsake! 😊' },
];

export default function GoogleReviewSpotlight() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);
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
  const rotating = !paused && !hovered && !focused && !reducedMotion && visible;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % reviews.length), 8000);
    return () => window.clearInterval(timer);
  }, [rotating]);
  const move = (direction: number) => {
    setPaused(true);
    setActive(index => (index + direction + reviews.length) % reviews.length);
  };
  return (
    <section className="google-review-spotlight" aria-label="Customer Google reviews" aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="google-review-inner">
        <div className="google-review-label">
          <span className="google-review-source">Google reviews</span>
          <span className="google-review-stars" aria-label="5 out of 5 stars">
            {[0, 1, 2, 3, 4].map(star => <Star key={star} size={16} fill="currentColor" aria-hidden="true" />)}
          </span>
        </div>
        <div className="google-review-slides" aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">
          {reviews.map((review, index) => (
            <figure key={review.name} className={`google-review-slide${index === active ? ' is-active' : ''}`}
              aria-hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${reviews.length}`}>
              <blockquote>“{review.text}”</blockquote>
              <figcaption>— {review.name}</figcaption>
            </figure>
          ))}
        </div>
        <div className="google-review-controls">
          <button type="button" onClick={() => move(-1)} aria-label="Previous review"><ChevronLeft size={18} /></button>
          <span className="google-review-count" aria-hidden="true">{active + 1} / {reviews.length}</span>
          <button type="button" onClick={() => move(1)} aria-label="Next review"><ChevronRight size={18} /></button>
          {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play reviews' : 'Pause reviews'}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>}
        </div>
      </div>
    </section>
  );
}
