-- Durable, fair retry state for bounded PayPal settlement reconciliation.
-- Provider recovery runs in a scheduled background worker; Admin reads never
-- perform provider I/O or reuse business-facing orders.updated_at as a lease.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('admin-payment-reconciliation-v1')::bigint);

CREATE TABLE IF NOT EXISTS public.admin_payment_reconciliation_queue (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  paypal_order_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_payment_reconciliation_attempt_count_nonnegative
    CHECK (attempt_count >= 0),
  CONSTRAINT admin_payment_reconciliation_lease_pair
    CHECK (
      (lease_token IS NULL AND lease_until IS NULL)
      OR (lease_token IS NOT NULL AND lease_until IS NOT NULL)
    )
);

-- Keep reruns and interrupted rolling deployments additive even if a prior
-- version created the table before every queue column was present.
ALTER TABLE public.admin_payment_reconciliation_queue
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS paypal_order_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $queue_types$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('order_id', 'uuid'::regtype),
        ('paypal_order_id', 'text'::regtype),
        ('attempt_count', 'integer'::regtype),
        ('last_attempt_at', 'timestamp with time zone'::regtype),
        ('next_attempt_at', 'timestamp with time zone'::regtype),
        ('lease_token', 'uuid'::regtype),
        ('lease_until', 'timestamp with time zone'::regtype),
        ('last_error', 'text'::regtype),
        ('created_at', 'timestamp with time zone'::regtype),
        ('updated_at', 'timestamp with time zone'::regtype)
      ) AS expected(attname, type_oid)
      JOIN pg_attribute attribute
        ON attribute.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND attribute.attname = expected.attname
     WHERE attribute.atttypid <> expected.type_oid
  ) THEN
    RAISE EXCEPTION 'admin payment reconciliation queue has incompatible column types';
  END IF;
END
$queue_types$;

ALTER TABLE public.admin_payment_reconciliation_queue
  ALTER COLUMN last_attempt_at DROP NOT NULL,
  ALTER COLUMN lease_token DROP NOT NULL,
  ALTER COLUMN lease_until DROP NOT NULL,
  ALTER COLUMN last_error DROP NOT NULL;

-- A partially deployed predecessor may have created the derived queue before
-- storing the provider generation. Recover it from the authoritative order;
-- stale rows with no provider generation are ineligible work, not business
-- history, and are safe to discard before enforcing the invariant.
UPDATE public.admin_payment_reconciliation_queue AS queue
   SET paypal_order_id = orders.paypal_order_id,
       updated_at = NOW()
  FROM public.orders
 WHERE queue.order_id = orders.id
   AND NULLIF(BTRIM(queue.paypal_order_id), '') IS NULL
   AND NULLIF(BTRIM(orders.paypal_order_id), '') IS NOT NULL;

DELETE FROM public.admin_payment_reconciliation_queue AS queue
 WHERE queue.order_id IS NULL
    OR NULLIF(BTRIM(queue.paypal_order_id), '') IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.orders WHERE orders.id = queue.order_id);

DELETE FROM public.admin_payment_reconciliation_queue AS duplicate
USING public.admin_payment_reconciliation_queue AS retained
 WHERE duplicate.order_id = retained.order_id
   AND duplicate.ctid < retained.ctid;

UPDATE public.admin_payment_reconciliation_queue
   SET attempt_count = GREATEST(COALESCE(attempt_count, 0), 0),
       next_attempt_at = COALESCE(next_attempt_at, NOW()),
       created_at = COALESCE(created_at, NOW()),
       updated_at = COALESCE(updated_at, NOW()),
       last_error = LEFT(last_error, 500),
       lease_token = CASE
         WHEN lease_token IS NULL OR lease_until IS NULL THEN NULL
         ELSE lease_token
       END,
       lease_until = CASE
         WHEN lease_token IS NULL OR lease_until IS NULL THEN NULL
         ELSE lease_until
       END;

ALTER TABLE public.admin_payment_reconciliation_queue
  ALTER COLUMN order_id SET NOT NULL,
  ALTER COLUMN paypal_order_id SET NOT NULL,
  ALTER COLUMN attempt_count SET DEFAULT 0,
  ALTER COLUMN attempt_count SET NOT NULL,
  ALTER COLUMN next_attempt_at SET DEFAULT NOW(),
  ALTER COLUMN next_attempt_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $queue_constraints$
DECLARE
  constraint_name text;
BEGIN
  -- A primary key on unrelated partial-rollout columns does not satisfy the
  -- worker's ON CONFLICT(order_id) contract.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_state
      JOIN pg_attribute order_id_column
        ON order_id_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND order_id_column.attname = 'order_id'
     WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND constraint_state.contype = 'p'
       AND constraint_state.conkey = ARRAY[order_id_column.attnum]::smallint[]
  ) THEN
    SELECT conname INTO constraint_name
      FROM pg_constraint
     WHERE conrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND contype = 'p'
     LIMIT 1;
    IF constraint_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.admin_payment_reconciliation_queue DROP CONSTRAINT %I',
        constraint_name
      );
    END IF;
    ALTER TABLE public.admin_payment_reconciliation_queue
      ADD CONSTRAINT admin_payment_reconciliation_queue_pkey PRIMARY KEY (order_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint constraint_state
     WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND constraint_state.conname = 'admin_payment_reconciliation_queue_order_id_fkey'
       AND NOT (
         constraint_state.contype = 'f'
         AND constraint_state.conkey = ARRAY[(
           SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.admin_payment_reconciliation_queue'::regclass
              AND attname = 'order_id'
         )]::smallint[]
         AND constraint_state.confrelid = 'public.orders'::regclass
         AND constraint_state.confkey = ARRAY[(
           SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.orders'::regclass AND attname = 'id'
         )]::smallint[]
         AND constraint_state.confdeltype = 'c'
       )
  ) THEN
    ALTER TABLE public.admin_payment_reconciliation_queue
      DROP CONSTRAINT admin_payment_reconciliation_queue_order_id_fkey;
  END IF;
  SELECT constraint_state.conname INTO constraint_name
    FROM pg_constraint constraint_state
    JOIN pg_attribute queue_order_id
      ON queue_order_id.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND queue_order_id.attname = 'order_id'
    JOIN pg_attribute orders_id
      ON orders_id.attrelid = 'public.orders'::regclass
     AND orders_id.attname = 'id'
   WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND constraint_state.contype = 'f'
     AND constraint_state.conkey = ARRAY[queue_order_id.attnum]::smallint[]
     AND constraint_state.confrelid = 'public.orders'::regclass
     AND constraint_state.confkey = ARRAY[orders_id.attnum]::smallint[]
     AND constraint_state.confdeltype = 'c'
   LIMIT 1;
  IF constraint_name IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.admin_payment_reconciliation_queue'::regclass
         AND conname = 'admin_payment_reconciliation_queue_order_id_fkey'
    ) THEN
      ALTER TABLE public.admin_payment_reconciliation_queue
        DROP CONSTRAINT admin_payment_reconciliation_queue_order_id_fkey;
    END IF;
    ALTER TABLE public.admin_payment_reconciliation_queue
      ADD CONSTRAINT admin_payment_reconciliation_queue_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
    constraint_name := 'admin_payment_reconciliation_queue_order_id_fkey';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.admin_payment_reconciliation_queue VALIDATE CONSTRAINT %I',
    constraint_name
  );

  IF EXISTS (
    SELECT 1 FROM pg_constraint constraint_state
     WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND constraint_state.conname = 'admin_payment_reconciliation_attempt_count_nonnegative'
       AND NOT (
         constraint_state.contype = 'c'
         AND regexp_replace(
               LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
               '[[:space:]()]', '', 'g'
             ) = 'attempt_count>=0'
       )
  ) THEN
    ALTER TABLE public.admin_payment_reconciliation_queue
      DROP CONSTRAINT admin_payment_reconciliation_attempt_count_nonnegative;
  END IF;
  SELECT constraint_state.conname INTO constraint_name
    FROM pg_constraint constraint_state
   WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND constraint_state.contype = 'c'
     AND regexp_replace(
           LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
           '[[:space:]()]', '', 'g'
         ) = 'attempt_count>=0'
   LIMIT 1;
  IF constraint_name IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.admin_payment_reconciliation_queue'::regclass
         AND conname = 'admin_payment_reconciliation_attempt_count_nonnegative'
    ) THEN
      ALTER TABLE public.admin_payment_reconciliation_queue
        DROP CONSTRAINT admin_payment_reconciliation_attempt_count_nonnegative;
    END IF;
    ALTER TABLE public.admin_payment_reconciliation_queue
      ADD CONSTRAINT admin_payment_reconciliation_attempt_count_nonnegative
      CHECK (attempt_count >= 0) NOT VALID;
    constraint_name := 'admin_payment_reconciliation_attempt_count_nonnegative';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.admin_payment_reconciliation_queue VALIDATE CONSTRAINT %I',
    constraint_name
  );

  IF EXISTS (
    SELECT 1 FROM pg_constraint constraint_state
     WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND constraint_state.conname = 'admin_payment_reconciliation_lease_pair'
       AND NOT (
         constraint_state.contype = 'c'
         AND regexp_replace(
               LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
               '[[:space:]()]', '', 'g'
             ) = 'lease_tokenisnullandlease_untilisnullorlease_tokenisnotnullandlease_untilisnotnull'
       )
  ) THEN
    ALTER TABLE public.admin_payment_reconciliation_queue
      DROP CONSTRAINT admin_payment_reconciliation_lease_pair;
  END IF;
  SELECT constraint_state.conname INTO constraint_name
    FROM pg_constraint constraint_state
   WHERE constraint_state.conrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND constraint_state.contype = 'c'
     AND regexp_replace(
           LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
           '[[:space:]()]', '', 'g'
         ) = 'lease_tokenisnullandlease_untilisnullorlease_tokenisnotnullandlease_untilisnotnull'
   LIMIT 1;
  IF constraint_name IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.admin_payment_reconciliation_queue'::regclass
         AND conname = 'admin_payment_reconciliation_lease_pair'
    ) THEN
      ALTER TABLE public.admin_payment_reconciliation_queue
        DROP CONSTRAINT admin_payment_reconciliation_lease_pair;
    END IF;
    ALTER TABLE public.admin_payment_reconciliation_queue
      ADD CONSTRAINT admin_payment_reconciliation_lease_pair CHECK (
        (lease_token IS NULL AND lease_until IS NULL)
        OR (lease_token IS NOT NULL AND lease_until IS NOT NULL)
      ) NOT VALID;
    constraint_name := 'admin_payment_reconciliation_lease_pair';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.admin_payment_reconciliation_queue VALIDATE CONSTRAINT %I',
    constraint_name
  );
END
$queue_constraints$;

DO $queue_indexes$
BEGIN
  -- Bind index readiness to this table and these exact keys. If a partial
  -- predecessor reused the canonical name with the wrong definition, replace
  -- only that derived queue index inside this transaction.
  IF EXISTS (
    SELECT 1 FROM pg_class index_class
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
     WHERE index_class.relnamespace = 'public'::regnamespace
       AND index_class.relname = 'idx_admin_payment_reconciliation_order_id_unique'
       AND index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND NOT (
         index_state.indisunique AND index_state.indisvalid AND index_state.indisready
         AND index_state.indpred IS NULL AND index_state.indexprs IS NULL
         AND index_state.indnkeyatts = 1 AND index_state.indnatts = 1
         AND index_state.indkey::text = (
           SELECT attnum::text FROM pg_attribute
            WHERE attrelid = 'public.admin_payment_reconciliation_queue'::regclass
              AND attname = 'order_id'
         )
       )
  ) THEN
    DROP INDEX public.idx_admin_payment_reconciliation_order_id_unique;
  END IF;
  IF to_regclass('public.idx_admin_payment_reconciliation_order_id_unique') IS NULL THEN
    CREATE UNIQUE INDEX idx_admin_payment_reconciliation_order_id_unique
      ON public.admin_payment_reconciliation_queue (order_id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index index_state
    JOIN pg_attribute order_id_column
      ON order_id_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND order_id_column.attname = 'order_id'
     WHERE index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND index_state.indisunique AND index_state.indisvalid AND index_state.indisready
       AND index_state.indpred IS NULL AND index_state.indexprs IS NULL
       AND index_state.indnkeyatts = 1 AND index_state.indnatts = 1
       AND index_state.indkey::text = order_id_column.attnum::text
  ) THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON public.admin_payment_reconciliation_queue (order_id)',
      'apr_order_id_uq_' || 'public.admin_payment_reconciliation_queue'::regclass::oid
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class index_class
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
     WHERE index_class.relnamespace = 'public'::regnamespace
       AND index_class.relname = 'idx_admin_payment_reconciliation_due'
       AND index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND NOT (
         NOT index_state.indisunique AND index_state.indisvalid AND index_state.indisready
         AND index_state.indpred IS NULL AND index_state.indexprs IS NULL
         AND index_state.indnkeyatts = 4 AND index_state.indnatts = 4
         AND index_state.indkey::text = (
           SELECT CONCAT_WS(' ', next_attempt.attnum, lease_until.attnum, updated_at.attnum, order_id.attnum)
             FROM pg_attribute next_attempt
             JOIN pg_attribute lease_until ON lease_until.attrelid = next_attempt.attrelid
               AND lease_until.attname = 'lease_until'
             JOIN pg_attribute updated_at ON updated_at.attrelid = next_attempt.attrelid
               AND updated_at.attname = 'updated_at'
             JOIN pg_attribute order_id ON order_id.attrelid = next_attempt.attrelid
               AND order_id.attname = 'order_id'
            WHERE next_attempt.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
              AND next_attempt.attname = 'next_attempt_at'
         )
         AND index_state.indoption::text = '0 2 0 0'
       )
  ) THEN
    DROP INDEX public.idx_admin_payment_reconciliation_due;
  END IF;
  IF to_regclass('public.idx_admin_payment_reconciliation_due') IS NULL THEN
    CREATE INDEX idx_admin_payment_reconciliation_due
      ON public.admin_payment_reconciliation_queue (
        next_attempt_at ASC,
        lease_until ASC NULLS FIRST,
        updated_at ASC,
        order_id ASC
      );
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index index_state
    JOIN pg_attribute next_attempt_column
      ON next_attempt_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND next_attempt_column.attname = 'next_attempt_at'
    JOIN pg_attribute lease_until_column
      ON lease_until_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND lease_until_column.attname = 'lease_until'
    JOIN pg_attribute updated_at_column
      ON updated_at_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND updated_at_column.attname = 'updated_at'
    JOIN pg_attribute order_id_column
      ON order_id_column.attrelid = 'public.admin_payment_reconciliation_queue'::regclass
     AND order_id_column.attname = 'order_id'
     WHERE index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
       AND NOT index_state.indisunique AND index_state.indisvalid AND index_state.indisready
       AND index_state.indpred IS NULL AND index_state.indexprs IS NULL
       AND index_state.indnkeyatts = 4 AND index_state.indnatts = 4
       AND index_state.indkey::text = CONCAT_WS(' ', next_attempt_column.attnum,
             lease_until_column.attnum, updated_at_column.attnum, order_id_column.attnum)
       AND index_state.indoption::text = '0 2 0 0'
  ) THEN
    EXECUTE format(
      'CREATE INDEX %I ON public.admin_payment_reconciliation_queue '
      || '(next_attempt_at ASC, lease_until ASC NULLS FIRST, updated_at ASC, order_id ASC)',
      'apr_due_' || 'public.admin_payment_reconciliation_queue'::regclass::oid
    );
  END IF;
END
$queue_indexes$;

COMMIT;
