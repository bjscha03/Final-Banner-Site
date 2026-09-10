import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { handler, _test } = require('../_shared/legacy/get-abandoned-carts.cjs');

describe('get-abandoned-carts admin endpoint', () => {
  it('rejects unauthenticated access before reading database configuration', async () => {
    const response = await handler({ httpMethod: 'GET', headers: {} });

    expect(response.statusCode).toBe(401);
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('returns only lightweight commerce item summaries', () => {
    const item = _test.normalizeItem({
      product_type: 'yard_sign',
      width_in: '24',
      height_in: '18',
      material: 'coroplast',
      quantity: '3',
      line_total_cents: '4500',
      has_artwork: true,
      file_url: 'data:image/png;base64,should-never-be-forwarded',
      canvas_state_json: 'large-production-payload',
    });

    expect(item).toEqual({
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      dimensions: '24″ × 18″',
      area_sqft: 3,
      material: 'coroplast',
      quantity: 3,
      line_total_cents: 4500,
      has_artwork: true,
    });
    expect(JSON.stringify(item)).not.toContain('base64');
    expect(JSON.stringify(item)).not.toContain('canvas_state');
  });

  it('merges live suppression state and uses cents for analytics', () => {
    const suppression = new Map([
      ['shopper@example.com', { reason: 'unsubscribed', recordedAt: '2026-08-15T15:00:00.000Z' }],
    ]);
    const cart = _test.normalizeCart({
      id: 'cart-id',
      email: 'Shopper@Example.com',
      total_value: '42.50',
      estimated_total_cents: null,
      recovery_status: 'recovered',
      recovery_emails_sent: 1,
      checkout_stage: 'contact',
      item_summaries: [{ width_in: '48', height_in: '24', quantity: '1', material: '13oz', has_artwork: false }],
      created_at: '2026-08-15T12:00:00.000Z',
      last_activity_at: '2026-08-15T13:00:00.000Z',
    }, suppression);

    expect(cart.estimated_total_cents).toBeNull();
    expect(cart.captured_value_cents).toBe(4250);
    expect(cart.recovery_suppression_reason).toBe('unsubscribed');
    const analytics = _test.summarizeCarts([cart]);
    expect(analytics.recoveredCount).toBe(0);
    expect(analytics.recoveredAfterEmailValueCents).toBe(0);
    expect(analytics.suppressedCount).toBe(1);
    expect(analytics.abandonmentCohortCount).toBe(0);
    expect(analytics.totalCapturedValueCents).toBe(4250);
    expect(analytics.topSizes).toEqual([{ label: '48″ × 24″', count: 1 }]);
  });

  it('keeps recovery events while retained revenue excludes refunded and unknown exact-order outcomes', () => {
    const base = {
      total_value: 100,
      recovery_status: 'recovered',
      recovery_emails_sent: 1,
      abandoned_at: '2026-08-15T14:00:00.000Z',
      recovered_at: '2026-08-15T15:00:00.000Z',
      checkout_stage: 'payment_started',
      item_summaries: [],
      created_at: '2026-08-15T12:00:00.000Z',
      last_activity_at: '2026-08-15T13:00:00.000Z',
    };
    const retained = _test.normalizeCart({
      ...base,
      id: 'recovered-retained',
      recovered_order_id: 'order-retained',
      recovered_order_found: true,
      recovered_order_status: 'delivered',
      recovered_order_total_cents: 8800,
    }, new Map());
    const refunded = _test.normalizeCart({
      ...base,
      id: 'recovered-refunded',
      recovered_order_id: 'order-refunded',
      recovered_order_found: true,
      recovered_order_status: 'refunded',
      recovered_order_total_cents: 20000,
    }, new Map());
    const historicalUnknown = _test.normalizeCart({
      ...base,
      id: 'recovered-historical-unknown',
      recovered_order_id: null,
      recovered_order_found: false,
      recovered_order_status: null,
      recovered_order_total_cents: null,
    }, new Map());

    expect(retained.recovered_revenue_state).toBe('retained');
    expect(refunded.recovered_revenue_state).toBe('refunded');
    expect(historicalUnknown.recovered_revenue_state).toBe('unknown');
    const analytics = _test.summarizeCarts([retained, refunded, historicalUnknown]);
    expect(analytics).toMatchObject({
      recoveredCount: 3,
      recoveredRetainedCount: 1,
      recoveredRefundedCount: 1,
      recoveredRevenueUnknownCount: 1,
      recoveredValueCents: 8_800,
      recoveredAfterEmailCount: 3,
      recoveredAfterEmailRetainedCount: 1,
      recoveredAfterEmailValueCents: 8_800,
    });

    const query = _test.analyticsQuery('TRUE');
    expect(query).toContain(`LEFT JOIN orders AS recovered_order ON ${_test.recoveredOrderJoinSql()}`);
    expect(query).toMatch(/recovered_order_status|recovered_order[\s\S]+refunded/i);
    expect(query).toMatch(/recovered_revenue_unknown_count/i);
    expect(query).toMatch(/recovered_after_email_retained_count/i);
    expect(query).toMatch(/SUM\(GREATEST\(COALESCE\(recovered_order\.total_cents, 0\), 0\)/i);
  });

  it('normalizes bounded delivery, event, offer, and exact-order recovery facts', () => {
    const cart = _test.normalizeCart({
      id: 'recovery-funnel-cart',
      total_value: 100,
      recovery_status: 'recovered',
      abandoned_at: '2026-09-01T10:00:00.000Z',
      recovered_order_id: 'order-1',
      recovered_order_found: true,
      recovered_order_status: 'paid',
      recovered_order_total_cents: '7500',
      recovered_order_created_at: '2026-09-01T11:00:00.000Z',
      recovery_deliveries: [{ sequence_number: 1, status: 'sent', sent_at: '2026-09-01T10:01:00.000Z', discount_code: 'SAVE25' }],
      recovery_events: [{ event_type: 'email_clicked', email_sequence_number: 1, created_at: '2026-09-01T10:05:00.000Z', source: 'signed_recovery_link' }],
      recovery_offers: [{ code: 'SAVE25', discount_percentage: '25', status: 'used', used: true, order_id: 'order-1' }],
      item_summaries: [],
      created_at: '2026-09-01T09:00:00.000Z',
      last_activity_at: '2026-09-01T09:30:00.000Z',
    }, new Map());

    expect(cart.recovered_order_total_cents).toBe(7500);
    expect(cart.recovery_deliveries).toEqual([expect.objectContaining({ sequence_number: 1, status: 'sent', discount_code: 'SAVE25' })]);
    expect(cart.recovery_events).toEqual([expect.objectContaining({ event_type: 'email_clicked', source: 'signed_recovery_link' })]);
    expect(cart.recovery_offers).toEqual([expect.objectContaining({ code: 'SAVE25', discount_percentage: 25, status: 'used', used: true })]);
  });

  it('joins the historical text recovery ID to UUID orders without an invalid uuid = text comparison', () => {
    const join = _test.recoveredOrderJoinSql();
    const query = _test.analyticsQuery('TRUE');
    const source = readFileSync(
      new URL('../_shared/legacy/get-abandoned-carts.cjs', import.meta.url),
      'utf8',
    );
    const recoveryMigration = readFileSync(
      new URL('../../../migrations/006_add_recovery_tracking_columns.sql', import.meta.url),
      'utf8',
    );

    expect(recoveryMigration).toMatch(/ADD COLUMN IF NOT EXISTS recovered_order_id TEXT/i);
    expect(join).toBe(
      "recovered_order.id::TEXT = LOWER(NULLIF(BTRIM(cart.recovered_order_id), ''))",
    );
    expect(query).toContain(`LEFT JOIN orders AS recovered_order ON ${join}`);
    expect(query).not.toMatch(/recovered_order\.id\s*=\s*cart\.recovered_order_id/);
    expect(source.match(/LEFT JOIN orders AS recovered_order ON \$\{recoveredOrderJoinSql\(\)\}/g)).toHaveLength(2);
    expect(source).toMatch(/FROM cart_recovery_deliveries AS delivery/);
    expect(source).toMatch(/FROM cart_recovery_logs AS recovery_log/);
    expect(source).toMatch(/FROM discount_codes AS discount/);
    expect(source).toMatch(/recovered_order\.total_cents/);
  });

  it('bounds pagination and parses only whitelisted server-side filters and sorting', () => {
    const options = _test.parseRequestOptions({
      queryStringParameters: {
        page: '3',
        limit: '5000',
        sort: 'value_desc; DROP TABLE orders',
        from: '2026-09-01',
        to: '2026-09-30',
        size: '48x24',
        min_value: '50',
        max_value: '250',
        stage: 'contact',
        email: 'with_email',
        status: 'abandoned',
      },
    });

    expect(options).toMatchObject({ page: 3, limit: 50, sort: 'activity_desc', summaryOnly: false });
    expect(options.filters).toMatchObject({
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      size: { width: 48, height: 24 },
      minValueCents: 5000,
      maxValueCents: 25000,
      checkoutStage: 'contact',
      emailPresence: 'with_email',
      recoveryStatus: 'abandoned',
    });
    const filterSql = _test.buildFilterSql(options.filters);
    expect(filterSql.params).toEqual(['2026-09-01', '2026-09-30', 5000, 25000, 'contact', 'abandoned', 48, 24]);
    expect(filterSql.clause).not.toContain('DROP TABLE');

    const invalidDateOptions = _test.parseRequestOptions({
      queryStringParameters: { from: '2026-02-31', to: 'not-a-date' },
    });
    expect(invalidDateOptions.filters.fromDate).toBeNull();
    expect(invalidDateOptions.filters.toDate).toBeNull();
  });

  it('keeps API-shaped post-rollout stage timestamps and classifies terminal outcomes once', () => {
    const base = {
      total_value: 60,
      checkout_stage: 'contact',
      checkout_stage_updated_at: '2026-09-01T10:00:00.000Z',
      item_summaries: [{ product_type: 'banner', width_in: '48', height_in: '24', area_sqft: '8' }],
      created_at: '2026-09-01T09:00:00.000Z',
      last_activity_at: '2026-09-01T10:00:00.000Z',
    };
    const carts = [
      ...Array.from({ length: 10 }, (_, index) => _test.normalizeCart({
        ...base,
        id: `abandoned-${index}`,
        recovery_status: 'abandoned',
        abandoned_at: '2026-09-01T11:00:00.000Z',
      }, new Map())),
      ...Array.from({ length: 10 }, (_, index) => _test.normalizeCart({
        ...base,
        id: `completed-${index}`,
        recovery_status: 'recovered',
        recovered_at: '2026-09-01T11:00:00.000Z',
      }, new Map())),
      _test.normalizeCart({
        ...base,
        id: 'poster-completed',
        recovery_status: 'recovered',
        recovered_at: '2026-09-01T11:00:00.000Z',
        item_summaries: [{ product_type: 'poster', width_in: '72', height_in: '48', area_sqft: '24' }],
      }, new Map()),
      _test.normalizeCart({ ...base, id: 'censored', recovery_status: 'active' }, new Map()),
      _test.normalizeCart({ ...base, id: 'historical', checkout_stage_updated_at: null, recovery_status: 'abandoned', abandoned_at: '2026-09-01T11:00:00.000Z' }, new Map()),
    ];

    expect(carts[0].checkout_stage_updated_at).toBe('2026-09-01T10:00:00.000Z');
    const comparison = _test.summarizeOutcomeComparison(carts);
    expect(comparison.terminalSampleSize).toBe(21);
    expect(comparison.valueClassifiedSampleSize).toBe(21);
    expect(comparison.sizeClassifiedSampleSize).toBe(20);
    expect(comparison.sizeBands[0]).toMatchObject({
      abandonedCount: 10,
      completedCount: 10,
      sampleSize: 20,
      abandonmentRate: 0.5,
      sufficientSample: true,
    });
  });

  it('discloses a 41-line source cart captured as a 40-line bounded snapshot', () => {
    const storedItems = Array.from({ length: 40 }, (_, index) => ({
      product_type: 'banner',
      width_in: '48',
      height_in: '24',
      area_sqft: '8',
      material: `vinyl-${index}`,
      quantity: '1',
    }));
    const cart = _test.normalizeCart({
      id: 'bounded-41-line-cart',
      total_value: 400,
      stored_item_count: 40,
      item_quantity: 40,
      item_summaries: storedItems,
      item_summaries_truncated: false,
      snapshot_metadata_present: true,
      snapshot_metadata_version: '1',
      snapshot_source_item_count: '41',
      snapshot_stored_item_count: '40',
      snapshot_complete: 'false',
      checkout_stage: 'cart',
      created_at: '2026-09-01T09:00:00.000Z',
      last_activity_at: '2026-09-01T10:00:00.000Z',
    }, new Map());

    expect(cart.item_count).toBe(40);
    expect(cart.stored_item_count).toBe(40);
    expect(cart.source_item_count).toBe(41);
    expect(cart.snapshot_completeness).toBe('incomplete');
    expect(cart.item_summaries).toHaveLength(40);
    expect(cart.item_summaries_truncated).toBe(false);
  });

  it('builds size, value, and stage facets from every matching cart', () => {
    const base = {
      id: 'cart-facet',
      total_value: 125,
      captured_value_cents: 12_500,
      checkout_stage: 'contact',
      item_summaries: [{ width_in: '48', height_in: '24', quantity: '100', material: '13oz', has_artwork: false }],
      created_at: '2026-08-15T12:00:00.000Z',
      last_activity_at: '2026-08-15T13:00:00.000Z',
    };
    const abandoned = _test.normalizeCart({ ...base, abandoned_at: '2026-08-15T14:00:00.000Z' }, new Map());
    const directPurchase = _test.normalizeCart({
      ...base,
      id: 'cart-direct-purchase',
      recovery_status: 'recovered',
      item_summaries: [{ width_in: '120', height_in: '60', quantity: '1', material: '18oz' }],
    }, new Map());

    const analytics = _test.summarizeCarts([abandoned, directPurchase]);
    expect(analytics.abandonmentCohortCount).toBe(1);
    expect(analytics.totalCapturedValueCents).toBe(25_000);
    expect(analytics.topSizes).toEqual([
      { label: '120″ × 60″', count: 1 },
      { label: '48″ × 24″', count: 1 },
    ]);
    expect(analytics.valueBands).toEqual([{ label: '$100–$249', count: 2 }]);
    expect(analytics.checkoutStages).toEqual([{ label: 'contact', count: 2 }]);

    const query = _test.facetsQuery('TRUE');
    expect(query).not.toMatch(/abandoned_at\s+IS\s+NOT\s+NULL/i);
  });

  it('preserves unknown historical artwork instead of fabricating false', () => {
    const item = _test.normalizeItem({ width_in: '48', height_in: '24' });
    const cart = _test.normalizeCart({
      id: 'historical-cart',
      has_artwork: null,
      item_summaries: [item],
      total_value: 20,
    }, new Map());

    expect(item.has_artwork).toBeNull();
    expect(cart.has_artwork).toBeNull();
    expect(cart.source_item_count).toBeNull();
    expect(cart.stored_item_count).toBe(1);
    expect(cart.snapshot_completeness).toBe('unknown');
  });

  it('does not assign cart-level artwork to an unknown historical item', () => {
    const item = _test.normalizeItem({ width_in: '48', height_in: '24', has_artwork: null });
    const cart = _test.normalizeCart({
      id: 'historical-cart-with-artwork',
      has_artwork: true,
      item_summaries: [item],
      total_value: 20,
    }, new Map());

    expect(item.has_artwork).toBeNull();
    expect(cart.has_artwork).toBe(true);
  });

  it('loads newsletter and domain suppressions for the Admin eligibility display', async () => {
    const sql = async (first) => {
      const query = Array.isArray(first) ? first.join('?') : String(first || '');
      if (/FROM outbound_suppressions/i.test(query)) {
        return [
          {
            value: 'blocked-business.com',
            reason: 'legal',
            scope: 'company_domain',
            recorded_at: '2026-08-15T14:00:00.000Z',
          },
          {
            value: 'wrong-contact@business.com',
            reason: 'wrong_contact',
            scope: 'email',
            recorded_at: '2026-08-15T14:01:00.000Z',
          },
          {
            value: 'duplicate@business.com',
            reason: 'duplicate',
            scope: 'email',
            recorded_at: '2026-08-15T14:02:00.000Z',
          },
        ];
      }
      if (/FROM newsletter/i.test(query)) {
        return [{ email: 'newsletter@business.com', recorded_at: '2026-08-15T15:00:00.000Z' }];
      }
      return [];
    };

    const suppression = await _test.readSuppressionState(sql);
    expect(suppression.get('@blocked-business.com')?.reason).toBe('legal');
    expect(suppression.get('wrong-contact@business.com')?.reason).toBe('wrong_contact');
    expect(suppression.get('duplicate@business.com')?.reason).toBe('duplicate');
    expect(suppression.get('newsletter@business.com')?.reason).toBe('newsletter_unsubscribed');

    const domainSuppressed = _test.normalizeCart({
      id: 'cart-domain',
      email: 'buyer@blocked-business.com',
      item_summaries: [],
      total_value: 0,
    }, suppression);
    expect(domainSuppressed.recovery_suppression_reason).toBe('legal');
  });

  it('bounds live suppression lookups to the current page emails and domains', async () => {
    const calls = [];
    const sql = async (query, params) => {
      calls.push({ query: String(query), params });
      if (/FROM outbound_suppressions/i.test(query)) {
        return [{
          value: 'blocked-business.com',
          reason: 'legal',
          scope: 'company_domain',
          recorded_at: '2026-08-15T14:00:00.000Z',
        }];
      }
      return [];
    };

    const suppression = await _test.readSuppressionState(sql, [
      'Buyer@Blocked-Business.com',
      'buyer@blocked-business.com',
      ...Array.from({ length: 75 }, (_, index) => `person-${index}@example.test`),
    ]);

    expect(calls).toHaveLength(5);
    calls.forEach(({ query, params }) => {
      expect(query).toContain('ANY($1::TEXT[])');
      expect(params[0]).toHaveLength(50);
      expect(params[0][0]).toBe('buyer@blocked-business.com');
    });
    expect(calls[0].params[1]).toContain('blocked-business.com');
    expect(suppression.get('@blocked-business.com')?.reason).toBe('legal');
  });
});
