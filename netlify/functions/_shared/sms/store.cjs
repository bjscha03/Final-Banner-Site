'use strict';

const { randomUUID } = require('node:crypto');
const { neon } = require('@neondatabase/serverless');
const { env } = require('./runtime.cjs');
const initialized = new WeakMap();
let cachedDatabase;
let cachedUrl;

function database() {
  const url = env('NETLIFY_DATABASE_URL') || env('DATABASE_URL');
  if (!url) throw new Error('SMS_DATABASE_UNAVAILABLE');
  if (cachedUrl !== url) { cachedDatabase = neon(url); cachedUrl = url; }
  return cachedDatabase;
}

async function ensureSchema(sql) {
  if (!initialized.has(sql)) {
    const ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS bof_sms_contacts (
        phone TEXT PRIMARY KEY, opted_out BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS bof_sms_sessions (
        id UUID PRIMARY KEY, phone TEXT NOT NULL, step TEXT NOT NULL DEFAULT 'SIZE',
        config JSONB NOT NULL DEFAULT '{}'::jsonb, artwork JSONB,
        revision INTEGER NOT NULL DEFAULT 0, approved_revision INTEGER,
        checkout_key TEXT NOT NULL, order_id UUID, stripe_session_id TEXT, payment_url TEXT,
        checkout_attempt INTEGER NOT NULL DEFAULT 1,
        checkout_lock_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
        error_code TEXT
      )`;
      await sql`ALTER TABLE bof_sms_sessions ADD COLUMN IF NOT EXISTS checkout_attempt INTEGER NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE bof_sms_sessions ADD COLUMN IF NOT EXISTS last_inbound_sid TEXT`;
      await sql`ALTER TABLE bof_sms_sessions ADD COLUMN IF NOT EXISTS upload_requests INTEGER NOT NULL DEFAULT 0`;
      await sql`CREATE INDEX IF NOT EXISTS bof_sms_sessions_phone_idx ON bof_sms_sessions(phone, created_at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS bof_sms_inbound (
        sid TEXT PRIMARY KEY, phone TEXT NOT NULL, payload JSONB NOT NULL,
        session_id UUID, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
        error_code TEXT
      )`;
      await sql`CREATE INDEX IF NOT EXISTS bof_sms_inbound_pending_idx ON bof_sms_inbound(status, created_at)`;
      await sql`CREATE TABLE IF NOT EXISTS bof_sms_outbox (
        id UUID PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, session_id UUID,
        phone TEXT NOT NULL, body TEXT NOT NULL, media_url TEXT,
        units INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending', provider_sid TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        error_code TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS bof_sms_outbox_pending_idx ON bof_sms_outbox(status, created_at)`;
      await sql`CREATE TABLE IF NOT EXISTS bof_sms_budget (
        id INTEGER PRIMARY KEY, day DATE NOT NULL DEFAULT CURRENT_DATE, month DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
        daily_units INTEGER NOT NULL DEFAULT 0, monthly_units INTEGER NOT NULL DEFAULT 0
      )`;
      await sql`INSERT INTO bof_sms_budget(id) VALUES (1) ON CONFLICT DO NOTHING`;
    })();
    initialized.set(sql, ready);
    ready.catch(() => initialized.delete(sql));
  }
  return initialized.get(sql);
}

async function receive(sql, { sid, phone, payload, sessionId = null }) {
  await sql`INSERT INTO bof_sms_contacts(phone) VALUES (${phone}) ON CONFLICT DO NOTHING`;
  return sql`INSERT INTO bof_sms_inbound(sid, phone, payload, session_id)
    VALUES (${sid}, ${phone}, ${JSON.stringify(payload)}::jsonb, ${sessionId})
    ON CONFLICT (sid) DO NOTHING RETURNING sid`;
}

async function claimInbound(sql) {
  const rows = await sql`UPDATE bof_sms_inbound SET status = 'processing', attempts = attempts + 1,
      lease_until = NOW() + INTERVAL '4 minutes'
    WHERE sid = (
      SELECT candidate.sid FROM bof_sms_inbound candidate
      WHERE (candidate.status = 'pending' OR (candidate.status = 'processing' AND candidate.lease_until < NOW()))
        AND candidate.attempts < 5
        AND NOT EXISTS (
          SELECT 1 FROM bof_sms_inbound earlier WHERE earlier.phone = candidate.phone
            AND (earlier.created_at, earlier.sid) < (candidate.created_at, candidate.sid)
            AND earlier.status IN ('pending', 'processing') AND earlier.attempts < 5
        )
      ORDER BY candidate.created_at, candidate.sid FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *`;
  return rows[0] || null;
}
async function finishInbound(sql, message, errorCode = null) {
  await sql`UPDATE bof_sms_inbound SET status = ${errorCode ? 'failed' : 'done'}, completed_at = NOW(),
    lease_until = NULL, error_code = ${errorCode} WHERE sid = ${message.sid} AND status = 'processing'`;
}
async function retryInbound(sql, message, errorCode) {
  await sql`UPDATE bof_sms_inbound SET status = ${message.attempts >= 5 ? 'failed' : 'pending'},
    lease_until = NULL, error_code = ${errorCode} WHERE sid = ${message.sid} AND status = 'processing'`;
}
async function getSession(sql, id) { return (await sql`SELECT * FROM bof_sms_sessions WHERE id = ${id} LIMIT 1`)[0] || null; }
async function activeSession(sql, phone) {
  return (await sql`SELECT * FROM bof_sms_sessions WHERE phone = ${phone} AND expires_at > NOW()
    AND step NOT IN ('PAID', 'CANCELED') ORDER BY created_at DESC LIMIT 1`)[0] || null;
}
async function createSession(sql, phone, id = randomUUID()) {
  const inserted = await sql`INSERT INTO bof_sms_sessions(id, phone, config, checkout_key, expires_at)
    VALUES (${id}, ${phone}, ${JSON.stringify({ product_type: 'banner', quantity: 1, fit_mode: 'fill' })}::jsonb,
      ${`sms_${randomUUID().replaceAll('-', '')}`}, NOW() + INTERVAL '7 days') ON CONFLICT DO NOTHING RETURNING *`;
  return inserted[0] || getSession(sql, id);
}

// Commit the new conversation state, reply, and inbound acknowledgement together.
// A retry after a lost database response cannot advance the conversation twice.
async function commitInbound(sql, message, session, changes, body, mediaUrl = null) {
  const next = { ...session, ...changes };
  const rows = await sql`WITH changed AS (
    UPDATE bof_sms_sessions SET step = ${next.step}, config = ${JSON.stringify(next.config)}::jsonb,
      artwork = ${next.artwork ? JSON.stringify(next.artwork) : null}::jsonb,
      revision = ${next.revision}, approved_revision = ${next.approved_revision ?? null},
      error_code = ${next.error_code ?? null}, last_inbound_sid = ${message.sid}, updated_at = NOW()
    WHERE id = ${session.id} AND revision = ${session.revision} AND step = ${session.step}
      AND step NOT IN ('PAID', 'CANCELED') RETURNING id
  ), queued AS (
    INSERT INTO bof_sms_outbox(id, dedupe_key, session_id, phone, body, media_url, units)
    SELECT ${randomUUID()}, ${`inbound:${message.sid}`}, id, ${session.phone}, ${body}, ${mediaUrl}, ${messageUnits(body, mediaUrl)} FROM changed
    ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
  ) UPDATE bof_sms_inbound SET status = 'done', session_id = ${session.id}, completed_at = NOW(), lease_until = NULL
    WHERE sid = ${message.sid} AND EXISTS (SELECT 1 FROM changed) RETURNING sid`;
  if (!rows[0]) throw Object.assign(new Error('Conversation changed during processing.'), { code: 'SMS_SESSION_CHANGED', statusCode: 409 });
}

async function claimReply(sql, config) {
  const rows = await sql`WITH candidate AS MATERIALIZED (
    SELECT o.* FROM bof_sms_outbox o
    WHERE o.status = 'pending' AND o.attempts < 3
      AND NOT EXISTS (SELECT 1 FROM bof_sms_contacts c WHERE c.phone = o.phone AND c.opted_out)
      AND NOT EXISTS (SELECT 1 FROM bof_sms_outbox earlier WHERE earlier.phone = o.phone
        AND (earlier.created_at, earlier.id) < (o.created_at, o.id) AND earlier.status IN ('pending', 'sending'))
    ORDER BY o.created_at, o.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), reserved AS (
    UPDATE bof_sms_budget SET
      daily_units = (CASE WHEN day = CURRENT_DATE THEN daily_units ELSE 0 END) + (SELECT units FROM candidate),
      monthly_units = (CASE WHEN month = DATE_TRUNC('month', NOW())::date THEN monthly_units ELSE 0 END) + (SELECT units FROM candidate),
      day = CURRENT_DATE, month = DATE_TRUNC('month', NOW())::date
    WHERE id = 1 AND EXISTS (SELECT 1 FROM candidate)
      AND (CASE WHEN day = CURRENT_DATE THEN daily_units ELSE 0 END) + (SELECT units FROM candidate) <= ${config.dailyMessages}
      AND (CASE WHEN month = DATE_TRUNC('month', NOW())::date THEN monthly_units ELSE 0 END) + (SELECT units FROM candidate) <= ${config.monthlyMessages}
    RETURNING id
  ) UPDATE bof_sms_outbox SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
    WHERE id = (SELECT id FROM candidate) AND EXISTS (SELECT 1 FROM reserved) RETURNING *`;
  return rows[0] || null;
}
async function saveSession(sql, session, changes = {}) {
  const next = { ...session, ...changes };
  const rows = await sql`UPDATE bof_sms_sessions SET step = ${next.step}, config = ${JSON.stringify(next.config)}::jsonb,
      artwork = ${next.artwork ? JSON.stringify(next.artwork) : null}::jsonb,
      revision = ${next.revision}, approved_revision = ${next.approved_revision ?? null},
      error_code = ${next.error_code ?? null}, updated_at = NOW()
    WHERE id = ${session.id} AND revision = ${session.revision} AND step = ${session.step}
    RETURNING *`;
  if (!rows[0]) throw Object.assign(new Error('Your order changed. Please refresh and try again.'), { code: 'SMS_SESSION_CHANGED', statusCode: 409 });
  return rows[0];
}

// Count SMS segments rather than assuming one API request equals one billed text.
const GSM = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const EXTENDED = new Set('^{}\\[~]|€');
function messageUnits(body, mediaUrl) {
  if (mediaUrl) return 1;
  let count = 0;
  for (const character of String(body)) {
    if (GSM.has(character)) count += 1;
    else if (EXTENDED.has(character)) count += 2;
    else return body.length <= 70 ? 1 : Math.ceil(body.length / 67);
  }
  return count <= 160 ? 1 : Math.ceil(count / 153);
}
async function queueReply(sql, { key, session, phone = session?.phone, body, mediaUrl = null }) {
  if (!body || !phone) return;
  await sql`INSERT INTO bof_sms_outbox(id, dedupe_key, session_id, phone, body, media_url, units)
    VALUES (${randomUUID()}, ${key}, ${session?.id || null}, ${phone}, ${body}, ${mediaUrl}, ${messageUnits(body, mediaUrl)})
    ON CONFLICT (dedupe_key) DO NOTHING`;
}
async function optedOut(sql, phone) { return (await sql`SELECT opted_out FROM bof_sms_contacts WHERE phone = ${phone}`)[0]?.opted_out === true; }
async function setOptOut(sql, phone, value) {
  await sql`INSERT INTO bof_sms_contacts(phone, opted_out) VALUES (${phone}, ${value})
    ON CONFLICT(phone) DO UPDATE SET opted_out = ${value}, updated_at = NOW()`;
  if (value) await sql`UPDATE bof_sms_outbox SET status = 'suppressed', updated_at = NOW()
    WHERE phone = ${phone} AND status = 'pending'`;
}
async function sessionCount(sql, id) {
  const rows = await sql`SELECT COALESCE(SUM(units), 0)::integer AS count FROM bof_sms_outbox WHERE session_id = ${id}`;
  return Number(rows[0]?.count || 0);
}

module.exports = { database, ensureSchema, receive, claimInbound, finishInbound, retryInbound, getSession, activeSession, createSession, saveSession, commitInbound, claimReply, queueReply, optedOut, setOptOut, messageUnits, sessionCount };
