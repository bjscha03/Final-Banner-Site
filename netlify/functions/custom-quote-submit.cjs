const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');

const PRODUCT_LABELS = { banner: 'Banner', yard_sign: 'Yard Sign', magnet: 'Magnet' };
const VALID_PRODUCTS = Object.keys(PRODUCT_LABELS);
const VALID_UNITS = ['inches', 'feet', 'cm'];
const MAX_FILES = 8;

function headers() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }; }
function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fail(statusCode, error) { return { statusCode, headers: headers(), body: JSON.stringify({ ok: false, error }) }; }
function formatSize(d) { return `${d.width} × ${d.height} ${d.unit}`; }
function optionRows(options = {}) { return Object.entries(options).filter(([,v]) => v !== '' && v !== null && v !== undefined).map(([k,v]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${esc(k.replace(/_/g,' '))}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join(''); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return fail(500, 'Database not configured');
    const data = JSON.parse(event.body || '{}');
    const required = ['fullName','email','phone','productType','width','height','unit','quantity','shippingZip','projectDescription'];
    for (const field of required) if (!String(data[field] ?? '').trim()) return fail(400, `${field} is required`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return fail(400, 'Please provide a valid email address');
    if (!VALID_PRODUCTS.includes(data.productType)) return fail(400, 'Invalid product type');
    if (!VALID_UNITS.includes(data.unit)) return fail(400, 'Invalid unit of measurement');
    const width = Number(data.width); const height = Number(data.height); const quantity = Number.parseInt(data.quantity, 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return fail(400, 'Width and height must be positive numbers');
    if (!Number.isInteger(quantity) || quantity <= 0) return fail(400, 'Quantity must be a positive whole number');
    const files = Array.isArray(data.artworkFiles) ? data.artworkFiles.slice(0, MAX_FILES) : [];

    const sql = neon(dbUrl);
    const seq = await sql`SELECT nextval('custom_quote_request_number_seq') AS n`;
    const quoteNumber = `QUOTE-${String(seq[0].n).padStart(6, '0')}`;
    const inserted = await sql`
      INSERT INTO custom_quote_requests (
        quote_number, full_name, company_name, email, phone, product_type, width, height, unit, quantity,
        material_specs, finishing_options, needed_by_date, shipping_zip, project_description, additional_notes,
        product_options, artwork_files
      ) VALUES (
        ${quoteNumber}, ${data.fullName.trim()}, ${data.companyName?.trim() || null}, ${data.email.trim()}, ${data.phone.trim()},
        ${data.productType}, ${width}, ${height}, ${data.unit}, ${quantity}, ${data.materialSpecs || null}, ${data.finishingOptions || null},
        ${data.neededByDate || null}, ${data.shippingZip.trim()}, ${data.projectDescription.trim()}, ${data.additionalNotes || null},
        ${JSON.stringify(data.productOptions || {})}, ${JSON.stringify(files)}
      ) RETURNING id, created_at`;

    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resend = new Resend(apiKey);
        const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
        const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';
        const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
        const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
        const product = PRODUCT_LABELS[data.productType];
        const submitted = new Date(inserted[0].created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
        const summary = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Product</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(product)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Size</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(formatSize(data))}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Quantity</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${quantity}</td></tr>${optionRows(data.productOptions)}</table>`;
        const base = (title, body) => `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;"><div style="max-width:680px;margin:0 auto;padding:24px;"><div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;"><div style="text-align:center;padding:22px;"><img src="${logoUrl}" alt="Banners On The Fly" style="height:54px;"></div><div style="background:#18448D;color:white;padding:24px;text-align:center;"><h1 style="margin:0;font-size:24px;">${title}</h1><p style="margin:8px 0 0;color:#dbeafe;">${quoteNumber}</p></div><div style="padding:26px;">${body}</div></div></div></body></html>`;
        await resend.emails.send({ from: `Banners on the Fly <${emailFrom}>`, to: data.email, subject: `We received your custom quote request – ${quoteNumber}`, reply_to: replyTo, html: base('Custom Quote Request Received', `<p style="font-weight:700;">Hi ${esc(data.fullName)},</p><p>We received your custom quote request. Our team will review the details and respond with pricing.</p>${summary}<p><strong>Project summary:</strong></p><p style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">${esc(data.projectDescription)}</p>`) });
        const fileLinks = files.length ? files.map(f => `<li><a href="${esc(f.secureUrl)}">${esc(f.originalName || f.publicId || f.secureUrl)}</a></li>`).join('') : '<li>No artwork uploaded</li>';
        await resend.emails.send({ from: `Banners on the Fly <${emailFrom}>`, to: adminEmail, subject: `🎉 New Custom Quote Request – ${quoteNumber} – ${data.fullName}`, reply_to: data.email, html: base('New Custom Quote Request', `<h2 style="margin-top:0;">Customer</h2><p><strong>Name:</strong> ${esc(data.fullName)}<br><strong>Company:</strong> ${esc(data.companyName || '—')}<br><strong>Email:</strong> <a href="mailto:${esc(data.email)}">${esc(data.email)}</a><br><strong>Phone:</strong> ${esc(data.phone)}<br><strong>Submitted:</strong> ${esc(submitted)}</p>${summary}<p><strong>Needed by:</strong> ${esc(data.neededByDate || '—')}<br><strong>Shipping ZIP:</strong> ${esc(data.shippingZip)}</p><h3>Material / specs</h3><p style="white-space:pre-wrap;">${esc(data.materialSpecs || '—')}</p><h3>Finishing / options</h3><p style="white-space:pre-wrap;">${esc(data.finishingOptions || '—')}</p><h3>Project description</h3><p style="white-space:pre-wrap;">${esc(data.projectDescription)}</p><h3>Additional notes</h3><p style="white-space:pre-wrap;">${esc(data.additionalNotes || '—')}</p><h3>Artwork</h3><ul>${fileLinks}</ul>`) });
      }
    } catch (emailErr) { console.error('Quote email failed:', emailErr); }

    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, quoteNumber, id: inserted[0].id }) };
  } catch (error) { console.error('custom quote submit failed:', error); return fail(500, 'Failed to submit custom quote request'); }
};
