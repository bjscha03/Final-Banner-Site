import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Monitor, Truck, type LucideIcon } from 'lucide-react';
import ProductVisual from './ProductVisual';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import type { CityProductSlug } from '@/lib/seo/cityData';
import '@/styles/product-hero.css';

export interface HeroBenefit { label: string; icon: LucideIcon }
const defaultBenefits: HeroBenefit[] = [
  { label: '24-hour standard production', icon: Clock3 },
  { label: 'Free next-day air after production', icon: Truck },
  { label: 'Live print preview', icon: Monitor },
];

interface LightProductHeroProps {
  productSlug: CityProductSlug;
  title: string;
  eyebrow?: string;
  description?: string;
  primaryLabel: string;
  ctaUrl?: string;
  onStart?: () => void;
  secondary?: { label: string; href: string };
  offer?: React.ReactNode;
  benefits?: HeroBenefit[];
  photo?: React.ReactNode;
  attributes?: Record<string, string | boolean>;
}

/** Shared visual treatment; product selection, prices and delivery logic stay with their owners. */
export default function LightProductHero({ productSlug, title, eyebrow, description, primaryLabel, ctaUrl = '/design', onStart, secondary, offer, benefits = defaultBenefits, photo, attributes }: LightProductHeroProps) {
  const action = <>{primaryLabel}<ArrowRight aria-hidden="true" /></>;
  return (
    <section {...attributes} className="product-hero-light">
      <div className="product-hero-stage">
        <div className="product-hero-copy">
          {eyebrow && <p className="product-hero-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="product-hero-description">{description}</p>}
          <div className="product-hero-actions">
            {onStart ? <button type="button" onClick={onStart} className="product-hero-cta">{action}</button> : <Link to={ctaUrl} className="product-hero-cta">{action}</Link>}
            {secondary && <a href={secondary.href} className="product-hero-secondary">{secondary.label}</a>}
          </div>
          {offer && <div className="product-hero-offer">{offer}</div>}
          <HeroDeliveryStatus variant="light" className="product-hero-delivery" />
        </div>
        <div className="product-hero-media">
          {photo ?? <ProductVisual productSlug={productSlug} presentation="hero" priority className="h-full w-full" />}
        </div>
      </div>
      <div className="product-hero-benefits">
        <ul aria-label="Product ordering benefits">
          {benefits.map(({ label, icon: Icon }) => <li key={label}><Icon aria-hidden="true" /><span>{label}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
