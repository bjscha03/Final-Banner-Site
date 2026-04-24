/**
 * Admin endpoint: upload a proof file URL for a graduation intake and send
 * the customer a "Your Graduation Design Proof Is Ready" email.
 *
 * The proof file itself is uploaded to Cloudinary by the admin UI via the
 * existing `/.netlify/functions/upload-file` endpoint; only the resulting
 * URL is posted to this endpoint. This keeps the function payload small and
 * reuses the existing upload infrastructure.
 *
 * Auth: requires the requesting user's email to be in the
 * ADMIN_TEST_PAY_ALLOWLIST environment variable.
 *
 * Method: POST
 * Body: {
 *   email: string,            // admin user
 *   intakeId: string,
 *   proofFileUrl: string,
 *   proofFileKey?: string,
 *   proofFileName?: string,
 *   adminMessage?: string
 * }
 *
 * Side effects:
 *   - inserts a row into proof_versions (auto-incremented version_number)
 *   - updates the intake: status=proof_sent, latest_proof_version, last_status_change_at
 *   - marks any prior in-flight proof rows as "superseded"
 *   - emails the customer the proof email with the /proof/:token review link
 */
const {
  getSql,
  ensureSchema,
  isAdminEmail,
  getIntakeById,
  sendProofToCustomer,
} = require('./lib/graduation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function isHttpUrl(v) {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { /* ignore */ }
  const email = typeof body.email === 'string' ? body.email : '';
  const intakeId = typeof body.intakeId === 'string' ? body.intakeId : '';
  const proofFileUrl = typeof body.proofFileUrl === 'string' ? body.proofFileUrl : '';
  const proofFileKey = typeof body.proofFileKey === 'string' ? body.proofFileKey.slice(0, 300) : null;
  const proofFileName = typeof body.proofFileName === 'string' ? body.proofFileName.slice(0, 200) : null;
  const adminMessage = typeof body.adminMessage === 'string' ? body.adminMessage.slice(0, 4000) : null;

  if (!isAdminEmail(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admin access required' }) };
  }
  if (!/^[0-9a-f-]{36}$/i.test(intakeId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid intakeId' }) };
  }
  if (!isHttpUrl(proofFileUrl)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'A valid proofFileUrl is required' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const intake = await getIntakeById(sql, intakeId);
    if (!intake) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Intake not found' }) };
    }
    if (!intake.design_fee_paid) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Cannot send proof — design fee not paid yet.' }) };
    }
    if (intake.final_payment_paid) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order is already paid in full and ready for production.' }) };
    }

    // Mark any previously-sent in-flight proofs as superseded
    await sql`
      UPDATE proof_versions
      SET status = 'superseded'
      WHERE intake_id = ${intakeId}::uuid
        AND status IN ('sent', 'revision_requested')
    `;

    const nextVersion = (Number(intake.latest_proof_version) || 0) + 1;
    const inserted = await sql`
      INSERT INTO proof_versions (
        intake_id, version_number, proof_file_url, proof_file_key, proof_file_name,
        admin_message, admin_email, status
      ) VALUES (
        ${intakeId}::uuid, ${nextVersion}, ${proofFileUrl}, ${proofFileKey}, ${proofFileName},
        ${adminMessage}, ${email}, 'sent'
      )
      RETURNING *
    `;
    const proof = inserted[0];

    await sql`
      UPDATE designer_intake_orders
      SET
        status = 'proof_sent',
        latest_proof_version = ${nextVersion},
        last_status_change_at = NOW(),
        updated_at = NOW()
      WHERE id = ${intakeId}::uuid
    `;

    // Send proof email (best-effort)
    try {
      const updatedIntake = await getIntakeById(sql, intakeId);
      await sendProofToCustomer(updatedIntake, proof);
    } catch (emailErr) {
      console.error('admin-graduation-send-proof: customer email failed:', emailErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, proof }),
    };
  } catch (err) {
    console.error('admin-graduation-send-proof error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
