import React from 'react';
import { ArrowRight, Plane, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import '@/styles/homepage-hero.css';

const HeroSection: React.FC = () => (
  <section data-homepage-hero="timber-ridge" className="homepage-hero">
    <div className="homepage-hero-stage">
      <div className="homepage-hero-content">
        <h1>Big impact.<span>Fast turnaround.</span></h1>
        <p className="homepage-hero-description">Custom banners. Printed fast. Built to stand out.</p>
        <ul className="homepage-hero-promises" aria-label="Ordering benefits">
          <li><Timer aria-hidden="true" /><div><strong>24 HOUR</strong><span>PRODUCTION</span></div></li>
          <li><Plane aria-hidden="true" /><div><strong>FREE NEXT-DAY</strong><span>AIR SHIPPING</span><small>On orders $20+</small></div></li>
        </ul>
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

export default HeroSection;
