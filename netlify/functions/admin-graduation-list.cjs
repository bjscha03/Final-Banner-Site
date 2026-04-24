/**
 * Admin endpoint: list designer-assisted (graduation) intakes.
 *
 * Auth: requires the requesting user's email to be in the
 * ADMIN_TEST_PAY_ALLOWLIST environment variable (same allowlist used by
 * the existing check-admin-status.cjs endpoint and the in-app admin UI).
 *
 * Method: POST  body { email: string }
 * Returns: { ok: true, intakes: [...minimal rows] }
 */
const { getSql, ensureSchema, isAdminEmail, safeJson } = require('./lib/graduation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { /* ignore */ }
  const email = typeof body.email === 'string' ? body.email : '';
  if (!isAdminEmail(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admin access required' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = await sql`
      SELECT id, customer_name, customer_email, product_type, status,
             design_fee_paid, final_payment_paid,
             estimated_product_total_cents, final_product_amount_cents,
             latest_proof_version, created_at, updated_at,
             graduate_info
      FROM designer_intake_orders
      ORDER BY created_at DESC
      LIMIT 200
    `;
    const intakes = rows.map((r) => ({
      ...r,
      graduate_info: safeJson(r.graduate_info, {}),
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, intakes }) };
  } catch (err) {
    console.error('admin-graduation-list error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
