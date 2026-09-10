import { describe, expect, it } from 'vitest';
import {
  STRIPE_CHECKOUT_STATE_TTL_MS,
  KEY_ONLY_ABSENT_OBSERVATIONS_REQUIRED,
  buildStripeCheckoutSignature,
  clearStripeCheckoutState,
  createStripeCheckoutState,
  isStripeKeyOnlyRecovery,
  observeStripeKeyOnlyAbsence,
  readStripeCheckoutState,
  stripeCheckoutStorageKey,
  writeStripeCheckoutState,
} from './stripeCheckoutState';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

const baseItem = {
  id: 'banner-line',
  product_type: 'banner',
  width_in: 96,
  height_in: 48,
  quantity: 2,
  material: '13oz',
  grommets: 'every-2-feet',
  pole_pockets: 'none',
  rope_feet: 0,
  unit_price_cents: 7200,
  line_total_cents: 14400,
  file_key: 'original-art',
  placement_preview: {
    sourceIdentity: 'original-art@1',
    compositionSignature: 'placement-a',
    compositionRevision: 1,
    previewPublicId: 'placement-a',
  },
};

const signature = (item = baseItem, total = 15264) => buildStripeCheckoutSignature({
  total,
  discountCode: null,
  sameDayHitService: false,
  saturdayDelivery: false,
  items: [item],
});

describe('Stripe checkout recovery identity', () => {
  it('is deterministic for equivalent checkout input', () => {
    expect(signature(structuredClone(baseItem))).toBe(signature(baseItem));
  });

  it('changes for price, add-on, artwork, and expedited-service changes', () => {
    expect(signature({ ...baseItem, rope_feet: 24, rope_cost_cents: 4800 })).not.toBe(signature());
    expect(signature({
      ...baseItem,
      placement_preview: { ...baseItem.placement_preview, compositionSignature: 'placement-b' },
    })).not.toBe(signature());
    expect(signature(baseItem, 16000)).not.toBe(signature());
    expect(buildStripeCheckoutSignature({
      total: 15264,
      discountCode: null,
      sameDayHitService: true,
      saturdayDelivery: false,
      items: [baseItem],
    })).not.toBe(signature());
  });

  it('restores a current matching state and rejects expired state', () => {
    const storage = memoryStorage();
    const now = 10_000_000;
    const state = createStripeCheckoutState(signature(), now);
    writeStripeCheckoutState(state, storage);

    expect(readStripeCheckoutState(signature(), storage, now + 1000)).toEqual(state);
    expect(readStripeCheckoutState(
      signature(),
      storage,
      now + STRIPE_CHECKOUT_STATE_TTL_MS + 1,
    )).toBeNull();
  });

  it('does not cross-contaminate different carts and can be cleared', () => {
    const storage = memoryStorage();
    const firstSignature = signature();
    const state = createStripeCheckoutState(firstSignature, 1000);
    writeStripeCheckoutState(state, storage);

    expect(readStripeCheckoutState(signature(baseItem, 17000), storage, 1000)).toBeNull();
    expect(storage.getItem(stripeCheckoutStorageKey(firstSignature))).not.toBeNull();
    clearStripeCheckoutState(firstSignature, storage);
    expect(storage.getItem(stripeCheckoutStorageKey(firstSignature))).toBeNull();
  });

  it('keeps a reloaded key-only authorization locked through the bounded absence window', () => {
    const reloadedState = {
      ...createStripeCheckoutState(signature(), 1000),
      phase: 'confirming' as const,
      orderId: null,
      paymentIntentId: null,
    };

    expect(isStripeKeyOnlyRecovery(reloadedState)).toBe(true);

    let observations = 0;
    for (let index = 1; index <= KEY_ONLY_ABSENT_OBSERVATIONS_REQUIRED; index += 1) {
      const result = observeStripeKeyOnlyAbsence(observations);
      observations = result.observations;
      expect(result.safeToRetry).toBe(index === KEY_ONLY_ABSENT_OBSERVATIONS_REQUIRED);
    }

    expect(observations).toBe(3);
  });

  it('does not classify idle or provider-bound state as key-only recovery', () => {
    const idle = createStripeCheckoutState(signature(), 1000);
    expect(isStripeKeyOnlyRecovery(idle)).toBe(false);
    expect(isStripeKeyOnlyRecovery({ ...idle, phase: 'verifying', orderId: 'order-1' })).toBe(false);
    expect(isStripeKeyOnlyRecovery({ ...idle, phase: 'verifying', paymentIntentId: 'pi_1' })).toBe(false);
  });
});
