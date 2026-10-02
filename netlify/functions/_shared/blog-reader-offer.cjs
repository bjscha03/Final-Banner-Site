'use strict';

const crypto = require('node:crypto');
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const marketing = require('./marketing-email-store.cjs');
const tokens = require('./marketing-email-token.cjs');
const suppression = require('./email-suppression.cjs');
const customers = require('./admin-customers.cjs');

const CAMPAIGN = 'blog-reader-25-2026';
const CONSENT_TEXT = 'Send me occasional offers and design tips from Banners On The Fly. Unsubscribe anytime.';
const SUBJECT = 'A big debut for your next idea: your 25% off code';
const SITE = 'https://bannersonthefly.com';
let schemaPromise;

async function ensureSchema(sql) {
  if (!schemaPromise) schemaPromise = (async () => {
    await marketing.ensureMarketingEmailSchema(sql);
    await sql`CREATE TABLE IF NOT EXISTS blog_offer_leads (
      normalized_email TEXT PRIMARY KEY,
      discount_code TEXT NOT NULL UNIQUE,
      source_slug TEXT NOT NULL,
      marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
      consent_text TEXT NOT NULL,
      consent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
      CHECK (normalized_email = LOWER(normalized_email))
    )`;
    await sql`CREATE TABLE IF NOT EXISTS blog_offer_rate_limits (
      bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS blog_offer_leads_created_idx ON blog_offer_leads (created_at DESC)`;
  })().catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailContent(lead, unsubscribeUrl, address) {
  const expires = new Date(lead.expires_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });
  const text = `Good ideas deserve a big debut.\n\nYour personal code: ${lead.discount_code}\nSave 25% on your next order. Use the email address you signed up with at checkout.\n\nStart designing: ${SITE}/design?utm_source=blog_offer&utm_medium=email&utm_campaign=reader25\n\nOne use. Expires ${expires}. Cannot be combined with other offers.\n\nYou requested this code from the Banners On The Fly blog.${lead.marketing_consent ? ' You also opted in to occasional offers and design tips.' : ' This request does not subscribe you to future marketing emails.'}\nUnsubscribe: ${unsubscribeUrl}\nBanners On The Fly · ${address}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your 25% off code</title></head><body style="margin:0;background:#f2f5f9;font-family:Arial,sans-serif;color:#14263d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px"><table role="presentation" align="center" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;background:#0b1f3a;color:#fff;font-weight:bold;font-size:19px">BANNERS ON THE FLY</td></tr><tr><td style="padding:32px"><p style="color:#b64312;font-size:12px;font-weight:bold;letter-spacing:2px">A LITTLE PERK FOR OUR READERS</p><h1 style="font-size:32px;line-height:1.15;margin:16px 0">Good ideas deserve<br>a big debut.</h1><p style="font-size:16px;line-height:1.6;color:#526174">Here’s <strong>25% off your next order</strong>—from your first spark of inspiration to the finished print.</p><div style="padding:24px 12px;margin:24px 0;text-align:center;background:#f2f6fb;border:1px dashed #18448d;border-radius:10px"><p style="margin:0 0 10px;font-size:12px;color:#526174">YOUR PERSONAL CODE</p><strong style="font-size:27px;color:#18448d;letter-spacing:2px">${escape(lead.discount_code)}</strong></div><p style="font-size:14px;line-height:1.6;color:#526174">Enter this code at checkout with the email address you signed up with.</p><a href="${SITE}/design?utm_source=blog_offer&amp;utm_medium=email&amp;utm_campaign=reader25" style="display:inline-block;padding:16px 24px;background:#18448d;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:bold">Bring my idea to life →</a><p style="margin-top:24px;font-size:12px;line-height:1.6;color:#657387">One use. Expires ${escape(expires)}. Cannot be combined with other offers.</p></td></tr><tr><td style="padding:24px 32px;background:#f7f9fc;font-size:12px;line-height:1.6;color:#657387">You requested this code from our blog.${lead.marketing_consent ? ' You also opted in to occasional offers and design tips.' : ' You are not subscribed to future marketing emails by this request.'}<br><a href="${escape(unsubscribeUrl)}" style="color:#18448d">Unsubscribe</a><br>Banners On The Fly · ${escape(address)}</td></tr></table></td></tr></table></body></html>`;
  return { subject: SUBJECT, text, html };
}

async function rateLimit(sql, ip, secret, now) {
  const bucket = crypto.createHmac('sha256', secret).update(`${ip}\0${now.toISOString().slice(0, 10)}`).digest('hex');
  const rows = await sql`INSERT INTO blog_offer_rate_limits (bucket, hits, expires_at)
    VALUES (${bucket}, 1, NOW() + INTERVAL '2 days')
    ON CONFLICT (bucket) DO UPDATE SET hits = blog_offer_rate_limits.hits + 1
      WHERE blog_offer_rate_limits.hits < 10
    RETURNING hits`;
  await sql`DELETE FROM blog_offer_rate_limits WHERE expires_at < NOW()`;
  return rows.length > 0;
}

async function getOrCreateLead(sql, { email, slug, consent }) {
  const code = `READ25-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const rows = await sql`WITH lead AS (
    INSERT INTO blog_offer_leads (normalized_email, discount_code, source_slug, marketing_consent, consent_text, consent_at)
    VALUES (${email}, ${code}, ${slug}, ${consent}, ${CONSENT_TEXT}, CASE WHEN ${consent} THEN NOW() ELSE NULL END)
    ON CONFLICT (normalized_email) DO UPDATE SET normalized_email = EXCLUDED.normalized_email
    RETURNING *
  ), coupon AS (
    INSERT INTO discount_codes (code, email, discount_percentage, single_use, used, expires_at, status, issued_at, campaign, max_uses_per_customer, max_total_uses, created_at, updated_at)
    SELECT discount_code, normalized_email, 25, TRUE, FALSE, expires_at, 'unused', NOW(), ${CAMPAIGN}, 1, 1, NOW(), NOW() FROM lead
    ON CONFLICT (code) DO NOTHING RETURNING code
  ) SELECT * FROM lead`;
  return rows[0];
}

async function claimEmail(sql, lead, tokenHash, providerKey) {
  const rows = await sql`INSERT INTO marketing_email_sends (
    campaign_key, normalized_email, recipient_email, subject, status, request_id, provider_idempotency_key, unsubscribe_token_hash
  ) VALUES (${CAMPAIGN}, ${lead.normalized_email}, ${lead.normalized_email}, ${SUBJECT}, 'processing', ${crypto.randomUUID()}, ${providerKey}, ${tokenHash})
  ON CONFLICT (campaign_key, normalized_email) DO UPDATE
    SET status = 'processing', last_attempt_at = NOW(), updated_at = NOW(), attempt_count = marketing_email_sends.attempt_count + 1
    WHERE (marketing_email_sends.status = 'error' OR (marketing_email_sends.status = 'processing' AND marketing_email_sends.last_attempt_at < NOW() - INTERVAL '5 minutes'))
      AND marketing_email_sends.created_at > NOW() - INTERVAL '23 hours'
  RETURNING id, status`;
  if (rows.length) return { claimed: true, row: rows[0] };
  const previous = await sql`SELECT id, status FROM marketing_email_sends WHERE campaign_key = ${CAMPAIGN} AND normalized_email = ${lead.normalized_email}`;
  return { claimed: false, row: previous[0] };
}

function createService(overrides = {}) {
  const deps = { neon, ensureSchema, rateLimit, getOrCreateLead, claimEmail, findSuppression: suppression.findEmailSuppression,
    send: (key, payload, providerKey) => new Resend(key).emails.send(payload, { idempotencyKey: providerKey }), ...overrides };
  return async function offer(input, env, { ip, production, now = new Date() }) {
    const reply = (status, body) => ({ status, body });
    if (!production) return reply(503, { ok: false, error: 'This is a preview. Code delivery will be enabled on the live site.' });
    const email = typeof input?.email === 'string' ? tokens.normalizeEmail(input.email) : null;
    if (!email || typeof input.marketingConsent !== 'boolean' || typeof input.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(input.slug) || input.website) {
      return reply(400, { ok: false, error: 'Please enter a valid email address and try again.' });
    }
    const secret = tokens.configuredSecret(env);
    const db = env.NETLIFY_DATABASE_URL || env.DATABASE_URL;
    if (!db || !env.RESEND_API_KEY || !secret || !ip) return reply(503, { ok: false, error: 'The offer is temporarily unavailable. Please try again shortly.' });
    const sql = deps.neon(db);
    let claim;
    try {
      await deps.ensureSchema(sql);
      if (!await deps.rateLimit(sql, ip, secret, now)) return reply(429, { ok: false, error: 'Too many requests. Please try again tomorrow.' });
      const blocked = await deps.findSuppression(sql, email);
      if (blocked.suppressed) return reply(409, { ok: false, error: 'We cannot email this address. Contact support@bannersonthefly.com for help with your offer.' });
      const lead = await deps.getOrCreateLead(sql, { email, slug: input.slug, consent: input.marketingConsent });
      if (new Date(lead.expires_at) <= now) return reply(409, { ok: false, error: 'Your reader offer has expired. Contact us if you need a hand with your order.' });
      const token = tokens.createMarketingUnsubscribeToken(email, CAMPAIGN, { env });
      const providerKey = `blog-reader25/${crypto.createHmac('sha256', secret).update(email).digest('hex')}`;
      claim = await deps.claimEmail(sql, lead, tokens.hashMarketingUnsubscribeToken(token), providerKey);
      const success = () => reply(200, { ok: true, code: lead.discount_code, expiresAt: lead.expires_at, emailSent: true });
      if (!claim.claimed) {
        if (claim.row?.status === 'sent') return success();
        return reply(409, { ok: false, error: 'Your code request is already being processed. Check your inbox or try again in a few minutes.' });
      }
      const unsubscribeUrl = tokens.buildMarketingUnsubscribeUrl(token, { PUBLIC_SITE_URL: SITE });
      const address = env.MARKETING_PHYSICAL_ADDRESS || env.OUTBOUND_PHYSICAL_ADDRESS || env.RECOVERY_PHYSICAL_ADDRESS || 'PO Box 369, Crestwood, KY 40014';
      const fromRaw = env.EMAIL_FROM_INFO || env.EMAIL_FROM || 'info@bannersonthefly.com';
      const content = emailContent(lead, unsubscribeUrl, address);
      const result = await deps.send(env.RESEND_API_KEY, {
        from: fromRaw.includes('<') ? fromRaw : `Banners On The Fly <${fromRaw}>`, to: email,
        replyTo: env.EMAIL_REPLY_TO || 'support@bannersonthefly.com', ...content,
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: [{ name: 'campaign', value: CAMPAIGN }],
      }, providerKey);
      if (result?.error || !result?.data?.id) throw new Error('Email provider did not confirm delivery');
      await sql`UPDATE marketing_email_sends SET status = 'sent', resend_message_id = ${result.data.id}, sent_at = NOW(), updated_at = NOW(), error_message = NULL WHERE id = ${claim.row.id} AND status = 'processing'`;
      return success();
    } catch (error) {
      if (claim?.claimed) {
        try { await sql`UPDATE marketing_email_sends SET status = 'error', error_message = 'Delivery could not be confirmed', updated_at = NOW() WHERE id = ${claim.row.id} AND status = 'processing'`; } catch { /* The processing lease and provider key preserve retry safety. */ }
      }
      console.error('[blog-reader-offer] failed', { code: error?.code || 'OFFER_FAILED' });
      return reply(503, { ok: false, error: 'We could not confirm your email was sent. Please try again in a few minutes; your offer is saved.' });
    }
  };
}

async function listLeads(sql, { page = 1, pageSize = 100 } = {}) {
  await ensureSchema(sql);
  const rows = await sql`SELECT l.*, s.status AS email_status, COUNT(*) OVER() AS total,
    EXISTS (SELECT 1 FROM orders o WHERE LOWER(BTRIM(o.email)) = l.normalized_email
      AND o.created_at >= l.created_at AND COALESCE(o.is_test_order, FALSE) = FALSE
      AND (o.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
        OR NULLIF(to_jsonb(o)->>'paypal_capture_id', '') IS NOT NULL
        OR (o.status = 'pending' AND to_jsonb(o)->>'payment_reconciliation_status' IN ('complete', 'completed')))) AS purchased
    FROM blog_offer_leads l LEFT JOIN marketing_email_sends s ON s.normalized_email = l.normalized_email AND s.campaign_key = ${CAMPAIGN}
    ORDER BY l.created_at DESC, l.normalized_email LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const state = await customers.loadSuppressionIndex(sql, rows.map(row => row.normalized_email).filter(customers.isValidCustomerEmail));
  return { total: Number(rows[0]?.total || 0), page, pageSize, verificationAvailable: state.complete,
    leads: rows.map(row => {
      const reasons = customers.isValidCustomerEmail(row.normalized_email)
        ? customers.suppressionReasonsForEmail(state, row.normalized_email) : ['invalid_or_test_email'];
      return { email: row.normalized_email, slug: row.source_slug, createdAt: row.created_at, code: row.discount_code,
        consent: row.marketing_consent, consentAt: row.consent_at, consentText: row.consent_text,
        emailStatus: row.email_status || 'pending', purchased: Boolean(row.purchased),
        eligible: state.complete && row.marketing_consent === true && row.email_status === 'sent' && !row.purchased && reasons.length === 0,
        exclusionReason: !state.complete ? 'Suppression check unavailable' : reasons.length ? 'Unsubscribed or suppressed' : !row.marketing_consent ? 'Code only; no marketing consent' : row.purchased ? 'Purchased since signup' : row.email_status !== 'sent' ? 'Email not confirmed' : null };
    }) };
}

module.exports = { CAMPAIGN, CONSENT_TEXT, ensureSchema, emailContent, rateLimit, getOrCreateLead, claimEmail, createService, listLeads,
  resetSchemaForTests() { schemaPromise = null; } };
