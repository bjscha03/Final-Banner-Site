import { afterEach, describe, expect, it, vi } from 'vitest';
import getOrder from '../../../netlify/functions/_shared/legacy/get-order.cjs';
import auth from '../../../netlify/functions/_shared/server-auth.cjs';
import { estimateOrderProfit } from '../admin-profit-estimate';

const order = { id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914', user_id: 'customer-1',
  status: 'paid', subtotal_cents: 4000, total_cents: 3392, tax_cents: 192,
  applied_discount_cents: 800, created_at: '2026-11-16T03:29:53.088Z' };
const banner = { id: 'item-1', product_type: 'banner', width_in: '48', height_in: '24',
  rope_feet: '0', quantity: 1, material: '13oz', grommets: '4-corners',
  pole_pockets: false, line_total_cents: 4000, file_key: 'artwork/original.jpg' };

async function readDetail(item = banner, admin = true) {
  vi.stubEnv('NETLIFY_DATABASE_URL', 'postgres://regression.invalid/database');
  vi.stubEnv('AUTH_SESSION_SECRET', 'order-read-regression-secret');
  const queries: string[] = [];
  getOrder._test.setNeonFactory(() => async (query: string) => {
    queries.push(query);
    if (/FROM orders WHERE id/.test(query)) return [order];
    if (/FROM order_items WHERE order_id/.test(query)) return [item];
    return [];
  });
  const token = auth.createSessionToken({ id: admin ? 'admin-1' : order.user_id,
    email: 'regression@example.test', is_admin: admin });
  const response = await getOrder.handler({ httpMethod: 'GET',
    headers: { authorization: `Bearer ${token}` }, queryStringParameters: { id: order.id } });
  expect(response.statusCode).toBe(200);
  expect(queries.every(query => /^SELECT\b/i.test(query.trim()))).toBe(true);
  return JSON.parse(response.body).order;
}

afterEach(() => { getOrder._test.resetNeonFactory(); vi.unstubAllEnvs(); });

describe('Postgres NUMERIC order detail readback', () => {
  it('keeps a complete 48 by 24 banner costable after detail hydration', async () => {
    const result = await readDetail();
    expect(result.items[0]).toMatchObject({ width_in: 48, height_in: 24, rope_feet: 0,
      file_key: banner.file_key });
    expect(estimateOrderProfit(result)).toMatchObject({ needsReview: false,
      productionCostCents: 1000, shippingCostCents: 1000, netProfitCents: 1200 });
  });

  it('preserves fractional dimensions and rope for customer reorder and admin costs', async () => {
    const result = await readDetail({ ...banner, width_in: '33.5', height_in: '80.25', rope_feet: '2.5' }, false);
    expect(result.items[0]).toMatchObject({ width_in: 33.5, height_in: 80.25, rope_feet: 2.5 });
    expect(estimateOrderProfit(result).needsReview).toBe(false);
  });

  it.each([null, '', 'invalid', 'NaN'])('does not invent a valid dimension for %s', async value => {
    const result = await readDetail({ ...banner, width_in: value as any });
    expect(result.items[0].width_in).toBeNull();
    expect(estimateOrderProfit(result).needsReview).toBe(true);
  });
});
