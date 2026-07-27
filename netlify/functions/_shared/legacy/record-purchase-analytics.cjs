const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const allowedStatus = new Set(['not_attempted', 'queued', 'attempted', 'blocked', 'configuration_missing', 'error']);
const providerStatus = (attempt) => {
  const status = String(attempt?.status || '').trim();
  if (allowedStatus.has(status)) return status;
  if (!attempt?.attempted) return 'not_attempted';
  return attempt.ok ? 'attempted' : 'error';
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) };

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, skipped: true, error: 'DATABASE_NOT_CONFIGURED' }) };
    const payload = JSON.parse(event.body || '{}');
    const orderId = String(payload.order_id || '').trim();
    const orderNumber = String(payload.order_number || '').trim();
    if (!orderId || !orderNumber) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'MISSING_ORDER' }) };

    const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
    const find = (provider) => attempts.find((a) => a && a.provider === provider) || {};
    const ga4 = find('ga4');
    const ads = find('google_ads');
    const meta = find('meta');
    const sql = neon(dbUrl);

    await sql`
      CREATE TABLE IF NOT EXISTS purchase_analytics_audit (
        id BIGSERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        order_number TEXT NOT NULL,
        paypal_order_id TEXT,
        paypal_capture_id TEXT,
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`ALTER TABLE purchase_analytics_audit ADD COLUMN IF NOT EXISTS paypal_order_id TEXT`;
    await sql`ALTER TABLE purchase_analytics_audit ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT`;
    await sql`ALTER TABLE purchase_analytics_audit ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchase_analytics_audit_order_id ON purchase_analytics_audit(order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchase_analytics_audit_paypal_capture_id ON purchase_analytics_audit(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL`;

    const now = new Date();
    await sql`
      INSERT INTO purchase_analytics_audit (
        order_id, order_number, paypal_order_id, paypal_capture_id, payment_status, order_total_cents, currency,
        ga4_attempted_at, ga4_status, ga4_error,
        google_ads_attempted_at, google_ads_status, google_ads_error,
        meta_attempted_at, meta_status, meta_error,
        client_user_agent, page_url, updated_at
      ) VALUES (
        ${orderId}, ${orderNumber}, ${payload.paypal_order_id || null}, ${payload.paypal_capture_id || null}, ${payload.payment_status || null}, ${Number(payload.order_total_cents || 0)}, ${payload.currency || 'USD'},
        ${ga4.attempted ? now : null}, ${providerStatus(ga4)}, ${ga4.error || null},
        ${ads.attempted ? now : null}, ${providerStatus(ads)}, ${ads.error || null},
        ${meta.attempted ? now : null}, ${providerStatus(meta)}, ${meta.error || null},
        ${event.headers['user-agent'] || event.headers['User-Agent'] || null}, ${payload.page_url || null}, ${now}
      )
    `;

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('[record-purchase-analytics] error', error);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'AUDIT_LOG_FAILED' }) };
  }
};

