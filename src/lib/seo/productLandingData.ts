import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { CAR_MAGNET_ROUNDED_CORNERS, CAR_MAGNET_SIZES } from '@/lib/car-magnet-pricing';
import { getConfiguratorUrl } from '@/lib/configurator';
import { getProductConfig } from '@/lib/products';
import { SITE_POLICIES } from '@/lib/sitePolicies';
import {
  YARD_SIGN_DOUBLE_SIDED_CENTS,
  YARD_SIGN_HEIGHT_IN,
  YARD_SIGN_MAX_QUANTITY,
  YARD_SIGN_MIN_QUANTITY,
  YARD_SIGN_SINGLE_SIDED_CENTS,
  YARD_SIGN_STEP_STAKE_CENTS,
  YARD_SIGN_WIDTH_IN,
} from '@/lib/yard-sign-pricing';
import type { CityProductSlug } from '@/lib/seo/cityData';

export const SITE_URL = 'https://bannersonthefly.com';

export interface PriceExample {
  label: string;
  configuration: string;
  totalCents: number;
  note?: string;
}

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface ProductLandingDefinition {
  slug: CityProductSlug;
  singular: string;
  plural: string;
  lower: string;
  configuratorType: 'banner' | 'yard_sign' | 'car_magnet';
  ctaLabel: string;
  heroImage: string;
  heroImageAlt: string;
  socialImage: string;
  overview: string;
  productionSummary: string;
  startingPriceCents: number;
  minimumOrderLabel: string;
  priceExamples: PriceExample[];
  sizes: string[];
  materials: string[];
  options: string[];
  useCases: string[];
  limitations: string[];
  installationAndCare: string[];
  faqs: ProductFaq[];
}

const bannerConfig = getProductConfig('banner');
const yardConfig = getProductConfig('yard_sign');
const carMagnetConfig = getProductConfig('car_magnet');

function bannerExample(widthIn: number, heightIn: number): PriceExample {
  const pricing = calculateBannerPricing({
    widthIn,
    heightIn,
    quantity: 1,
    material: '13oz',
    addRope: false,
    polePockets: 'none',
    grommets: 'none',
  });
  return {
    label: `${widthIn / 12}′ × ${heightIn / 12}′ banner`,
    configuration: '13oz vinyl, quantity 1, no paid add-ons',
    totalCents: pricing.subtotalCents,
    note: 'Before tax',
  };
}

const commonArtworkFaq: ProductFaq = {
  question: 'What artwork can I upload?',
  answer: SITE_POLICIES.artwork.detail,
};

const commonPreviewFaq: ProductFaq = {
  question: 'Will I receive a separate proof?',
  answer: SITE_POLICIES.preview.detail,
};

export const PRODUCT_LANDING_DATA: Record<CityProductSlug, ProductLandingDefinition> = {
  'vinyl-banners': {
    slug: 'vinyl-banners',
    singular: 'Vinyl Banner',
    plural: 'Vinyl Banners',
    lower: 'vinyl banners',
    configuratorType: 'banner',
    ctaLabel: 'Design your vinyl banner',
    heroImage: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_900/v1777020723/Vinyl_Banners_ycsdpm.png',
    heroImageAlt: 'Custom printed vinyl banner display',
    socialImage: '/images/og-vinyl-banners.png',
    overview:
      'Create a made-to-size vinyl or mesh banner, upload your artwork, review the on-screen print preview, and see the current price before checkout.',
    productionSummary: `${SITE_POLICIES.production.short}. ${SITE_POLICIES.shipping.short}.`,
    startingPriceCents: bannerConfig.minimumUnitPriceCents,
    minimumOrderLabel: `One banner; ${formatMoney(bannerConfig.minimumUnitPriceCents)} minimum unit price`,
    priceExamples: [bannerExample(24, 48), bannerExample(36, 72), bannerExample(48, 96)],
    sizes: [
      `Custom width and height from ${bannerConfig.dimensions.minIn}″ to ${bannerConfig.dimensions.maxIn}″`,
      `Up to ${bannerConfig.dimensions.maxSqFt.toLocaleString()} square feet per configured banner`,
    ],
    materials: bannerConfig.materials.map((material) => material.label),
    options: [
      `Grommets: ${bannerConfig.grommets.map((option) => option.label).join(', ')}`,
      `Rope: ${formatMoney(bannerConfig.rope.pricePerFootCents)} per linear foot`,
      `Pole pockets: ${formatMoney(bannerConfig.polePockets.setupFeeCents)} setup plus ${formatMoney(bannerConfig.polePockets.pricePerLinearFootCents)} per linear foot`,
    ],
    useCases: ['Storefront and grand-opening signage', 'Events and sponsorships', 'Job sites and fencing', 'Indoor promotions and backdrops'],
    limitations: [
      'Orders over 1,000 square feet require a custom quote and may need additional production time.',
      'Production time is separate from carrier transit time.',
      'Color on a screen can differ from printed output because screens use emitted RGB light and printing uses ink.',
    ],
    installationAndCare: [
      'Choose attachment options for the intended mounting method before checkout.',
      'Use enough attachment points to distribute wind load; mesh is the available wind-permeable material option.',
      'Store dry, clean, and loosely rolled rather than sharply folded when the banner is not in use.',
    ],
    faqs: [
      {
        question: 'Can I enter a custom banner size?',
        answer: `Yes. The banner configurator accepts dimensions from ${bannerConfig.dimensions.minIn}″ to ${bannerConfig.dimensions.maxIn}″ per side, up to ${bannerConfig.dimensions.maxSqFt.toLocaleString()} square feet. Larger work requires a custom quote.`,
      },
      commonArtworkFaq,
      commonPreviewFaq,
      {
        question: 'Are grommets included?',
        answer: 'Available grommet choices are shown in the configurator. Grommets do not add a separate charge; rope and pole pockets are paid options.',
      },
    ],
  },
  'yard-signs': {
    slug: 'yard-signs',
    singular: 'Yard Sign',
    plural: 'Yard Signs',
    lower: 'yard signs',
    configuratorType: 'yard_sign',
    ctaLabel: 'Design your yard signs',
    heroImage: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_900/v1777020710/Yard_Signs_incb8x.png',
    heroImageAlt: 'Custom printed corrugated plastic yard signs',
    socialImage: '/images/og-yard-signs.png',
    overview:
      'Order the supported 24×18-inch corrugated plastic format in quantities of 10, choose single- or double-sided printing, and add step stakes if needed.',
    productionSummary: `${SITE_POLICIES.production.short}. Orders above ${YARD_SIGN_MAX_QUANTITY} signs require separate orders or additional planning.`,
    startingPriceCents: YARD_SIGN_SINGLE_SIDED_CENTS * YARD_SIGN_MIN_QUANTITY,
    minimumOrderLabel: `${YARD_SIGN_MIN_QUANTITY} signs at ${formatMoney(YARD_SIGN_SINGLE_SIDED_CENTS)} each`,
    priceExamples: [
      {
        label: '10 single-sided signs',
        configuration: `${YARD_SIGN_WIDTH_IN}″ × ${YARD_SIGN_HEIGHT_IN}″ corrugated plastic`,
        totalCents: YARD_SIGN_SINGLE_SIDED_CENTS * 10,
        note: 'Before tax; stakes not included',
      },
      {
        label: '10 double-sided signs',
        configuration: `${YARD_SIGN_WIDTH_IN}″ × ${YARD_SIGN_HEIGHT_IN}″ corrugated plastic`,
        totalCents: YARD_SIGN_DOUBLE_SIDED_CENTS * 10,
        note: 'Before tax; stakes not included',
      },
      {
        label: '10 step stakes',
        configuration: 'Optional add-on for 10 signs',
        totalCents: YARD_SIGN_STEP_STAKE_CENTS * 10,
        note: 'Added to the sign price',
      },
    ],
    sizes: yardConfig.predefinedSizes?.map((size) => `${size.label} only`) || [`${YARD_SIGN_WIDTH_IN}″ × ${YARD_SIGN_HEIGHT_IN}″ only`],
    materials: yardConfig.materials.map((material) => material.label),
    options: [
      `Single-sided: ${formatMoney(YARD_SIGN_SINGLE_SIDED_CENTS)} per sign`,
      `Double-sided: ${formatMoney(YARD_SIGN_DOUBLE_SIDED_CENTS)} per sign`,
      `Step stakes: ${formatMoney(YARD_SIGN_STEP_STAKE_CENTS)} each`,
      `Quantity: ${YARD_SIGN_MIN_QUANTITY}–${YARD_SIGN_MAX_QUANTITY}, in increments of 10`,
    ],
    useCases: ['Real-estate and open-house messages', 'Contractor and service-company identification', 'Campaign and event wayfinding', 'Birthday and celebration messages'],
    limitations: [
      'The online product is a fixed 24×18-inch rectangle; custom dimensions are not offered in this configurator.',
      `Orders must contain ${YARD_SIGN_MIN_QUANTITY}–${YARD_SIGN_MAX_QUANTITY} signs in increments of 10.`,
      'A separate design is still subject to the total order quantity and design-count limits in the configurator.',
    ],
    installationAndCare: [
      'Add the correct number of optional step stakes for the signs you plan to install.',
      'Insert stakes into suitable ground and avoid underground utilities or restricted property.',
      'Bring signs indoors during severe weather and store them flat and dry when not in use.',
    ],
    faqs: [
      {
        question: 'What size yard sign can I order online?',
        answer: `The supported online size is ${YARD_SIGN_WIDTH_IN}″ × ${YARD_SIGN_HEIGHT_IN}″. The configurator does not offer custom yard-sign dimensions.`,
      },
      {
        question: 'What is the minimum yard-sign order?',
        answer: `The minimum is ${YARD_SIGN_MIN_QUANTITY} signs, and quantities must increase in increments of 10. Single-sided signs are ${formatMoney(YARD_SIGN_SINGLE_SIDED_CENTS)} each before tax and optional stakes.`,
      },
      commonArtworkFaq,
      commonPreviewFaq,
    ],
  },
  'car-magnets': {
    slug: 'car-magnets',
    singular: 'Car Magnet',
    plural: 'Car Magnets',
    lower: 'car magnets',
    configuratorType: 'car_magnet',
    ctaLabel: 'Choose car magnet size',
    heroImage: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_900/v1777020742/car_magnets_dwoq8q.png',
    heroImageAlt: 'Custom removable vehicle magnet on a car door',
    socialImage: '/images/og-car-magnets.png',
    overview:
      'Choose one of the supported rectangular magnet sizes, select a square or rounded-corner option, upload artwork, and review the on-screen preview before checkout.',
    productionSummary: `${SITE_POLICIES.production.short}. ${SITE_POLICIES.shipping.short}.`,
    startingPriceCents: carMagnetConfig.minimumUnitPriceCents,
    minimumOrderLabel: `One ${CAR_MAGNET_SIZES[0]?.label || 'supported-size'} magnet from ${formatMoney(carMagnetConfig.minimumUnitPriceCents)}`,
    priceExamples: CAR_MAGNET_SIZES.map((size) => ({
      label: `${size.label} magnet`,
      configuration: 'Premium magnetic material, quantity 1',
      totalCents: size.basePriceCents,
      note: 'Before tax',
    })),
    sizes: CAR_MAGNET_SIZES.map((size) => `${size.label} — ${formatMoney(size.basePriceCents)}`),
    materials: carMagnetConfig.materials.map((material) => material.label),
    options: [`Corner options: ${CAR_MAGNET_ROUNDED_CORNERS.map((corner) => corner.label).join(', ')}`],
    useCases: ['Removable service-vehicle identification', 'Realtor and contractor contact information', 'Temporary fleet branding', 'Local delivery and mobile-service promotion'],
    limitations: [
      'Only the listed rectangular sizes are available; custom shapes and dimensions are not offered in this configurator.',
      'Magnetic signs require a clean, flat, magnet-compatible steel surface; not every vehicle panel is magnetic.',
      'Production time is separate from carrier transit time.',
    ],
    installationAndCare: [
      'Test the intended vehicle panel with a household magnet before ordering.',
      'Apply to a clean, dry, flat steel surface without trim, deep curves, or body filler beneath it.',
      'Remove the magnet before an automatic car wash and clean both the magnet and vehicle surface regularly.',
    ],
    faqs: [
      {
        question: 'Can I order a custom car-magnet shape or size?',
        answer: `No. The online configurator supports these rectangular sizes only: ${CAR_MAGNET_SIZES.map((size) => size.label).join(', ')}.`,
      },
      {
        question: 'How much is the least expensive car magnet?',
        answer: `The current lowest listed size is ${CAR_MAGNET_SIZES[0]?.label} at ${formatMoney(CAR_MAGNET_SIZES[0]?.basePriceCents || carMagnetConfig.minimumUnitPriceCents)} before tax.`,
      },
      commonArtworkFaq,
      commonPreviewFaq,
    ],
  },
};

export function getProductLandingDefinition(slug: CityProductSlug | string | undefined): ProductLandingDefinition | undefined {
  if (!slug) return undefined;
  return PRODUCT_LANDING_DATA[slug as CityProductSlug];
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function getProductHubPath(slug: CityProductSlug): string {
  return `/${slug}`;
}

export function getProductHubCta(slug: CityProductSlug): string {
  return getConfiguratorUrl(slug, getProductHubPath(slug), 'product-hub');
}
