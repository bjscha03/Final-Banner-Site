/**
 * Capture a final-product PayPal order for a graduation intake (called from
 * the customer's browser after PayPal redirects back to /proof/:token with
 * `?final=success&token=<paypal_order_id>` style params).
 *
 * Method: POST  body { token: string, paypalOrderId: string }
 *
 * Side effects on COMPLETED capture:
 *   - intake: final_payment_paid=true, status='paid_ready_for_production',
 *     final_payment_paid_at=NOW, final_product_paypal_order_id stored
 *   - admin email: "Graduation Proof Approved and Paid"
 *   - customer email: receipt confirming production starting
 */
const {
  getSql,
  ensureSchema,
  getIntakeByApprovalToken,
  getProofsForIntake,
  sendApprovedAndPaidEmails,
} = require('./lib/graduation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function getPayPalCredentials() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error(`PayPal credentials not configured for environment: ${env}`);
  return {
    clientId,
    secret,
    baseUrl: env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

async function getPayPalAccessToken() {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const r = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`PayPal auth failed: ${r.status}`);
  const d = await r.json();
  return { accessToken: d.access_token, baseUrl };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { /* ignore */ }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const paypalOrderId = typeof body.paypalOrderId === 'string' ? body.paypalOrderId.trim() : '';
  if (!/^[a-f0-9]{16,128}$/i.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid token' }) };
  }
  if (!paypalOrderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'paypalOrderId is required' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const intake = await getIntakeByApprovalToken(sql, token);
    if (!intake) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Proof not found' }) };
    }
    if (intake.final_payment_paid) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyPaid: true }) };
    }
    // Optional safety: confirm the paypalOrderId matches what we created
    if (intake.final_product_paypal_order_id && intake.final_product_paypal_order_id !== paypalOrderId) {
      console.warn('paypal-capture-final-product: paypalOrderId mismatch', {
        stored: intake.final_product_paypal_order_id, posted: paypalOrderId,
      });
    }

    const { accessToken, baseUrl } = await getPayPalAccessToken();
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    });
    const captureData = await captureRes.json();
    if (!captureRes.ok) {
      console.error('paypal-capture-final-product capture failed:', captureRes.status, JSON.stringify(captureData));
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'PayPal capture failed', details: captureData }) };
    }
    if (captureData.status !== 'COMPLETED') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Payment not completed', status: captureData.status }) };
    }

    // Compute paid amount from capture response when possible
    let paidCents = intake.final_product_amount_cents || 0;
    try {
      const cap = captureData.purchase_units?.[0]?.payments?.captures?.[0];
      if (cap?.amount?.value) paidCents = Math.round(parseFloat(cap.amount.value) * 100);
    } catch (_e) { /* keep fallback */ }

    await sql`
      UPDATE designer_intake_orders
         SET final_payment_paid = true,
             final_payment_paid_at = NOW(),
             final_product_amount_cents = COALESCE(final_product_amount_cents, ${paidCents}),
             status = 'paid_ready_for_production',
             last_status_change_at = NOW(),
             final_product_paypal_order_id = ${paypalOrderId},
             updated_at = NOW()
       WHERE id = ${intake.id}::uuid
    `;

    try {
      const proofs = await getProofsForIntake(sql, intake.id);
      const approvedProof = proofs.reverse().find((p) => p.status === 'approved') || proofs[0];
      const updatedRows = await sql`SELECT * FROM designer_intake_orders WHERE id = ${intake.id}::uuid LIMIT 1`;
      await sendApprovedAndPaidEmails(updatedRows[0] || intake, approvedProof, paidCents);
    } catch (emailErr) {
      console.error('paypal-capture-final-product: email failed:', emailErr.message);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, paidCents }) };
  } catch (err) {
    console.error('paypal-capture-final-product error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
