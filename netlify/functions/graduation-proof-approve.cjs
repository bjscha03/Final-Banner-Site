/**
 * Public endpoint: customer approves the latest graduation proof.
 *
 * Marks the latest proof as 'approved', moves intake to
 * 'approved_awaiting_payment', and returns the data needed for the client
 * to load the final product balance into the standard site checkout cart.
 *
 * The final amount is ALWAYS recomputed server-side from product_specs —
 * we never trust amounts posted by the client.
 *
 * Method: POST  body { token: string }
 * Returns: {
 *   ok: true,
 *   amountCents: number,
 *   intakeId: string,
 *   proofVersionNumber: number,
 *   approvedProofUrl: string,
 *   approvedProofFileName: string | null,
 *   productType: string,
 *   productSpecs: object,
 *   customerName: string,
 * }
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
      intake.final_product_amount_cents
      ?? (recomputed ? recomputed.totalCents : intake.estimated_product_total_cents)
      ?? 0;
    if (!amountCents || amountCents <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Final balance not configured. Please contact support.' }) };
    }

    // Mark proof approved + intake awaiting payment + persist final amount + approved proof URL
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        amountCents,
        intakeId: intake.id,
        proofVersionNumber: latestProof.version_number,
        approvedProofUrl: latestProof.proof_file_url,
        approvedProofFileName: latestProof.proof_file_name || null,
        productType: intake.product_type,
        productSpecs,
        customerName: intake.customer_name,
        customerEmail: intake.customer_email,
      }),
    };
  } catch (err) {
    console.error('graduation-proof-approve error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
