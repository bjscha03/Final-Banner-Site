import React from 'react';
import LightProductHero from '@/components/product/LightProductHero';
import { Clock3, Layers3, Magnet, Monitor, Truck, type LucideIcon } from 'lucide-react';
import BannerDiscountOffer from '@/components/design/BannerDiscountOffer';
import type { ProductTypeSlug } from '@/lib/products';

interface DesignHeroDefinition {
  productSlug: 'vinyl-banners' | 'yard-signs' | 'car-magnets';
  title: string[];
  cta: string;
  alt: string;
  benefits: Array<{ label: string; icon: LucideIcon }>;
  /** Shows the shared banner discount offer next to the CTA. Banner only. */
  offer?: true;
}

const DESIGN_HEROES: Record<ProductTypeSlug, DesignHeroDefinition> = {
  banner: {
    productSlug: 'vinyl-banners',
    title: ['Design it.', 'Preview it.', 'Print it.'],
    cta: 'Start your banner',
    alt: 'Banner design editor preview beside the finished Northline Coffee grand opening banner',
    benefits: [
      { label: '24-hour standard production', icon: Clock3 },
      { label: 'Free next-day air after production', icon: Truck },
      { label: 'Live print preview', icon: Monitor },
    ],
    offer: true,
  },
  yard_sign: {
    productSlug: 'yard-signs',
    title: ['Design it.', 'Preview it.', 'Stake it.'],
    cta: 'Start your yard signs',
    alt: 'Custom open house yard sign displayed in a front lawn',
    benefits: [
      { label: '24 × 18 corrugated plastic', icon: Layers3 },
      { label: 'Single- or double-sided printing', icon: Monitor },
      { label: 'Optional step stakes', icon: Clock3 },
    ],
  },
  car_magnet: {
    productSlug: 'car-magnets',
    title: ['Design it.', 'Preview it.', 'Drive it.'],
    cta: 'Start your car magnets',
    alt: 'Custom home services car magnet installed on a gray service vehicle',
    benefits: [
      { label: 'Four supported sizes', icon: Layers3 },
      { label: 'Square or rounded corners', icon: Magnet },
      { label: 'Live print preview', icon: Monitor },
    ],
  },
};

interface DesignPageHeroProps {
  productType: ProductTypeSlug;
  onStart: () => void;
}

const DesignPageHero: React.FC<DesignPageHeroProps> = ({ productType, onStart }) => {
  const definition = DESIGN_HEROES[productType];

  return (
    <LightProductHero
      attributes={{ 'data-design-page-hero': productType }}
      productSlug={definition.productSlug}
      title={definition.title.join(' ')}
      accentText={definition.title[definition.title.length - 1]}
      eyebrow={productType === 'yard_sign' ? 'Custom yard signs · Made to stand out' : productType === 'car_magnet' ? 'Custom car magnets · Your business, on the move' : 'Custom banners · Made for your next big moment'}
      primaryLabel={definition.cta}
      onStart={onStart}
      benefits={definition.benefits}
      offer={definition.offer ? <BannerDiscountOffer /> : undefined}
    />
  );
};

export default DesignPageHero;
