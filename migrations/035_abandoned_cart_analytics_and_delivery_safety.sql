-- Abandoned-cart progressive checkout capture, analytics, and recovery-send safety.
-- Additive and repeatable. Existing carts and recovery history are preserved.

BEGIN;

-- Coordinate direct migrations with the rolling-deploy runtime bootstrap.
SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

ALTER TABLE abandoned_carts
  ADD COLUMN IF NOT EXISTS checkout_stage TEXT,
  ADD COLUMN IF NOT EXISTS checkout_stage_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS normalized_email TEXT,
  ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER,
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tax_cents INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_total_cents INTEGER,
  ADD COLUMN IF NOT EXISTS has_artwork BOOLEAN,
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_last_name TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email_claim_sequence SMALLINT,
  ADD COLUMN IF NOT EXISTS recovery_email_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_recovery_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_suppressed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_suppression_reason TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email_last_error TEXT;

-- New paid orders keep an exact, validated link to the recovery source.
-- Historical rows remain NULL and use only conservative fallback attribution.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS abandoned_cart_id UUID;

-- Migration 004 created this column with an FK, but some partially repaired
-- databases may already have the plain UUID column. Clear only impossible
-- orphan links, then restore the intended relationship without rewriting
-- valid order history.
UPDATE orders AS order_row
SET abandoned_cart_id = NULL
WHERE abandoned_cart_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM abandoned_carts AS cart
     WHERE cart.id = order_row.abandoned_cart_id
  );

DO $order_cart_fk$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND conname = 'orders_abandoned_cart_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND conname = 'orders_abandoned_cart_id_fkey'
       AND confrelid = 'abandoned_carts'::regclass
       AND confdeltype = 'n'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_abandoned_cart_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND conname = 'orders_abandoned_cart_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_abandoned_cart_id_fkey
      FOREIGN KEY (abandoned_cart_id)
      REFERENCES abandoned_carts(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$order_cart_fk$;

ALTER TABLE orders
  VALIDATE CONSTRAINT orders_abandoned_cart_id_fkey;

CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_id
  ON orders(abandoned_cart_id)
  WHERE abandoned_cart_id IS NOT NULL;

-- Older application-only previews briefly introduced defaults for stage and
-- artwork. Remove the constraints, then repair only rows without the timestamp
-- stamped by every authoritative snapshot writer. Those historical values were
-- fabricated by the preview defaults and must remain honestly unknown.
ALTER TABLE abandoned_carts
  ALTER COLUMN checkout_stage DROP DEFAULT,
  ALTER COLUMN checkout_stage DROP NOT NULL,
  ALTER COLUMN has_artwork DROP NOT NULL,
  ALTER COLUMN has_artwork DROP DEFAULT;

UPDATE abandoned_carts
SET checkout_stage = NULL,
    has_artwork = NULL
WHERE checkout_stage_updated_at IS NULL
  AND (checkout_stage IS NOT NULL OR has_artwork IS NOT NULL);

-- Besides making any future anomaly cheap to inspect, this catalog object is
-- the durable completion marker used by rolling runtime schema checks.
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_historical_unknown_repair_v1
  ON abandoned_carts(id)
  WHERE checkout_stage_updated_at IS NULL
    AND (checkout_stage IS NOT NULL OR has_artwork IS NOT NULL);

UPDATE abandoned_carts
SET subtotal_cents = COALESCE(subtotal_cents, ROUND(total_value * 100)::INTEGER),
    normalized_email = NULLIF(LOWER(BTRIM(email)), '')
WHERE subtotal_cents IS NULL
   OR normalized_email IS DISTINCT FROM NULLIF(LOWER(BTRIM(email)), '');

-- Historical total_value represented only the sum of client line totals. It is
-- safe to preserve that value as a legacy subtotal, but historical discounts,
-- tax, and final checkout estimates are unknowable and intentionally stay NULL.
-- Historical artwork presence is likewise left NULL. New snapshot writes send
-- an explicit boolean; rolling older writers that omit the field must continue
-- to produce unknown rather than fabricating a negative value.

-- Older databases received these indexes through an unnumbered repair script.
-- Reconcile any pre-index duplicate active rows without deleting their history,
-- then make the upsert targets durable for every environment.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_activity_at DESC, created_at DESC, id DESC) AS row_number
  FROM abandoned_carts
  WHERE recovery_status = 'active' AND user_id IS NOT NULL
)
UPDATE abandoned_carts AS cart
SET recovery_status = 'expired', updated_at = NOW()
FROM ranked
WHERE cart.id = ranked.id AND ranked.row_number > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY last_activity_at DESC, created_at DESC, id DESC) AS row_number
  FROM abandoned_carts
  WHERE recovery_status = 'active' AND session_id IS NOT NULL
)
UPDATE abandoned_carts AS cart
SET recovery_status = 'expired', updated_at = NOW()
FROM ranked
WHERE cart.id = ranked.id AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_user_active
  ON abandoned_carts(user_id)
  WHERE recovery_status = 'active' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_session_active
  ON abandoned_carts(session_id)
  WHERE recovery_status = 'active' AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_checkout_stage
  ON abandoned_carts(checkout_stage, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email_presence
  ON abandoned_carts((NULLIF(BTRIM(email), '') IS NOT NULL), last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_normalized_email
  ON abandoned_carts(normalized_email, last_activity_at DESC)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_estimated_total
  ON abandoned_carts(estimated_total_cents, last_activity_at DESC);

-- A durable sequence ledger complements the short-lived claim fields on the
-- cart. The unique key is the final guard against concurrent cron/manual sends.
CREATE TABLE IF NOT EXISTS cart_recovery_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  abandoned_cart_id UUID NOT NULL REFERENCES abandoned_carts(id) ON DELETE CASCADE,
  sequence_number SMALLINT NOT NULL CHECK (sequence_number BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'sent', 'failed', 'skipped', 'suppressed')),
  provider_message_id TEXT,
  discount_code TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (abandoned_cart_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_cart_recovery_deliveries_status
  ON cart_recovery_deliveries(status, claimed_at);

-- Recovery-specific opt-outs are kept separate from cold-outreach exclusions
-- such as `prior_customer`, which must never be interpreted as an unsubscribe.
CREATE TABLE IF NOT EXISTS recovery_email_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  normalized_email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'recovery_unsubscribe',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_email_suppressions_active
  ON recovery_email_suppressions(normalized_email)
  WHERE active = TRUE;

-- Reconcile legacy webhook values with the exact provider event vocabulary.
-- Comparing the full sorted literal set avoids accepting an intermediate
-- constraint merely because it happens to include one recently-added value.
DO $schema_repair$
DECLARE
  current_definition TEXT;
  current_values TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'cart_recovery_logs'::regclass
     AND conname = 'cart_recovery_logs_event_type_check';

  SELECT ARRAY_AGG(match_values[1] ORDER BY match_values[1])
    INTO current_values
    FROM regexp_matches(COALESCE(current_definition, ''), '''([^'']+)''', 'g')
      AS matched(match_values);

  IF current_values IS DISTINCT FROM ARRAY[
    'cart_recovered', 'discount_applied', 'email_bounced', 'email_clicked',
    'email_complained', 'email_delivered', 'email_failed', 'email_opened',
    'email_sent', 'email_suppressed', 'sms_sent'
  ]::TEXT[] THEN
    ALTER TABLE cart_recovery_logs
      DROP CONSTRAINT IF EXISTS cart_recovery_logs_event_type_check;
    ALTER TABLE cart_recovery_logs
      ADD CONSTRAINT cart_recovery_logs_event_type_check
      CHECK (event_type IN (
        'email_sent', 'email_delivered', 'email_opened', 'email_clicked',
        'email_bounced', 'email_complained', 'email_failed', 'email_suppressed',
        'sms_sent', 'cart_recovered', 'discount_applied'
      ));
  END IF;
END
$schema_repair$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_recovery_logs_provider_event
  ON cart_recovery_logs((metadata->>'provider_event_id'))
  WHERE NULLIF(metadata->>'provider_event_id', '') IS NOT NULL;

-- Customer aggregation and paid-order recovery both normalize email exactly
-- this way. The expression index prevents those reads from degrading to scans.
CREATE INDEX IF NOT EXISTS idx_orders_normalized_email_created_at
  ON orders((LOWER(BTRIM(email))), created_at DESC)
  WHERE NULLIF(BTRIM(email), '') IS NOT NULL;

COMMIT;
