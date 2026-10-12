import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
vi.hoisted(() => {
  const values = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
});
vi.mock('@/lib/cartSync', () => ({ cartSync: { getUserId: () => null, getSessionId: () => 'test-session', saveCart: vi.fn(async () => true) } }));
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackFBAddToCart: vi.fn() }));
import { useCartStore } from '@/store/cart';
import { orderItemToReorderQuote } from './reorder';
const require = createRequire(import.meta.url);
const { _test: { prepareOrderItems } } = require('../../../netlify/functions/_shared/legacy/create-order-core.cjs');
const { getFinalizedThumbnailUrl } = require('../../../netlify/functions/_shared/legacy/email-template.cjs');
const { buildCompositionSignatureFromPreview } = require('../../../netlify/functions/_shared/preview-artifact.cjs');
const original = 'https://example.com/customer-artwork.png';
const preview = 'https://example.com/saved-preview.png';
const item = { width_in: 72, height_in: 36, quantity: 1, material: '13oz', area_sqft: 18, unit_price_cents: 9000, line_total_cents: 9000,
  file_key: 'uploads/customer-artwork', file_url: original, file_name: 'customer-artwork.png', thumbnail_url: preview,
  web_preview_url: preview, canvas_state_json: JSON.stringify({ originalImageUrl: original, imgScale: 1.4 }),
  text_elements: [{ id: 'headline', content: 'Saved headline' }], image_position: { x: 15, y: 20 }, image_scale: 1.4,
  pole_pockets: 'top-bottom', pole_pocket_size: '3', rope_feet: 12, rope_placement: 'top-bottom',
} as any;

describe('reorder artwork survives cart and server persistence', () => {
  beforeEach(() => useCartStore.setState({ items: [], discountCode: null }));
  it('preserves the original, preview, composition, text and finishing in the actual cart and prepared order', () => {
    useCartStore.getState().addFromQuote(orderItemToReorderQuote(item));
    const cart = useCartStore.getState().items[0];
    expect(cart.file_key).toBe(item.file_key);
    expect(cart.file_url).toBe(original);
    expect(cart.thumbnail_url).toBe(preview);
    expect(cart.canvas_state_json).toBe(item.canvas_state_json);
    expect(cart.text_elements).toEqual(item.text_elements);
    expect(cart.image_position).toEqual(item.image_position);
    expect(cart.pole_pockets).toBe('top-bottom');
    expect(cart.pole_pocket_size).toBe('3');
    expect(cart.rope_placement).toBe('top-bottom');
    const [saved] = prepareOrderItems([JSON.parse(JSON.stringify(cart))]);
    expect(saved.file_key).toBe(item.file_key);
    expect(saved.file_url).toBe(original);
    expect(saved.thumbnail_url).toBe(preview);
    expect(saved.text_elements).toEqual(item.text_elements);
    expect(saved.canvas_state_json).toBe(item.canvas_state_json);
    expect(getFinalizedThumbnailUrl(saved)).toContain(preview);
  });
  it('rejects the exact name-only shape that caused the incident, at both reorder and checkout', () => {
    const broken = { ...item, file_key: null, file_url: null, thumbnail_url: null, web_preview_url: null, canvas_state_json: null, text_elements: [] };
    expect(() => orderItemToReorderQuote(broken)).toThrow('missing its saved artwork');
    expect(() => prepareOrderItems([broken])).toThrow('missing its saved artwork');
  });
  it('preserves a legacy key-only original and rejects preview-only or temporary artwork at checkout', () => {
    const minimal = { width_in: 72, height_in: 36, quantity: 1, material: '13oz', line_total_cents: 9000 };
    expect(prepareOrderItems([{ ...minimal, file_key: 'uploads/source' }])[0].file_key).toBe('uploads/source');
    expect(() => prepareOrderItems([{ ...minimal, thumbnail_url: preview }])).toThrow('missing its saved artwork');
    expect(() => prepareOrderItems([{ ...minimal, file_url: 'blob:expired-upload' }])).toThrow('missing its saved artwork');
  });
  it('allows intentional design-service and text-only orders', () => {
    expect(prepareOrderItems([{ ...item, file_key: null, file_url: null, text_elements: [{ content: 'Text-only design' }] }])).toHaveLength(1);
    expect(prepareOrderItems([{ width_in: 72, height_in: 36, quantity: 1, line_total_cents: 9000, design_service_enabled: true }])).toHaveLength(1);
  });
  it('clones nested artwork instead of modifying the historical order', () => {
    const quote = orderItemToReorderQuote(item);
    quote.textElements[0].content = 'New text';
    expect(item.text_elements[0].content).toBe('Saved headline');
  });
  it('keeps the approved exact preview and original manifest through reorder and email rendering', () => {
    const placement = { version: 3, uploadStatus: 'uploaded', sourceIdentity: item.file_key, sourceUrl: original, productType: 'banner', widthIn: 72, heightIn: 36, fitMode: 'fit', positionPct: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, compositionRevision: 1, previewUrl: preview, previewPublicId: 'previews/approved', previewWidthPx: 1200, previewHeightPx: 600 } as any;
    placement.compositionSignature = buildCompositionSignatureFromPreview(placement);
    const manifest = { originalUrl: original, publicId: item.file_key, resourceType: 'image', format: 'png', mimeType: 'image/png', originalFilename: item.file_name, bytes: 50000, uploadStatus: 'uploaded', uploadedAt: '2026-10-01T00:00:00Z' };
    useCartStore.getState().addFromQuote(orderItemToReorderQuote({ ...item, placement_preview: placement, artwork_manifest: manifest }));
    const [saved] = prepareOrderItems(useCartStore.getState().items);
    expect(saved.artwork_manifest.originalUrl).toBe(original);
    expect(saved.placement_preview).toMatchObject(placement);
    expect(getFinalizedThumbnailUrl(saved)).toContain(preview);
    expect(() => orderItemToReorderQuote({ ...item, placement_preview: { ...placement, widthIn: 96 } })).toThrow('preview rebuilt');
  });
  it('preserves product type and yard-sign design metadata', () => {
    const yard = { ...item, product_type: 'yard_sign', material: 'corrugated', width_in: 24, height_in: 18, yard_sign_designs: [{ fileKey: 'uploads/yard', quantity: 1 }], yard_sign_sidedness: 'double', yard_sign_step_stakes_enabled: true, yard_sign_step_stakes_qty: 1 };
    useCartStore.getState().addFromQuote(orderItemToReorderQuote(yard));
    expect(useCartStore.getState().items[0]).toMatchObject({ product_type: 'yard_sign', yard_sign_designs: yard.yard_sign_designs, yard_sign_sidedness: 'double', yard_sign_step_stakes_qty: 1 });
  });
});
