const crypto = require('crypto');

const REQUIRED_GOOGLE_ADS_ENV = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_CONVERSION_ACTION_ID',
];

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value && !value.startsWith('guest-') ? value : '';
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

function sha256(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function toMicros(cents) {
  const n = Number(cents || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 100) * 1000000);
}

function formatGoogleAdsDateTime(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

function missingGoogleAdsConfig(env = process.env) {
  return REQUIRED_GOOGLE_ADS_ENV.filter((key) => !env[key]);
}

async function ensurePurchaseAuditSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS purchase_analytics_audit (
      id BIGSERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      payment_status TEXT,
      order_total_cents INTEGER,
      currency TEXT DEFAULT 'USD',
      purchase_event_created_at TIMESTAMPTZ DEFAULT NOW(),
      ga4_attempted_at TIMESTAMPTZ,
      ga4_status TEXT,
      ga4_error TEXT,
      google_ads_attempted_at TIMESTAMPTZ,
      google_ads_status TEXT,
      google_ads_error TEXT,
      meta_attempted_at TIMESTAMPTZ,
      meta_status TEXT,
      meta_error TEXT,
      client_user_agent TEXT,
      page_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function ensureConversionQueueSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS google_ads_conversion_queue (
      id BIGSERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      payment_provider TEXT NOT NULL,
      payment_event_id TEXT NOT NULL,
      conversion_type TEXT NOT NULL DEFAULT 'purchase',
      conversion_status TEXT NOT NULL DEFAULT 'pending',
      conversion_value_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      google_click_id TEXT,
      gbraid TEXT,
      wbraid TEXT,
      email_hash TEXT,
      phone_hash TEXT,
      conversion_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
      google_ads_response JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS google_ads_conversion_queue_dedupe_idx
      ON google_ads_conversion_queue(order_number, conversion_type, payment_provider, payment_event_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS google_ads_conversion_queue_status_next_idx
      ON google_ads_conversion_queue(conversion_status, next_attempt_at)
  `;
}

async function ensureOrderAttributionColumns(sql) {
  await sql`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS google_click_id TEXT,
    ADD COLUMN IF NOT EXISTS gbraid TEXT,
    ADD COLUMN IF NOT EXISTS wbraid TEXT,
    ADD COLUMN IF NOT EXISTS landing_page TEXT,
    ADD COLUMN IF NOT EXISTS referrer TEXT,
    ADD COLUMN IF NOT EXISTS utm_source TEXT,
    ADD COLUMN IF NOT EXISTS utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS utm_term TEXT,
    ADD COLUMN IF NOT EXISTS utm_content TEXT,
    ADD COLUMN IF NOT EXISTS consent_status TEXT
  `;
}

function getOrderNumber(row) {
  return String((row && (row.order_number || row.id)) || '').trim();
}

async function enqueuePaidStripeConversion(sql, { orderId, paymentIntentId, stripeEventId, paidAt } = {}) {
  if (!orderId && !paymentIntentId) return { ok: false, error: 'MISSING_ORDER_LOOKUP' };
  await ensureConversionQueueSchema(sql);
  await ensureOrderAttributionColumns(sql);

  const rows = orderId
    ? await sql`SELECT id, order_number, status, total_cents, email, customer_phone, google_click_id, gbraid, wbraid, created_at, updated_at FROM orders WHERE id = ${orderId} LIMIT 1`
    : await sql`SELECT id, order_number, status, total_cents, email, customer_phone, google_click_id, gbraid, wbraid, created_at, updated_at FROM orders WHERE stripe_payment_intent_id = ${paymentIntentId} LIMIT 1`;
  const order = rows && rows[0];
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };
  if (String(order.status || '').toLowerCase() !== 'paid') return { ok: false, skipped: true, error: 'ORDER_NOT_PAID' };

  const orderNumber = getOrderNumber(order);
  const valueCents = Number(order.total_cents || 0);
  if (!orderNumber || !Number.isFinite(valueCents) || valueCents <= 0) return { ok: false, error: 'INVALID_ORDER_FOR_CONVERSION' };

  const paymentEventId = stripeEventId || paymentIntentId || orderId;
  const emailHash = sha256(normalizeEmail(order.email));
  const phoneHash = sha256(normalizePhone(order.customer_phone));
  const conversionTime = paidAt ? new Date(paidAt) : new Date();

  const inserted = await sql`
    INSERT INTO google_ads_conversion_queue (
      order_id, order_number, payment_provider, payment_event_id, conversion_type,
      conversion_status, conversion_value_cents, currency, google_click_id, gbraid, wbraid,
      email_hash, phone_hash, conversion_time, next_attempt_at
    ) VALUES (
      ${order.id}, ${orderNumber}, 'stripe', ${paymentEventId}, 'purchase',
      'pending_browser_wait', ${valueCents}, 'USD', ${order.google_click_id || null}, ${order.gbraid || null}, ${order.wbraid || null},
      ${emailHash}, ${phoneHash}, ${conversionTime}, NOW() + INTERVAL '2 hours'
    )
    ON CONFLICT (order_number, conversion_type, payment_provider, payment_event_id) DO UPDATE SET
      conversion_value_cents = EXCLUDED.conversion_value_cents,
      google_click_id = COALESCE(google_ads_conversion_queue.google_click_id, EXCLUDED.google_click_id),
      gbraid = COALESCE(google_ads_conversion_queue.gbraid, EXCLUDED.gbraid),
      wbraid = COALESCE(google_ads_conversion_queue.wbraid, EXCLUDED.wbraid),
      email_hash = COALESCE(google_ads_conversion_queue.email_hash, EXCLUDED.email_hash),
      phone_hash = COALESCE(google_ads_conversion_queue.phone_hash, EXCLUDED.phone_hash)
    RETURNING id, conversion_status
  `;
  return { ok: true, id: inserted && inserted[0] && inserted[0].id, orderNumber };
}

async function browserGoogleAdsAttemptExists(sql, orderNumber) {
  await ensurePurchaseAuditSchema(sql);
  const rows = await sql`
    SELECT id FROM purchase_analytics_audit
    WHERE order_number = ${orderNumber}
      AND google_ads_status = 'attempted'
      AND google_ads_attempted_at IS NOT NULL
    LIMIT 1
  `;
  return Boolean(rows && rows.length);
}

function buildUploadPayload(row, env = process.env) {
  const customerId = String(env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const actionId = env.GOOGLE_ADS_CONVERSION_ACTION_ID;
  const conversionAction = `customers/${customerId}/conversionActions/${actionId}`;
  const conversion = {
    conversionAction,
    conversionDateTime: formatGoogleAdsDateTime(row.conversion_time || row.created_at),
    conversionValue: Number((Number(row.conversion_value_cents || 0) / 100).toFixed(2)),
    currencyCode: row.currency || 'USD',
    orderId: row.order_number,
  };
  if (row.google_click_id) {
    conversion.gclid = row.google_click_id;
  } else if (row.gbraid) {
    conversion.gbraid = row.gbraid;
  } else if (row.wbraid) {
    conversion.wbraid = row.wbraid;
  }
  return { conversions: [conversion], partialFailure: true, validateOnly: false };
}

async function getAccessToken(env = process.env, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const err = new Error(data.error_description || data.error || `OAuth token failed: ${response.status}`);
    err.permanent = response.status >= 400 && response.status < 500;
    throw err;
  }
  return data.access_token;
}

async function uploadConversion(row, env = process.env, fetchImpl = fetch) {
  const missing = missingGoogleAdsConfig(env);
  if (missing.length) {
    const err = new Error(`Missing Google Ads configuration: ${missing.join(', ')}`);
    err.permanent = true;
    throw err;
  }
  if (env.GOOGLE_ADS_UPLOAD_ENABLED !== 'true') {
    const err = new Error('Google Ads upload disabled or eligibility not confirmed');
    err.status = 'unsupported_upload_method';
    err.permanent = true;
    throw err;
  }
  if (!row.google_click_id && !row.gbraid && !row.wbraid) {
    const err = new Error('No Google click identifier available');
    err.status = 'missing_click_identifier';
    err.permanent = true;
    throw err;
  }

  const token = await getAccessToken(env, fetchImpl);
  const customerId = String(env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const url = `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || 'v24'}/customers/${customerId}:uploadClickConversions`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/-/g, '');
  const payload = buildUploadPayload(row, env);
  const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.partialFailureError) {
    const err = new Error(data.partialFailureError?.message || data.error?.message || `Google Ads upload failed: ${response.status}`);
    err.permanent = response.status >= 400 && response.status < 500;
    err.response = data;
    throw err;
  }
  return data;
}

async function enqueueConversionAdjustment(sql, { orderId, adjustmentType = 'retraction', reason = 'order_refunded_or_canceled' } = {}) {
  if (!orderId) return { ok: false, error: 'MISSING_ORDER_ID' };
  await ensureConversionQueueSchema(sql);
  const rows = await sql`SELECT id, order_number, status, total_cents FROM orders WHERE id = ${orderId} LIMIT 1`;
  const order = rows && rows[0];
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };
  const status = String(order.status || '').toLowerCase();
  if (!['refunded', 'canceled', 'cancelled'].includes(status)) {
    return { ok: false, skipped: true, error: 'ORDER_NOT_REFUNDED_OR_CANCELED' };
  }
  const orderNumber = getOrderNumber(order);
  const inserted = await sql`
    INSERT INTO google_ads_conversion_queue (
      order_id, order_number, payment_provider, payment_event_id, conversion_type,
      conversion_status, conversion_value_cents, currency, next_attempt_at, error_message
    ) VALUES (
      ${order.id}, ${orderNumber}, 'stripe', ${`${adjustmentType}:${order.id}`}, ${adjustmentType},
      'adjustment_pending', ${Number(order.total_cents || 0)}, 'USD', NOW(), ${reason}
    )
    ON CONFLICT (order_number, conversion_type, payment_provider, payment_event_id) DO NOTHING
    RETURNING id
  `;
  return { ok: true, id: inserted && inserted[0] && inserted[0].id, orderNumber };
}

async function processDueConversions(sql, { limit = 10, env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  await ensureConversionQueueSchema(sql);
  const rows = await sql`
    UPDATE google_ads_conversion_queue
    SET conversion_status = 'processing', last_attempt_at = NOW()
    WHERE id IN (
      SELECT id FROM google_ads_conversion_queue
      WHERE conversion_status IN ('pending_browser_wait', 'retry')
        AND next_attempt_at <= NOW()
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  const results = [];
  for (const row of rows) {
    try {
      const response = await uploadConversion(row, env, fetchImpl);
      await sql`
        UPDATE google_ads_conversion_queue
        SET conversion_status = 'uploaded', completed_at = NOW(), last_attempt_at = NOW(), attempt_count = attempt_count + 1,
            google_ads_response = ${JSON.stringify(response)}::jsonb, error_message = NULL
        WHERE id = ${row.id}
      `;
      results.push({ id: row.id, status: 'uploaded' });
    } catch (error) {
      const permanent = Boolean(error.permanent);
      const nextStatus = error.status || (permanent ? 'permanent_failure' : 'retry');
      const nextDelayMinutes = Math.min(1440, Math.pow(2, Number(row.attempt_count || 0)) * 15);
      await sql`
        UPDATE google_ads_conversion_queue
        SET conversion_status = ${nextStatus}, last_attempt_at = NOW(), attempt_count = attempt_count + 1,
            next_attempt_at = CASE WHEN ${permanent} THEN next_attempt_at ELSE NOW() + (${`${nextDelayMinutes} minutes`})::interval END,
            google_ads_response = ${JSON.stringify(error.response || {})}::jsonb,
            error_message = ${error.message}
        WHERE id = ${row.id}
      `;
      results.push({ id: row.id, status: nextStatus, error: error.message });
    }
  }
  return { ok: true, processed: results.length, results, now };
}

async function getConversionQueueSummary(sql) {
  await ensureConversionQueueSchema(sql);
  const rows = await sql`
    SELECT conversion_status, COUNT(*)::int AS count, MIN(created_at) AS oldest_created_at
    FROM google_ads_conversion_queue
    GROUP BY conversion_status
  `;
  const lastSuccess = await sql`
    SELECT completed_at, order_number FROM google_ads_conversion_queue
    WHERE conversion_status = 'uploaded'
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 1
  `;
  const lastError = await sql`
    SELECT conversion_status, error_message, last_attempt_at FROM google_ads_conversion_queue
    WHERE error_message IS NOT NULL
    ORDER BY last_attempt_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return {
    ok: true,
    counts: rows.reduce((acc, row) => ({ ...acc, [row.conversion_status]: row.count }), {}),
    oldest_pending: rows.filter((r) => ['pending_browser_wait', 'retry', 'processing'].includes(r.conversion_status)).map((r) => r.oldest_created_at).filter(Boolean).sort()[0] || null,
    last_successful_upload_at: lastSuccess[0]?.completed_at || null,
    last_google_api_error: lastError[0] ? { status: lastError[0].conversion_status, message: lastError[0].error_message, at: lastError[0].last_attempt_at } : null,
  };
}

module.exports = {
  REQUIRED_GOOGLE_ADS_ENV,
  buildUploadPayload,
  browserGoogleAdsAttemptExists,
  enqueuePaidStripeConversion,
  enqueueConversionAdjustment,
  ensureConversionQueueSchema,
  ensureOrderAttributionColumns,
  ensurePurchaseAuditSchema,
  formatGoogleAdsDateTime,
  getConversionQueueSummary,
  missingGoogleAdsConfig,
  normalizeEmail,
  normalizePhone,
  processDueConversions,
  sha256,
  toMicros,
  uploadConversion,
};
