/**
 * Product Copy Configuration
 * 
 * Centralized product-specific copy used across cart, checkout, review,
 * and order summary components. Ensures yard sign orders never show
 * banner-specific language and vice versa.
 */

export interface ProductCopyConfig {
  /** Singular display label, e.g. "Banner" or "Yard Sign" */
  singularLabel: string;
  /** Plural display label, e.g. "Banners" or "Yard Signs" */
  pluralLabel: string;
  /** CTA for adding another item */
  addAnotherCta: string;
  /** Artwork review notice shown in checkout/cart */
  reviewNotice: string;
  /** Upsell modal header */
  upsellHeader: string;
  /** Suggestions when order is under minimum (small shortfall ≤$5) */
  minimumOrderSuggestionsSmall: string[];
  /** Suggestions when order is under minimum (medium shortfall ≤$10) */
  minimumOrderSuggestionsMedium: string[];
  /** Suggestions when order is under minimum (large shortfall >$10) */
  minimumOrderSuggestionsLarge: string[];
  /** Label used in price breakdown, e.g. "Base banner" or "Signs" */
  priceBreakdownBaseLabel: string;
  /** Empty cart prompt text */
  emptyCartPrompt: string;
  /** Shipping notification text for sign-up modal */
  shippingNotification: string;
}

const bannerCopy: ProductCopyConfig = {
  singularLabel: 'Banner',
  pluralLabel: 'Banners',
  addAnotherCta: 'Add Another Banner',
  reviewNotice:
    'Preview only. Our team personally reviews every banner before production and will reach out if anything needs attention.',
  upsellHeader: 'Complete Your Banner',
  minimumOrderSuggestionsSmall: [
    'Consider increasing your banner quantity by 1',
    'Add rope reinforcement for durability',
  ],
  minimumOrderSuggestionsMedium: [
    'Increase your banner size slightly',
    'Add pole pockets for easy hanging',
    'Consider upgrading to premium 18oz material',
  ],
  minimumOrderSuggestionsLarge: [
    'Increase your banner quantity',
    'Consider a larger banner size',
    'Add multiple banners to your order',
    'Upgrade to premium materials and add-ons',
  ],
  priceBreakdownBaseLabel: 'Base banner',
  emptyCartPrompt: 'Add some banners to get started!',
  shippingNotification: 'Get notified when your banner ships',
};

const yardSignCopy: ProductCopyConfig = {
  singularLabel: 'Yard Sign',
  pluralLabel: 'Yard Signs',
  addAnotherCta: 'Add Another Yard Sign',
  reviewNotice:
    'Preview only. Our team reviews your yard sign artwork before production and will reach out if anything needs attention.',
  upsellHeader: 'Complete Your Yard Sign',
  minimumOrderSuggestionsSmall: [
    'Increase your yard sign quantity',
    'Add step stakes',
  ],
  minimumOrderSuggestionsMedium: [
    'Increase your yard sign quantity',
    'Add step stakes',
    'Upgrade from single-sided to double-sided',
    'Add another design to your order',
  ],
  minimumOrderSuggestionsLarge: [
    'Increase your yard sign quantity',
    'Add step stakes',
    'Upgrade to double-sided printing',
    'Add another design',
  ],
  priceBreakdownBaseLabel: 'Signs',
  emptyCartPrompt: 'Add some yard signs to get started!',
  shippingNotification: 'Get notified when your order ships',
};

/**
 * Get the product copy config for a given product type.
 */
export function getProductCopy(productType?: string): ProductCopyConfig {
  if (productType === 'yard_sign') return yardSignCopy;
  return bannerCopy;
}

/**
 * Determine the dominant product type from a list of cart items.
 * If all items are yard signs, returns 'yard_sign'.
 * If mixed or all banners, returns 'banner'.
 */
export function getDominantProductType(
  items: Array<{ product_type?: string }>
): string {
  if (items.length === 0) return 'banner';
  const allYardSigns = items.every((i) => i.product_type === 'yard_sign');
  if (allYardSigns) return 'yard_sign';
  return 'banner';
}

/**
 * Get yard-sign-specific minimum order suggestions that are contextually
 * aware of the current yard sign configuration.
 */
export function getYardSignMinimumSuggestions(
  shortfall: number,
  config?: {
    sidedness?: string;
    stepStakesEnabled?: boolean;
  }
): string[] {
  const isDoubleSided = config?.sidedness === 'double';
  const hasStepStakes = config?.stepStakesEnabled === true;

  const pool: string[] = ['Increase your yard sign quantity'];

  if (!hasStepStakes) {
    pool.push('Add step stakes');
  }
  if (!isDoubleSided) {
    pool.push('Upgrade from single-sided to double-sided');
  }
  pool.push('Add another design to your order');

  // Return up to 3 suggestions
  if (shortfall <= 5) return pool.slice(0, 2);
  if (shortfall <= 10) return pool.slice(0, 3);
  return pool.slice(0, 4);
}
