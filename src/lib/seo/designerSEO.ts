import type { SEOProps } from '@/components/SEO';

// Product identity is independent of dimensions, material, artwork and tracking parameters.
const metadata: Record<string, SEOProps> = {
  banner: {
    title: 'Custom Vinyl Banner Designer | Banners On The Fly',
    description: 'Design custom vinyl banners. Choose size, material and finishing, upload artwork, and preview your print. Free next-day air after production on orders $20+.',
    canonical: 'https://bannersonthefly.com/design',
    ogImage: '/images/og-vinyl-banners.png',
  },
  yard_sign: {
    title: 'Custom Yard Sign Designer | Banners On The Fly',
    description: 'Design 24 × 18 yard signs with single- or double-sided printing and optional stakes. Upload artwork and order online with free next-day air after production.',
    canonical: 'https://bannersonthefly.com/design?product=yard-signs',
    ogImage: '/images/og-yard-signs.png',
  },
  car_magnet: {
    title: 'Custom Car Magnet Designer | Banners On The Fly',
    description: 'Design custom car magnets. Choose your size and corner style, upload artwork, and preview your print with free next-day air shipping after production.',
    canonical: 'https://bannersonthefly.com/design?product=car-magnets',
    ogImage: '/images/og-car-magnets.png',
  },
};

export function getDesignerSEO(product: string): SEOProps {
  return metadata[product] || metadata.banner;
}
