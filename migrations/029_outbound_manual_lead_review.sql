-- Manual review and permissioned, one-at-a-time marketing delivery.
--
-- This migration is additive and outbound-only. It does not enable automatic
-- sending or weaken the independent cold-outreach provider-policy lock.

BEGIN;

CREATE TABLE IF NOT EXISTS outbound_manual_lead_reviews (
  prospect_id UUID PRIMARY KEY REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  permission_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (permission_status IN ('unknown', 'explicit_opt_in')),
  permission_evidence TEXT,
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  send_state TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (send_state IN ('not_sent', 'processing', 'sent', 'failed')),
  send_key TEXT UNIQUE,
  send_attempt_count SMALLINT NOT NULL DEFAULT 0
    CHECK (send_attempt_count BETWEEN 0 AND 20),
  resend_message_id TEXT UNIQUE,
  last_send_error_code TEXT,
  send_started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    review_status <> 'approved'
    OR (
      permission_status = 'explicit_opt_in'
      AND LENGTH(TRIM(COALESCE(permission_evidence, ''))) BETWEEN 8 AND 1000
      AND reviewed_at IS NOT NULL
      AND LENGTH(TRIM(COALESCE(reviewed_by, ''))) BETWEEN 3 AND 320
    )
  ),
  CHECK (send_state <> 'sent' OR (sent_at IS NOT NULL AND resend_message_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS outbound_manual_lead_reviews_queue_idx
  ON outbound_manual_lead_reviews (review_status, send_state, updated_at DESC);

ALTER TABLE outbound_daily_delivery_counters
  ADD COLUMN IF NOT EXISTS manual_attempted_count INTEGER NOT NULL DEFAULT 0
    CHECK (manual_attempted_count >= 0),
  ADD COLUMN IF NOT EXISTS manual_sent_count INTEGER NOT NULL DEFAULT 0
    CHECK (manual_sent_count >= 0);

COMMIT;
