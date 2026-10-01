import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
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

export default function GoogleReviewSpotlight() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const syncVisibility = () => setVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % reviews.length), 4000);
    return () => window.clearInterval(timer);
  }, [visible]);
  return (
    <section className="google-review-spotlight" aria-label="Customer Google reviews" aria-roledescription="carousel">
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
