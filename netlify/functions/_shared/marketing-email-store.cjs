'use strict';

const SEPTEMBER_PROMO_CAMPAIGN_KEY = 'september-large-banner-2026';
const SEPTEMBER_PROMO_PROCESSING_LEASE_MINUTES = 10;

let schemaPromise = null;

async function ensureMarketingEmailSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
      await sql`
        CREATE TABLE IF NOT EXISTS marketing_email_suppressions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          normalized_email TEXT NOT NULL UNIQUE,
          reason TEXT NOT NULL CHECK (reason IN (
            'unsubscribe', 'spam_complaint', 'hard_bounce', 'provider_suppressed', 'admin'
          )),
          source TEXT NOT NULL CHECK (source IN (
            'footer_link', 'list_unsubscribe', 'resend_webhook', 'admin'
          )),
          campaign_key TEXT,
          first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          CHECK (normalized_email = LOWER(normalized_email))
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS marketing_email_sends (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          campaign_key TEXT NOT NULL,
          normalized_email TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          recipient_name TEXT,
          subject TEXT NOT NULL,
          sending_admin_id TEXT,
          sending_admin_email TEXT,
          status TEXT NOT NULL CHECK (status IN (
            'processing', 'sent', 'error', 'unsubscribed', 'complained', 'bounced', 'suppressed'
          )),
          request_id TEXT NOT NULL,
          provider_idempotency_key TEXT NOT NULL UNIQUE,
          resend_message_id TEXT,
          unsubscribe_token_hash TEXT NOT NULL UNIQUE,
          attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
          error_message TEXT,
          last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sent_at TIMESTAMPTZ,
          unsubscribed_at TIMESTAMPTZ,
          UNIQUE (campaign_key, normalized_email),
          CHECK (normalized_email = LOWER(normalized_email))
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS marketing_email_sends_campaign_status_idx
        ON marketing_email_sends (campaign_key, status, updated_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS marketing_email_sends_recipient_idx
        ON marketing_email_sends (normalized_email, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS marketing_email_suppressions_active_idx
        ON marketing_email_suppressions (normalized_email)
        WHERE active = TRUE
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function loadMarketingSendStatuses(sql, emails, campaignKey = SEPTEMBER_PROMO_CAMPAIGN_KEY) {
  const candidates = Array.from(new Set((emails || [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)));
  if (!candidates.length) return new Map();
  try {
    const rows = await sql(
      `SELECT normalized_email, status, sent_at, updated_at, error_message
         FROM marketing_email_sends
        WHERE campaign_key = $1
          AND normalized_email = ANY($2::text[])`,
      [campaignKey, candidates],
    );
    return new Map((rows || []).map((row) => [String(row.normalized_email).toLowerCase(), {
      status: String(row.status || 'not_sent'),
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      error: row.error_message ? String(row.error_message).slice(0, 500) : null,
    }]));
  } catch (error) {
    if (['42P01', '42703'].includes(String(error?.code || ''))) return new Map();
    throw error;
  }
}

function resetMarketingEmailSchemaForTests() {
  schemaPromise = null;
}

module.exports = {
  SEPTEMBER_PROMO_CAMPAIGN_KEY,
  SEPTEMBER_PROMO_PROCESSING_LEASE_MINUTES,
  ensureMarketingEmailSchema,
  loadMarketingSendStatuses,
  resetMarketingEmailSchemaForTests,
};
