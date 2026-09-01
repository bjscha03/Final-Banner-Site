'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const schema = require('../_shared/abandoned-cart-schema.cjs')._test;

function currentConstraintDefinition(types = schema.REQUIRED_EVENT_TYPES) {
  return `CHECK ((event_type = ANY (ARRAY[${types.map((value) => `'${value}'::text`).join(', ')}])))`;
}

test('event constraint validation requires the exact recovery vocabulary', () => {
  assert.equal(schema.eventConstraintIsCurrent(currentConstraintDefinition()), true);
  assert.equal(schema.eventConstraintIsCurrent(currentConstraintDefinition(
    schema.REQUIRED_EVENT_TYPES.filter((value) => value !== 'email_suppressed'),
  )), false);
  assert.equal(schema.eventConstraintIsCurrent(currentConstraintDefinition([
    ...schema.REQUIRED_EVENT_TYPES,
    'unexpected_event',
  ])), false);
  assert.equal(schema.eventConstraintIsCurrent(null), false);
});

test('bootstrap contains one full advisory transaction plan and the complete index set', () => {
  const capture = (strings, ...values) => ({ text: strings.join('?'), values });
  const queries = schema.bootstrapQueries(capture);
  assert.match(queries[0].text, /pg_advisory_xact_lock/);
  assert.deepEqual(queries[0].values, [schema.SCHEMA_LOCK_KEY]);

  const source = queries.map((query) => query.text).join('\n');
  assert.match(source, /ADD COLUMN IF NOT EXISTS has_artwork BOOLEAN/);
  assert.doesNotMatch(source, /has_artwork BOOLEAN NOT NULL/);
  assert.match(source, /ALTER COLUMN has_artwork DROP NOT NULL/);
  assert.match(source, /ALTER COLUMN has_artwork DROP DEFAULT/);
  assert.doesNotMatch(source, /ALTER COLUMN has_artwork SET DEFAULT/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS snapshot_revision BIGINT/);
  assert.match(source, /ALTER COLUMN snapshot_revision DROP NOT NULL/);
  assert.match(source, /ALTER COLUMN snapshot_revision DROP DEFAULT/);
  assert.match(source, /SET checkout_stage = NULL,\s+has_artwork = NULL/);
  assert.match(source, /WHERE checkout_stage_updated_at IS NULL/);
  assert.match(source, /idx_abandoned_carts_historical_unknown_repair_v1/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS recovery_job_leases/);
  assert.match(source, /idx_abandoned_carts_email_presence/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS abandoned_cart_session_id TEXT/);
  assert.match(source, /idx_orders_abandoned_cart_session_created_at/);
  assert.match(source, /orders_abandoned_cart_id_fkey/);
  assert.match(source, /REFERENCES abandoned_carts\(id\)/);
  assert.match(source, /ON DELETE SET NULL/);
  assert.match(source, /current_values IS DISTINCT FROM ARRAY/);
});

test('schema bootstrap uses one Neon transaction and verifies the resulting catalog state', async () => {
  const readyRow = {
    columns_ready: true,
    artwork_column_ready: true,
    snapshot_revision_column_ready: true,
    order_link_ready: true,
    order_session_link_ready: true,
    order_link_fk_ready: true,
    tables_ready: true,
    indexes_ready: true,
    event_constraint_definition: currentConstraintDefinition(),
  };
  let catalogReads = 0;
  let transactionCalls = 0;
  let transactionQueries = [];

  const sql = (strings, ...values) => {
    const text = strings.join('?');
    if (/information_schema\.columns/.test(text)) {
      catalogReads += 1;
      return Promise.resolve([catalogReads === 1
        ? { ...readyRow, indexes_ready: false }
        : readyRow]);
    }
    throw new Error(`Unexpected non-transaction query: ${text.slice(0, 80)}`);
  };
  sql.transaction = async (builder) => {
    transactionCalls += 1;
    const transactionSql = (strings, ...values) => ({ text: strings.join('?'), values });
    transactionQueries = builder(transactionSql);
    return transactionQueries;
  };

  const result = await schema.applySchema(sql);
  assert.deepEqual(result, { applied: true });
  assert.equal(transactionCalls, 1);
  assert.equal(catalogReads, 2);
  assert.match(transactionQueries[0].text, /pg_advisory_xact_lock/);
  assert.match(transactionQueries.map((query) => query.text).join('\n'), /idx_abandoned_carts_email_presence/);
  assert.match(transactionQueries.map((query) => query.text).join('\n'), /idx_orders_abandoned_cart_session_created_at/);
});

test('current schema fast path performs no runtime DDL transaction', async () => {
  const currentRow = {
    columns_ready: true,
    artwork_column_ready: true,
    snapshot_revision_column_ready: true,
    order_link_ready: true,
    order_session_link_ready: true,
    order_link_fk_ready: true,
    tables_ready: true,
    indexes_ready: true,
    event_constraint_definition: currentConstraintDefinition(),
  };
  let readinessQuery = '';
  const sql = (strings) => {
    readinessQuery = strings.join('?');
    return Promise.resolve([currentRow]);
  };
  sql.transaction = async () => {
    throw new Error('transaction should not run for a current schema');
  };
  assert.deepEqual(await schema.applySchema(sql), { applied: false });
  assert.match(readinessQuery, /idx_abandoned_carts_historical_unknown_repair_v1/);
  assert.doesNotMatch(readinessQuery, /FROM abandoned_carts(?:\s+AS\s+cart)?/i);

  assert.equal(await schema.schemaIsCurrent(() => Promise.resolve([{
    ...currentRow,
    snapshot_revision_column_ready: false,
  }])), false);
});
