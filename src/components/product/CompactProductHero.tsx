import { useEffect, useRef, type ReactNode } from 'react';
import { Plane, Timer } from 'lucide-react';
import ProductionShippingBenefits from '@/components/delivery/ProductionShippingBenefits';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import GoogleReviewSpotlight from '@/components/design/GoogleReviewSpotlight';
import '@/styles/compact-product-hero.css';

interface Props {
  title: string;
  accent: string;
  photo: ReactNode;
  delivery?: ReactNode;
  specialty?: boolean;
  freight?: boolean;
  discount?: boolean;
  action?: ReactNode;
  testId?: string;
}

export default function CompactProductHero({ title, accent, photo, delivery, specialty = false, freight = false, discount = false, action, testId }: Props) {
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!hero.getClientRects().length) return;
        const bar = document.querySelector('[data-testid="mobile-subtotal-bar"]');
        const barHeight = bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().height : 0;
        // Keep the dates and review strip above the real sticky order bar,
        // including safe-area padding and wrapping on narrower phones.
        hero.dataset.hasOrderBar = String(barHeight > 0);
        const top = hero.getBoundingClientRect().top + window.scrollY;
        hero.style.setProperty('--compact-available-height', `${Math.max(320, window.innerHeight - top - barHeight)}px`);
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    const header = document.querySelector('[data-site-header]');
    const bar = document.querySelector('[data-testid="mobile-subtotal-bar"]');
    if (header) observer?.observe(header);
    if (bar) observer?.observe(bar);
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);

  return <section ref={heroRef} className="compact-product-hero" data-testid={testId || 'compact-product-hero'}>
    <div className="compact-product-copy">
      <h1>{title}<span>{accent}</span></h1>
      {specialty ? <ul className="production-shipping-benefits" aria-label="Ordering benefits">
        <li><Timer aria-hidden="true" /><div><strong>NEXT BUSINESS DAY</strong><span>SHIPMENT*</span></div></li>
        <li><Plane aria-hidden="true" /><div><strong>FREE FEDEX</strong><span>NEXT-DAY AIR</span><small>Shipping included</small></div></li>
      </ul> : <ProductionShippingBenefits freight={freight} />}
    </div>
    <div className="compact-product-photo">
      {photo}
      {discount && <div data-testid="mobile-banner-discount-badge" className="compact-product-discount" aria-label="20% off your first order"><strong>20%<br />OFF</strong><span>YOUR FIRST<br />ORDER</span></div>}
    </div>
    <div className="compact-product-delivery">{delivery ?? <HeroDeliveryStatus variant="featured" />}</div>
    <GoogleReviewSpotlight />
    {action && <div className="compact-product-action">{action}</div>}
  </section>;
}
