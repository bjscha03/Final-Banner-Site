BEGIN;

SELECT pg_advisory_xact_lock(hashtext('recovery-large-banner-discount-v1')::bigint);

DROP INDEX IF EXISTS public.idx_discount_codes_large_banner_recovery_active;
DROP INDEX IF EXISTS public.idx_cart_recovery_logs_idempotency_key;

ALTER TABLE public.discount_codes
  DROP CONSTRAINT IF EXISTS discount_codes_large_banner_activation_check,
  DROP CONSTRAINT IF EXISTS discount_codes_large_banner_campaign_check,
  DROP CONSTRAINT IF EXISTS discount_codes_max_discount_amount_check,
  DROP CONSTRAINT IF EXISTS discount_codes_eligible_cart_item_ids_check,
  DROP CONSTRAINT IF EXISTS discount_codes_discount_scope_check,
  DROP COLUMN IF EXISTS activated_at,
  DROP COLUMN IF EXISTS max_discount_amount_cents,
  DROP COLUMN IF EXISTS eligible_cart_item_ids,
  DROP COLUMN IF EXISTS discount_scope;

COMMIT;
