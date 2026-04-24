/**
 * Public endpoint: load a graduation proof for the customer review page
 * (`/proof/:token`). Looks up the intake by approval_token and returns the
 * latest proof, public-safe intake fields, and an authoritative
 * server-recomputed final balance.
 *
 * Method: POST  body { token: string }
 *
 * Returns ONLY customer-safe fields. Never includes admin emails, internal
 * status histories beyond what the customer needs, or any pricing the customer
 * can manipulate — the final balance is always recomputed server-side from
 * the stored product_specs.
 */
const {
  getSql,
  ensureSchema,
  getIntakeByApprovalToken,
  getProofsForIntake,
  calculateEstimateForIntake,
  safeJson,
} = require('./lib/graduation.cjs');

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
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  // approval_token is 48 hex chars (24 bytes). Be permissive for older tokens.
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

    const proofs = await getProofsForIntake(sql, intake.id);
    const latestProof = proofs.length > 0 ? proofs[proofs.length - 1] : null;

    const productSpecs = safeJson(intake.product_specs, {});
    // ALWAYS recompute the final balance server-side. Use stored final amount
    // if present (set by admin override), otherwise fall back to the recomputed
    // estimate so the customer sees a consistent number.
    const recomputed = calculateEstimateForIntake(intake.product_type, productSpecs);
    const finalBalanceCents = intake.final_product_amount_cents ||
      (recomputed ? recomputed.totalCents : intake.estimated_product_total_cents) || 0;

    // Build public-safe payload
    const publicIntake = {
      id: intake.id,
      customerName: intake.customer_name,
      productType: intake.product_type,
      productSpecs,
      graduateInfo: safeJson(intake.graduate_info, {}),
      status: intake.status,
      designFeePaid: intake.design_fee_paid,
      finalPaymentPaid: intake.final_payment_paid,
      estimatedProductSubtotalCents: intake.estimated_product_subtotal_cents,
      estimatedTaxCents: intake.estimated_tax_cents,
      estimatedProductTotalCents: intake.estimated_product_total_cents,
      finalBalanceCents,
    };
    const publicProof = latestProof
      ? {
          id: latestProof.id,
          versionNumber: latestProof.version_number,
          proofFileUrl: latestProof.proof_file_url,
          proofFileName: latestProof.proof_file_name,
          adminMessage: latestProof.admin_message,
          status: latestProof.status,
          sentAt: latestProof.sent_at,
        }
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, intake: publicIntake, proof: publicProof }),
    };
  } catch (err) {
    console.error('graduation-proof-get error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
