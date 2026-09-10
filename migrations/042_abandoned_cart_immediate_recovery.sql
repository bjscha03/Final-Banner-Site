-- Immediate abandoned-cart recovery scheduling, cross-device checkout state,
-- and the complete production recovery funnel event vocabulary.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

ALTER TABLE abandoned_carts
  ADD COLUMN IF NOT EXISTS abandonment_signaled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_recovery_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_state JSONB;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovery_due
  ON abandoned_carts(first_recovery_due_at, last_activity_at)
  WHERE recovery_status = 'active';

DO $recovery_event_constraint$
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
    'cart_abandoned', 'cart_created', 'cart_reactivated', 'cart_recovered',
    'coupon_expired', 'coupon_issued', 'coupon_used', 'discount_applied',
    'email_bounced', 'email_captured', 'email_clicked', 'email_complained',
    'email_delivered', 'email_failed', 'email_opened', 'email_sent',
    'email_suppressed', 'recovery_link_clicked', 'sms_sent'
  ]::TEXT[] THEN
    ALTER TABLE cart_recovery_logs
      DROP CONSTRAINT IF EXISTS cart_recovery_logs_event_type_check;
    ALTER TABLE cart_recovery_logs
      ADD CONSTRAINT cart_recovery_logs_event_type_check
      CHECK (event_type IN (
        'cart_abandoned', 'cart_created', 'cart_reactivated', 'cart_recovered',
        'coupon_expired', 'coupon_issued', 'coupon_used', 'discount_applied',
        'email_bounced', 'email_captured', 'email_clicked', 'email_complained',
        'email_delivered', 'email_failed', 'email_opened', 'email_sent',
        'email_suppressed', 'recovery_link_clicked', 'sms_sent'
      ));
  END IF;
END
$recovery_event_constraint$;

COMMIT;
