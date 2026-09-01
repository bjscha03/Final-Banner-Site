const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/035_abandoned_cart_analytics_and_delivery_safety.sql'),
  'utf8',
);
const orderSessionMigration = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/037_orders_abandoned_cart_session_id.sql'),
  'utf8',
);
const recoveryLeaseMigration = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/038_recovery_worker_leases.sql'),
  'utf8',
);
const snapshotRevisionMigration = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/039_abandoned_cart_snapshot_revision.sql'),
  'utf8',
);

test('migration preserves unknowable historical checkout values', () => {
  assert.match(migration, /subtotal_cents = COALESCE\(subtotal_cents, ROUND\(total_value \* 100\)::INTEGER\)/);
  assert.doesNotMatch(migration, /discount_cents\s*=\s*COALESCE\([^,]+,\s*0\)/);
  assert.doesNotMatch(migration, /tax_cents\s*=\s*COALESCE\([^,]+,\s*0\)/);
  assert.doesNotMatch(migration, /estimated_total_cents\s*=\s*COALESCE\([^,]+,\s*ROUND\(total_value/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS has_artwork BOOLEAN,/);
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS has_artwork BOOLEAN NOT NULL/);
  assert.match(migration, /ALTER COLUMN has_artwork DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN has_artwork DROP DEFAULT/);
  assert.doesNotMatch(migration, /ALTER COLUMN has_artwork SET DEFAULT/);
  assert.match(migration, /SET checkout_stage = NULL,\s+has_artwork = NULL/);
  assert.match(migration, /WHERE checkout_stage_updated_at IS NULL/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_abandoned_carts_historical_unknown_repair_v1/);
  assert.ok(
    migration.indexOf('SET checkout_stage = NULL')
      < migration.indexOf('CREATE INDEX IF NOT EXISTS idx_abandoned_carts_historical_unknown_repair_v1'),
  );
});

test('migration expires duplicate active owners before adding partial unique indexes', () => {
  const firstDedupe = migration.indexOf('WITH ranked AS');
  const userIndex = migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_user_active');
  const sessionIndex = migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_session_active');

  assert.ok(firstDedupe >= 0);
  assert.ok(userIndex > firstDedupe);
  assert.ok(sessionIndex > firstDedupe);
  assert.match(migration, /SET recovery_status = 'expired'/);
  assert.match(migration, /WHERE recovery_status = 'active' AND user_id IS NOT NULL/);
  assert.match(migration, /WHERE recovery_status = 'active' AND session_id IS NOT NULL/);
});

test('migration creates once-only deliveries, suppressions, and provider-event dedupe', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cart_recovery_deliveries/);
  assert.match(migration, /UNIQUE \(abandoned_cart_id, sequence_number\)/);
  assert.match(migration, /CHECK \(sequence_number BETWEEN 1 AND 3\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS recovery_email_suppressions/);
  assert.match(migration, /normalized_email TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_recovery_logs_provider_event/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS abandoned_cart_id UUID/);
  assert.match(migration, /ADD CONSTRAINT orders_abandoned_cart_id_fkey/);
  assert.match(migration, /REFERENCES abandoned_carts\(id\)/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.match(migration, /VALIDATE CONSTRAINT orders_abandoned_cart_id_fkey/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_id/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_orders_normalized_email_created_at/);
});

test('migration coordinates rolling bootstraps and compares the full event vocabulary', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('abandoned-cart-schema-v3'\)::bigint\)/);
  assert.match(migration, /current_values IS DISTINCT FROM ARRAY/);
  for (const eventType of [
    'email_sent', 'email_delivered', 'email_opened', 'email_clicked',
    'email_bounced', 'email_complained', 'email_failed', 'email_suppressed',
    'sms_sent', 'cart_recovered', 'discount_applied',
  ]) {
    assert.match(migration, new RegExp(`'${eventType}'`));
  }
});

test('late-snapshot reconciliation migration adds only a nullable, indexed session hint', () => {
  assert.match(orderSessionMigration, /pg_advisory_xact_lock\(hashtext\('abandoned-cart-schema-v3'\)::bigint\)/);
  assert.match(orderSessionMigration, /ADD COLUMN IF NOT EXISTS abandoned_cart_session_id TEXT/);
  assert.doesNotMatch(orderSessionMigration, /abandoned_cart_session_id TEXT\s+(?:NOT NULL|DEFAULT)/);
  assert.match(orderSessionMigration, /idx_orders_abandoned_cart_session_created_at/);
  assert.match(orderSessionMigration, /ON orders\(abandoned_cart_session_id, created_at DESC\)/);
  assert.match(orderSessionMigration, /WHERE abandoned_cart_session_id IS NOT NULL/);
});

test('background recovery lease migration is durable, coordinated, and owner guarded', () => {
  assert.match(recoveryLeaseMigration, /^\s*--[\s\S]*\bBEGIN;/);
  assert.match(recoveryLeaseMigration, /pg_advisory_xact_lock\(hashtext\('abandoned-cart-schema-v3'\)::bigint\)/);
  assert.match(recoveryLeaseMigration, /CREATE TABLE IF NOT EXISTS recovery_job_leases/);
  assert.match(recoveryLeaseMigration, /job_name TEXT PRIMARY KEY/);
  assert.match(recoveryLeaseMigration, /lease_owner TEXT/);
  assert.match(recoveryLeaseMigration, /lease_expires_at TIMESTAMPTZ/);
  assert.match(recoveryLeaseMigration, /lease_owner IS NULL AND lease_expires_at IS NULL/);
  assert.match(recoveryLeaseMigration, /NULLIF\(BTRIM\(lease_owner\), ''\) IS NOT NULL AND lease_expires_at IS NOT NULL/);
  assert.match(recoveryLeaseMigration, /\bCOMMIT;\s*$/);
  assert.doesNotMatch(recoveryLeaseMigration, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

test('snapshot ordering migration is nullable, lock-coordinated, and has no legacy-writer default', () => {
  assert.match(snapshotRevisionMigration, /pg_advisory_xact_lock\(hashtext\('abandoned-cart-schema-v3'\)::bigint\)/);
  assert.match(snapshotRevisionMigration, /ADD COLUMN IF NOT EXISTS snapshot_revision BIGINT/);
  assert.doesNotMatch(snapshotRevisionMigration, /snapshot_revision BIGINT\s+(?:NOT NULL|DEFAULT)/);
  assert.match(snapshotRevisionMigration, /ALTER COLUMN snapshot_revision DROP NOT NULL/);
  assert.match(snapshotRevisionMigration, /ALTER COLUMN snapshot_revision DROP DEFAULT/);
});
