const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUploadPayload,
  formatGoogleAdsDateTime,
  missingGoogleAdsConfig,
  enqueuePaidStripeConversion,
  enqueueConversionAdjustment,
  getConversionQueueSummary,
  processDueConversions,
  sha256,
} = require('../googleAdsConversions.cjs');

const env = {
  GOOGLE_ADS_DEVELOPER_TOKEN: 'dev',
  GOOGLE_ADS_CLIENT_ID: 'client',
  GOOGLE_ADS_CLIENT_SECRET: 'secret',
  GOOGLE_ADS_REFRESH_TOKEN: 'refresh',
  GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
  GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
  GOOGLE_ADS_UPLOAD_ENABLED: 'true',
};

function makeSql({ queue = [], browserAudit = [], orders = [] } = {}) {
  const updates = [];
  const sql = async (strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (/CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|ALTER TABLE/.test(text)) return [];
    if (/SELECT id, order_number, status, total_cents/.test(text)) {
      const lookup = values[0];
      return orders.filter((o) => o.id === lookup || o.stripe_payment_intent_id === lookup);
    }
    if (/INSERT INTO google_ads_conversion_queue/.test(text)) {
      const order_number = values[1];
      const payment_event_id = values[3];
      const existing = queue.find((r) => r.order_number === order_number && r.payment_event_id === payment_event_id);
      if (existing) return [{ id: existing.id, conversion_status: existing.conversion_status }];
      const row = { id: queue.length + 1, order_number, payment_event_id, conversion_status: 'pending_browser_wait' };
      queue.push(row);
      return [row];
    }
    if (/GROUP BY conversion_status/.test(text)) {
      const grouped = new Map();
      for (const row of queue) {
        const current = grouped.get(row.conversion_status) || { conversion_status: row.conversion_status, count: 0, oldest_created_at: row.created_at || null };
        current.count += 1;
        if (row.created_at && (!current.oldest_created_at || row.created_at < current.oldest_created_at)) current.oldest_created_at = row.created_at;
        grouped.set(row.conversion_status, current);
      }
      return [...grouped.values()];
    }
    if (/ORDER BY completed_at/.test(text)) return queue.filter((r) => r.conversion_status === 'uploaded').slice(0, 1);
    if (/error_message IS NOT NULL/.test(text)) return queue.filter((r) => r.error_message).slice(0, 1);
    if (/UPDATE google_ads_conversion_queue/.test(text) && /RETURNING \*/.test(text)) {
      const selected = queue.filter((r) => ['pending_browser_wait', 'retry'].includes(r.conversion_status || 'pending_browser_wait')).slice(0, values.at(-1) || queue.length);
      selected.forEach((r) => { r.conversion_status = 'processing'; });
      return selected;
    }
    if (/FROM google_ads_conversion_queue/.test(text)) return queue;
    if (/FROM purchase_analytics_audit/.test(text)) {
      const orderNumber = values[0];
      return browserAudit.filter((r) => r.order_number === orderNumber && r.google_ads_status === 'attempted' && r.google_ads_attempted_at);
    }
    if (/UPDATE google_ads_conversion_queue/.test(text)) {
      updates.push({ text, values });
      return [];
    }
    return [];
  };
  sql.updates = updates;
  return sql;
}


test('Stripe webhook creates one conversion queue record and duplicate webhook does not duplicate', async () => {
  const queue = [];
  const sql = makeSql({ orders: [{ id: 'order-1', order_number: 'BOTF-1', status: 'paid', total_cents: 10000, email: 'buyer@example.com', customer_phone: '555-123-4567', google_click_id: 'gclid-1' }], queue });
  const first = await enqueuePaidStripeConversion(sql, { orderId: 'order-1', paymentIntentId: 'pi_1', stripeEventId: 'evt_1' });
  const second = await enqueuePaidStripeConversion(sql, { orderId: 'order-1', paymentIntentId: 'pi_1', stripeEventId: 'evt_1' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(queue.length, 1);
});

test('failed or canceled payment/order creates no conversion queue record', async () => {
  const queue = [];
  const sql = makeSql({ orders: [
    { id: 'failed-order', order_number: 'BOTF-F', status: 'failed', total_cents: 10000 },
    { id: 'canceled-order', order_number: 'BOTF-C', status: 'canceled', total_cents: 10000 },
  ], queue });
  assert.equal((await enqueuePaidStripeConversion(sql, { orderId: 'failed-order', paymentIntentId: 'pi_f' })).skipped, true);
  assert.equal((await enqueuePaidStripeConversion(sql, { orderId: 'canceled-order', paymentIntentId: 'pi_c' })).skipped, true);
  assert.equal(queue.length, 0);
});


test('refund or cancellation adjustment is queued only after refunded/canceled status', async () => {
  const queue = [];
  const sql = makeSql({ orders: [
    { id: 'refunded-order', order_number: 'BOTF-R', status: 'refunded', total_cents: 10000 },
    { id: 'paid-order', order_number: 'BOTF-P', status: 'paid', total_cents: 10000 },
  ], queue });
  const queued = await enqueueConversionAdjustment(sql, { orderId: 'refunded-order' });
  const skipped = await enqueueConversionAdjustment(sql, { orderId: 'paid-order' });
  assert.equal(queued.ok, true);
  assert.equal(skipped.skipped, true);
});

test('buildUploadPayload uses cents-to-dollars and order-number deduplication', () => {
  const payload = buildUploadPayload({
    order_number: 'BOTF-1001',
    conversion_value_cents: 12345,
    currency: 'USD',
    conversion_time: '2026-07-15T12:34:56Z',
    google_click_id: 'gclid-1',
  }, env);
  const conversion = payload.conversions[0];
  assert.equal(conversion.conversionValue, 123.45);
  assert.equal(conversion.currencyCode, 'USD');
  assert.equal(conversion.orderId, 'BOTF-1001');
  assert.equal(conversion.gclid, 'gclid-1');
  assert.equal(conversion.conversionAction, 'customers/1234567890/conversionActions/987654321');
  assert.equal(conversion.conversionDateTime, '2026-07-15 12:34:56+00:00');
});


test('multiple click IDs select only one preferred identifier', () => {
  const payload = buildUploadPayload({
    order_number: 'BOTF-MULTI',
    conversion_value_cents: 1000,
    currency: 'USD',
    conversion_time: '2026-07-15T12:34:56Z',
    google_click_id: 'gclid-1',
    gbraid: 'gbraid-1',
    wbraid: 'wbraid-1',
  }, env);
  const conversion = payload.conversions[0];
  assert.equal(conversion.gclid, 'gclid-1');
  assert.equal(conversion.gbraid, undefined);
  assert.equal(conversion.wbraid, undefined);
});

test('gbraid and wbraid selection work when higher-priority identifiers are absent', () => {
  assert.equal(buildUploadPayload({ order_number: 'BOTF-G', conversion_value_cents: 1000, gbraid: 'gbraid-1' }, env).conversions[0].gbraid, 'gbraid-1');
  assert.equal(buildUploadPayload({ order_number: 'BOTF-W', conversion_value_cents: 1000, wbraid: 'wbraid-1' }, env).conversions[0].wbraid, 'wbraid-1');
});

test('missing Google Ads credentials are detected', () => {
  assert.deepEqual(missingGoogleAdsConfig({}), [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_CONVERSION_ACTION_ID',
  ]);
});

test('browser gtag attempt does not prove delivery or suppress authoritative server upload', async () => {
  const sql = makeSql({
    queue: [{ id: 1, order_number: 'BOTF-1', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-1', attempt_count: 0 }],
    browserAudit: [{ order_number: 'BOTF-1', google_ads_status: 'attempted', google_ads_attempted_at: new Date() }],
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    return { ok: true, json: async () => ({ results: [{ orderId: 'BOTF-1' }] }) };
  };
  const result = await processDueConversions(sql, { env, fetchImpl });
  assert.equal(result.results[0].status, 'uploaded');
});

test('browser conversion missing uploads delayed server fallback', async () => {
  const sql = makeSql({
    queue: [{ id: 2, order_number: 'BOTF-2', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-2', attempt_count: 0 }],
    browserAudit: [],
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    return { ok: true, json: async () => ({ results: [{ orderId: 'BOTF-2' }] }) };
  };
  const result = await processDueConversions(sql, { env, fetchImpl });
  assert.equal(result.results[0].status, 'uploaded');
});

test('missing Google click identifier is terminal and not retried forever', async () => {
  const sql = makeSql({ queue: [{ id: 3, order_number: 'BOTF-3', conversion_value_cents: 5000, currency: 'USD', attempt_count: 0 }] });
  const result = await processDueConversions(sql, { env, fetchImpl: async () => { throw new Error('should not call API'); } });
  assert.equal(result.results[0].status, 'missing_click_identifier');
  assert.match(result.results[0].error, /No Google click identifier/);
});


test('ineligible or unsupported upload method is terminal', async () => {
  const sql = makeSql({ queue: [{ id: 6, order_number: 'BOTF-6', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-6', attempt_count: 0 }] });
  const result = await processDueConversions(sql, { env: { ...env, GOOGLE_ADS_UPLOAD_ENABLED: 'false' }, fetchImpl: async () => { throw new Error('should not call API'); } });
  assert.equal(result.results[0].status, 'unsupported_upload_method');
});


test('concurrent worker calls do not claim and upload the same row twice', async () => {
  const queue = [{ id: 7, order_number: 'BOTF-7', conversion_status: 'pending_browser_wait', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-7', attempt_count: 0 }];
  const sql = makeSql({ queue });
  let uploads = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    uploads += 1;
    return { ok: true, json: async () => ({ results: [{ orderId: 'BOTF-7' }] }) };
  };
  const first = await processDueConversions(sql, { env, fetchImpl });
  const second = await processDueConversions(sql, { env, fetchImpl });
  assert.equal(first.processed, 1);
  assert.equal(second.processed, 0);
  assert.equal(uploads, 1);
});

test('worker health summary returns sanitized aggregate status', async () => {
  const sql = makeSql({ queue: [
    { id: 1, conversion_status: 'pending_browser_wait', created_at: '2026-07-15T00:00:00Z' },
    { id: 2, conversion_status: 'uploaded', completed_at: '2026-07-15T01:00:00Z', order_number: 'BOTF-2' },
    { id: 3, conversion_status: 'missing_click_identifier', error_message: 'No Google click identifier available', last_attempt_at: '2026-07-15T02:00:00Z' },
  ] });
  const summary = await getConversionQueueSummary(sql);
  assert.equal(summary.ok, true);
  assert.equal(summary.counts.pending_browser_wait, 1);
  assert.equal(summary.counts.uploaded, 1);
});

test('temporary API error is retryable', async () => {
  const sql = makeSql({ queue: [{ id: 4, order_number: 'BOTF-4', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-4', attempt_count: 0 }] });
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    return { ok: false, status: 500, json: async () => ({ error: { message: 'temporary' } }) };
  };
  const result = await processDueConversions(sql, { env, fetchImpl });
  assert.equal(result.results[0].status, 'retry');
});

test('permanent API rejection is logged as permanent failure', async () => {
  const sql = makeSql({ queue: [{ id: 5, order_number: 'BOTF-5', conversion_value_cents: 5000, currency: 'USD', google_click_id: 'gclid-5', attempt_count: 0 }] });
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    return { ok: false, status: 400, json: async () => ({ error: { message: 'bad request' } }) };
  };
  const result = await processDueConversions(sql, { env, fetchImpl });
  assert.equal(result.results[0].status, 'permanent_failure');
});

test('hashing supports enhanced conversion fields without storing raw values', () => {
  assert.equal(sha256('test@example.com').length, 64);
  assert.equal(formatGoogleAdsDateTime('2026-01-02T03:04:05Z'), '2026-01-02 03:04:05+00:00');
});
