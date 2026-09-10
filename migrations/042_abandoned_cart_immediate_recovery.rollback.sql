-- Roll back immediate recovery scheduling without deleting recovery history.
-- The prior event constraint is added NOT VALID so production rows containing
-- newer funnel events remain intact while older writers regain their contract.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

DROP INDEX IF EXISTS idx_abandoned_carts_recovery_due;

ALTER TABLE abandoned_carts
  DROP COLUMN IF EXISTS checkout_state,
  DROP COLUMN IF EXISTS first_recovery_due_at,
  DROP COLUMN IF EXISTS abandonment_signaled_at;

ALTER TABLE cart_recovery_logs
  DROP CONSTRAINT IF EXISTS cart_recovery_logs_event_type_check;

ALTER TABLE cart_recovery_logs
  ADD CONSTRAINT cart_recovery_logs_event_type_check
  CHECK (event_type IN (
    'cart_recovered', 'discount_applied', 'email_bounced', 'email_clicked',
    'email_complained', 'email_delivered', 'email_failed', 'email_opened',
    'email_sent', 'email_suppressed', 'sms_sent'
  )) NOT VALID;

COMMIT;
