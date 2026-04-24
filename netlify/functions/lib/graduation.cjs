/**
 * Shared helpers for the Graduation designer-assisted workflow.
 *
 * All proof-workflow Netlify functions share this module so that schema
 * provisioning, intake fetching, server-side pricing recalculation, admin
 * authorization, and email rendering stay consistent.
 *
 * Pricing recomputation here is intentionally simple and mirrors the
 * front-end pricing engines (src/lib/bannerPricingEngine.ts,
 * src/lib/yard-sign-pricing.ts, src/lib/car-magnet-pricing.ts). It is used
 * BOTH to validate the customer-supplied estimated total AND to compute the
 * authoritative final balance the customer is charged after proof approval.
 *
 * NEVER trust customer-posted price totals — always re-derive on the server
 * from product_specs and use the derived amount for the PayPal capture.
 */

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// --- DB connection helper ---------------------------------------------------
function getSql() {
  const dbUrl =
    process.env.NETLIFY_DATABASE_URL ||
    process.env.VITE_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database URL not configured');
  }
  return neon(dbUrl);
}

// --- Schema (idempotent) ----------------------------------------------------
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS designer_intake_orders (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_name               VARCHAR(160) NOT NULL,
      customer_email              VARCHAR(255) NOT NULL,
      customer_phone              VARCHAR(40),
      order_type                  VARCHAR(40)  NOT NULL DEFAULT 'designer_assisted',
      source                      VARCHAR(60)  NOT NULL DEFAULT 'graduation_landing_page',
      product_type                VARCHAR(40)  NOT NULL,
      product_specs               JSONB        NOT NULL DEFAULT '{}'::jsonb,
      graduate_info               JSONB        NOT NULL DEFAULT '{}'::jsonb,
      design_notes                JSONB        NOT NULL DEFAULT '{}'::jsonb,
      inspiration_files           JSONB        NOT NULL DEFAULT '[]'::jsonb,
      design_fee_amount_cents     INTEGER      NOT NULL DEFAULT 1900,
      design_fee_paid             BOOLEAN      NOT NULL DEFAULT FALSE,
      final_product_amount_cents  INTEGER,
      final_payment_paid          BOOLEAN      NOT NULL DEFAULT FALSE,
      status                      VARCHAR(40)  NOT NULL DEFAULT 'pending_payment',
      paypal_order_id             TEXT,
      approval_token              VARCHAR(64),
      approved_proof_url          TEXT,
      created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_product_subtotal_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_tax_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS estimated_product_total_cents INTEGER`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS design_fee_paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS final_payment_paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS final_product_paypal_order_id TEXT`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS latest_proof_version INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE designer_intake_orders ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ`;

  await sql`
    CREATE TABLE IF NOT EXISTS proof_versions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      intake_id       UUID NOT NULL REFERENCES designer_intake_orders(id) ON DELETE CASCADE,
      version_number  INTEGER NOT NULL,
      proof_file_url  TEXT NOT NULL,
      proof_file_key  TEXT,
      proof_file_name TEXT,
      admin_message   TEXT,
      admin_email     VARCHAR(255),
      status          VARCHAR(40) NOT NULL DEFAULT 'sent',
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (intake_id, version_number)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_proof_versions_intake ON proof_versions (intake_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS revision_requests (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      intake_id         UUID NOT NULL REFERENCES designer_intake_orders(id) ON DELETE CASCADE,
      proof_version_id  UUID REFERENCES proof_versions(id) ON DELETE SET NULL,
      notes             TEXT NOT NULL,
      attachment_url    TEXT,
      attachment_name   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_requests_intake ON revision_requests (intake_id)`;
}

// --- Admin auth -------------------------------------------------------------
//
// The canonical admin auth used everywhere else in the app (sign-in.cjs,
// /admin/orders, etc.) is the `is_admin` column on the `profiles` table.
// Historically, the graduation endpoints only consulted the
// ADMIN_TEST_PAY_ALLOWLIST env var, which broke real logged-in admins whose
// email wasn't in that list and produced "Admin access required" on
// /admin/graduation-intakes. We now check the database first and fall back
// to the env allowlist only as a legacy safety net.

function isAdminEmail(email) {
  // Env-allowlist check, kept as a synchronous fallback for back-compat.
  if (!email || typeof email !== 'string') return false;
  const allow = process.env.ADMIN_TEST_PAY_ALLOWLIST;
  if (!allow) return false;
  const set = allow
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return set.includes(email.toLowerCase());
}

/**
 * Returns true if the email belongs to an admin user. Checks the
 * `profiles.is_admin` flag in the database (the same source of truth used by
 * sign-in.cjs and /admin/orders), and falls back to the
 * ADMIN_TEST_PAY_ALLOWLIST env var if the DB check is inconclusive.
 *
 * Logs the decision so failed admin lookups are debuggable in Netlify
 * function logs without leaking sensitive info.
 */
async function isAdminUser(sql, email) {
  if (!email || typeof email !== 'string') {
    console.warn('[graduation-admin-auth] denied: missing email');
    return false;
  }
  const normalized = email.toLowerCase().trim();
  try {
    const rows = await sql`
      SELECT is_admin
      FROM profiles
      WHERE LOWER(email) = ${normalized}
      LIMIT 1
    `;
    if (rows.length > 0 && rows[0].is_admin === true) {
      console.log(`[graduation-admin-auth] allowed via profiles.is_admin: ${normalized}`);
      return true;
    }
    if (rows.length === 0) {
      console.warn(`[graduation-admin-auth] no profile row for ${normalized}`);
    } else {
      console.warn(`[graduation-admin-auth] profile.is_admin is not true for ${normalized}`);
    }
  } catch (err) {
    // DB lookup errors should not silently grant access — log and continue
    // to the env-allowlist fallback.
    console.error('[graduation-admin-auth] profiles lookup failed:', err && err.message);
  }
  // Legacy env-allowlist fallback (kept so existing infra still works).
  if (isAdminEmail(normalized)) {
    console.log(`[graduation-admin-auth] allowed via ADMIN_TEST_PAY_ALLOWLIST fallback: ${normalized}`);
    return true;
  }
  console.warn(`[graduation-admin-auth] denied: ${normalized} is not an admin`);
  return false;
}

// --- HTML escape ------------------------------------------------------------
function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoneyCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  return '$' + (n / 100).toFixed(2);
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_e) {
    return fallback;
  }
}

// --- Intake fetcher ---------------------------------------------------------
async function getIntakeById(sql, intakeId) {
  const rows = await sql`
    SELECT * FROM designer_intake_orders WHERE id = ${intakeId}::uuid LIMIT 1
  `;
  return rows[0] || null;
}

async function getIntakeByApprovalToken(sql, token) {
  if (!token || typeof token !== 'string') return null;
  const rows = await sql`
    SELECT * FROM designer_intake_orders WHERE approval_token = ${token} LIMIT 1
  `;
  return rows[0] || null;
}

async function getProofsForIntake(sql, intakeId) {
  return await sql`
    SELECT * FROM proof_versions
     WHERE intake_id = ${intakeId}::uuid
     ORDER BY version_number ASC
  `;
}

async function getRevisionsForIntake(sql, intakeId) {
  return await sql`
    SELECT * FROM revision_requests
     WHERE intake_id = ${intakeId}::uuid
     ORDER BY created_at ASC
  `;
}

// --- Server-side estimated pricing -----------------------------------------
// Mirrors the front-end pricing engines so the customer-supplied estimated
// total can be validated AND so the final balance after proof approval can
// be authoritatively recomputed from product_specs.
//
// IMPORTANT: keep these constants in sync with src/lib/products config.
// We only need totals here, not detailed breakdowns.
const TAX_RATE = 0.06;
const MIN_UNIT_PRICE_CENTS = 2000;

const BANNER_MATERIAL_PRICE_CENTS_PER_SQFT = {
  '13oz': 450,
  '13oz Vinyl': 450,
  '15oz': 600,
  '15oz Vinyl': 600,
  '18oz': 800,
  '18oz Vinyl': 800,
  Mesh: 600,
  'Mesh Fence': 600,
};

const ROPE_PRICE_PER_FOOT_CENTS = 200;
const POLE_POCKET_SETUP_FEE_CENTS = 1500;
const POLE_POCKET_PRICE_PER_FOOT_CENTS = 200;

function quantityDiscountRate(quantity) {
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
  if (q >= 5) return 0.13;
  if (q === 4) return 0.10;
  if (q === 3) return 0.07;
  if (q === 2) return 0.05;
  return 0;
}

// Parses size strings like "3' × 6'", '24" × 18"', "12\" x 24\"" → { w, h } in inches.
function parseSizeToInches(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return null;
  const cleaned = sizeStr.replace(/[\u201C\u201D\u2033\u2032\u2018\u2019]/g, '"').replace(/×/g, 'x');
  // Try foot pattern first: 3' x 6'
  let m = cleaned.match(/(\d+(?:\.\d+)?)\s*'\s*x\s*(\d+(?:\.\d+)?)\s*'/i);
  if (m) return { w: Number(m[1]) * 12, h: Number(m[2]) * 12 };
  // Try inch pattern: 24" x 18"
  m = cleaned.match(/(\d+(?:\.\d+)?)\s*"\s*x\s*(\d+(?:\.\d+)?)\s*"/i);
  if (m) return { w: Number(m[1]), h: Number(m[2]) };
  // Bare number x number — assume inches
  m = cleaned.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (m) return { w: Number(m[1]), h: Number(m[2]) };
  return null;
}

function calcBannerEstimate(specs) {
  const size = parseSizeToInches(specs.size);
  if (!size) return null;
  const widthIn = size.w;
  const heightIn = size.h;
  const quantity = Math.max(1, Math.floor(Number(specs.quantity) || 1));
  const materialKey = specs.material || '13oz Vinyl';
  const pricePerSqft = BANNER_MATERIAL_PRICE_CENTS_PER_SQFT[materialKey] ||
    BANNER_MATERIAL_PRICE_CENTS_PER_SQFT['13oz Vinyl'];
  const areaSqft = (widthIn * heightIn) / 144;
  let unitBase = Math.round(areaSqft * pricePerSqft);
  if (unitBase < MIN_UNIT_PRICE_CENTS) unitBase = MIN_UNIT_PRICE_CENTS;
  const baseBanner = unitBase * quantity;

  // Rope: width linear feet × $2/ft × quantity
  const ropeOpt = String(specs.rope || 'none');
  let ropeFeet = 0;
  if (ropeOpt === 'top' || ropeOpt === 'bottom') ropeFeet = (widthIn / 12) * quantity;
  else if (ropeOpt === 'top-and-bottom' || ropeOpt === 'top-bottom')
    ropeFeet = (widthIn / 12) * 2 * quantity;
  const ropeCost = Math.round(ropeFeet * ROPE_PRICE_PER_FOOT_CENTS);

  // Pole pockets
  const ppOpt = String(specs.polePockets || specs.pole_pockets || 'none');
  let ppFeet = 0;
  if (ppOpt === 'top' || ppOpt === 'bottom') ppFeet = widthIn / 12;
  else if (ppOpt === 'top-and-bottom' || ppOpt === 'top-bottom') ppFeet = (widthIn / 12) * 2;
  const ppSetup = ppOpt !== 'none' ? POLE_POCKET_SETUP_FEE_CENTS : 0;
  const ppCost = Math.round(ppFeet * POLE_POCKET_PRICE_PER_FOOT_CENTS) * quantity + ppSetup;

  const subtotalBeforeDiscount = baseBanner + ropeCost + ppCost;
  const rate = quantityDiscountRate(quantity);
  const discount = Math.round(subtotalBeforeDiscount * rate);
  const subtotal = subtotalBeforeDiscount - discount;
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  return { subtotalCents: subtotal, taxCents: tax, totalCents: total };
}

function calcYardSignEstimate(specs) {
  const sidedness = specs.sidedness === 'double' ? 'double' : 'single';
  const unit = sidedness === 'double' ? 1400 : 1200;
  const qty = Math.max(1, Math.floor(Number(specs.quantity) || 1));
  const stakes = String(specs.addStakes || '').toLowerCase() === 'yes' ? qty * 150 : 0;
  const subtotal = unit * qty + stakes;
  const tax = Math.round(subtotal * TAX_RATE);
  return { subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
}

const CAR_MAGNET_PRICE_CENTS = {
  '18" x 12"': 2900,
  '24" x 12"': 4000,
  '24" x 18"': 4700,
  '42" x 12"': 6000,
  '72" x 24"': 16000,
  // Legacy / form-displayed sizes (best-effort fallbacks)
  '12" x 18"': 2900,
  '12" x 24"': 4000,
  '6" x 24"': 2900,
  '8" x 16"': 2900,
};

function calcCarMagnetEstimate(specs) {
  const sizeNorm = String(specs.size || '')
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/×/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
  const unit = CAR_MAGNET_PRICE_CENTS[sizeNorm] || 2900;
  const qty = Math.max(1, Math.floor(Number(specs.quantity) || 1));
  const subtotal = unit * qty;
  const tax = Math.round(subtotal * TAX_RATE);
  return { subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
}

function calculateEstimateForIntake(productType, productSpecs) {
  const specs = productSpecs && typeof productSpecs === 'object' ? productSpecs : {};
  if (productType === 'banner') return calcBannerEstimate(specs);
  if (productType === 'yard_sign') return calcYardSignEstimate(specs);
  if (productType === 'car_magnet') return calcCarMagnetEstimate(specs);
  return null;
}

// --- Intake → email "all sections" HTML ------------------------------------
function renderProductSpecsHtml(productType, specs) {
  const s = specs || {};
  const rows = [];
  if (productType === 'banner') {
    rows.push(['Size', s.size]);
    rows.push(['Material', s.material]);
    rows.push(['Quantity', s.quantity]);
    rows.push(['Sidedness', s.sidedness]);
    rows.push(['Grommets', s.grommets]);
    rows.push(['Pole Pockets', s.polePockets]);
    rows.push(['Rope', s.rope]);
  } else if (productType === 'yard_sign') {
    rows.push(['Size', s.sizeType]);
    rows.push(['Quantity', s.quantity]);
    rows.push(['Sidedness', s.sidedness]);
    rows.push(['Step Stakes', s.addStakes]);
  } else if (productType === 'car_magnet') {
    rows.push(['Size', s.size]);
    rows.push(['Quantity', s.quantity]);
    rows.push(['Rounded Corners', s.roundedCorners]);
  } else {
    Object.entries(s).forEach(([k, v]) => rows.push([k, v]));
  }
  return rows
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${esc(k)}</td><td style="padding:4px 0;color:#111827;"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
}

function renderGraduateHtml(g) {
  const rows = [
    ['Graduate Name', g?.graduateName],
    ['School', g?.schoolName],
    ['Graduation Year', g?.graduationYear],
    ['School Colors', g?.schoolColors],
    ['Graduation Date', g?.graduationDate],
    ['Party / Open House Date', g?.partyDate],
  ];
  return rows
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${esc(k)}</td><td style="padding:4px 0;color:#111827;"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
}

function renderDesignDirectionHtml(d) {
  const rows = [
    ['Preferred Style', d?.preferredStyle],
    ['Colors / Style Preference', d?.colorsStyle],
    ['Headline / Main Text', d?.mainText],
    ['Secondary Text', d?.secondaryText],
    ['Contact Info to Include', d?.contactInfo],
    ['Notes for Designer', d?.notes],
  ];
  return rows
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;color:#111827;white-space:pre-wrap;"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
}

function renderFilesHtml(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return '<p style="color:#6b7280;font-style:italic;">No files uploaded.</p>';
  }
  return (
    '<ul style="padding-left:18px;margin:8px 0;">' +
    files
      .map((f) => {
        if (!f || !f.url) return '';
        const label = f.category === 'graduate_photo'
          ? 'Graduate Photo'
          : f.category === 'school_logo'
            ? 'School Logo'
            : 'Inspiration';
        const name = f.name ? ` &mdash; ${esc(f.name)}` : '';
        return `<li style="margin:4px 0;"><strong>${esc(label)}</strong>${name} &nbsp; <a href="${esc(f.url)}" style="color:#FF6A00;" target="_blank" rel="noopener">[Download]</a></li>`;
      })
      .filter(Boolean)
      .join('') +
    '</ul>'
  );
}

const LOGO_URL = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

function emailLayout({ title, subtitle, bodyHtml }) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;margin:0 auto;padding:20px;background:#f4f4f4;">' +
    '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">' +
    `<div style="text-align:center;padding:20px;background:#ffffff;"><img src="${LOGO_URL}" alt="Banners On The Fly" style="height:50px;"></div>` +
    `<div style="background:#0B1F3A;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">${esc(title)}</h1>` +
    (subtitle ? `<p style="margin:8px 0 0;color:#d1d5db;">${esc(subtitle)}</p>` : '') +
    '</div>' +
    '<div style="padding:24px;">' + bodyHtml + '</div>' +
    '</div></body></html>'
  );
}

function sectionTitle(text) {
  return `<h3 style="margin:24px 0 8px;color:#0B1F3A;font-size:16px;border-bottom:2px solid #FF6A00;padding-bottom:4px;">${esc(text)}</h3>`;
}

function table(rowsHtml) {
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml}</table>`;
}

// Build the "all sections" body shared by admin and customer emails.
function renderIntakeSummaryBody(intake, opts = {}) {
  const productSpecs = safeJson(intake.product_specs, {});
  const graduateInfo = safeJson(intake.graduate_info, {});
  const designNotes = safeJson(intake.design_notes, {});
  const files = safeJson(intake.inspiration_files, []);
  const productLabels = { banner: 'Banner', yard_sign: 'Yard Sign', car_magnet: 'Car Magnet' };

  let html = '';
  if (opts.intro) html += `<p style="margin:0 0 12px;">${opts.intro}</p>`;

  // Customer
  html += sectionTitle('Customer');
  html += table([
    ['Name', intake.customer_name],
    ['Email', intake.customer_email],
    ['Phone', intake.customer_phone],
  ].filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${esc(k)}</td><td style="padding:4px 0;color:#111827;"><strong>${esc(v)}</strong></td></tr>`)
    .join(''));

  // Product specs
  html += sectionTitle(`Product (${productLabels[intake.product_type] || intake.product_type})`);
  html += table(renderProductSpecsHtml(intake.product_type, productSpecs));

  // Graduate
  html += sectionTitle('Graduate Info');
  html += table(renderGraduateHtml(graduateInfo));

  // Design direction
  html += sectionTitle('Design Direction');
  const dd = renderDesignDirectionHtml(designNotes);
  html += dd ? table(dd) : '<p style="color:#6b7280;font-style:italic;">No design direction provided.</p>';

  // Uploaded files
  html += sectionTitle('Uploaded Files');
  html += renderFilesHtml(files);

  // Payment summary
  html += sectionTitle('Payment Summary');
  const designFeeStr = fmtMoneyCents(intake.design_fee_amount_cents || 1900);
  const estTotal = intake.estimated_product_total_cents;
  const estSubtotal = intake.estimated_product_subtotal_cents;
  const estTax = intake.estimated_tax_cents;
  const finalAmt = intake.final_product_amount_cents;
  html += '<table style="border-collapse:collapse;width:100%;font-size:14px;">';
  html += `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Design Fee Paid</td><td style="padding:4px 0;color:#111827;"><strong>${designFeeStr}</strong></td></tr>`;
  if (estSubtotal != null) html += `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Estimated Product Subtotal</td><td style="padding:4px 0;color:#111827;">${fmtMoneyCents(estSubtotal)}</td></tr>`;
  if (estTax != null) html += `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Estimated Tax</td><td style="padding:4px 0;color:#111827;">${fmtMoneyCents(estTax)}</td></tr>`;
  if (estTotal != null) html += `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Estimated Product Total</td><td style="padding:4px 0;color:#111827;"><strong>${fmtMoneyCents(estTotal)}</strong></td></tr>`;
  if (finalAmt != null) html += `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Final Product Total</td><td style="padding:4px 0;color:#111827;"><strong>${fmtMoneyCents(finalAmt)}</strong></td></tr>`;
  html += '</table>';

  // IDs
  html += sectionTitle('Reference');
  html += table([
    ['Intake ID', intake.id],
    ['Status', intake.status],
  ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${esc(k)}</td><td style="padding:4px 0;color:#111827;font-family:monospace;font-size:13px;">${esc(v)}</td></tr>`).join(''));

  if (opts.footer) html += opts.footer;
  return html;
}

// --- Email senders ----------------------------------------------------------
function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  // eslint-disable-next-line global-require
  const { Resend } = require('resend');
  return new Resend(apiKey);
}

function emailEnv() {
  return {
    from: process.env.EMAIL_FROM || 'info@bannersonthefly.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com',
    admin: process.env.ADMIN_EMAIL || 'info@bannersonthefly.com',
    siteUrl: process.env.SITE_URL || process.env.URL || 'https://bannersonthefly.com',
  };
}

async function sendDesignDepositEmails(intake, orderId) {
  const resend = getResend();
  if (!resend) {
    console.warn('[graduation] RESEND_API_KEY missing — skipping deposit emails');
    return;
  }
  const env = emailEnv();
  const customerBody = renderIntakeSummaryBody(intake, {
    intro:
      `<p style="font-weight:600;color:#0B1F3A;">Hi ${esc(intake.customer_name || 'there')},</p>` +
      '<p>Thanks — your $19 design fee has been received. Our designers will create your custom graduation proof and email it to you for approval.</p>' +
      (intake.estimated_product_total_cents != null
        ? `<p style="background:#f4f8ff;border-left:4px solid #FF6A00;padding:10px 14px;border-radius:4px;">You paid the <strong>$19 design fee</strong> today. Your estimated product total is <strong>${fmtMoneyCents(intake.estimated_product_total_cents)}</strong> before final proof approval. Once your proof is approved, you’ll receive a secure link to pay the remaining product balance.</p>`
        : '<p style="background:#f4f8ff;border-left:4px solid #FF6A00;padding:10px 14px;border-radius:4px;">You paid the <strong>$19 design fee</strong> today. Once your proof is approved, you’ll receive a secure link to pay the remaining product balance.</p>') +
      '<p style="color:#6b7280;font-size:13px;">Final total may update if product options are changed before approval. Production begins after proof approval and final product payment.</p>',
    footer:
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"><p style="font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:' + esc(env.replyTo) + '" style="color:#FF6A00;">' + esc(env.replyTo) + '</a></p>',
  });

  const customerHtml = emailLayout({
    title: 'We Received Your Graduation Design Request 🎓',
    subtitle: '$19 design fee received',
    bodyHtml: customerBody,
  });

  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: intake.customer_email,
    subject: 'We Received Your Graduation Design Request',
    html: customerHtml,
    reply_to: env.replyTo,
    tags: [{ name: 'source', value: 'graduation_design_deposit_paid' }],
  });

  // Admin email
  const adminBody = renderIntakeSummaryBody(intake, {
    intro:
      `<p>$19 design fee received — design work can begin.</p>` +
      (orderId
        ? `<p style="font-size:13px;color:#6b7280;"><strong>Order ID:</strong> <span style="font-family:monospace;">${esc(orderId)}</span></p>`
        : ''),
    footer:
      `<div style="text-align:center;margin:24px 0;"><a href="${esc(env.siteUrl)}/admin/graduation/${esc(intake.id)}" style="background:#FF6A00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open in Admin</a></div>`,
  });

  const adminHtml = emailLayout({
    title: 'New Paid Graduation Design Request',
    subtitle: 'Designer-Assisted • Graduation',
    bodyHtml: adminBody,
  });

  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: env.admin,
    subject:
      'New Paid Graduation Design Request — ' +
      (safeJson(intake.graduate_info, {}).graduateName || intake.customer_name || 'customer'),
    html: adminHtml,
    reply_to: intake.customer_email,
    tags: [{ name: 'source', value: 'graduation_design_deposit_admin' }],
  });
}

async function sendProofToCustomer(intake, proof) {
  const resend = getResend();
  if (!resend) return;
  const env = emailEnv();
  const proofUrl = `${env.siteUrl}/proof/${intake.approval_token}`;
  const productLabels = { banner: 'Banner', yard_sign: 'Yard Sign', car_magnet: 'Car Magnet' };
  const specs = safeJson(intake.product_specs, {});
  const sizeText = specs.size || specs.sizeType || '';

  const body =
    `<p style="font-weight:600;color:#0B1F3A;">Hi ${esc(intake.customer_name || 'there')},</p>` +
    `<p>Your graduation design proof <strong>(Version ${esc(proof.version_number)})</strong> is ready for review.</p>` +
    `<p><strong>Product:</strong> ${esc(productLabels[intake.product_type] || intake.product_type)}${sizeText ? ' &middot; ' + esc(sizeText) : ''}</p>` +
    (proof.admin_message
      ? `<p style="background:#fff7ed;border-left:4px solid #FF6A00;padding:10px 14px;border-radius:4px;"><strong>From the designer:</strong><br>${esc(proof.admin_message)}</p>`
      : '') +
    `<div style="text-align:center;margin:24px 0;"><a href="${esc(proofUrl)}" style="background:#FF6A00;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px;">Review Proof</a></div>` +
    `<p style="text-align:center;"><a href="${esc(proof.proof_file_url)}" style="color:#FF6A00;" target="_blank" rel="noopener">View / download proof file</a></p>` +
    `<p style="color:#6b7280;font-size:13px;">Please review your proof. You can approve it and pay your remaining product balance, or request edits.</p>`;

  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: intake.customer_email,
    subject: 'Your Graduation Design Proof Is Ready',
    html: emailLayout({
      title: 'Your Graduation Design Proof Is Ready 🎓',
      subtitle: `Version ${proof.version_number}`,
      bodyHtml: body,
    }),
    reply_to: env.replyTo,
    tags: [{ name: 'source', value: 'graduation_proof_sent' }],
  });
}

async function sendRevisionRequestedToAdmin(intake, revision, proof) {
  const resend = getResend();
  if (!resend) return;
  const env = emailEnv();
  const body =
    `<p>The customer requested edits on <strong>Version ${esc(proof?.version_number || '—')}</strong> of their graduation design.</p>` +
    sectionTitle('Customer') +
    `<p><strong>${esc(intake.customer_name)}</strong> &lt;${esc(intake.customer_email)}&gt;</p>` +
    sectionTitle('Revision Notes') +
    `<div style="background:#fff7ed;border-left:4px solid #FF6A00;padding:12px 14px;border-radius:4px;white-space:pre-wrap;">${esc(revision.notes)}</div>` +
    (revision.attachment_url
      ? `<p style="margin-top:12px;"><strong>Attachment:</strong> <a href="${esc(revision.attachment_url)}" style="color:#FF6A00;" target="_blank" rel="noopener">${esc(revision.attachment_name || 'Download')}</a></p>`
      : '') +
    sectionTitle('Reference') +
    `<p style="font-family:monospace;font-size:13px;color:#374151;">Intake ID: ${esc(intake.id)}<br>Proof Version: ${esc(proof?.version_number || '—')}</p>` +
    `<div style="text-align:center;margin:24px 0;"><a href="${esc(env.siteUrl)}/admin/graduation/${esc(intake.id)}" style="background:#FF6A00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open in Admin</a></div>`;
  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: env.admin,
    subject: 'Graduation Proof Edit Requested',
    html: emailLayout({ title: 'Graduation Proof Edit Requested', subtitle: 'Designer-Assisted • Graduation', bodyHtml: body }),
    reply_to: intake.customer_email,
    tags: [{ name: 'source', value: 'graduation_revision_requested' }],
  });
}

async function sendApprovedAndPaidEmails(intake, proof, finalAmountCents) {
  const resend = getResend();
  if (!resend) return;
  const env = emailEnv();

  // Admin
  const adminBody =
    `<p>The customer approved their graduation design and paid the final balance. Order is ready for production.</p>` +
    sectionTitle('Customer') +
    `<p><strong>${esc(intake.customer_name)}</strong> &lt;${esc(intake.customer_email)}&gt;</p>` +
    sectionTitle('Approved Proof') +
    `<p>Version ${esc(proof?.version_number || '—')} &mdash; <a href="${esc(proof?.proof_file_url || intake.approved_proof_url || '')}" style="color:#FF6A00;" target="_blank" rel="noopener">View proof</a></p>` +
    sectionTitle('Payment') +
    `<p>Final amount paid: <strong>${esc(fmtMoneyCents(finalAmountCents))}</strong></p>` +
    `<p style="font-family:monospace;font-size:13px;color:#374151;">Intake ID: ${esc(intake.id)}</p>` +
    `<div style="text-align:center;margin:24px 0;"><a href="${esc(env.siteUrl)}/admin/graduation/${esc(intake.id)}" style="background:#FF6A00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open in Admin</a></div>`;
  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: env.admin,
    subject: 'Graduation Proof Approved and Paid',
    html: emailLayout({ title: 'Graduation Proof Approved and Paid', subtitle: 'Production-ready', bodyHtml: adminBody }),
    reply_to: intake.customer_email,
    tags: [{ name: 'source', value: 'graduation_proof_approved_paid_admin' }],
  });

  // Customer receipt
  const customerBody =
    `<p style="font-weight:600;color:#0B1F3A;">Hi ${esc(intake.customer_name || 'there')},</p>` +
    `<p>Thank you! Your graduation design has been approved and your payment of <strong>${esc(fmtMoneyCents(finalAmountCents))}</strong> is confirmed.</p>` +
    `<p>We'll start production now and ship via FREE next-day air. You'll receive tracking once it ships.</p>` +
    sectionTitle('Approved Design') +
    (proof?.proof_file_url
      ? `<p><a href="${esc(proof.proof_file_url)}" style="color:#FF6A00;" target="_blank" rel="noopener">View approved proof</a></p>`
      : '') +
    `<p style="color:#6b7280;font-size:13px;">Reference: ${esc(intake.id)}</p>`;
  await resend.emails.send({
    from: 'Banners on the Fly <' + env.from + '>',
    to: intake.customer_email,
    subject: 'Graduation Design Approved — Payment Confirmed',
    html: emailLayout({ title: 'Approved & Paid 🎓', subtitle: 'Production starting', bodyHtml: customerBody }),
    reply_to: env.replyTo,
    tags: [{ name: 'source', value: 'graduation_proof_approved_paid_customer' }],
  });
}

module.exports = {
  getSql,
  ensureSchema,
  isAdminEmail,
  isAdminUser,
  esc,
  fmtMoneyCents,
  safeJson,
  getIntakeById,
  getIntakeByApprovalToken,
  getProofsForIntake,
  getRevisionsForIntake,
  calculateEstimateForIntake,
  emailLayout,
  renderIntakeSummaryBody,
  sendDesignDepositEmails,
  sendProofToCustomer,
  sendRevisionRequestedToAdmin,
  sendApprovedAndPaidEmails,
  emailEnv,
  randomToken: (bytes = 24) => crypto.randomBytes(bytes).toString('hex'),
};
