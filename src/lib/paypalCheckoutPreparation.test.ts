import { describe, expect, it } from 'vitest';
import { buildPayPalCheckoutSignature } from './paypalCheckoutPreparation';

const baseItem = {
  id: 'item-1',
  product_type: 'yard_sign',
  width_in: 24,
  height_in: 18,
  quantity: 10,
  material: 'corrugated',
  grommets: 'none',
  line_total_cents: 3600,
  file_key: 'uploads/current-yard-sign.png',
  file_url: 'https://cdn.example.com/current-yard-sign.png',
  canvas_state_json: '{"version":3}',
};

const signature = (item: Record<string, unknown>) => buildPayPalCheckoutSignature({
  totalCents: 3816,
  userId: 'user-1',
  email: 'Customer@Example.com',
  items: [item],
  discountCode: null,
  sameDayHitService: false,
  saturdayDelivery: false,
});

describe('buildPayPalCheckoutSignature', () => {
  it('ignores background thumbnail and web-preview URL updates', () => {
    expect(signature({
      ...baseItem,
      thumbnail_url: 'data:image/png;base64,temporary',
      web_preview_url: null,
    })).toBe(signature({
      ...baseItem,
      thumbnail_url: 'https://cdn.example.com/final-thumb.png',
      web_preview_url: 'https://cdn.example.com/final-web-preview.png',
    }));
  });

  it('invalidates a prepared order when the artwork identity changes', () => {
    expect(signature(baseItem)).not.toBe(signature({
      ...baseItem,
      file_key: 'uploads/replacement-yard-sign.png',
      file_url: 'https://cdn.example.com/replacement-yard-sign.png',
    }));
  });

  it('invalidates a prepared order when price or quantity changes', () => {
    expect(signature(baseItem)).not.toBe(signature({
      ...baseItem,
      quantity: 20,
      line_total_cents: 7200,
    }));
  });
});
