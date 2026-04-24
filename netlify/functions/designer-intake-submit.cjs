/**
 * Designer-assisted (graduation) intake submission.
 *
 * Receives the JSON payload from the /graduation-signs landing page intake form,
 * validates it, stores it in the designer_intake_orders table, creates a $19
 * PayPal design-deposit order, and returns the PayPal approval URL so the
 * frontend can redirect the customer to pay. Also emails the customer + admin.
 */
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const ALLOWED_PRODUCT_TYPES = new Set(['banner', 'yard_sign', 'car_magnet']);
const DESIGN_FEE_CENTS = 1900;
const DESIGN_FEE_DOLLARS = (DESIGN_FEE_CENTS / 100).toFixed(2);
const MAX_INSPIRATION_FILES = 10;

// Ensure the designer_intake_orders table exists (idempotent DDL).
// Also adds paypal_order_id column if the table was created before this change.
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
      status                     VARCHAR(40)  NOT NULL DEFAULT 'design_requested',
      paypal_order_id            TEXT,
      approval_token             VARCHAR(64),
      approved_proof_url         TEXT,
      created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;
  // Add paypal_order_id if it was missing from an earlier table version
  await sql`
    ALTER TABLE designer_intake_orders
      ADD COLUMN IF NOT EXISTS paypal_order_id TEXT
  `;
}

// PayPal API helpers (same pattern as paypal-create-order.cjs)
function getPayPalCredentials() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }
  return {
    clientId,
    secret,
    baseUrl: env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
  };
}

async function getPayPalAccessToken() {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, baseUrl };
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

function buildAdminHtml({
  intakeId,
  customer,
  productType,
  productSpecs,
  graduateInfo,
  designNotes,
  inspirationFiles,
  formattedDate,
}) {
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  const adminOrderLink = 'https://bannersonthefly.com/admin/orders';

  const renderKv = (label, value) =>
    '<p style="margin:6px 0;"><strong>' + sanitize(label) + ':</strong> ' + sanitize(value || '\u2014') + '</p>';

  const renderSection = (title, obj) => {
    const entries = Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (entries.length === 0) return '';
    return '<h3 style="color:#0B1F3A;margin:20px 0 12px;">' + sanitize(title) + '</h3>'
      + entries.map(([k, v]) => renderKv(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('');
  };

  const filesHtml = inspirationFiles.length
    ? '<h3 style="color:#0B1F3A;margin:20px 0 12px;">Uploaded Inspiration Files</h3><ul style="padding-left:20px;margin:0;">'
      + inspirationFiles.map((f) => '<li style="margin:4px 0;"><a href="' + sanitize(f.url) + '" style="color:#FF6A00;">' + sanitize(f.name || f.url) + '</a>' + (f.category ? ' <span style="color:#6b7280;">(' + sanitize(f.category) + ')</span>' : '') + '</li>').join('')
      + '</ul>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;margin:0 auto;padding:20px;background:#f4f4f4;">'
    + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
    + '<div style="text-align:center;padding:20px;background:#ffffff;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
    + '<div style="background:#0B1F3A;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">New Designer-Assisted Graduation Order</h1><p style="margin:8px 0 0;color:#d1d5db;">A customer has requested a custom graduation design</p></div>'
    + '<div style="padding:24px;">'
    + '<h3 style="color:#0B1F3A;margin:0 0 12px;">Customer</h3>'
    + renderKv('Name', customer.name)
    + renderKv('Email', customer.email)
    + renderKv('Phone', customer.phone)
    + renderKv('Submitted', formattedDate)
    + renderKv('Intake ID', intakeId)
    + renderKv('Product', productType)
    + renderSection('Product Specs', productSpecs)
    + renderSection('Graduate Info', graduateInfo)
    + renderSection('Design Direction', designNotes)
    + filesHtml
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'
    + '<h3 style="color:#0B1F3A;margin:0 0 12px;">Payment</h3>'
    + '<p style="margin:6px 0;"><strong>Design fee:</strong> $19.00 (pending PayPal capture)</p>'
    + '<div style="text-align:center;margin:24px 0;"><a href="' + adminOrderLink + '" style="background:#FF6A00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Admin Orders</a></div>'
    + '</div></div></body></html>';
}

function buildCustomerHtml({ customerName }) {
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4;">'
    + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
    + '<div style="text-align:center;padding:20px;background:#ffffff;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
    + '<div style="background:#0B1F3A;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">Your Graduation Design Request is In \u1f393</h1></div>'
    + '<div style="padding:24px;">'
    + '<p style="font-weight:600;color:#0B1F3A;">Hi ' + sanitize(customerName) + ',</p>'
    + '<p>Thanks for your request!</p>'
    + '<p>We\u2019re creating your custom graduation design now. You\u2019ll receive a proof shortly to review and approve.</p>'
    + '<p>Once approved, we\u2019ll print and ship fast.</p>'
    + '<p style="margin-top:8px;color:#6b7280;font-size:13px;">Questions? Reply to this email or contact us at <a href="mailto:info@bannersonthefly.com" style="color:#FF6A00;">info@bannersonthefly.com</a>.</p>'
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'
    + '<p style="font-size:13px;color:#6b7280;">\u2014 Banners On The Fly</p>'
    + '</div></div></body></html>';
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

  const paypalEnv = process.env.PAYPAL_ENV || 'sandbox';
  const paypalClientId = process.env[`PAYPAL_CLIENT_ID_${paypalEnv.toUpperCase()}`];
  const paypalSecret = process.env[`PAYPAL_SECRET_${paypalEnv.toUpperCase()}`];
  if (!paypalClientId || !paypalSecret) {
    console.error('designer-intake-submit: PayPal credentials not configured for env:', paypalEnv);
    return jsonResponse(headers, 500, { ok: false, error: 'Payment provider not configured' });
  }

  const siteUrl = process.env.SITE_URL || process.env.URL || 'https://bannersonthefly.com';

  // --- Ensure DB table exists ---
  let sql;
  try {
    sql = neon(dbUrl);
    await ensureTable(sql);
  } catch (ddlErr) {
    console.error('designer-intake-submit DDL error:', ddlErr.message, ddlErr);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to initialize database table' });
  }

  // --- Save intake to DB ---
  let intakeId;
  let createdAt;
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
        approval_token
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
        ${DESIGN_FEE_CENTS},
        ${false},
        ${'design_requested'},
        ${approvalToken}
      )
      RETURNING id, created_at
    `;
    intakeId = result[0].id;
    createdAt = result[0].created_at;
    console.log('designer-intake-submit: intake saved, id:', intakeId);
  } catch (dbErr) {
    console.error('designer-intake-submit DB insert error:', dbErr.message, dbErr);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to save intake', details: dbErr.message });
  }

  // --- Create PayPal $19 design deposit order ---
  let checkoutUrl;
  try {
    const { accessToken, baseUrl } = await getPayPalAccessToken();

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: DESIGN_FEE_DOLLARS },
        description: 'Custom design proof for graduation banner, yard sign, or car magnet',
        custom_id: intakeId,
      }],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        return_url: siteUrl.replace(/\/$/, '') + '/graduation-signs?deposit=success&intakeId=' + encodeURIComponent(intakeId),
        cancel_url: siteUrl.replace(/\/$/, '') + '/graduation-signs?deposit=cancel&intakeId=' + encodeURIComponent(intakeId),
        shipping_preference: 'NO_SHIPPING',
      },
    };

    const ppResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!ppResponse.ok) {
      const errText = await ppResponse.text();
      console.error('designer-intake-submit PayPal order creation failed:', ppResponse.status, errText);
      return jsonResponse(headers, 500, { ok: false, error: 'Failed to create payment session', intakeId });
    }

    const ppOrder = await ppResponse.json();
    const approveLink = (ppOrder.links || []).find((l) => l.rel === 'approve');
    checkoutUrl = approveLink ? approveLink.href : null;
    console.log('designer-intake-submit: PayPal order created:', ppOrder.id, 'approveUrl:', checkoutUrl);

    // Persist the PayPal order ID to the intake row (best effort)
    try {
      await sql`
        UPDATE designer_intake_orders
        SET paypal_order_id = ${ppOrder.id}, updated_at = NOW()
        WHERE id = ${intakeId}
      `;
    } catch (updateErr) {
      console.warn('designer-intake-submit: failed to save paypal_order_id:', updateErr.message);
    }
  } catch (paypalErr) {
    console.error('designer-intake-submit PayPal error:', paypalErr.message, paypalErr);
    // Intake is already saved — return error so user can retry payment
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to create payment session', intakeId });
  }

  // --- Emails (best effort, never fail the request) ---
  try {
    const { Resend } = require('resend');
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
      const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
      const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';
      const formattedDate = new Date(createdAt).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
      });

      const adminHtml = buildAdminHtml({
        intakeId,
        customer: { name: customerName, email: customerEmail, phone: customerPhone },
        productType,
        productSpecs,
        graduateInfo,
        designNotes,
        inspirationFiles,
        formattedDate,
      });

      const adminResult = await resend.emails.send({
        from: 'Banners on the Fly <' + emailFrom + '>',
        to: adminEmail,
        subject: 'New Designer-Assisted Graduation Order',
        html: adminHtml,
        reply_to: customerEmail,
        tags: [{ name: 'source', value: 'designer_intake' }],
      });

      const customerHtml = buildCustomerHtml({ customerName });
      const customerResult = await resend.emails.send({
        from: 'Banners on the Fly <' + emailFrom + '>',
        to: customerEmail,
        subject: 'Your Graduation Design Request is In \ud83c\udf93',
        html: customerHtml,
        reply_to: emailReplyTo,
        tags: [{ name: 'source', value: 'designer_intake_ack' }],
      });

      try {
        await sql`INSERT INTO email_events (type, to_email, status, provider_msg_id, created_at) VALUES ('designer_intake.admin', ${adminEmail}, 'sent', ${adminResult.data?.id || null}, NOW())`;
        await sql`INSERT INTO email_events (type, to_email, status, provider_msg_id, created_at) VALUES ('designer_intake.ack', ${customerEmail}, 'sent', ${customerResult.data?.id || null}, NOW())`;
      } catch (logErr) {
        console.warn('Failed to log designer-intake email events:', logErr.message);
      }
    } else {
      console.warn('RESEND_API_KEY not configured, skipping designer-intake emails');
    }
  } catch (emailErr) {
    console.error('Failed to send designer-intake emails:', emailErr);
  }

  return jsonResponse(headers, 200, {
    ok: true,
    message: 'Designer intake submitted',
    intakeId,
    checkoutUrl,
  });
};
