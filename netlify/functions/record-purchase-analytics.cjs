const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
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

    await sql`
      INSERT INTO purchase_analytics_audit (
        order_id, order_number, payment_status, order_total_cents, currency,
        ga4_attempted_at, ga4_status, ga4_error,
        google_ads_attempted_at, google_ads_status, google_ads_error,
        meta_attempted_at, meta_status, meta_error,
        client_user_agent, page_url
      ) VALUES (
        ${orderId}, ${orderNumber}, ${payload.payment_status || null}, ${Number(payload.order_total_cents || 0)}, ${payload.currency || 'USD'},
        ${ga4.attempted ? new Date() : null}, ${ga4.attempted ? (ga4.ok ? 'attempted' : 'error') : 'not_attempted'}, ${ga4.error || null},
        ${ads.attempted ? new Date() : null}, ${ads.attempted ? (ads.ok ? 'attempted' : 'error') : 'not_attempted'}, ${ads.error || null},
        ${meta.attempted ? new Date() : null}, ${meta.attempted ? (meta.ok ? 'attempted' : 'error') : 'not_attempted'}, ${meta.error || null},
        ${event.headers['user-agent'] || event.headers['User-Agent'] || null}, ${payload.page_url || null}
      )
    `;

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('[record-purchase-analytics] error', error);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'AUDIT_LOG_FAILED' }) };
  }
};
