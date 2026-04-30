/**
 * Same-Day Hit Service configuration.
 *
 * This is a *production priority* upsell, NOT a shipping upgrade.
 * Standard offer continues to be: "Printed within 24 hours and shipped free
 * via next-day air."  Never advertise this feature with phrases like
 * "delivered tomorrow" or "rush shipping".
 *
 * All time logic is anchored to Eastern Time (America/New_York).
 *
 * `maxQuantities` thresholds are tunable by ops. They cap which orders are
 * eligible for same-day production, since high-volume runs cannot realistically
 * be produced and shipped the same day. Adjust as production capacity changes.
 */

export type SameDayProductKey = 'banners' | 'yardSigns' | 'magnets';

export interface SameDayConfig {
  enabled: boolean;
  /** Hour (ET) at which the same-day window CLOSES. Window is [00:00, cutoffHour:cutoffMinute). */
  cutoffHour: number;
  cutoffMinute: number;
  /** Hour (ET) at which the window re-opens (midnight). */
  resetHour: number;
  /** Multiplier applied to the eligible product subtotal. 0.60 = 60%. */
  upchargeRate: number;
  /** Flat add-on for Saturday delivery, in dollars. */
  saturdayDeliveryFee: number;
  /** Config-key product types that are eligible. Posters are intentionally excluded. */
  eligibleProducts: SameDayProductKey[];
  /** Per-product maximum quantity for same-day eligibility. */
  maxQuantities: Record<SameDayProductKey, number>;
}

export const sameDayConfig: SameDayConfig = {
  enabled: true,
  cutoffHour: 12,
  cutoffMinute: 0,
  resetHour: 0,
  upchargeRate: 0.60,
  saturdayDeliveryFee: 45,
  eligibleProducts: ['banners', 'yardSigns', 'magnets'],
  // Defaults are intentionally moderate; tune per production capacity.
  maxQuantities: {
    banners: 25,
    yardSigns: 50,
    magnets: 50,
  },
};

/**
 * Map internal product slugs (as stored on cart items / order_items) to the
 * Same-Day Service config keys. Posters are intentionally not represented.
 */
export const PRODUCT_SLUG_TO_SAME_DAY_KEY: Record<string, SameDayProductKey> = {
  banner: 'banners',
  yard_sign: 'yardSigns',
  car_magnet: 'magnets',
};

export function getSameDayKeyForProduct(productType: string | undefined | null): SameDayProductKey | null {
  if (!productType) return null;
  return PRODUCT_SLUG_TO_SAME_DAY_KEY[productType] || null;
}
