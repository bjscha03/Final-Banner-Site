/**
 * Public endpoint: customer approves the latest graduation proof.
 *
 * Marks the latest proof as 'approved', moves intake to
 * 'approved_awaiting_payment', and creates a PayPal order for the final
 * product balance. Returns a PayPal approve link the client redirects to.
 *
 * The final amount is ALWAYS recomputed server-side from product_specs —
 * we never trust amounts posted by the client.
 *
 * Method: POST  body { token: string }
 * Returns: { ok: true, checkoutUrl: string, amountCents: number }
 */
const {
  getSql,
  ensureSchema,
  getIntakeByApprovalToken,
  getProofsForIntake,
  calculateEstimateForIntake,
  safeJson,
  emailEnv,
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
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${txt}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, baseUrl };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { /* ignore */ }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^[a-f0-9]{16,128}$/i.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid token' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const intake = await getIntakeByApprovalToken(sql, token);
    if (!intake) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Proof not found' }) };
    }
    if (intake.final_payment_paid) {
      return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Order already paid in full.' }) };
    }
    const proofs = await getProofsForIntake(sql, intake.id);
    const latestProof = proofs.length > 0 ? proofs[proofs.length - 1] : null;
    if (!latestProof) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'No proof has been sent yet.' }) };
    }

    // ALWAYS recompute the authoritative final balance server-side.
    const productSpecs = safeJson(intake.product_specs, {});
    const recomputed = calculateEstimateForIntake(intake.product_type, productSpecs);
    const amountCents =
      intake.final_product_amount_cents ||
      (recomputed ? recomputed.totalCents : intake.estimated_product_total_cents) ||
      0;
    if (!amountCents || amountCents <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Final balance not configured. Please contact support.' }) };
    }
    const amountDollars = (amountCents / 100).toFixed(2);

    // Mark proof approved + intake awaiting payment + persist final amount
    await sql`
      UPDATE proof_versions
         SET status = 'approved', responded_at = NOW()
       WHERE id = ${latestProof.id}::uuid
    `;
    await sql`
      UPDATE designer_intake_orders
         SET status = 'approved_awaiting_payment',
             approved_proof_url = COALESCE(approved_proof_url, ${latestProof.proof_file_url}),
             final_product_amount_cents = COALESCE(final_product_amount_cents, ${amountCents}),
             last_status_change_at = NOW(),
             updated_at = NOW()
       WHERE id = ${intake.id}::uuid
    `;

    // Create PayPal order for the final balance
    const env = emailEnv();
    const { accessToken, baseUrl } = await getPayPalAccessToken();
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amountDollars },
        description: 'Graduation product balance — approved design',
        custom_id: intake.id,
      }],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        return_url: env.siteUrl.replace(/\/$/, '') + '/proof/' + encodeURIComponent(token) + '?final=success',
        cancel_url: env.siteUrl.replace(/\/$/, '') + '/proof/' + encodeURIComponent(token) + '?final=cancel',
        shipping_preference: 'GET_FROM_FILE',
      },
    };
    const ppRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });
    if (!ppRes.ok) {
      const txt = await ppRes.text();
      console.error('graduation-proof-approve PayPal create failed:', ppRes.status, txt);
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Failed to create payment session' }) };
    }
    const ppOrder = await ppRes.json();
    const approveLink = (ppOrder.links || []).find((l) => l.rel === 'approve');
    if (!approveLink) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'PayPal did not return an approve link' }) };
    }

    await sql`
      UPDATE designer_intake_orders
         SET final_product_paypal_order_id = ${ppOrder.id}, updated_at = NOW()
       WHERE id = ${intake.id}::uuid
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, checkoutUrl: approveLink.href, amountCents, paypalOrderId: ppOrder.id }),
    };
  } catch (err) {
    console.error('graduation-proof-approve error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
