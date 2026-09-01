'use strict';

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_SEED_LIMIT = 500;
const MAX_BACKOFF_SECONDS = 6 * 60 * 60;
const MIN_BACKOFF_SECONDS = 5 * 60;
let queueSchemaReady = false;

function buildSchemaReadinessQuery() {
  return `
    WITH target AS (
      SELECT to_regclass('public.admin_payment_reconciliation_queue') AS oid
    )
    SELECT (
      target.oid IS NOT NULL
      AND 10 = (
        SELECT COUNT(*)
          FROM pg_attribute attribute
         WHERE attribute.attrelid = target.oid
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
           AND attribute.attname = ANY (ARRAY[
             'order_id','paypal_order_id','attempt_count','last_attempt_at','next_attempt_at',
             'lease_token','lease_until','last_error','created_at','updated_at'
           ]::text[])
      )
      AND 6 = (
        SELECT COUNT(*)
          FROM pg_attribute attribute
         WHERE attribute.attrelid = target.oid
           AND attribute.attnotnull
           AND attribute.attname = ANY (ARRAY[
             'order_id','paypal_order_id','attempt_count','next_attempt_at','created_at','updated_at'
           ]::text[])
      )
      AND 4 = (
        SELECT COUNT(*)
          FROM pg_attribute attribute
         WHERE attribute.attrelid = target.oid
           AND attribute.atthasdef
           AND attribute.attname = ANY (ARRAY[
             'attempt_count','next_attempt_at','created_at','updated_at'
           ]::text[])
      )
      AND NOT EXISTS (
        SELECT 1
          FROM (VALUES
            ('order_id', 'uuid'::regtype, TRUE),
            ('paypal_order_id', 'text'::regtype, TRUE),
            ('attempt_count', 'integer'::regtype, TRUE),
            ('last_attempt_at', 'timestamp with time zone'::regtype, FALSE),
            ('next_attempt_at', 'timestamp with time zone'::regtype, TRUE),
            ('lease_token', 'uuid'::regtype, FALSE),
            ('lease_until', 'timestamp with time zone'::regtype, FALSE),
            ('last_error', 'text'::regtype, FALSE),
            ('created_at', 'timestamp with time zone'::regtype, TRUE),
            ('updated_at', 'timestamp with time zone'::regtype, TRUE)
          ) AS expected(attname, type_oid, required_not_null)
          LEFT JOIN pg_attribute attribute
            ON attribute.attrelid = target.oid
           AND attribute.attname = expected.attname
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
         WHERE attribute.attnum IS NULL
            OR attribute.atttypid <> expected.type_oid
            OR attribute.attnotnull IS DISTINCT FROM expected.required_not_null
      )
      AND NOT EXISTS (
        SELECT 1
          FROM (VALUES
            ('attempt_count', '0'),
            ('next_attempt_at', 'now()'),
            ('created_at', 'now()'),
            ('updated_at', 'now()')
          ) AS expected(attname, normalized_default)
          LEFT JOIN pg_attribute attribute
            ON attribute.attrelid = target.oid
           AND attribute.attname = expected.attname
          LEFT JOIN pg_attrdef default_state
            ON default_state.adrelid = target.oid
           AND default_state.adnum = attribute.attnum
         WHERE default_state.oid IS NULL
            OR regexp_replace(
                 LOWER(pg_get_expr(default_state.adbin, default_state.adrelid)),
                 '[[:space:]]', '', 'g'
               ) <> expected.normalized_default
      )
      AND EXISTS (
        SELECT 1
          FROM pg_constraint constraint_state
          JOIN pg_attribute order_id_column
            ON order_id_column.attrelid = target.oid
           AND order_id_column.attname = 'order_id'
         WHERE constraint_state.conrelid = target.oid
           AND constraint_state.contype = 'p'
           AND constraint_state.conkey = ARRAY[order_id_column.attnum]::smallint[]
      )
      AND EXISTS (
        SELECT 1
          FROM pg_constraint constraint_state
          JOIN pg_attribute queue_order_id
            ON queue_order_id.attrelid = target.oid
           AND queue_order_id.attname = 'order_id'
          JOIN pg_attribute orders_id
            ON orders_id.attrelid = 'public.orders'::regclass
           AND orders_id.attname = 'id'
         WHERE constraint_state.conrelid = target.oid
           AND constraint_state.contype = 'f'
           AND constraint_state.conkey = ARRAY[queue_order_id.attnum]::smallint[]
           AND constraint_state.confrelid = 'public.orders'::regclass
           AND constraint_state.confkey = ARRAY[orders_id.attnum]::smallint[]
           AND constraint_state.confdeltype = 'c'
           AND constraint_state.convalidated
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint constraint_state
         WHERE constraint_state.conrelid = target.oid
           AND constraint_state.contype = 'c'
           AND constraint_state.convalidated
           AND regexp_replace(
                 LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
                 '[[:space:]()]', '', 'g'
               ) = 'attempt_count>=0'
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint constraint_state
         WHERE constraint_state.conrelid = target.oid
           AND constraint_state.contype = 'c'
           AND constraint_state.convalidated
           AND regexp_replace(
                 LOWER(pg_get_expr(constraint_state.conbin, constraint_state.conrelid)),
                 '[[:space:]()]', '', 'g'
               ) = 'lease_tokenisnullandlease_untilisnullorlease_tokenisnotnullandlease_untilisnotnull'
      )
      AND EXISTS (
        SELECT 1 FROM pg_index index_state
        JOIN pg_attribute order_id_column
          ON order_id_column.attrelid = target.oid
         AND order_id_column.attname = 'order_id'
         WHERE index_state.indrelid = target.oid
           AND index_state.indisunique
           AND index_state.indisvalid
           AND index_state.indisready
           AND index_state.indpred IS NULL
           AND index_state.indexprs IS NULL
           AND index_state.indnkeyatts = 1
           AND index_state.indnatts = 1
           AND index_state.indkey::text = order_id_column.attnum::text
      )
      AND EXISTS (
        SELECT 1 FROM pg_index index_state
        JOIN pg_attribute next_attempt_column
          ON next_attempt_column.attrelid = target.oid
         AND next_attempt_column.attname = 'next_attempt_at'
        JOIN pg_attribute lease_until_column
          ON lease_until_column.attrelid = target.oid
         AND lease_until_column.attname = 'lease_until'
        JOIN pg_attribute updated_at_column
          ON updated_at_column.attrelid = target.oid
         AND updated_at_column.attname = 'updated_at'
        JOIN pg_attribute order_id_column
          ON order_id_column.attrelid = target.oid
         AND order_id_column.attname = 'order_id'
         WHERE index_state.indrelid = target.oid
           AND NOT index_state.indisunique
           AND index_state.indisvalid
           AND index_state.indisready
           AND index_state.indpred IS NULL
           AND index_state.indexprs IS NULL
           AND index_state.indnkeyatts = 4
           AND index_state.indnatts = 4
           AND index_state.indkey::text = CONCAT_WS(' ',
                 next_attempt_column.attnum,
                 lease_until_column.attnum,
                 updated_at_column.attnum,
                 order_id_column.attnum
               )
           AND index_state.indoption::text = '0 2 0 0'
      )
    ) AS ready
    FROM target`;
}

function buildRuntimeSchemaRepairSql() {
  return `DO $queue_schema$
  DECLARE
    constraint_name text;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('admin-payment-reconciliation-v1')::bigint);
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
      CONSTRAINT admin_payment_reconciliation_attempt_count_nonnegative CHECK (attempt_count >= 0),
      CONSTRAINT admin_payment_reconciliation_lease_pair CHECK (
        (lease_token IS NULL AND lease_until IS NULL)
        OR (lease_token IS NOT NULL AND lease_until IS NOT NULL)
      )
    );
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
    ALTER TABLE public.admin_payment_reconciliation_queue
      ALTER COLUMN last_attempt_at DROP NOT NULL,
      ALTER COLUMN lease_token DROP NOT NULL,
      ALTER COLUMN lease_until DROP NOT NULL,
      ALTER COLUMN last_error DROP NOT NULL;
    UPDATE public.admin_payment_reconciliation_queue AS queue
       SET paypal_order_id = orders.paypal_order_id
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
     WHERE duplicate.order_id = retained.order_id AND duplicate.ctid < retained.ctid;
    UPDATE public.admin_payment_reconciliation_queue
       SET attempt_count = GREATEST(COALESCE(attempt_count, 0), 0),
           next_attempt_at = COALESCE(next_attempt_at, NOW()),
           created_at = COALESCE(created_at, NOW()),
           updated_at = COALESCE(updated_at, NOW()),
           last_error = LEFT(last_error, 500),
           lease_token = CASE WHEN lease_token IS NULL OR lease_until IS NULL THEN NULL ELSE lease_token END,
           lease_until = CASE WHEN lease_token IS NULL OR lease_until IS NULL THEN NULL ELSE lease_until END;
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
        EXECUTE format('ALTER TABLE public.admin_payment_reconciliation_queue DROP CONSTRAINT %I', constraint_name);
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

    IF NOT EXISTS (
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
      IF EXISTS (
        SELECT 1 FROM pg_class index_class
        JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
         WHERE index_class.relnamespace = 'public'::regnamespace
           AND index_class.relname = 'idx_admin_payment_reconciliation_order_id_unique'
           AND index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
      ) THEN
        DROP INDEX public.idx_admin_payment_reconciliation_order_id_unique;
      END IF;
      IF to_regclass('public.idx_admin_payment_reconciliation_order_id_unique') IS NULL THEN
        CREATE UNIQUE INDEX idx_admin_payment_reconciliation_order_id_unique
          ON public.admin_payment_reconciliation_queue (order_id);
      ELSE
        EXECUTE format(
          'CREATE UNIQUE INDEX %I ON public.admin_payment_reconciliation_queue (order_id)',
          'apr_order_id_uq_' || 'public.admin_payment_reconciliation_queue'::regclass::oid
        );
      END IF;
    END IF;

    IF NOT EXISTS (
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
      IF EXISTS (
        SELECT 1 FROM pg_class index_class
        JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
         WHERE index_class.relnamespace = 'public'::regnamespace
           AND index_class.relname = 'idx_admin_payment_reconciliation_due'
           AND index_state.indrelid = 'public.admin_payment_reconciliation_queue'::regclass
      ) THEN
        DROP INDEX public.idx_admin_payment_reconciliation_due;
      END IF;
      IF to_regclass('public.idx_admin_payment_reconciliation_due') IS NULL THEN
        CREATE INDEX idx_admin_payment_reconciliation_due
          ON public.admin_payment_reconciliation_queue (
            next_attempt_at ASC, lease_until ASC NULLS FIRST, updated_at ASC, order_id ASC
          );
      ELSE
        EXECUTE format(
          'CREATE INDEX %I ON public.admin_payment_reconciliation_queue '
          || '(next_attempt_at ASC, lease_until ASC NULLS FIRST, updated_at ASC, order_id ASC)',
          'apr_due_' || 'public.admin_payment_reconciliation_queue'::regclass::oid
        );
      END IF;
    END IF;
  END
  $queue_schema$`;
}

async function ensureReconciliationQueueSchema(sql) {
  if (queueSchemaReady) return;
  const readiness = await sql(buildSchemaReadinessQuery(), []);
  if (readiness?.[0]?.ready !== true) {
    await sql(buildRuntimeSchemaRepairSql(), []);
    const verified = await sql(buildSchemaReadinessQuery(), []);
    if (verified?.[0]?.ready !== true) throw new Error('PAYPAL_RECONCILIATION_SCHEMA_NOT_READY');
  }
  queueSchemaReady = true;
}

function eligiblePayPalPredicate(alias, allowTestParameter) {
  return `LOWER(BTRIM(COALESCE(${alias}.payment_method, ''))) = 'paypal'
    AND NULLIF(BTRIM(COALESCE(${alias}.paypal_order_id, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(${alias}.stripe_payment_intent_id, '')), '') IS NULL
    AND (
      (
        LOWER(BTRIM(COALESCE(${alias}.status, ''))) = 'pending'
        AND NULLIF(BTRIM(COALESCE(${alias}.paypal_capture_id, '')), '') IS NULL
        AND LOWER(BTRIM(COALESCE(to_jsonb(${alias})->>'payment_reconciliation_status', ''))) <> 'complete'
      )
      OR (
        LOWER(BTRIM(COALESCE(${alias}.status, ''))) = ANY (
          ARRAY['paid','in_production','shipped','delivered','fulfilled','refunded']::text[]
        )
        AND NULLIF(BTRIM(COALESCE(${alias}.paypal_capture_id, '')), '') IS NOT NULL
        AND LOWER(BTRIM(COALESCE(to_jsonb(${alias})->>'payment_reconciliation_status', '')))
              = 'captured_bookkeeping_pending'
      )
    )
    AND (${allowTestParameter}::boolean OR LOWER(COALESCE(to_jsonb(${alias})->>'is_test_order', 'false')) <> 'true')`;
}

function seedLaneLimits(seedLimit) {
  const bounded = Math.max(1, Math.trunc(Number(seedLimit) || DEFAULT_SEED_LIMIT));
  if (bounded === 1) return { urgent: 0, recent: 0, oldestReserved: 1 };
  const urgent = Math.min(bounded - 1, Math.max(1, Math.floor(bounded * 0.2)));
  const recent = Math.min(
    bounded - urgent - 1,
    Math.max(0, Math.floor(bounded * 0.4)),
  );
  return { urgent, recent, oldestReserved: 1 };
}

function claimLaneLimits(batchSize) {
  const bounded = Math.max(1, Math.trunc(Number(batchSize) || DEFAULT_BATCH_SIZE));
  const oldestReserved = 1;
  const reserved = Math.max(0, bounded - oldestReserved);
  const urgent = Math.ceil(reserved / 2);
  const recent = reserved - urgent;
  return { urgent, recent, oldestReserved };
}

function compareRecentLaneCandidates(left, right, nowMs = Date.now()) {
  const cutoff = Number(nowMs) - (24 * 60 * 60 * 1000);
  const leftCreated = Date.parse(String(left?.created_at || '')) || 0;
  const rightCreated = Date.parse(String(right?.created_at || '')) || 0;
  const leftIsCurrent = leftCreated >= cutoff;
  const rightIsCurrent = rightCreated >= cutoff;
  if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  const leftNeverAttempted = Number(left?.attempt_count || 0) === 0;
  const rightNeverAttempted = Number(right?.attempt_count || 0) === 0;
  if (leftNeverAttempted !== rightNeverAttempted) return leftNeverAttempted ? -1 : 1;
  const leftDue = Date.parse(String(left?.next_attempt_at || '')) || 0;
  const rightDue = Date.parse(String(right?.next_attempt_at || '')) || 0;
  if (leftDue !== rightDue) return leftDue - rightDue;
  const leftUpdated = Date.parse(String(left?.updated_at || '')) || 0;
  const rightUpdated = Date.parse(String(right?.updated_at || '')) || 0;
  if (leftUpdated !== rightUpdated) return leftUpdated - rightUpdated;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function buildSeedQuery() {
  return `
    WITH eligible AS MATERIALIZED (
      SELECT orders.id AS order_id,
             orders.paypal_order_id,
             orders.created_at AS order_created_at,
             orders.updated_at AS order_updated_at,
             LOWER(BTRIM(COALESCE(
               to_jsonb(orders)->>'payment_reconciliation_status', ''
             ))) = 'captured_bookkeeping_pending' AS bookkeeping_pending
        FROM orders
        LEFT JOIN admin_payment_reconciliation_queue queue
          ON queue.order_id = orders.id
       WHERE (
             queue.order_id IS NULL
             OR queue.paypal_order_id IS DISTINCT FROM orders.paypal_order_id
           )
         AND ${eligiblePayPalPredicate('orders', '$2')}
    ), urgent_lane AS (
      SELECT eligible.*,
             1::integer AS lane_priority,
             ROW_NUMBER() OVER (
               ORDER BY eligible.order_updated_at ASC, eligible.order_id ASC
             ) AS lane_rank
        FROM eligible
       WHERE eligible.bookkeeping_pending
       ORDER BY eligible.order_updated_at ASC, eligible.order_id ASC
       LIMIT $3
    ), recent_lane AS (
      SELECT eligible.*,
             2::integer AS lane_priority,
             ROW_NUMBER() OVER (
               ORDER BY eligible.order_created_at DESC NULLS LAST, eligible.order_id DESC
             ) AS lane_rank
        FROM eligible
       WHERE NOT eligible.bookkeeping_pending
         AND NOT EXISTS (
           SELECT 1 FROM urgent_lane WHERE urgent_lane.order_id = eligible.order_id
         )
       ORDER BY eligible.order_created_at DESC NULLS LAST, eligible.order_id DESC
       LIMIT $4
    ), oldest_lane AS (
      SELECT eligible.*,
             3::integer AS lane_priority,
             ROW_NUMBER() OVER (
               ORDER BY eligible.order_created_at ASC, eligible.order_id ASC
             ) AS lane_rank
        FROM eligible
       WHERE NOT EXISTS (
               SELECT 1 FROM urgent_lane WHERE urgent_lane.order_id = eligible.order_id
             )
         AND NOT EXISTS (
               SELECT 1 FROM recent_lane WHERE recent_lane.order_id = eligible.order_id
             )
       ORDER BY eligible.order_created_at ASC, eligible.order_id ASC
       LIMIT $1
    ), candidate AS (
      SELECT * FROM urgent_lane
      UNION ALL
      SELECT * FROM recent_lane
      UNION ALL
      SELECT * FROM oldest_lane
    )
    INSERT INTO admin_payment_reconciliation_queue (
      order_id, paypal_order_id, attempt_count, next_attempt_at, created_at, updated_at
    )
    SELECT candidate.order_id, candidate.paypal_order_id, 0, NOW(), NOW(), NOW()
      FROM candidate
     ORDER BY candidate.lane_priority ASC, candidate.lane_rank ASC
     LIMIT $1
    ON CONFLICT (order_id) DO UPDATE
      SET paypal_order_id = EXCLUDED.paypal_order_id,
          attempt_count = 0,
          last_attempt_at = NULL,
          next_attempt_at = NOW(),
          lease_token = NULL,
          lease_until = NULL,
          last_error = NULL,
          updated_at = NOW()
      WHERE admin_payment_reconciliation_queue.paypal_order_id
            IS DISTINCT FROM EXCLUDED.paypal_order_id
    RETURNING order_id::text AS order_id`;
}

function buildClaimQuery() {
  const eligibility = eligiblePayPalPredicate('orders', '$4');
  return `
    WITH urgent_lane AS (
      SELECT queue.order_id,
             'urgent'::text AS lane_name,
             1::integer AS lane_priority,
             queue.next_attempt_at,
             queue.updated_at
        FROM admin_payment_reconciliation_queue queue
        JOIN orders ON orders.id = queue.order_id
       WHERE queue.next_attempt_at <= NOW()
         AND (queue.lease_until IS NULL OR queue.lease_until <= NOW())
         AND queue.paypal_order_id = orders.paypal_order_id
         AND LOWER(BTRIM(COALESCE(
               to_jsonb(orders)->>'payment_reconciliation_status', ''
             ))) = 'captured_bookkeeping_pending'
         AND ${eligibility}
       ORDER BY queue.next_attempt_at ASC, queue.updated_at ASC, queue.order_id ASC
       LIMIT $5
       FOR UPDATE OF queue SKIP LOCKED
    ), recent_lane AS (
      SELECT queue.order_id,
             'recent'::text AS lane_name,
             2::integer AS lane_priority,
             queue.next_attempt_at,
             queue.updated_at
        FROM admin_payment_reconciliation_queue queue
        JOIN orders ON orders.id = queue.order_id
       WHERE queue.next_attempt_at <= NOW()
         AND (queue.lease_until IS NULL OR queue.lease_until <= NOW())
         AND queue.paypal_order_id = orders.paypal_order_id
         AND ${eligibility}
         AND NOT EXISTS (
               SELECT 1 FROM urgent_lane WHERE urgent_lane.order_id = queue.order_id
             )
         AND LOWER(BTRIM(COALESCE(
               to_jsonb(orders)->>'payment_reconciliation_status', ''
             ))) <> 'captured_bookkeeping_pending'
         AND (
           queue.attempt_count = 0
           OR orders.created_at >= NOW() - INTERVAL '24 hours'
         )
       ORDER BY COALESCE(
                  orders.created_at >= NOW() - INTERVAL '24 hours',
                  FALSE
                ) DESC,
                orders.created_at DESC NULLS LAST,
                (queue.attempt_count = 0) DESC,
                queue.next_attempt_at ASC,
                queue.updated_at ASC,
                queue.order_id ASC
       LIMIT $6
       FOR UPDATE OF queue SKIP LOCKED
    ), oldest_lane AS (
      SELECT queue.order_id,
             'oldest'::text AS lane_name,
             3::integer AS lane_priority,
             queue.next_attempt_at,
             queue.updated_at
        FROM admin_payment_reconciliation_queue queue
        JOIN orders ON orders.id = queue.order_id
       WHERE queue.next_attempt_at <= NOW()
         AND (queue.lease_until IS NULL OR queue.lease_until <= NOW())
         AND queue.paypal_order_id = orders.paypal_order_id
         AND ${eligibility}
         AND NOT EXISTS (
               SELECT 1 FROM urgent_lane WHERE urgent_lane.order_id = queue.order_id
             )
         AND NOT EXISTS (
               SELECT 1 FROM recent_lane WHERE recent_lane.order_id = queue.order_id
             )
       ORDER BY queue.next_attempt_at ASC, queue.updated_at ASC, queue.order_id ASC
       LIMIT CASE WHEN $1 > 0 THEN 1 ELSE 0 END
       FOR UPDATE OF queue SKIP LOCKED
    ), filler_lane AS (
      SELECT queue.order_id,
             'fair_filler'::text AS lane_name,
             4::integer AS lane_priority,
             queue.next_attempt_at,
             queue.updated_at
        FROM admin_payment_reconciliation_queue queue
        JOIN orders ON orders.id = queue.order_id
       WHERE queue.next_attempt_at <= NOW()
         AND (queue.lease_until IS NULL OR queue.lease_until <= NOW())
         AND queue.paypal_order_id = orders.paypal_order_id
         AND ${eligibility}
         AND NOT EXISTS (
               SELECT 1 FROM urgent_lane WHERE urgent_lane.order_id = queue.order_id
             )
         AND NOT EXISTS (
               SELECT 1 FROM recent_lane WHERE recent_lane.order_id = queue.order_id
             )
         AND NOT EXISTS (
               SELECT 1 FROM oldest_lane WHERE oldest_lane.order_id = queue.order_id
             )
       ORDER BY queue.next_attempt_at ASC, queue.updated_at ASC, queue.order_id ASC
       LIMIT $1
       FOR UPDATE OF queue SKIP LOCKED
    ), due AS (
      SELECT * FROM urgent_lane
      UNION ALL SELECT * FROM recent_lane
      UNION ALL SELECT * FROM oldest_lane
      UNION ALL SELECT * FROM filler_lane
      ORDER BY lane_priority ASC, next_attempt_at ASC, updated_at ASC, order_id ASC
      LIMIT $1
    ), claimed AS (
      UPDATE admin_payment_reconciliation_queue queue
         SET lease_token = $2::uuid,
             lease_until = NOW() + ($3::integer * INTERVAL '1 millisecond'),
             updated_at = NOW()
       FROM due
       WHERE queue.order_id = due.order_id
       RETURNING queue.order_id, queue.paypal_order_id, queue.attempt_count,
                 queue.lease_token, due.lane_name
    )
    SELECT claimed.order_id::text AS id,
           claimed.attempt_count,
           claimed.lease_token::text AS lease_token,
           claimed.paypal_order_id,
           claimed.lane_name AS claim_lane,
           orders.checkout_idempotency_key
      FROM claimed
      JOIN orders ON orders.id = claimed.order_id
     ORDER BY claimed.order_id ASC`;
}

function buildPruneQuery() {
  return `
    WITH stale AS (
      SELECT queue.order_id
        FROM admin_payment_reconciliation_queue queue
        JOIN orders ON orders.id = queue.order_id
       WHERE (queue.lease_until IS NULL OR queue.lease_until <= NOW())
         AND NOT (${eligiblePayPalPredicate('orders', '$2')})
       ORDER BY queue.updated_at ASC, queue.order_id ASC
       FOR UPDATE OF queue SKIP LOCKED
       LIMIT $1
    )
    DELETE FROM admin_payment_reconciliation_queue queue
     USING stale
     WHERE queue.order_id = stale.order_id
    RETURNING queue.order_id::text AS order_id`;
}

function buildDeleteClaimQuery() {
  return `
    DELETE FROM admin_payment_reconciliation_queue
     WHERE order_id = $1::uuid
       AND lease_token = $2::uuid
    RETURNING order_id::text AS order_id`;
}

function buildRetryClaimQuery() {
  return `
    UPDATE admin_payment_reconciliation_queue
       SET attempt_count = attempt_count + 1,
           last_attempt_at = NOW(),
           next_attempt_at = NOW() + ($3::integer * INTERVAL '1 second'),
           lease_token = NULL,
           lease_until = NULL,
           last_error = LEFT($4::text, 500),
           updated_at = NOW()
     WHERE order_id = $1::uuid
       AND lease_token = $2::uuid
    RETURNING order_id::text AS order_id, attempt_count, next_attempt_at`;
}

function retryDelaySeconds(attemptCount) {
  const completedAttempts = Math.max(0, Number.parseInt(String(attemptCount || 0), 10) || 0);
  return Math.min(MAX_BACKOFF_SECONDS, MIN_BACKOFF_SECONDS * (2 ** Math.min(completedAttempts, 10)));
}

function clippedError(value) {
  const text = String(value || 'PAYPAL_RECONCILIATION_PENDING').trim();
  return (text || 'PAYPAL_RECONCILIATION_PENDING').slice(0, 500);
}

async function finishClaim(sql, candidate) {
  const rows = await sql(buildDeleteClaimQuery(), [candidate.id, candidate.lease_token]);
  return Array.isArray(rows) && rows.length > 0;
}

async function retryClaim(sql, candidate, error) {
  const delaySeconds = retryDelaySeconds(candidate.attempt_count);
  const rows = await sql(buildRetryClaimQuery(), [
    candidate.id,
    candidate.lease_token,
    delaySeconds,
    clippedError(error),
  ]);
  return {
    updated: Array.isArray(rows) && rows.length > 0,
    delaySeconds,
  };
}

async function processClaim({ sql, candidate, reconcileCandidate }) {
  let outcome;
  try {
    outcome = await reconcileCandidate(candidate);
  } catch (error) {
    outcome = {
      disposition: 'retry',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (outcome?.disposition === 'complete' || outcome?.disposition === 'terminal') {
    return {
      id: candidate.id,
      disposition: outcome.disposition,
      leaseOwned: await finishClaim(sql, candidate),
    };
  }

  const retry = await retryClaim(sql, candidate, outcome?.error);
  return {
    id: candidate.id,
    disposition: 'retry',
    leaseOwned: retry.updated,
    delaySeconds: retry.delaySeconds,
  };
}

async function runReconciliationBatch({
  sql,
  ownerToken,
  allowTestOrders = false,
  reconcileCandidate,
  batchSize = DEFAULT_BATCH_SIZE,
  leaseMs = DEFAULT_LEASE_MS,
  seedLimit = DEFAULT_SEED_LIMIT,
}) {
  if (typeof sql !== 'function') throw new TypeError('sql is required');
  if (typeof reconcileCandidate !== 'function') throw new TypeError('reconcileCandidate is required');

  const boundedSeedLimit = Math.min(
    DEFAULT_SEED_LIMIT,
    Math.max(1, Math.trunc(Number(seedLimit)) || DEFAULT_SEED_LIMIT),
  );
  const boundedBatchSize = Math.min(
    DEFAULT_BATCH_SIZE,
    Math.max(1, Math.trunc(Number(batchSize)) || DEFAULT_BATCH_SIZE),
  );
  const boundedLeaseMs = Math.min(5 * 60_000, Math.max(10_000, Number(leaseMs) || DEFAULT_LEASE_MS));
  const seedLanes = seedLaneLimits(boundedSeedLimit);
  const claimLanes = claimLaneLimits(boundedBatchSize);
  await ensureReconciliationQueueSchema(sql);
  const pruned = await sql(buildPruneQuery(), [boundedSeedLimit, Boolean(allowTestOrders)]);
  const seeded = await sql(buildSeedQuery(), [
    boundedSeedLimit,
    Boolean(allowTestOrders),
    seedLanes.urgent,
    seedLanes.recent,
  ]);
  const claimed = await sql(buildClaimQuery(), [
    boundedBatchSize,
    ownerToken,
    boundedLeaseMs,
    Boolean(allowTestOrders),
    claimLanes.urgent,
    claimLanes.recent,
  ]);

  const results = await Promise.all((Array.isArray(claimed) ? claimed : []).map((candidate) => (
    processClaim({ sql, candidate, reconcileCandidate })
  )));

  return {
    pruned: Array.isArray(pruned) ? pruned.length : 0,
    seeded: Array.isArray(seeded) ? seeded.length : 0,
    claimed: Array.isArray(claimed) ? claimed.length : 0,
    completed: results.filter((result) => result.disposition === 'complete').length,
    terminal: results.filter((result) => result.disposition === 'terminal').length,
    retried: results.filter((result) => result.disposition === 'retry').length,
    leaseLost: results.filter((result) => result.leaseOwned === false).length,
  };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
  DEFAULT_SEED_LIMIT,
  MAX_BACKOFF_SECONDS,
  MIN_BACKOFF_SECONDS,
  buildClaimQuery,
  buildDeleteClaimQuery,
  buildPruneQuery,
  buildRetryClaimQuery,
  buildRuntimeSchemaRepairSql,
  buildSchemaReadinessQuery,
  buildSeedQuery,
  claimLaneLimits,
  clippedError,
  compareRecentLaneCandidates,
  eligiblePayPalPredicate,
  ensureReconciliationQueueSchema,
  processClaim,
  retryDelaySeconds,
  runReconciliationBatch,
  seedLaneLimits,
  resetSchemaReadinessForTests() { queueSchemaReady = false; },
};
