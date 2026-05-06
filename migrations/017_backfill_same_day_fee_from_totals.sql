-- One-time repair for legacy paid orders where Same-Day Hit Service was charged
-- in the captured total but same_day_fee_cents / same_day_hit_service were not set.
-- Safe guards:
-- - Only updates paid orders.
-- - Only when stored same_day_fee_cents is null/zero.
-- - Only when residual total math is positive.
-- - Never alters total_cents (captured payment truth source).

WITH candidates AS (
  SELECT
    id,
    total_cents,
    subtotal_cents,
    tax_cents,
    COALESCE(saturday_fee_cents, 0) AS saturday_fee_cents,
    (total_cents - subtotal_cents - tax_cents - COALESCE(saturday_fee_cents, 0)) AS inferred_same_day_fee_cents
  FROM orders
  WHERE COALESCE(status, '') = 'paid'
    AND COALESCE(same_day_fee_cents, 0) = 0
    AND (total_cents - subtotal_cents - tax_cents - COALESCE(saturday_fee_cents, 0)) > 0
)
UPDATE orders o
SET
  same_day_fee_cents = c.inferred_same_day_fee_cents,
  same_day_hit_service = TRUE
FROM candidates c
WHERE o.id = c.id;
