'use strict';

const SCHEMA_LOCK_KEY = 'abandoned-cart-schema-v3';
const REQUIRED_EVENT_TYPES = Object.freeze([
  'cart_recovered',
  'discount_applied',
  'email_bounced',
  'email_clicked',
  'email_complained',
  'email_delivered',
  'email_failed',
  'email_opened',
  'email_sent',
  'email_suppressed',
  'sms_sent',
]);

let schemaPromise = null;

function truthyDatabaseBoolean(value) {
  return value === true || value === 't' || value === 1 || value === '1';
}

function eventConstraintValues(definition) {
  const values = [];
  const pattern = /'((?:''|[^'])*)'/g;
  for (const match of String(definition || '').matchAll(pattern)) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values.sort();
}

function eventConstraintIsCurrent(definition) {
  const values = eventConstraintValues(definition);
  return values.length === REQUIRED_EVENT_TYPES.length
    && values.every((value, index) => value === REQUIRED_EVENT_TYPES[index]);
}

async function schemaIsCurrent(sql) {
  const rows = await sql`
    SELECT
      (
        SELECT COUNT(DISTINCT column_name) = 17
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'abandoned_carts'
           AND column_name = ANY (ARRAY[
             'checkout_stage', 'checkout_stage_updated_at', 'normalized_email',
             'subtotal_cents', 'discount_cents', 'tax_cents', 'estimated_total_cents',
             'has_artwork', 'customer_first_name', 'customer_last_name',
             'recovery_email_claim_sequence', 'recovery_email_claimed_at',
             'last_recovery_email_at', 'recovery_suppressed_at',
             'recovery_suppression_reason', 'recovery_email_last_error',
             'snapshot_revision'
           ]::TEXT[])
      ) AS columns_ready,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'abandoned_carts'
           AND column_name = 'has_artwork'
           AND is_nullable = 'YES'
           AND column_default IS NULL
      ) AS artwork_column_ready,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'abandoned_carts'
           AND column_name = 'snapshot_revision'
           AND is_nullable = 'YES'
           AND column_default IS NULL
      ) AS snapshot_revision_column_ready,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'orders'
           AND column_name = 'abandoned_cart_id'
      ) AS order_link_ready,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'orders'
           AND column_name = 'abandoned_cart_session_id'
      ) AS order_session_link_ready,
      EXISTS (
        SELECT 1
          FROM pg_constraint AS constraint_row
          JOIN pg_attribute AS column_row
            ON column_row.attrelid = constraint_row.conrelid
           AND column_row.attname = 'abandoned_cart_id'
           AND column_row.attnum = ANY (constraint_row.conkey)
         WHERE constraint_row.conrelid = to_regclass('orders')
           AND constraint_row.confrelid = to_regclass('abandoned_carts')
           AND constraint_row.contype = 'f'
           AND constraint_row.confdeltype = 'n'
           AND constraint_row.convalidated = TRUE
           AND ARRAY_LENGTH(constraint_row.conkey, 1) = 1
      ) AS order_link_fk_ready,
      (
        to_regclass('cart_recovery_deliveries') IS NOT NULL
        AND to_regclass('recovery_email_suppressions') IS NOT NULL
        AND to_regclass('recovery_job_leases') IS NOT NULL
      ) AS tables_ready,
      (
        SELECT COUNT(DISTINCT index_class.relname) = 13
          FROM pg_class AS index_class
          JOIN pg_namespace AS namespace ON namespace.oid = index_class.relnamespace
          JOIN pg_index AS index_state ON index_state.indexrelid = index_class.oid
         WHERE namespace.nspname = current_schema()
           AND index_state.indisvalid = TRUE
           AND index_state.indisready = TRUE
           AND index_class.relname = ANY (ARRAY[
             'idx_orders_abandoned_cart_id',
             'idx_orders_abandoned_cart_session_created_at',
             'idx_abandoned_carts_user_active',
             'idx_abandoned_carts_session_active',
             'idx_abandoned_carts_checkout_stage',
             'idx_abandoned_carts_email_presence',
             'idx_abandoned_carts_normalized_email',
             'idx_abandoned_carts_estimated_total',
             'idx_abandoned_carts_historical_unknown_repair_v1',
             'idx_cart_recovery_deliveries_status',
             'idx_recovery_email_suppressions_active',
             'idx_cart_recovery_logs_provider_event',
             'idx_orders_normalized_email_created_at'
           ]::TEXT[])
      ) AS indexes_ready,
      (
        SELECT pg_get_constraintdef(constraint_row.oid)
          FROM pg_constraint AS constraint_row
         WHERE constraint_row.conrelid = to_regclass('cart_recovery_logs')
           AND constraint_row.conname = 'cart_recovery_logs_event_type_check'
         LIMIT 1
      ) AS event_constraint_definition
  `;
  const row = rows[0] || {};
  return truthyDatabaseBoolean(row.columns_ready)
    && truthyDatabaseBoolean(row.artwork_column_ready)
    && truthyDatabaseBoolean(row.snapshot_revision_column_ready)
    && truthyDatabaseBoolean(row.order_link_ready)
    && truthyDatabaseBoolean(row.order_session_link_ready)
    && truthyDatabaseBoolean(row.order_link_fk_ready)
    && truthyDatabaseBoolean(row.tables_ready)
    && truthyDatabaseBoolean(row.indexes_ready)
    && eventConstraintIsCurrent(row.event_constraint_definition);
}

function bootstrapQueries(sql) {
  return [
    sql`SELECT pg_advisory_xact_lock(hashtext(${SCHEMA_LOCK_KEY})::bigint)`,
    sql`
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
        ADD COLUMN IF NOT EXISTS recovery_email_last_error TEXT,
        ADD COLUMN IF NOT EXISTS snapshot_revision BIGINT
    `,
    sql`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS abandoned_cart_id UUID,
        ADD COLUMN IF NOT EXISTS abandoned_cart_session_id TEXT
    `,
    sql`
      UPDATE orders AS order_row
         SET abandoned_cart_id = NULL
       WHERE abandoned_cart_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM abandoned_carts AS cart
            WHERE cart.id = order_row.abandoned_cart_id
         )
    `,
    sql`
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
      $order_cart_fk$
    `,
    sql`
      ALTER TABLE orders
        VALIDATE CONSTRAINT orders_abandoned_cart_id_fkey
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_id
        ON orders(abandoned_cart_id)
        WHERE abandoned_cart_id IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_session_created_at
        ON orders(abandoned_cart_session_id, created_at DESC)
        WHERE abandoned_cart_session_id IS NOT NULL
    `,
    sql`
      ALTER TABLE abandoned_carts
        ALTER COLUMN checkout_stage DROP DEFAULT,
        ALTER COLUMN checkout_stage DROP NOT NULL,
        ALTER COLUMN has_artwork DROP NOT NULL,
        ALTER COLUMN has_artwork DROP DEFAULT,
        ALTER COLUMN snapshot_revision DROP NOT NULL,
        ALTER COLUMN snapshot_revision DROP DEFAULT
    `,
    sql`
      UPDATE abandoned_carts
         SET checkout_stage = NULL,
             has_artwork = NULL
       WHERE checkout_stage_updated_at IS NULL
         AND (checkout_stage IS NOT NULL OR has_artwork IS NOT NULL)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts_historical_unknown_repair_v1
        ON abandoned_carts(id)
        WHERE checkout_stage_updated_at IS NULL
          AND (checkout_stage IS NOT NULL OR has_artwork IS NOT NULL)
    `,
    sql`
      UPDATE abandoned_carts
         SET subtotal_cents = COALESCE(subtotal_cents, ROUND(total_value * 100)::INTEGER),
             normalized_email = NULLIF(LOWER(BTRIM(email)), '')
       WHERE subtotal_cents IS NULL
          OR normalized_email IS DISTINCT FROM NULLIF(LOWER(BTRIM(email)), '')
    `,
    sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id
                 ORDER BY last_activity_at DESC, created_at DESC, id DESC
               ) AS row_number
          FROM abandoned_carts
         WHERE recovery_status = 'active' AND user_id IS NOT NULL
      )
      UPDATE abandoned_carts AS cart
         SET recovery_status = 'expired', updated_at = NOW()
        FROM ranked
       WHERE cart.id = ranked.id AND ranked.row_number > 1
    `,
    sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY session_id
                 ORDER BY last_activity_at DESC, created_at DESC, id DESC
               ) AS row_number
          FROM abandoned_carts
         WHERE recovery_status = 'active' AND session_id IS NOT NULL
      )
      UPDATE abandoned_carts AS cart
         SET recovery_status = 'expired', updated_at = NOW()
        FROM ranked
       WHERE cart.id = ranked.id AND ranked.row_number > 1
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_user_active
        ON abandoned_carts(user_id)
        WHERE recovery_status = 'active' AND user_id IS NOT NULL
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_session_active
        ON abandoned_carts(session_id)
        WHERE recovery_status = 'active' AND session_id IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts_checkout_stage
        ON abandoned_carts(checkout_stage, last_activity_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email_presence
        ON abandoned_carts((NULLIF(BTRIM(email), '') IS NOT NULL), last_activity_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts_estimated_total
        ON abandoned_carts(estimated_total_cents, last_activity_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts_normalized_email
        ON abandoned_carts(normalized_email, last_activity_at DESC)
        WHERE normalized_email IS NOT NULL
    `,
    sql`
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
      )
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_cart_recovery_deliveries_status
        ON cart_recovery_deliveries(status, claimed_at)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS recovery_email_suppressions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        normalized_email TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'recovery_unsubscribe',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_recovery_email_suppressions_active
        ON recovery_email_suppressions(normalized_email)
        WHERE active = TRUE
    `,
    sql`
      CREATE TABLE IF NOT EXISTS recovery_job_leases (
        job_name TEXT PRIMARY KEY,
        lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (
          (lease_owner IS NULL AND lease_expires_at IS NULL)
          OR (NULLIF(BTRIM(lease_owner), '') IS NOT NULL AND lease_expires_at IS NOT NULL)
        )
      )
    `,
    sql`
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
      $schema_repair$
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_recovery_logs_provider_event
        ON cart_recovery_logs((metadata->>'provider_event_id'))
        WHERE NULLIF(metadata->>'provider_event_id', '') IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_orders_normalized_email_created_at
        ON orders((LOWER(BTRIM(email))), created_at DESC)
        WHERE NULLIF(BTRIM(email), '') IS NOT NULL
    `,
  ];
}

async function applySchema(sql) {
  if (await schemaIsCurrent(sql)) return { applied: false };
  if (typeof sql.transaction !== 'function') {
    throw new Error('Abandoned-cart schema bootstrap requires Neon transaction support');
  }

  await sql.transaction((transactionSql) => bootstrapQueries(transactionSql));

  if (!(await schemaIsCurrent(sql))) {
    throw new Error('Abandoned-cart schema bootstrap completed without the required schema state');
  }
  return { applied: true };
}

async function ensureAbandonedCartSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = applySchema(sql).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = {
  ensureAbandonedCartSchema,
  _test: {
    REQUIRED_EVENT_TYPES,
    SCHEMA_LOCK_KEY,
    applySchema,
    bootstrapQueries,
    eventConstraintIsCurrent,
    eventConstraintValues,
    resetSchemaPromise() { schemaPromise = null; },
    schemaIsCurrent,
    truthyDatabaseBoolean,
  },
};
