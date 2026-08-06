import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { TRADE_SHOWS } from '../../../src/lib/tradeShows/tradeShows.ts';
import { buildTradeShowEmail } from '../../../src/lib/tradeShows/tradeShowEmail.mjs';
import { _test as endpointTest } from '../admin-trade-show-emails.mjs';
import {
  buildTradeShowUnsubscribeUrl,
  compliancePage,
  generateUnsubscribeToken,
  hashUnsubscribeToken,
  validUnsubscribeToken,
} from '../_shared/trade-show-email-compliance.mjs';
import { _test as webhookTest } from '../trade-show-email-webhook.mjs';

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
    const unsubscribeUrl = 'https://bannersonthefly.com/.netlify/functions/trade-show-unsubscribe?token=test_abcdefghijklmnopqrstuvwxyz123456';
    const email = buildTradeShowEmail({ event: rocky, exhibitorName: 'Acme Apparel', discountCode: '20RMAS', unsubscribeUrl });
    expect(email.subject).toBe('Acme Apparel — Save 20% on banners for Rocky Mountain Apparel, Gift & Resort Show');
    expect(email.html).toContain('Hi Acme Apparel,');
    expect(email.html).toContain('20RMAS');
    expect(email.text).toContain('24-hour production');
    expect(email.text).toContain('Free Next-Day Air delivery');
    expect(email.text).toContain('custom vinyl banners and mesh banners');
    expect(email.html).toContain('background:#f7faff');
    expect(email.html).toContain('border-bottom:4px solid #ff6a00');
    expect(email.html).toContain('<strong style="color:#e45700;font-weight:900;">24-hour production</strong>');
    expect(email.html).toContain('<strong style="color:#e45700;font-weight:900;">Free Next-Day Air delivery</strong>');
    expect(email.html).toContain('Banners On The Fly is not affiliated with or endorsed by Rocky Mountain Apparel, Gift &amp; Resort Show or its organizer.');
    expect(email.text).toContain('Banners On The Fly is not affiliated with or endorsed by Rocky Mountain Apparel, Gift & Resort Show or its organizer.');
    expect(email.html).toContain(unsubscribeUrl.replace(/&/g, '&amp;'));
    expect(email.text).toContain(`Unsubscribe from trade-show promotional emails: ${unsubscribeUrl}`);
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

  it('uses opaque hashed unsubscribe tokens and never reflects them on the confirmation page', () => {
    const token = generateUnsubscribeToken();
    expect(validUnsubscribeToken(token)).toBe(true);
    expect(token).toHaveLength(43);
    expect(hashUnsubscribeToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUnsubscribeToken(token)).not.toContain(token);
    expect(buildTradeShowUnsubscribeUrl(token)).toBe(`https://bannersonthefly.com/.netlify/functions/trade-show-unsubscribe?token=${token}`);
    const page = compliancePage(200, 'Unsubscribe', 'Confirm your choice.', true);
    expect(page.body).toContain('Confirm unsubscribe');
    expect(page.body).not.toContain(token);
    expect(page.headers['Cache-Control']).toBe('no-store');
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
    const webhook = fs.readFileSync(path.join(root, 'netlify/functions/_shared/legacy/resend-webhook.cjs'), 'utf8');
    const webhookRouter = fs.readFileSync(path.join(root, 'netlify/functions/resend-webhook.mjs'), 'utf8');
    expect(endpoint).toContain('serverAuthModule.requireAdmin(event)');
    expect(endpoint).toContain("event.httpMethod === 'POST'");
    expect(endpoint).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(endpoint).toContain('FROM trade_show_email_unsubscribes');
    expect(endpoint).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
    expect(endpoint).toContain('idempotencyKey: `trade-show-email/${requestKey}`');
    expect(endpoint).not.toContain('VITE_RESEND');
    expect(webhook).toContain("header(event, 'svix-signature')");
    expect(webhook).toContain('new Resend().webhooks.verify');
    expect(webhook).not.toContain('x-resend-signature');
    expect(webhookRouter).toContain('createTradeShowHandler');
  });

  it('adds a guarded Neon unsubscribe list and complaint-event audit log', () => {
    const migration = fs.readFileSync(path.join(root, 'migrations/028_trade_show_email_compliance.sql'), 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS trade_show_email_unsubscribes');
    expect(migration).toContain('normalized_email TEXT NOT NULL UNIQUE');
    expect(migration).toContain("'spam_complaint'");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS trade_show_email_provider_events');
    expect(migration).toContain("'email.complained'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS unsubscribe_token_hash TEXT');
  });

  it('verifies Resend Svix webhook headers and identifies complaint recipients', () => {
    const previous = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_trade_show_test';
    try {
      let received;
      const result = webhookTest.verifyWebhook({
        headers: {
          'svix-id': 'evt_trade_show_complaint',
          'svix-timestamp': '1786064400',
          'svix-signature': 'v1,test',
        },
      }, '{"type":"email.complained"}', {
        verify: (options) => { received = options; return { type: 'email.complained' }; },
      });
      expect(result.type).toBe('email.complained');
      expect(received).toMatchObject({
        payload: '{"type":"email.complained"}',
        webhookSecret: 'whsec_trade_show_test',
        headers: { id: 'evt_trade_show_complaint', timestamp: '1786064400', signature: 'v1,test' },
      });
      expect(webhookTest.recipientFromPayload({ data: { to: [' Buyer@Example.com '] } })).toBe('buyer@example.com');
    } finally {
      if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = previous;
    }
  });

  it('sends a private idempotent admin alert for a spam complaint without contacting the recipient', async () => {
    const previousKey = process.env.RESEND_API_KEY;
    const previousAdmin = process.env.ADMIN_EMAIL;
    process.env.RESEND_API_KEY = 're_test_only';
    process.env.ADMIN_EMAIL = 'alerts@bannersonthefly.com';
    try {
      let request;
      let options;
      const result = await webhookTest.sendComplaintAlert({
        trade_show_slug: rocky.slug,
        trade_show_name: rocky.name,
        exhibitor_name: 'Acme Apparel',
        recipient_email: 'buyer@example.com',
        resend_message_id: 'email_message_123',
      }, { data: { email_id: 'email_message_123' } }, 'evt_complaint_123', {
        resend: {
          emails: {
            send: async (sendRequest, sendOptions) => {
              request = sendRequest;
              options = sendOptions;
              return { data: { id: 'alert_message_123' } };
            },
          },
        },
      });
      expect(result).toEqual({ status: 'sent', messageId: 'alert_message_123', error: null });
      expect(request.to).toBe('alerts@bannersonthefly.com');
      expect(request.to).not.toBe('buyer@example.com');
      expect(request.subject).toContain('Spam complaint received');
      expect(options.idempotencyKey).toBe('trade-show-complaint/evt_complaint_123');
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
      if (previousAdmin === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousAdmin;
    }
  });
});
