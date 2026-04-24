/**
 * Admin endpoint: get a single designer-assisted (graduation) intake with
 * full details, proof history, and revision requests.
 *
 * Auth: requires the requesting user's email to be in the
 * ADMIN_TEST_PAY_ALLOWLIST environment variable.
 *
 * Method: POST  body { email: string, intakeId: string }
 * Returns: { ok: true, intake, proofs, revisions }
 */
const {
  getSql,
  ensureSchema,
  isAdminEmail,
  safeJson,
  getIntakeById,
  getProofsForIntake,
  getRevisionsForIntake,
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
  const email = typeof body.email === 'string' ? body.email : '';
  const intakeId = typeof body.intakeId === 'string' ? body.intakeId : '';
  if (!isAdminEmail(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admin access required' }) };
  }
  if (!/^[0-9a-f-]{36}$/i.test(intakeId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid intakeId' }) };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    const intake = await getIntakeById(sql, intakeId);
    if (!intake) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Intake not found' }) };
    }
    const proofs = await getProofsForIntake(sql, intakeId);
    const revisions = await getRevisionsForIntake(sql, intakeId);
    intake.product_specs = safeJson(intake.product_specs, {});
    intake.graduate_info = safeJson(intake.graduate_info, {});
    intake.design_notes = safeJson(intake.design_notes, {});
    intake.inspiration_files = safeJson(intake.inspiration_files, []);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, intake, proofs, revisions }),
    };
  } catch (err) {
    console.error('admin-graduation-get error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
