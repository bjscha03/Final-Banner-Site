import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { TRADE_SHOWS } from '../../../src/lib/tradeShows/tradeShows.ts';
import { buildTradeShowEmail } from '../../../src/lib/tradeShows/tradeShowEmail.mjs';
import { _test as endpointTest } from '../admin-trade-show-emails.mjs';

const require = createRequire(import.meta.url);
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');
const root = path.resolve(import.meta.dirname, '../../..');

function taggedSql(resolver) {
  return async (strings, ...values) => resolver(String.raw({ raw: strings }, ...values), values);
}

describe('trade show email template system', () => {
  const rocky = TRADE_SHOWS.find((event) => event.slug === 'rocky-mountain-apparel-show');

  it('renders the required Rocky Mountain personalization without unsupported products', () => {
    const email = buildTradeShowEmail({ event: rocky, exhibitorName: 'Acme Apparel', discountCode: '20RMAS' });
    expect(email.subject).toBe('Acme Apparel — Save 20% on banners for Rocky Mountain Apparel, Gift & Resort Show');
    expect(email.html).toContain('Hi Acme Apparel,');
    expect(email.html).toContain('20RMAS');
    expect(email.text).toContain('24-hour production');
    expect(email.text).toContain('Free Next-Day Air delivery');
    expect(email.text).toContain('custom vinyl banners and mesh banners');
    expect(email.planningUrl).toBe('https://bannersonthefly.com/trade-shows/rocky-mountain-apparel-show');
    for (const unsupported of ['yard signs', 'tablecloths', 'retractable displays', 'booth displays']) {
      expect(email.text.toLowerCase()).not.toContain(unsupported);
    }
    expect(email.text.toLowerCase()).not.toContain('we sell apparel');
  });

  it('escapes customer-entered HTML in the branded email', () => {
    const email = buildTradeShowEmail({ event: rocky, exhibitorName: '<img src=x onerror=alert(1)>', discountCode: '20RMAS' });
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('normalizes and validates names, addresses, and codes', () => {
    expect(endpointTest.normalizeExhibitorName('  Acme   Apparel ')).toBe('Acme Apparel');
    expect(endpointTest.normalizeExhibitorName('A')).toBeNull();
    expect(endpointTest.normalizeEmail(' Buyer@Example.com ')).toBe('buyer@example.com');
    expect(endpointTest.normalizeEmail('not-an-email')).toBeNull();
    expect(endpointTest.normalizePromotionCode('20rmas')).toBe('20RMAS');
    expect(endpointTest.normalizePromotionCode('bad code')).toBeNull();
  });

  it('backfills exactly one unique code for every canonical trade show', () => {
    const migration = fs.readFileSync(path.join(root, 'migrations/027_trade_show_email_templates.sql'), 'utf8');
    const valuesBlock = migration.split('INSERT INTO trade_show_promo_codes')[1].split('ON CONFLICT')[0];
    const rows = [...valuesBlock.matchAll(/\('([^']+)', '([^']+)', 20\)/g)].map((match) => ({ slug: match[1], code: match[2] }));
    expect(rows).toHaveLength(TRADE_SHOWS.length);
    expect(new Set(rows.map((row) => row.slug)).size).toBe(TRADE_SHOWS.length);
    expect(new Set(rows.map((row) => row.code.toUpperCase())).size).toBe(TRADE_SHOWS.length);
    expect(rows.find((row) => row.slug === rocky.slug)?.code).toBe('20RMAS');
    expect(migration).toContain('ON CONFLICT (trade_show_slug) DO NOTHING');
    expect(migration).toContain('idempotency_key TEXT NOT NULL UNIQUE');
  });

  it('resolves 20RMAS from the database as exactly 20 percent, case-insensitively', async () => {
    const sql = taggedSql((query, values) => {
      if (query.includes('trade_show_promo_codes') && String(values[0]).toUpperCase() === '20RMAS') {
        return [{ trade_show_slug: rocky.slug, code: '20RMAS', discount_percentage: 20 }];
      }
      return [];
    });
    const result = await validateDiscountForCheckout({ sql, code: '20rmas' });
    expect(result).toMatchObject({
      valid: true,
      discount: { code: '20RMAS', discountPercentage: 20, source: 'trade_show' },
    });
  });

  it('keeps the 20 percent discount consistent with the server total calculator', () => {
    const totals = computeTotals(
      [{ product_type: 'banner', quantity: 1, line_total_cents: 10_000 }],
      0.06,
      { freeShipping: true, minFloorCents: 0, shippingMethodLabel: 'Free Next-Day Air' },
      { code: '20RMAS', discountPercentage: 20 },
    );
    expect(totals.applied_discount_type).toBe('promo');
    expect(totals.applied_discount_cents).toBe(2_000);
    expect(totals.tax_cents).toBe(480);
    expect(totals.total_cents).toBe(8_480);
  });

  it('keeps the endpoint admin-only and the browser send explicitly POST-only', () => {
    const endpoint = fs.readFileSync(path.join(root, 'netlify/functions/admin-trade-show-emails.mjs'), 'utf8');
    expect(endpoint).toContain('serverAuthModule.requireAdmin(event)');
    expect(endpoint).toContain("event.httpMethod === 'POST'");
    expect(endpoint).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(endpoint).not.toContain('VITE_RESEND');
  });
});
