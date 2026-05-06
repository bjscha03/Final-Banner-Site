const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database not configured' }) };
    const sql = neon(dbUrl);
    const body = JSON.parse(event.body || '{}');
    const apply = body.apply === true;

    const candidates = await sql`
      SELECT
        id,
        created_at,
        status,
        payment_method,
        paypal_order_id,
        subtotal_cents,
        tax_cents,
        total_cents,
        COALESCE(saturday_fee_cents, 0) AS saturday_fee_cents,
        COALESCE(same_day_fee_cents, 0) AS same_day_fee_cents,
        (total_cents - subtotal_cents - tax_cents - COALESCE(saturday_fee_cents, 0)) AS inferred_same_day_fee_cents
      FROM orders
      WHERE COALESCE(status, '') = 'paid'
        AND COALESCE(same_day_fee_cents, 0) = 0
        AND (total_cents - subtotal_cents - tax_cents - COALESCE(saturday_fee_cents, 0)) > 0
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const latest = candidates[0] || null;

    let updated = null;
    if (apply && latest) {
      const rows = await sql`
        UPDATE orders
        SET same_day_fee_cents = ${latest.inferred_same_day_fee_cents},
            same_day_hit_service = TRUE
        WHERE id = ${latest.id}
          AND COALESCE(status, '') = 'paid'
          AND COALESCE(same_day_fee_cents, 0) = 0
        RETURNING id, same_day_hit_service, same_day_fee_cents
      `;
      updated = rows[0] || null;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, latestCandidate: latest, candidateCount: candidates.length, updated })
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
