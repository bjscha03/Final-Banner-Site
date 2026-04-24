/**
 * Designer-assisted (graduation) intake submission.
 *
 * Receives the JSON payload from the /graduation-signs landing page intake form,
 * validates it, and stores it in the designer_intake_orders table with
 * status = 'pending_payment'. Returns { ok: true, intakeId } so the frontend
 * can add a $19 design_deposit item to the normal cart and redirect to /checkout.
 *
 * Emails are sent ONLY after checkout payment succeeds (handled in create-order.cjs).
 */
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const { calculateEstimateForIntake } = require('./lib/graduation.cjs');

const ALLOWED_PRODUCT_TYPES = new Set(['banner', 'yard_sign', 'car_magnet']);
const MAX_INSPIRATION_FILES = 10;

// Ensure the designer_intake_orders table exists (idempotent DDL).
async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS designer_intake_orders (
      id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_name              VARCHAR(160) NOT NULL,
      customer_email             VARCHAR(255) NOT NULL,
      customer_phone             VARCHAR(40),
      order_type                 VARCHAR(40)  NOT NULL DEFAULT 'designer_assisted',
      source                     VARCHAR(60)  NOT NULL DEFAULT 'graduation_landing_page',
      product_type               VARCHAR(40)  NOT NULL,
      product_specs              JSONB        NOT NULL DEFAULT '{}'::jsonb,
      graduate_info              JSONB        NOT NULL DEFAULT '{}'::jsonb,
      design_notes               JSONB        NOT NULL DEFAULT '{}'::jsonb,
      inspiration_files          JSONB        NOT NULL DEFAULT '[]'::jsonb,
      design_fee_amount_cents    INTEGER      NOT NULL DEFAULT 1900,
      design_fee_paid            BOOLEAN      NOT NULL DEFAULT FALSE,
      final_product_amount_cents INTEGER,
      final_payment_paid         BOOLEAN      NOT NULL DEFAULT FALSE,
      status                     VARCHAR(40)  NOT NULL DEFAULT 'pending_payment',
      paypal_order_id            TEXT,
      approval_token             VARCHAR(64),
      approved_proof_url         TEXT,
      created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;
  // Ensure paypal_order_id column exists for older table versions
  await sql`
    ALTER TABLE designer_intake_orders
      ADD COLUMN IF NOT EXISTS paypal_order_id TEXT
  `;
  // Estimated-pricing columns added in migration 016 (idempotent here too).
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_product_subtotal_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_tax_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_product_total_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS design_fee_paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS final_payment_paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS final_product_paypal_order_id TEXT`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS latest_proof_version INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ`;
}

function sanitize(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(headers, statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

function normalizeInspirationFiles(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_INSPIRATION_FILES)
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const url = isHttpUrl(f.url) ? f.url : null;
      if (!url) return null;
      return {
        name: typeof f.name === 'string' ? f.name.slice(0, 200) : '',
        url,
        fileKey: typeof f.fileKey === 'string' ? f.fileKey.slice(0, 300) : '',
        category: typeof f.category === 'string' ? f.category.slice(0, 40) : '',
      };
    })
    .filter(Boolean);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // --- CORS preflight ---
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('designer-intake-submit invoked:', event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return jsonResponse(headers, 405, { ok: false, error: 'Method not allowed' });
  }

  // --- Parse body ---
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_e) {
    return jsonResponse(headers, 400, { ok: false, error: 'Invalid JSON body' });
  }

  console.log('designer-intake-submit payload keys:', Object.keys(payload));

  // --- Validation ---
  const customerName = typeof payload.customerName === 'string' ? payload.customerName.trim() : '';
  const customerEmail = typeof payload.customerEmail === 'string' ? payload.customerEmail.trim() : '';
  const customerPhone = typeof payload.customerPhone === 'string' ? payload.customerPhone.trim() : '';
  const productType = typeof payload.productType === 'string' ? payload.productType.trim() : '';

  if (!customerName || customerName.length > 160) {
    return jsonResponse(headers, 400, { ok: false, error: 'Customer name is required (max 160 chars).' });
  }
  if (!customerEmail || customerEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return jsonResponse(headers, 400, { ok: false, error: 'A valid customer email is required.' });
  }
  if (!customerPhone || customerPhone.length > 40) {
    return jsonResponse(headers, 400, { ok: false, error: 'Customer phone is required (max 40 chars).' });
  }
  if (!ALLOWED_PRODUCT_TYPES.has(productType)) {
    return jsonResponse(headers, 400, { ok: false, error: 'productType must be banner, yard_sign, or car_magnet.' });
  }

  const productSpecs = (payload.productSpecs && typeof payload.productSpecs === 'object') ? payload.productSpecs : {};
  const graduateInfo = (payload.graduateInfo && typeof payload.graduateInfo === 'object') ? payload.graduateInfo : {};
  const designNotes = (payload.designNotes && typeof payload.designNotes === 'object') ? payload.designNotes : {};
  const inspirationFiles = normalizeInspirationFiles(payload.inspirationFiles);

  // Server-side recomputation of estimated pricing — never trust client values.
  // We accept client-supplied estimates ONLY as a hint; we always store the
  // server-calculated values, which mirror the same pricing engines the
  // customer-facing pricing card uses.
  const estimate = calculateEstimateForIntake(productType, productSpecs);
  const estimatedSubtotalCents = estimate ? estimate.subtotalCents : null;
  const estimatedTaxCents = estimate ? estimate.taxCents : null;
  const estimatedTotalCents = estimate ? estimate.totalCents : null;

  // Hard cap on serialized JSON size to avoid runaway payloads
  const totalJsonSize = JSON.stringify({ productSpecs, graduateInfo, designNotes, inspirationFiles }).length;
  if (totalJsonSize > 100_000) {
    return jsonResponse(headers, 400, { ok: false, error: 'Submission payload too large.' });
  }

  // --- Env var checks ---
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('designer-intake-submit: DATABASE_URL not configured');
    return jsonResponse(headers, 500, { ok: false, error: 'Database not configured' });
  }

  // --- Ensure DB table exists ---
  let sql;
  try {
    sql = neon(dbUrl);
    await ensureTable(sql);
  } catch (ddlErr) {
    console.error('designer-intake-submit DDL error:', ddlErr.message, ddlErr);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to initialize database table' });
  }

  // --- Save intake to DB with status = pending_payment ---
  // Emails are NOT sent here. They are sent after checkout payment succeeds
  // (handled in create-order.cjs when a design_deposit cart item is detected).
  let intakeId;
  try {
    const approvalToken = crypto.randomBytes(24).toString('hex');

    const result = await sql`
      INSERT INTO designer_intake_orders (
        customer_name,
        customer_email,
        customer_phone,
        order_type,
        source,
        product_type,
        product_specs,
        graduate_info,
        design_notes,
        inspiration_files,
        design_fee_amount_cents,
        design_fee_paid,
        status,
        approval_token,
        estimated_product_subtotal_cents,
        estimated_tax_cents,
        estimated_product_total_cents
      ) VALUES (
        ${customerName},
        ${customerEmail},
        ${customerPhone},
        ${'designer_assisted'},
        ${'graduation_landing_page'},
        ${productType},
        ${JSON.stringify(productSpecs)}::jsonb,
        ${JSON.stringify(graduateInfo)}::jsonb,
        ${JSON.stringify(designNotes)}::jsonb,
        ${JSON.stringify(inspirationFiles)}::jsonb,
        ${1900},
        ${false},
        ${'pending_payment'},
        ${approvalToken},
        ${estimatedSubtotalCents},
        ${estimatedTaxCents},
        ${estimatedTotalCents}
      )
      RETURNING id
    `;
    intakeId = result[0].id;
    console.log('designer-intake-submit: intake saved as pending_payment, id:', intakeId);
  } catch (dbErr) {
    console.error('designer-intake-submit DB insert error:', dbErr.message, dbErr);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to save intake', details: dbErr.message });
  }

  // Return intakeId AND server-validated estimated total to the frontend so
  // the cart can display it and the post-payment emails can include it.
  return jsonResponse(headers, 200, {
    ok: true,
    message: 'Designer intake saved',
    intakeId,
    estimatedProductSubtotalCents: estimatedSubtotalCents,
    estimatedTaxCents,
    estimatedProductTotalCents: estimatedTotalCents,
  });
};
