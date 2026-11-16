-- Preserve exact physical measurements accepted by server-side pricing.
-- In particular, 30 inches of rope is 2.5 feet, not an integer.
-- NUMERIC widens the existing columns without rounding existing orders.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
ALTER TABLE public.order_items
  ALTER COLUMN width_in TYPE NUMERIC USING width_in::numeric,
  ALTER COLUMN height_in TYPE NUMERIC USING height_in::numeric,
  ALTER COLUMN rope_feet TYPE NUMERIC USING rope_feet::numeric;
COMMIT;
