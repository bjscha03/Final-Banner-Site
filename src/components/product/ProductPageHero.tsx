import React from 'react';
import LightProductHero from './LightProductHero';
import BannerDiscountOffer from '@/components/design/BannerDiscountOffer';
import {
  Clock3,
  Copy,
  Layers3,
  Monitor,
  Signpost,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { CityProductSlug } from '@/lib/seo/cityData';

type HeroProductSlug = CityProductSlug | 'double-sided-banners' | 'large-banners-fast';

interface HeroBenefit {
  label: string;
  icon: LucideIcon;
}

interface ProductHeroDefinition {
  eyebrow: string;
  intro?: string;
  title: string[];
  primaryLabel: string;
  secondaryLabel: string;
  secondaryUrl?: string;
  imageAlt: string;
  benefits: HeroBenefit[];
}

const sharedBenefits: HeroBenefit[] = [
  { label: '24-hour standard production', icon: Clock3 },
  { label: 'Free next-day air after production', icon: Truck },
  { label: 'Live print preview', icon: Monitor },
];

const HERO_DEFINITIONS: Record<HeroProductSlug, ProductHeroDefinition> = {
  'large-banners-fast': {
    eyebrow: 'Large custom banners · Printed fast · Shipped nationwide',
    title: ['Large banners.', 'Fast.'],
    intro: 'Big visibility for your next opening, event, or deadline. Order standard sizes online up to 50 × 16 ft. Larger projects, including single-piece banners up to 16 × 150 ft, are available by custom quote.',
    primaryLabel: 'Build & price my large banner',
    secondaryLabel: 'Need a larger size? Request a custom quote',
    secondaryUrl: '/custom-quote',
    imageAlt: 'Large custom vinyl banner installed outside a business',
    benefits: [
      { label: '24-hour standard production', icon: Clock3 },
      { label: 'Oversized banners may ship by freight', icon: Truck },
      { label: 'Custom quote for larger projects', icon: Monitor },
    ],
  },
  'double-sided-banners': {
    eyebrow: 'Double-sided banners · Heavy-duty 18 oz vinyl',
    title: ['Double-sided', 'banners.', 'Seen both ways.'],
    primaryLabel: 'Design your double-sided banner',
    secondaryLabel: 'Choose your size & options',
    imageAlt: 'Front and back views of a finished green grand-opening vinyl banner with matching full-color artwork',
    benefits: sharedBenefits,
  },
  'vinyl-banners': {
    eyebrow: 'Custom vinyl banners · Indoor · Outdoor · Mesh',
    title: ['Custom banners', 'built to get', 'noticed.'],
    primaryLabel: 'Design your vinyl banner',
    secondaryLabel: 'Explore materials & options',
    imageAlt: 'Custom Northline Market grand opening vinyl banner mounted to an outdoor railing',
    benefits: sharedBenefits,
  },
  'yard-signs': {
    eyebrow: '24 × 18 yard signs · Single- or double-sided',
    title: ['Yard signs', 'built to', 'get seen.'],
    primaryLabel: 'Design your yard signs',
    secondaryLabel: 'View sign options',
    imageAlt: 'Custom Highland Park Homes open house yard sign displayed in a front lawn',
    benefits: [
      { label: '24 × 18 corrugated plastic', icon: Layers3 },
      { label: 'Single- or double-sided printing', icon: Copy },
      { label: 'Optional step stakes', icon: Signpost },
    ],
  },
  'car-magnets': {
    eyebrow: 'Custom car magnets · Square or rounded corners',
    title: ['Put your', 'business', 'in motion.'],
    primaryLabel: 'Design your car magnets',
    secondaryLabel: 'View size options',
    imageAlt: 'Custom Summit Home Services car magnet installed on a gray service vehicle',
    benefits: sharedBenefits,
  },
};

interface ProductPageHeroProps {
  productSlug: HeroProductSlug;
  ctaUrl: string;
  onStart?: () => void;
}

const ProductPageHero: React.FC<ProductPageHeroProps> = ({ productSlug, ctaUrl, onStart }) => {
  const hero = HERO_DEFINITIONS[productSlug];
  const isLargeBanner = productSlug === 'large-banners-fast';

  return (
    <LightProductHero
      attributes={{ 'data-product-page-hero': productSlug }}
      productSlug={isLargeBanner || productSlug === 'double-sided-banners' ? 'vinyl-banners' : productSlug}
      title={hero.title.join(' ')}
      accentText={hero.title[hero.title.length - 1]}
      eyebrow={hero.eyebrow}
      description={isLargeBanner ? 'Big visibility for your next opening, event, or deadline. Choose your size, upload artwork, and see your price before ordering.' : hero.intro}
      primaryLabel={hero.primaryLabel}
      ctaUrl={ctaUrl}
      onStart={onStart}
      secondary={{ label: hero.secondaryLabel, href: hero.secondaryUrl ?? (productSlug === 'double-sided-banners' ? '#order-builder' : '#sizes-pricing') }}
      offer={isLargeBanner ? <BannerDiscountOffer /> : undefined}
      benefits={hero.benefits}
    />
  );
};

export default ProductPageHero;
