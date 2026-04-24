/**
 * Public endpoint: customer requests edits on a graduation proof.
 *
 * Method: POST  body { token, notes, attachmentUrl?, attachmentName? }
 *
 * Side effects:
 *   - inserts a row in revision_requests
 *   - updates the latest open proof_versions row to status='revision_requested'
 *   - updates the intake to status='revision_requested'
 *   - emails admin "Graduation Proof Edit Requested" with notes + attachment link
 */
const {
  getSql,
  ensureSchema,
  getIntakeByApprovalToken,
  getProofsForIntake,
  sendRevisionRequestedToAdmin,
} = require('./lib/graduation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function isHttpUrl(v) {
  if (typeof v !== 'string') return false;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { /* ignore */ }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 8000) : '';
  const attachmentUrl = typeof body.attachmentUrl === 'string' && isHttpUrl(body.attachmentUrl) ? body.attachmentUrl : null;
  const attachmentName = typeof body.attachmentName === 'string' ? body.attachmentName.slice(0, 200) : null;

  if (!/^[a-f0-9]{16,128}$/i.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid token' }) };
  }
  if (!notes) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Please describe the changes you would like.' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const intake = await getIntakeByApprovalToken(sql, token);
    if (!intake) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Proof not found' }) };
    }
    if (intake.final_payment_paid) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'This order is already approved and paid.' }) };
    }
    const proofs = await getProofsForIntake(sql, intake.id);
    const latestProof = proofs.length > 0 ? proofs[proofs.length - 1] : null;

    const inserted = await sql`
      INSERT INTO revision_requests (intake_id, proof_version_id, notes, attachment_url, attachment_name)
      VALUES (${intake.id}::uuid, ${latestProof ? latestProof.id : null}, ${notes}, ${attachmentUrl}, ${attachmentName})
      RETURNING *
    `;
    const revision = inserted[0];

    if (latestProof) {
      await sql`
        UPDATE proof_versions
           SET status = 'revision_requested', responded_at = NOW()
         WHERE id = ${latestProof.id}::uuid
      `;
    }
    await sql`
      UPDATE designer_intake_orders
         SET status = 'revision_requested',
             last_status_change_at = NOW(),
             updated_at = NOW()
       WHERE id = ${intake.id}::uuid
    `;

    try {
      await sendRevisionRequestedToAdmin(intake, revision, latestProof);
    } catch (emailErr) {
      console.error('graduation-proof-request-edits: admin email failed:', emailErr.message);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('graduation-proof-request-edits error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
