import React from 'react';
import { ArrowRight, Monitor, Timer, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EVERGREEN_HERO, getHomepageHeroCampaign } from '@/lib/seasonalCampaigns';
import '@/styles/homepage-hero.css';

const HeroSection: React.FC = () => {
  const campaign = getHomepageHeroCampaign();
  const isSeasonal = campaign.id !== EVERGREEN_HERO.id && Boolean(campaign.artwork);
  const artwork = campaign.artwork;

  return (
    <section
      data-homepage-hero={campaign.id}
      {...(isSeasonal ? { 'data-seasonal-campaign': campaign.id } : {})}
      className="homepage-hero"
    >
      <div className={`homepage-hero-stage${artwork ? '' : ' homepage-hero-stage--text'}`}>
        <div className="homepage-hero-content">
          <p className="homepage-hero-eyebrow">{campaign.eyebrow}</p>
          <h1>{campaign.headline}</h1>
          <p className="homepage-hero-description">{campaign.description}</p>
          <div className="homepage-hero-actions">
            <Link to={campaign.primaryCta.href} className="homepage-hero-primary">
              {campaign.primaryCta.label}<ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
        {artwork && (
          <picture className="homepage-hero-photo" data-seasonal-hero-art="responsive">
            {artwork.mobileAvifSrc && <source media="(max-width: 767px)" type="image/avif" srcSet={artwork.mobileAvifSrc} />}
            <source media="(max-width: 767px)" srcSet={artwork.mobileSrc} />
            {artwork.desktopAvifSrc && <source type="image/avif" srcSet={artwork.desktopAvifSrc} />}
            <img
              src={artwork.desktopSrc}
              alt={artwork.alt}
              width={artwork.desktopWidth}
              height={artwork.desktopHeight}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </picture>
        )}
      </div>
      <div className="homepage-hero-benefits">
        <ul aria-label="Ordering benefits">
          <li><Timer aria-hidden="true" /><span>24-hour production</span></li>
          <li><Truck aria-hidden="true" /><span>Free Next-Day Air</span></li>
          <li><Monitor aria-hidden="true" /><span>Live print preview</span></li>
        </ul>
      </div>
    </section>
  );
};

export default HeroSection;
