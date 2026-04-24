/**
 * Designer-assisted (graduation) intake submission.
 *
 * Receives the JSON payload from the /graduation-signs landing page intake form,
 * validates it, stores it in the designer_intake_orders table, and emails the
 * customer + admin. Modeled on contact-submit.cjs (same Resend / Neon pattern).
 *
 * NOTE: $19 design-fee PayPal capture, proof upload UI, customer approval page,
 * and final-payment flow are deferred to follow-up PRs. This function intentionally
 * only persists the intake and triggers the two confirmation emails.
 */
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const ALLOWED_PRODUCT_TYPES = new Set(['banner', 'yard_sign', 'car_magnet']);
const DESIGN_FEE_CENTS = 1900;
const MAX_INSPIRATION_FILES = 10;

function sanitize(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    '<p style="margin:6px 0;"><strong>' + sanitize(label) + ':</strong> ' + sanitize(value || '—') + '</p>';

  const renderSection = (title, obj) => {
    const entries = Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (entries.length === 0) return '';
    return '<h3 style="color:#1f2937;margin:20px 0 12px;">' + sanitize(title) + '</h3>'
      + entries.map(([k, v]) => renderKv(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('');
  };

  const filesHtml = inspirationFiles.length
    ? '<h3 style="color:#1f2937;margin:20px 0 12px;">Uploaded Inspiration Files</h3><ul style="padding-left:20px;margin:0;">'
      + inspirationFiles.map((f) => '<li style="margin:4px 0;"><a href="' + sanitize(f.url) + '" style="color:#dc2626;">' + sanitize(f.name || f.url) + '</a>' + (f.category ? ' <span style="color:#6b7280;">(' + sanitize(f.category) + ')</span>' : '') + '</li>').join('')
      + '</ul>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;margin:0 auto;padding:20px;background:#f4f4f4;">'
    + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
    + '<div style="text-align:center;padding:20px;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
    + '<div style="background:#7c3aed;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">New Designer-Assisted Graduation Order</h1><p style="margin:8px 0 0;color:#ddd6fe;">A customer has requested a custom graduation design</p></div>'
    + '<div style="padding:24px;">'
    + '<h3 style="color:#1f2937;margin:0 0 12px;">Customer</h3>'
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
    + '<h3 style="color:#1f2937;margin:20px 0 12px;">Payment</h3>'
    + '<p style="margin:6px 0;"><strong>Design fee:</strong> $19.00 (pending)</p>'
    + '<p style="margin:6px 0;color:#6b7280;font-size:13px;">Send the customer a $19 design-fee invoice/PayPal link, then upload a proof for approval.</p>'
    + '<div style="text-align:center;margin:24px 0;"><a href="' + adminOrderLink + '" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open Admin Orders</a></div>'
    + '</div></div></body></html>';
}

function buildCustomerHtml({ customerName }) {
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4;">'
    + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
    + '<div style="text-align:center;padding:20px;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
    + '<div style="background:#2563eb;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">We\u2019re Working on Your Graduation Design</h1></div>'
    + '<div style="padding:24px;">'
    + '<p style="font-weight:600;">Hi ' + sanitize(customerName) + ',</p>'
    + '<p>Thanks for your order. We received your graduation design request and our team is reviewing your details.</p>'
    + '<p>Your $19 design fee covers the custom design proof. We\u2019ll be in touch shortly with payment instructions for the design fee, and as soon as your proof is ready we\u2019ll email it to you for approval.</p>'
    + '<p>After you approve the design, you\u2019ll be able to pay the remaining product balance so we can move your order into production.</p>'
    + '<p style="margin-top:24px;">\u2014 Banners On The Fly</p>'
    + '</div></div></body></html>';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(headers, 405, { ok: false, error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_e) {
    return jsonResponse(headers, 400, { ok: false, error: 'Invalid JSON body' });
  }

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

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return jsonResponse(headers, 500, { ok: false, error: 'Database not configured' });
  }

  let intakeId;
  let createdAt;
  try {
    const sql = neon(dbUrl);
    const approvalToken = crypto.randomBytes(24).toString('hex'); // pre-generated for deferred /proof/:token flow

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
  } catch (dbErr) {
    console.error('designer-intake-submit DB error:', dbErr);
    return jsonResponse(headers, 500, { ok: false, error: 'Failed to save intake', details: dbErr.message });
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
        subject: 'We\u2019re Working on Your Graduation Design',
        html: customerHtml,
        reply_to: emailReplyTo,
        tags: [{ name: 'source', value: 'designer_intake_ack' }],
      });

      try {
        const sql = neon(dbUrl);
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
  });
};
