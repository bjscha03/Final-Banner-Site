import ProductionShippingBenefits from '@/components/delivery/ProductionShippingBenefits';
import { getActiveSeasonalCampaign } from '@/lib/seasonalCampaigns';
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import '@/styles/homepage-hero.css';

const EvergreenHero: React.FC = () => (
  <section data-homepage-hero="timber-ridge" className="homepage-hero">
    <div className="homepage-hero-stage">
      <div className="homepage-hero-content">
        <h1>Big impact.<span>Fast turnaround.</span></h1>
        <p className="homepage-hero-description">Custom banners. Printed fast. Built to stand out.</p>
        <ProductionShippingBenefits />
        <Link to="/design" className="homepage-hero-primary">Design your banner<ArrowRight aria-hidden="true" /></Link>
        <p className="homepage-hero-note">Your design. Your size.</p>
      </div>
      <div className="homepage-hero-media">
        <img className="homepage-hero-image" src="/images/homepage/timber-ridge-hero.webp" alt="Rustic Timber Ridge Outdoor Outfitters grand opening vinyl banner with mountain artwork and reinforced grommets, displayed on a brick storefront" width="1536" height="1024" loading="eager" decoding="async" fetchPriority="high" />
        <div className="homepage-hero-discount" aria-label="20% off your first order"><strong>20%<br />OFF</strong><span>YOUR FIRST<br />ORDER</span></div>
      </div>
    </div>
  </section>
);

const HeroSection: React.FC = () => {
  const campaign = getActiveSeasonalCampaign();
  if (!campaign?.artwork) return <EvergreenHero />;

  const { artwork } = campaign;
  return (
    <section
      data-homepage-hero={campaign.id}
      data-seasonal-campaign={campaign.id}
      className="homepage-hero homepage-hero--seasonal"
    >
      <div className="homepage-hero-stage">
        <div className="homepage-hero-content">
          <p className="homepage-hero-eyebrow">{campaign.eyebrow}</p>
          <h1 className="homepage-hero-seasonal-heading">{campaign.headline}</h1>
          <p className="homepage-hero-description">{campaign.description}</p>
          <div data-hero-delivery-status>
            <ProductionShippingBenefits />
          </div>
          <div className="homepage-hero-actions">
            <Link role="button" to={campaign.primaryCta.href} className="homepage-hero-primary">
              {campaign.primaryCta.label}<ArrowRight aria-hidden="true" />
            </Link>
            <Link to={campaign.secondaryCta.href} className="homepage-hero-secondary">
              {campaign.secondaryCta.label}<ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="homepage-hero-media">
          <picture data-seasonal-hero-art="desktop" className="homepage-hero-art homepage-hero-art--desktop">
            {artwork.desktopAvifSrc ? <source srcSet={artwork.desktopAvifSrc} type="image/avif" /> : null}
            <img
              className="homepage-hero-image"
              src={artwork.desktopSrc}
              alt={artwork.alt}
              width={artwork.desktopWidth}
              height={artwork.desktopHeight}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </picture>
          <picture data-seasonal-hero-art="mobile" className="homepage-hero-art homepage-hero-art--mobile">
            {artwork.mobileAvifSrc ? <source srcSet={artwork.mobileAvifSrc} type="image/avif" /> : null}
            <img
              className="homepage-hero-image"
              src={artwork.mobileSrc}
              alt={artwork.alt}
              width={artwork.mobileWidth}
              height={artwork.mobileHeight}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </picture>
          <div className="homepage-hero-discount" aria-label="20% off your first order"><strong>20%<br />OFF</strong><span>YOUR FIRST<br />ORDER</span></div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
