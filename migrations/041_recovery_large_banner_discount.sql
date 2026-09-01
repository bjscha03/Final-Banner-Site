-- Server-authoritative scope for the one-hour large-banner recovery offer.
-- Existing promotions remain full-order discounts unless explicitly scoped.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('recovery-large-banner-discount-v1')::bigint);

ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS discount_scope TEXT NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS eligible_cart_item_ids JSONB,
  ADD COLUMN IF NOT EXISTS max_discount_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

DO $recovery_discount_constraints$
BEGIN
  ALTER TABLE public.discount_codes
    DROP CONSTRAINT IF EXISTS discount_codes_discount_scope_check,
    DROP CONSTRAINT IF EXISTS discount_codes_eligible_cart_item_ids_check,
    DROP CONSTRAINT IF EXISTS discount_codes_max_discount_amount_check,
    DROP CONSTRAINT IF EXISTS discount_codes_large_banner_campaign_check,
    DROP CONSTRAINT IF EXISTS discount_codes_large_banner_activation_check;

  ALTER TABLE public.discount_codes
    ADD CONSTRAINT discount_codes_discount_scope_check
      CHECK (discount_scope IN ('order', 'recovery_qualifying_banner_lines')),
    ADD CONSTRAINT discount_codes_eligible_cart_item_ids_check
      CHECK (
        eligible_cart_item_ids IS NULL
        OR (
          jsonb_typeof(eligible_cart_item_ids) = 'array'
          AND jsonb_array_length(eligible_cart_item_ids) BETWEEN 1 AND 50
        )
      ),
    ADD CONSTRAINT discount_codes_max_discount_amount_check
      CHECK (max_discount_amount_cents IS NULL OR max_discount_amount_cents > 0),
    ADD CONSTRAINT discount_codes_large_banner_campaign_check
      CHECK (
        campaign IS DISTINCT FROM 'abandoned_cart_large_banner_25'
        OR (
          discount_scope = 'recovery_qualifying_banner_lines'
          AND cart_id IS NOT NULL
          AND discount_percentage = 25
          AND eligible_cart_item_ids IS NOT NULL
          AND max_discount_amount_cents IS NOT NULL
        )
      ),
    ADD CONSTRAINT discount_codes_large_banner_activation_check
      CHECK (
        campaign IS DISTINCT FROM 'abandoned_cart_large_banner_25'
        OR activated_at IS NULL
        OR (
          expires_at > activated_at
          AND expires_at <= activated_at + INTERVAL '1 hour'
        )
      );
END
$recovery_discount_constraints$;

CREATE INDEX IF NOT EXISTS idx_discount_codes_large_banner_recovery_active
  ON public.discount_codes(cart_id, expires_at)
  WHERE campaign = 'abandoned_cart_large_banner_25'
    AND used = FALSE;

-- Payment browser completion and provider webhooks can race. Every recovery
-- funnel writer may supply a stable metadata idempotency key and safely use
-- ON CONFLICT DO NOTHING across those independent completion paths.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_recovery_logs_idempotency_key
  ON public.cart_recovery_logs((metadata->>'idempotency_key'))
  WHERE NULLIF(metadata->>'idempotency_key', '') IS NOT NULL;

COMMIT;
