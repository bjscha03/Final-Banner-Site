'use strict';

const crypto = require('node:crypto');
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { requireAdmin } = require('./server-auth.cjs');

const CAMPAIGN_KEY = 'bof-past-customer-reactivation-2026-08';
const DEFAULT_SITE_URL = 'https://bannersonthefly.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function envValue(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name);
  } catch {
    return undefined;
  }
}

function jsonResponse(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function getDbUrl() {
  return envValue('NETLIFY_DATABASE_URL') || envValue('VITE_DATABASE_URL') || envValue('DATABASE_URL') || envValue('NEON_DATABASE_URL');
}

function getSiteUrl() {
  const raw = String(envValue('PUBLIC_SITE_URL') || DEFAULT_SITE_URL).trim();
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.origin : DEFAULT_SITE_URL;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function isValidOrderId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeProviderError(error) {
  const raw = typeof error === 'string' ? error : error?.message || error?.name || 'Email provider rejected the request';
  return String(raw)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:re_|sk_)[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .slice(0, 1000);
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function validToken(token) {
  return TOKEN_RE.test(String(token || ''));
}

function buildUnsubscribeUrl(token) {
  if (!validToken(token)) throw new Error('A valid unsubscribe token is required.');
  return `${getSiteUrl()}/.netlify/functions/past-customer-marketing-unsubscribe?token=${encodeURIComponent(token)}`;
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS past_customer_marketing_sends (
      id BIGSERIAL PRIMARY KEY,
      campaign_key TEXT NOT NULL,
      order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
      recipient_email TEXT NOT NULL,
      normalized_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      resend_message_id TEXT,
      admin_identifier TEXT,
      failure_reason TEXT,
      unsubscribe_token_hash TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (campaign_key, normalized_email)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS past_customer_marketing_sends_status_idx
      ON past_customer_marketing_sends (campaign_key, status, sent_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS past_customer_marketing_unsubscribes (
      normalized_email TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'footer_link',
      campaign_key TEXT,
      unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function queryOptional(sql, query, params = []) {
  try {
    return await sql(query, params);
  } catch (error) {
    if (['42P01', '42703'].includes(String(error?.code || ''))) return [];
    throw error;
  }
}

async function getSuppressionSource(sql, normalizedEmail) {
  const own = await sql`
    SELECT normalized_email
      FROM past_customer_marketing_unsubscribes
     WHERE normalized_email = ${normalizedEmail}
     LIMIT 1
  `;
  if (own[0]) return 'past_customer_marketing';

  const tradeShow = await queryOptional(
    sql,
    'SELECT normalized_email FROM trade_show_email_unsubscribes WHERE normalized_email = $1 LIMIT 1',
    [normalizedEmail],
  );
  if (tradeShow[0]) return 'trade_show_marketing';

  const outbound = await queryOptional(
    sql,
    "SELECT normalized_value FROM outbound_suppressions WHERE scope='email' AND normalized_value=$1 AND active=TRUE LIMIT 1",
    [normalizedEmail],
  );
  if (outbound[0]) return 'outbound_suppression';

  return null;
}

async function loadOrder(sql, orderId) {
  const rows = await sql`
    SELECT o.*, p.email AS profile_email, p.full_name AS profile_full_name
      FROM orders o
      LEFT JOIN profiles p ON o.user_id = p.id
     WHERE o.id = ${orderId}
     LIMIT 1
  `;
  return rows[0] || null;
}

function resolveOrderEmail(order) {
  return normalizeEmail(order?.email) || normalizeEmail(order?.profile_email);
}

function resolveFirstName(order) {
  const raw = order?.customer_first_name || order?.customer_name || order?.shipping_name || order?.profile_full_name || '';
  const first = String(raw).trim().split(/\s+/)[0] || '';
  return first.replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 60);
}

function isTestOrder(order) {
  return order?.is_test_order === true || String(order?.is_test_order || '').toLowerCase() === 'true';
}

function buildMarketingEmail({ order, customerEmail, from, replyTo, unsubscribeUrl }) {
  const siteUrl = getSiteUrl();
  const designUrl = `${siteUrl}/design?product=banner&source=past-customer-email`;
  const logoUrl = `${siteUrl}/images/header-logo.png`;
  const firstName = resolveFirstName(order);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const safeGreeting = escapeHtml(greeting);
  const safeDesignUrl = escapeHtml(designUrl);
  const safeSiteUrl = escapeHtml(siteUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
  const postalAddress = String(envValue('MARKETING_POSTAL_ADDRESS') || envValue('OUTBOUND_PHYSICAL_ADDRESS') || '').trim();
  const postalHtml = postalAddress
    ? `<div style="margin-top:7px;">${escapeHtml(postalAddress)}</div>`
    : '';
  const postalText = postalAddress ? `\n${postalAddress}` : '';
  const subject = 'Ready for your next project?';
  const preheader = '24-hour production, fast shipping, and the same Banners On The Fly service you already know.';

  const text = [
    greeting,
    '',
    "It's been a while since we've heard from you, and we just wanted to say thank you for trusting Banners On The Fly in the past.",
    '',
    "Whether you need another banner, signs, or magnets — we're still here, still fast, and ready for your next project.",
    '',
    '24 HOUR PRODUCTION',
    'FREE NEXT-DAY AIR SHIPPING',
    'PREMIUM QUALITY MATERIALS',
    '',
    'Perfect for your next project:',
    '• Vinyl Banners — Bold. Durable. Weatherproof. Built to get noticed.',
    '• Yard Signs — Big impact in any size. Perfect for your next event.',
    '• Car Magnets — Advertise on the go. Easy to apply and remove.',
    '',
    `Start your project: ${designUrl}`,
    '',
    "Your support means a lot to us. If there's anything we can do to help with your next project, just hit reply — we're here to help.",
    '',
    'Banners On The Fly',
    siteUrl + postalText,
    `Unsubscribe from promotional emails: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;color:#132238;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f6;padding:22px 10px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,34,59,.12);">
        <tr>
          <td style="background:#0f223b;padding:22px 28px;border-bottom:4px solid #ff6a00;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="middle"><img src="${safeLogoUrl}" width="235" alt="Banners On The Fly" style="display:block;width:235px;max-width:100%;height:auto;border:0;"></td>
              <td align="right" valign="middle" style="font-size:11px;line-height:1.45;color:#ffffff;font-weight:700;">24 HOUR PRODUCTION<br><span style="color:#ff8a3d;">FREE NEXT-DAY AIR SHIPPING</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:38px 34px 34px;background:#ffffff;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#42536a;">${safeGreeting}</p>
            <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#ff6a00;text-transform:uppercase;margin-bottom:10px;">Thanks for being a past customer</div>
            <h1 style="margin:0 0 18px;font-size:42px;line-height:1.03;letter-spacing:-.02em;color:#0f223b;">WE'VE GOT YOUR NEXT PROJECT <span style="color:#ff6a00;">COVERED.</span></h1>
            <p style="margin:0 0 14px;font-size:17px;line-height:1.65;color:#42536a;">It's been a while since we've heard from you, and we just wanted to say thank you for trusting Banners On The Fly in the past.</p>
            <p style="margin:0 0 26px;font-size:17px;line-height:1.65;color:#25364d;"><strong>Whether you need another banner, signs, or magnets — we're still here, still fast, and ready for your next project.</strong></p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#ff6a00" style="border-radius:9px;"><a href="${safeDesignUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;letter-spacing:.02em;">GET STARTED TODAY &nbsp;→</a></td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f9fc;border:1px solid #dce4ee;border-radius:12px;">
              <tr>
                <td width="33.33%" align="center" valign="top" style="padding:18px 9px;border-right:1px solid #dce4ee;"><div style="font-size:22px;color:#ff6a00;font-weight:900;">24</div><div style="margin-top:5px;font-size:11px;line-height:1.35;color:#0f223b;font-weight:800;">24 HOUR<br>PRODUCTION</div></td>
                <td width="33.33%" align="center" valign="top" style="padding:18px 9px;border-right:1px solid #dce4ee;"><div style="font-size:22px;color:#ff6a00;font-weight:900;">AIR</div><div style="margin-top:5px;font-size:11px;line-height:1.35;color:#0f223b;font-weight:800;">FREE NEXT-DAY<br>AIR SHIPPING</div></td>
                <td width="33.33%" align="center" valign="top" style="padding:18px 9px;"><div style="font-size:22px;color:#ff6a00;font-weight:900;">✓</div><div style="margin-top:5px;font-size:11px;line-height:1.35;color:#0f223b;font-weight:800;">PREMIUM QUALITY<br>MATERIALS</div></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:2px 28px 32px;">
            <h2 style="margin:0 0 20px;text-align:center;font-size:24px;color:#0f223b;">PERFECT FOR YOUR NEXT PROJECT</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="33.33%" valign="top" style="padding:8px;"><div style="height:8px;background:#ff6a00;border-radius:8px 8px 0 0;"></div><div style="min-height:128px;padding:18px 14px;background:#f7f9fc;border:1px solid #dce4ee;border-top:0;border-radius:0 0 10px 10px;text-align:center;"><div style="font-size:15px;font-weight:900;color:#0f223b;">VINYL BANNERS</div><div style="margin-top:9px;font-size:13px;line-height:1.5;color:#5a6a7f;">Bold. Durable. Weatherproof.<br>Built to get noticed.</div></div></td>
              <td width="33.33%" valign="top" style="padding:8px;"><div style="height:8px;background:#ff6a00;border-radius:8px 8px 0 0;"></div><div style="min-height:128px;padding:18px 14px;background:#f7f9fc;border:1px solid #dce4ee;border-top:0;border-radius:0 0 10px 10px;text-align:center;"><div style="font-size:15px;font-weight:900;color:#0f223b;">YARD SIGNS</div><div style="margin-top:9px;font-size:13px;line-height:1.5;color:#5a6a7f;">Big impact in any size.<br>Perfect for your next event.</div></div></td>
              <td width="33.33%" valign="top" style="padding:8px;"><div style="height:8px;background:#ff6a00;border-radius:8px 8px 0 0;"></div><div style="min-height:128px;padding:18px 14px;background:#f7f9fc;border:1px solid #dce4ee;border-top:0;border-radius:0 0 10px 10px;text-align:center;"><div style="font-size:15px;font-weight:900;color:#0f223b;">CAR MAGNETS</div><div style="margin-top:9px;font-size:13px;line-height:1.5;color:#5a6a7f;">Advertise on the go.<br>Easy to apply and remove.</div></div></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0f223b;border-radius:13px;overflow:hidden;"><tr><td style="padding:26px 25px;">
              <div style="font-size:26px;line-height:1.1;font-weight:900;color:#ffffff;">READY FOR YOUR <span style="color:#ff7b28;">NEXT PROJECT?</span></div>
              <p style="margin:10px 0 15px;font-size:14px;line-height:1.55;color:#dce5ef;">Reorder in minutes and get the same fast, high-quality service you know and trust.</p>
              <div style="font-size:13px;line-height:1.8;color:#ffffff;">✓ Upload your design or create a new one<br>✓ Choose your size, options &amp; quantity<br>✓ We print fast and get your order moving</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;"><tr><td bgcolor="#ff6a00" style="border-radius:8px;"><a href="${safeDesignUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">START YOUR PROJECT &nbsp;→</a></td></tr></table>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 34px 32px;">
            <h2 style="margin:0 0 8px;font-size:25px;color:#ff6a00;font-style:italic;">We Appreciate You!</h2>
            <p style="margin:0;font-size:15px;line-height:1.65;color:#42536a;">Your support means a lot to us. If there's anything we can do to help with your next project, just hit reply — we're here to help.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#0f223b;padding:23px 30px;text-align:center;color:#cbd6e3;font-size:11px;line-height:1.65;">
            <img src="${safeLogoUrl}" width="190" alt="Banners On The Fly" style="display:block;width:190px;max-width:100%;height:auto;margin:0 auto 12px;border:0;">
            <div><a href="${safeSiteUrl}" style="color:#ffffff;text-decoration:none;">bannersonthefly.com</a></div>
            ${postalHtml}
            <div style="margin-top:10px;">You received this email because you've ordered from Banners On The Fly in the past.</div>
            <div style="margin-top:7px;"><a href="${safeUnsubscribeUrl}" style="color:#ff9b5a;text-decoration:underline;">Unsubscribe from promotional emails</a></div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    from,
    to: customerEmail,
    replyTo,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'type', value: 'past_customer_marketing' },
      { name: 'campaign', value: CAMPAIGN_KEY },
      { name: 'order_id', value: String(order?.id || '') },
    ],
  };
}

async function sendWithRetry(resend, payload, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await resend.emails.send(payload);
      if (result?.error) throw new Error(normalizeProviderError(result.error));
      if (!result?.data?.id) throw new Error('Resend did not return a message ID');
      return result;
    } catch (error) {
      lastError = error;
      const status = Number(error?.statusCode ?? error?.status ?? error?.code);
      const message = normalizeProviderError(error).toLowerCase();
      const retryable = status === 429 || (status >= 500 && status < 600) || message.includes('rate limit') || message.includes('temporarily unavailable');
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 700 : 1800));
    }
  }
  throw lastError || new Error('Email provider rejected the request');
}

async function claimAttempt(sql, { orderId, customerEmail, adminIdentifier, unsubscribeTokenHash }) {
  let rows = await sql`
    INSERT INTO past_customer_marketing_sends (
      campaign_key, order_id, recipient_email, normalized_email, status,
      requested_at, admin_identifier, unsubscribe_token_hash, updated_at
    ) VALUES (
      ${CAMPAIGN_KEY}, ${orderId}, ${customerEmail}, ${customerEmail}, 'sending',
      NOW(), ${adminIdentifier || null}, ${unsubscribeTokenHash}, NOW()
    )
    ON CONFLICT (campaign_key, normalized_email) DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return { attemptId: rows[0].id, claimed: true };

  rows = await sql`
    UPDATE past_customer_marketing_sends
       SET order_id = ${orderId},
           recipient_email = ${customerEmail},
           status = 'sending',
           requested_at = NOW(),
           sent_at = NULL,
           resend_message_id = NULL,
           admin_identifier = ${adminIdentifier || null},
           failure_reason = NULL,
           unsubscribe_token_hash = ${unsubscribeTokenHash},
           updated_at = NOW()
     WHERE campaign_key = ${CAMPAIGN_KEY}
       AND normalized_email = ${customerEmail}
       AND status = 'failed'
    RETURNING id
  `;
  if (rows[0]) return { attemptId: rows[0].id, claimed: true };

  const existingRows = await sql`
    SELECT id, status, sent_at, recipient_email
      FROM past_customer_marketing_sends
     WHERE campaign_key = ${CAMPAIGN_KEY}
       AND normalized_email = ${customerEmail}
     LIMIT 1
  `;
  return { claimed: false, existing: existingRows[0] || null };
}

async function bestEffortEmailEvent(sql, { orderId, customerEmail, status, providerMessageId, failureReason }) {
  try {
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES ('marketing.past_customer', ${customerEmail}, ${orderId}, ${status}, ${providerMessageId || null}, ${failureReason || null}, NOW())
    `;
  } catch (error) {
    console.warn('[past-customer-marketing] email_events logging unavailable', { code: error?.code });
  }
}

async function sendHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: JSON_HEADERS, body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body.' }); }
  const orderId = String(body.orderId || '').trim();
  if (!isValidOrderId(orderId)) return jsonResponse(400, { ok: false, code: 'INVALID_ORDER_ID', error: 'A valid order ID is required.' });

  const dbUrl = getDbUrl();
  if (!dbUrl) return jsonResponse(500, { ok: false, code: 'DATABASE_NOT_CONFIGURED', error: 'Database configuration is missing.' });
  const resendApiKey = envValue('RESEND_API_KEY');
  if (!resendApiKey) return jsonResponse(500, { ok: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email configuration is missing.' });

  const sql = neon(dbUrl);
  let attemptId = null;
  let customerEmail = null;
  try {
    await ensureSchema(sql);
    const order = await loadOrder(sql, orderId);
    if (!order) return jsonResponse(404, { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order not found.' });
    if (isTestOrder(order)) return jsonResponse(422, { ok: false, code: 'TEST_ORDER', error: 'Marketing email is disabled for test orders.' });

    customerEmail = resolveOrderEmail(order);
    if (!customerEmail) return jsonResponse(422, { ok: false, code: 'NO_EMAIL', error: 'This order does not have a valid customer email.' });

    const suppressionSource = await getSuppressionSource(sql, customerEmail);
    if (suppressionSource) {
      return jsonResponse(409, {
        ok: false,
        code: 'MARKETING_UNSUBSCRIBED',
        error: 'This customer is unsubscribed from marketing email.',
        customerEmail,
      });
    }

    const unsubscribeToken = generateToken();
    const claimed = await claimAttempt(sql, {
      orderId,
      customerEmail,
      adminIdentifier: auth.session.email || auth.session.sub || null,
      unsubscribeTokenHash: hashToken(unsubscribeToken),
    });

    if (!claimed.claimed) {
      if (claimed.existing?.status === 'sent') {
        return jsonResponse(200, {
          ok: true,
          alreadySent: true,
          campaignKey: CAMPAIGN_KEY,
          customerEmail,
          sentAt: claimed.existing.sent_at,
          message: 'This customer already received this marketing email.',
        });
      }
      return jsonResponse(409, {
        ok: false,
        code: 'MARKETING_SEND_IN_PROGRESS',
        error: 'This marketing email is already being sent to this customer.',
        customerEmail,
      });
    }
    attemptId = claimed.attemptId;

    const fromRaw = envValue('MARKETING_FROM_EMAIL') || envValue('RESEND_FROM_EMAIL') || envValue('EMAIL_FROM') || envValue('FROM_EMAIL') || 'orders@bannersonthefly.com';
    const from = fromRaw.includes('<') ? fromRaw : `Banners On The Fly <${fromRaw}>`;
    const replyTo = envValue('MARKETING_REPLY_TO') || envValue('EMAIL_REPLY_TO') || 'support@bannersonthefly.com';
    const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);
    const payload = buildMarketingEmail({ order, customerEmail, from, replyTo, unsubscribeUrl });
    const resend = new Resend(resendApiKey);
    const result = await sendWithRetry(resend, payload);
    const messageId = result.data.id;

    const completed = await sql`
      UPDATE past_customer_marketing_sends
         SET status = 'sent', sent_at = NOW(), resend_message_id = ${messageId},
             failure_reason = NULL, updated_at = NOW()
       WHERE id = ${attemptId} AND status = 'sending'
      RETURNING sent_at
    `;
    if (!completed[0]?.sent_at) {
      console.error('[past-customer-marketing] provider accepted message but audit completion failed', { orderId, attemptId, messageId });
      return jsonResponse(500, {
        ok: false,
        code: 'MARKETING_AUDIT_FAILED',
        error: 'The provider accepted the email, but the send record could not be finalized. Check the customer before retrying.',
      });
    }

    await bestEffortEmailEvent(sql, { orderId, customerEmail, status: 'sent', providerMessageId: messageId });
    return jsonResponse(200, {
      ok: true,
      alreadySent: false,
      campaignKey: CAMPAIGN_KEY,
      customerEmail,
      sentAt: completed[0].sent_at,
      messageId,
      message: 'Marketing email sent successfully.',
    });
  } catch (error) {
    const failureReason = normalizeProviderError(error);
    if (attemptId) {
      try {
        await sql`
          UPDATE past_customer_marketing_sends
             SET status = 'failed', failure_reason = ${failureReason}, updated_at = NOW()
           WHERE id = ${attemptId} AND status = 'sending'
        `;
      } catch (auditError) {
        console.error('[past-customer-marketing] failed to record rejected attempt', { orderId, attemptId, code: auditError?.code });
      }
      if (customerEmail) await bestEffortEmailEvent(sql, { orderId, customerEmail, status: 'error', failureReason });
    }
    console.error('[past-customer-marketing] send failed', { orderId, error: failureReason });
    return jsonResponse(502, { ok: false, code: 'MARKETING_SEND_FAILED', error: 'The marketing email could not be sent. Please try again.' });
  }
}

async function getStatusRows(sql, orderIds) {
  if (!orderIds.length) return {};
  const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
  const orderRows = await sql(
    `SELECT o.id::text AS id, o.email, o.is_test_order, p.email AS profile_email
       FROM orders o
       LEFT JOIN profiles p ON o.user_id = p.id
      WHERE o.id::text IN (${placeholders})`,
    orderIds,
  );

  const orderInfo = orderRows.map((row) => ({
    id: String(row.id),
    email: normalizeEmail(row.email) || normalizeEmail(row.profile_email),
    isTest: row.is_test_order === true || String(row.is_test_order || '').toLowerCase() === 'true',
  }));
  const emails = [...new Set(orderInfo.map((row) => row.email).filter(Boolean))];
  const sendByEmail = new Map();
  const suppressed = new Set();

  if (emails.length) {
    const emailPlaceholders = emails.map((_, index) => `$${index + 2}`).join(', ');
    const sendRows = await queryOptional(
      sql,
      `SELECT normalized_email, status, sent_at, failure_reason
         FROM past_customer_marketing_sends
        WHERE campaign_key = $1 AND normalized_email IN (${emailPlaceholders})`,
      [CAMPAIGN_KEY, ...emails],
    );
    sendRows.forEach((row) => sendByEmail.set(String(row.normalized_email), row));

    const ownSuppressionRows = await queryOptional(
      sql,
      `SELECT normalized_email FROM past_customer_marketing_unsubscribes WHERE normalized_email IN (${emails.map((_, index) => `$${index + 1}`).join(', ')})`,
      emails,
    );
    ownSuppressionRows.forEach((row) => suppressed.add(String(row.normalized_email)));

    const tradeSuppressionRows = await queryOptional(
      sql,
      `SELECT normalized_email FROM trade_show_email_unsubscribes WHERE normalized_email IN (${emails.map((_, index) => `$${index + 1}`).join(', ')})`,
      emails,
    );
    tradeSuppressionRows.forEach((row) => suppressed.add(String(row.normalized_email)));

    const outboundRows = await queryOptional(
      sql,
      `SELECT normalized_value FROM outbound_suppressions WHERE scope='email' AND active=TRUE AND normalized_value IN (${emails.map((_, index) => `$${index + 1}`).join(', ')})`,
      emails,
    );
    outboundRows.forEach((row) => suppressed.add(String(row.normalized_value)));
  }

  return Object.fromEntries(orderInfo.map((row) => {
    if (row.isTest) return [row.id, { campaignKey: CAMPAIGN_KEY, status: 'test_order', recipientEmail: row.email }];
    if (!row.email) return [row.id, { campaignKey: CAMPAIGN_KEY, status: 'no_email', recipientEmail: null }];
    if (suppressed.has(row.email)) return [row.id, { campaignKey: CAMPAIGN_KEY, status: 'unsubscribed', recipientEmail: row.email }];
    const send = sendByEmail.get(row.email);
    if (!send) return [row.id, { campaignKey: CAMPAIGN_KEY, status: 'unsent', recipientEmail: row.email }];
    return [row.id, {
      campaignKey: CAMPAIGN_KEY,
      status: send.status,
      recipientEmail: row.email,
      sentAt: send.sent_at || null,
      errorMessage: send.failure_reason || null,
    }];
  }));
}

async function statusHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: JSON_HEADERS, body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body.' }); }
  const orderIds = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map((value) => String(value || '').trim()).filter(isValidOrderId))].slice(0, 100);
  if (!orderIds.length) return jsonResponse(200, { ok: true, campaignKey: CAMPAIGN_KEY, statuses: {} });
  const dbUrl = getDbUrl();
  if (!dbUrl) return jsonResponse(500, { ok: false, code: 'DATABASE_NOT_CONFIGURED', error: 'Database configuration is missing.' });
  try {
    const statuses = await getStatusRows(neon(dbUrl), orderIds);
    return jsonResponse(200, { ok: true, campaignKey: CAMPAIGN_KEY, statuses });
  } catch (error) {
    console.error('[past-customer-marketing] status failed', { code: error?.code, error: normalizeProviderError(error) });
    return jsonResponse(500, { ok: false, code: 'STATUS_FAILED', error: 'Marketing email status could not be loaded.' });
  }
}

function requestToken(event) {
  const query = String(event?.queryStringParameters?.token || '');
  if (query) return query;
  const contentType = String(event?.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try { return String(JSON.parse(event.body || '{}').token || ''); } catch { return ''; }
  }
  return String(new URLSearchParams(event.body || '').get('token') || '');
}

function isOneClick(event) {
  return event?.httpMethod === 'POST' && String(event.body || '').includes('List-Unsubscribe=One-Click');
}

function compliancePage(statusCode, title, message, showConfirmation = false) {
  const form = showConfirmation ? '<form method="post"><button type="submit">Confirm unsubscribe</button></form>' : '';
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:32px 16px;background:#eef2f6;color:#132238;font-family:Arial,sans-serif}main{max-width:560px;margin:40px auto;background:#fff;border-radius:18px;padding:32px;box-shadow:0 10px 35px rgba(15,34,59,.14);border-top:5px solid #ff6a00}h1{margin:0 0 14px;color:#0f223b;font-size:28px}p{line-height:1.65}button{margin-top:10px;border:0;border-radius:9px;background:#ff6a00;color:#fff;padding:13px 20px;font-size:15px;font-weight:800;cursor:pointer}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${form}</main></body></html>`,
  };
}

async function unsubscribeHandler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return compliancePage(405, 'Method not allowed', 'Use the unsubscribe link from the email.');
  const token = requestToken(event);
  if (!validToken(token)) return compliancePage(400, 'Link unavailable', 'This unsubscribe link is invalid or unavailable.');
  if (event.httpMethod === 'GET') return compliancePage(200, 'Unsubscribe', 'Confirm that you no longer want promotional emails from Banners On The Fly.', true);
  const dbUrl = getDbUrl();
  if (!dbUrl) return compliancePage(503, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');
  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);
    const tokenHash = hashToken(token);
    const matched = await sql`
      SELECT normalized_email, recipient_email
        FROM past_customer_marketing_sends
       WHERE unsubscribe_token_hash = ${tokenHash}
       LIMIT 1
    `;
    if (!matched[0]) return compliancePage(400, 'Link unavailable', 'This unsubscribe link is invalid or unavailable.');
    const normalizedEmail = String(matched[0].normalized_email);
    await sql`
      INSERT INTO past_customer_marketing_unsubscribes (normalized_email, email, source, campaign_key, unsubscribed_at, updated_at)
      VALUES (${normalizedEmail}, ${matched[0].recipient_email}, ${isOneClick(event) ? 'list_unsubscribe' : 'footer_link'}, ${CAMPAIGN_KEY}, NOW(), NOW())
      ON CONFLICT (normalized_email) DO UPDATE
        SET source = EXCLUDED.source, campaign_key = EXCLUDED.campaign_key,
            unsubscribed_at = LEAST(past_customer_marketing_unsubscribes.unsubscribed_at, NOW()),
            updated_at = NOW()
    `;
    return compliancePage(200, 'Unsubscribed', 'This email address will no longer receive promotional emails from Banners On The Fly.');
  } catch (error) {
    console.error('[past-customer-marketing] unsubscribe failed', { code: error?.code, error: normalizeProviderError(error) });
    return compliancePage(500, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');
  }
}

module.exports = {
  CAMPAIGN_KEY,
  sendHandler,
  statusHandler,
  unsubscribeHandler,
  _test: {
    normalizeEmail,
    isValidOrderId,
    escapeHtml,
    buildMarketingEmail,
    buildUnsubscribeUrl,
    hashToken,
    validToken,
    ensureSchema,
    getStatusRows,
  },
};
