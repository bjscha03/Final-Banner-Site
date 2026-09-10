import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import serverAuthModule from './_shared/server-auth.cjs';
import {
  TRADE_SHOWS,
  getTradeShowBySlug,
  getTradeShowPath,
  formatTradeShowDateRange,
} from '../../src/lib/tradeShows/tradeShows.ts';
import { buildTradeShowEmail } from '../../src/lib/tradeShows/tradeShowEmail.mjs';
import {
  buildTradeShowUnsubscribeUrl,
  generateUnsubscribeToken,
  hashUnsubscribeToken,
  normalizeComplianceEmail,
} from './_shared/trade-show-email-compliance.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Authorization, X-Banners-Admin-Session, Cookie, Origin',
};

const reply = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...JSON_HEADERS, ...extraHeaders },
  body: JSON.stringify(body),
});

function databaseUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

function parseBody(event, maxBytes = 12 * 1024) {
  const raw = String(event.body || '');
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    const error = new Error('Request body is too large.');
    error.code = 'REQUEST_TOO_LARGE';
    throw error;
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function allowedOrigins(event) {
  const proto = String(event.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hosts = [event.headers?.host, event.headers?.['x-forwarded-host']]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const result = new Set(hosts.map((host) => `${proto}://${host}`));
  for (const candidate of [event.rawUrl, process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL]) {
    try {
      if (candidate) result.add(new URL(String(candidate)).origin);
    } catch {
      // Ignore malformed platform metadata.
    }
  }
  return result;
}

function requireSameOrigin(event) {
  const origin = String(event.headers?.origin || '').trim();
  let approvedPreview = false;
  try {
    const siteName = String(process.env.SITE_NAME || '').trim().toLowerCase();
    const originUrl = new URL(origin);
    approvedPreview = Boolean(
      siteName
      && originUrl.protocol === 'https:'
      && (originUrl.hostname === `${siteName}.netlify.app` || originUrl.hostname.endsWith(`--${siteName}.netlify.app`)),
    );
  } catch {
    approvedPreview = false;
  }
  return Boolean(origin && (allowedOrigins(event).has(origin) || approvedPreview));
}

const STOP_WORDS = new Set([
  'THE', 'AND', 'OF', 'IN', 'AT', 'FOR', 'A', 'AN', 'ANNUAL', 'CONFERENCE',
  'CONVENTION', 'EXPO', 'SHOW', 'MEETING', 'ASSOCIATION', 'INTERNATIONAL',
  'NATIONAL', '2026',
]);

function shortHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().slice(-2).padStart(2, '0');
}

function proposedStem(event) {
  if (event.slug === 'rocky-mountain-apparel-show') return 'RMAS';
  const words = event.shortName.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const direct = words.find((word) => /^[A-Z][A-Z0-9]{1,7}$/.test(word) && !STOP_WORDS.has(word));
  if (direct) return direct.slice(0, 8);
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  if (meaningful.length === 1) return meaningful[0].slice(0, 8);
  return (meaningful.map((word) => word[0]).join('') || words.map((word) => word[0]).join('') || 'EVENT').slice(0, 8);
}

function proposeUniqueCode(event, occupiedCodes) {
  let candidate = `20${proposedStem(event)}`;
  if (occupiedCodes.has(candidate)) candidate = `${candidate.slice(0, 8)}${shortHash(event.slug)}`.slice(0, 10);
  let suffix = 2;
  while (occupiedCodes.has(candidate)) {
    candidate = `20${proposedStem(event).slice(0, 5)}${suffix}`.slice(0, 10);
    suffix += 1;
  }
  return candidate;
}

async function ensureTradeShowCodes(sql) {
  const existing = await sql`
    SELECT trade_show_slug, code, discount_percentage, is_active, created_at, updated_at
    FROM trade_show_promo_codes
  `;
  const bySlug = new Map(existing.map((row) => [row.trade_show_slug, row]));
  const occupied = new Set(existing.map((row) => String(row.code).toUpperCase()));
  const legacyCodes = await sql`SELECT UPPER(code) AS code FROM discount_codes`;
  for (const row of legacyCodes) occupied.add(String(row.code).toUpperCase());
  occupied.add('NEW20');
  occupied.add('CUSTOM60');
  occupied.add('20OFF');

  for (const event of TRADE_SHOWS) {
    if (bySlug.has(event.slug)) continue;
    const code = proposeUniqueCode(event, occupied);
    const inserted = await sql`
      INSERT INTO trade_show_promo_codes (trade_show_slug, code, discount_percentage)
      VALUES (${event.slug}, ${code}, 20)
      ON CONFLICT (trade_show_slug) DO NOTHING
      RETURNING trade_show_slug, code, discount_percentage, is_active, created_at, updated_at
    `;
    if (inserted[0]) {
      bySlug.set(event.slug, inserted[0]);
      occupied.add(code);
    }
  }

  if (bySlug.size < TRADE_SHOWS.length) {
    const refreshed = await sql`
      SELECT trade_show_slug, code, discount_percentage, is_active, created_at, updated_at
      FROM trade_show_promo_codes
    `;
    return new Map(refreshed.map((row) => [row.trade_show_slug, row]));
  }
  return bySlug;
}

function eventView(event, promotion) {
  return {
    slug: event.slug,
    name: event.name,
    shortName: event.shortName,
    startDate: event.startDate,
    endDate: event.endDate,
    dateRange: formatTradeShowDateRange(event),
    city: event.city,
    state: event.state,
    landingPagePath: getTradeShowPath(event),
    landingPageUrl: `https://bannersonthefly.com${getTradeShowPath(event)}`,
    discountCode: promotion?.code || null,
    discountPercentage: Number(promotion?.discount_percentage || 20),
    emailTemplateStatus: promotion?.is_active ? 'Ready' : 'Inactive',
  };
}

function normalizeExhibitorName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 160 || /[\u0000-\u001F\u007F]/.test(name)) return null;
  return name;
}

function normalizeEmail(value) {
  return normalizeComplianceEmail(value);
}

function normalizePromotionCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(code) ? code : null;
}

function idempotencyKey(event, body) {
  const value = String(event.headers?.['x-idempotency-key'] || body.idempotencyKey || '').trim();
  return /^[A-Za-z0-9_-]{12,100}$/.test(value) ? value : null;
}

function safeProviderError(value) {
  const text = typeof value === 'string' ? value : value?.message || JSON.stringify(value || {});
  return String(text || 'Resend rejected the email').replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 1000);
}

async function handleList(sql, event) {
  const codes = await ensureTradeShowCodes(sql);
  const slug = new URL(event.rawUrl || `https://local.invalid/?${event.rawQuery || ''}`).searchParams.get('slug');
  if (!slug) {
    return reply(200, {
      ok: true,
      events: TRADE_SHOWS.map((tradeShow) => eventView(tradeShow, codes.get(tradeShow.slug))),
      count: TRADE_SHOWS.length,
    });
  }

  const tradeShow = getTradeShowBySlug(slug);
  if (!tradeShow) return reply(404, { ok: false, error: 'Trade show not found' });
  const promotion = codes.get(slug);
  const history = await sql`
    SELECT id, exhibitor_name, recipient_email, subject, discount_code,
           sending_admin_email, resend_message_id, status, error_message,
           created_at, sent_at, unsubscribed_at, complained_at
    FROM trade_show_email_activity
    WHERE trade_show_slug = ${slug}
    ORDER BY created_at DESC
    LIMIT 25
  `;
  return reply(200, {
    ok: true,
    event: eventView(tradeShow, promotion),
    history,
  });
}

async function handleCodeUpdate(sql, event) {
  if (!requireSameOrigin(event)) return reply(403, { ok: false, error: 'This request must come from the same site.' });
  const body = parseBody(event);
  const tradeShow = getTradeShowBySlug(body.slug);
  const code = normalizePromotionCode(body.code);
  if (!tradeShow) return reply(404, { ok: false, error: 'Trade show not found' });
  if (!code) return reply(400, { ok: false, error: 'Use 4–24 uppercase letters, numbers, or hyphens.' });
  if (code === 'NEW20' || code === 'CUSTOM60' || code === '20OFF') return reply(409, { ok: false, error: 'That code is reserved.' });

  await ensureTradeShowCodes(sql);
  const legacyConflict = await sql`SELECT id FROM discount_codes WHERE UPPER(code) = ${code} LIMIT 1`;
  if (legacyConflict.length) return reply(409, { ok: false, error: 'That code already belongs to another promotion.' });

  try {
    const rows = await sql`
      UPDATE trade_show_promo_codes
      SET code = ${code}, updated_at = NOW()
      WHERE trade_show_slug = ${tradeShow.slug}
      RETURNING code, discount_percentage, is_active
    `;
    return reply(200, { ok: true, event: eventView(tradeShow, rows[0]) });
  } catch (error) {
    if (error?.code === '23505') return reply(409, { ok: false, error: 'That code is already assigned to another trade show.' });
    throw error;
  }
}

async function handleSend(sql, event, session) {
  if (!requireSameOrigin(event)) return reply(403, { ok: false, error: 'This request must come from the same site.' });
  const body = parseBody(event);
  const tradeShow = getTradeShowBySlug(body.slug);
  const exhibitorName = normalizeExhibitorName(body.exhibitorName);
  const recipientEmail = normalizeEmail(body.email);
  const requestKey = idempotencyKey(event, body);
  if (!tradeShow) return reply(404, { ok: false, error: 'Trade show not found' });
  if (!exhibitorName) return reply(400, { ok: false, field: 'exhibitorName', error: 'Enter a valid exhibitor or customer name.' });
  if (!recipientEmail) return reply(400, { ok: false, field: 'email', error: 'Enter a valid email address.' });
  if (!requestKey) return reply(400, { ok: false, error: 'A valid idempotency key is required.' });

  const codes = await ensureTradeShowCodes(sql);
  const promotion = codes.get(tradeShow.slug);
  if (!promotion?.is_active) return reply(409, { ok: false, error: 'This trade show email template is not active.' });
  const suppressed = await sql`
    SELECT reason
    FROM trade_show_email_unsubscribes
    WHERE normalized_email = ${recipientEmail}
    LIMIT 1
  `;
  if (suppressed.length) {
    return reply(409, {
      ok: false,
      suppressed: true,
      error: 'This recipient has unsubscribed or is suppressed and cannot receive trade-show promotional emails.',
    });
  }
  const unsubscribeToken = generateUnsubscribeToken();
  const unsubscribeTokenHash = hashUnsubscribeToken(unsubscribeToken);
  const unsubscribeUrl = buildTradeShowUnsubscribeUrl(unsubscribeToken);
  const email = buildTradeShowEmail({
    event: tradeShow,
    exhibitorName,
    discountCode: promotion.code,
    unsubscribeUrl,
  });

  const inserted = await sql`
    INSERT INTO trade_show_email_activity (
      trade_show_slug, trade_show_name, exhibitor_name, recipient_email,
      subject, discount_code, sending_admin_id, sending_admin_email,
      status, idempotency_key, unsubscribe_token_hash
    ) VALUES (
      ${tradeShow.slug}, ${tradeShow.name}, ${exhibitorName}, ${recipientEmail},
      ${email.subject}, ${promotion.code}, ${session.sub || null}, ${session.email || null},
      'processing', ${requestKey}, ${unsubscribeTokenHash}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;

  if (!inserted.length) {
    const previous = await sql`
      SELECT id, status, resend_message_id, error_message
      FROM trade_show_email_activity
      WHERE idempotency_key = ${requestKey}
      LIMIT 1
    `;
    if (previous[0]?.status === 'sent') {
      return reply(200, { ok: true, duplicate: true, messageId: previous[0].resend_message_id, activityId: previous[0].id });
    }
    if (previous[0]?.status === 'processing') {
      return reply(409, { ok: false, duplicate: true, error: 'This email send is already processing.' });
    }
    return reply(502, { ok: false, duplicate: true, error: previous[0]?.error_message || 'The previous send failed.' });
  }

  const activityId = inserted[0].id;
  if (!process.env.RESEND_API_KEY) {
    const errorMessage = 'Resend is not configured for this deployment.';
    await sql`UPDATE trade_show_email_activity SET status = 'error', error_message = ${errorMessage}, updated_at = NOW() WHERE id = ${activityId}`;
    return reply(503, { ok: false, error: errorMessage, activityId });
  }

  const emailFromRaw = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
  const from = emailFromRaw.includes('<') ? emailFromRaw : `Banners On The Fly <${emailFromRaw}>`;
  const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from,
      to: recipientEmail,
      replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'type', value: 'trade_show_promotion' },
        { name: 'event_slug', value: tradeShow.slug.slice(0, 256) },
      ],
    }, { idempotencyKey: `trade-show-email/${requestKey}`.slice(0, 256) });
    if (result?.error || !result?.data?.id) throw result?.error || new Error('Resend did not return a message ID.');

    await sql`
      UPDATE trade_show_email_activity
      SET status = 'sent', resend_message_id = ${result.data.id}, sent_at = NOW(), updated_at = NOW()
      WHERE id = ${activityId}
    `;
    return reply(200, { ok: true, messageId: result.data.id, activityId });
  } catch (error) {
    const errorMessage = safeProviderError(error);
    await sql`
      UPDATE trade_show_email_activity
      SET status = 'error', error_message = ${errorMessage}, updated_at = NOW()
      WHERE id = ${activityId}
    `;
    console.error('[admin-trade-show-emails] send failed', { activityId, tradeShowSlug: tradeShow.slug, error: errorMessage });
    return reply(502, { ok: false, error: 'Resend could not send this email.', activityId });
  }
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...JSON_HEADERS,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session, X-Idempotency-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      },
      body: '',
    };
  }

  const auth = serverAuthModule.requireAdmin(event);
  if (!auth.ok) return auth.response;
  const dbUrl = databaseUrl();
  if (!dbUrl) return reply(503, { ok: false, error: 'Database is not configured.' });
  const sql = neon(dbUrl);

  try {
    if (event.httpMethod === 'GET') return await handleList(sql, event);
    if (event.httpMethod === 'PATCH') return await handleCodeUpdate(sql, event);
    if (event.httpMethod === 'POST') return await handleSend(sql, event, auth.session);
    return reply(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[admin-trade-show-emails] request failed', { code: error?.code, message: error?.message });
    const status = error?.code === 'INVALID_JSON' ? 400 : error?.code === 'REQUEST_TOO_LARGE' ? 413 : 500;
    return reply(status, { ok: false, error: status === 500 ? 'Unable to process the trade show email request.' : error.message });
  }
};

export const _test = {
  normalizeEmail,
  normalizeExhibitorName,
  normalizePromotionCode,
  proposeUniqueCode,
  proposedStem,
};

export default withLambda(handler);
