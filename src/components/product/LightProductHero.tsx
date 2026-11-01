import ProductionShippingBenefits from '@/components/delivery/ProductionShippingBenefits';
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductVisual from './ProductVisual';
import CompactProductHero from './CompactProductHero';
import GoogleReviewSpotlight from '@/components/design/GoogleReviewSpotlight';
import FirstOrderBadge from './FirstOrderBadge';
import { useProductFirstOrderOffer } from '@/hooks/useProductFirstOrderOffer';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import type { CityProductSlug } from '@/lib/seo/cityData';
import '@/styles/product-hero.css';

interface LightProductHeroProps {
  productSlug: CityProductSlug;
  title: string;
  accentText: string;
  eyebrow?: string;
  description?: string;
  primaryLabel: string;
  ctaUrl?: string;
  onStart?: () => void;
  secondary?: { label: string; href: string };
  offer?: React.ReactNode;
  photo?: React.ReactNode;
  attributes?: Record<string, string | boolean>;
}

/** Shared visual treatment; product selection, prices and delivery logic stay with their owners. */
export default function LightProductHero({ productSlug, title, accentText, eyebrow, description, primaryLabel, ctaUrl = '/design', onStart, secondary, offer, photo, attributes }: LightProductHeroProps) {
  const { showBadge } = useProductFirstOrderOffer();
  const action = <>{primaryLabel}<ArrowRight aria-hidden="true" /></>;
  const isLarge = attributes?.['data-product-page-hero'] === 'large-banners-fast';
  const specialized = attributes?.['data-political-signs-hero'] || attributes?.['data-fall-festival-hero'] || attributes?.['data-halloween-hero'];
  const mobileTitle = specialized ? title.replace(accentText, '').trim() : productSlug === 'yard-signs' ? 'Custom yard signs.' : productSlug === 'car-magnets' ? 'Custom car magnets.' : isLarge ? 'Large banners.' : 'Custom banners.';
  return (<>
    <CompactProductHero title={mobileTitle} accent={specialized ? accentText : "Without the wait."} freight={isLarge}
      discount={showBadge}
      photo={photo ?? <ProductVisual productSlug={productSlug} presentation="hero" priority />}
      action={onStart ? <button type="button" onClick={onStart}>{action}</button> : <Link to={ctaUrl}>{action}</Link>}
    />
    <section {...attributes} className="product-hero-light hidden lg:block">
      {productSlug !== "vinyl-banners" && <GoogleReviewSpotlight />}
      <div className="product-hero-stage">
        <div className="product-hero-copy">
          {eyebrow && <p className="product-hero-eyebrow">{eyebrow}</p>}
          <h1>{title.endsWith(accentText) ? <>{title.slice(0, -accentText.length)}<span className="product-hero-accent">{accentText}</span></> : title}</h1>
          {description && <p className="product-hero-description">{description}</p>}
          <ProductionShippingBenefits freight={attributes?.['data-product-page-hero'] === 'large-banners-fast'} />
          <div className="product-hero-actions">
            {onStart ? <button type="button" onClick={onStart} className="product-hero-cta">{action}</button> : <Link to={ctaUrl} className="product-hero-cta">{action}</Link>}
            {secondary && <a href={secondary.href} className="product-hero-secondary">{secondary.label}</a>}
          </div>
          <HeroDeliveryStatus variant="featured" className="product-hero-delivery" />
        </div>
        <div className="product-hero-media">
          {photo ?? <ProductVisual productSlug={productSlug} presentation="hero" priority className="h-full w-full" />}
          {showBadge && <FirstOrderBadge />}
        </div>
      </div>
    </section>
  </>);
}
