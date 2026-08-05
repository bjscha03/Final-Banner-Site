#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { transactionBodyStatements } = require('./outbound-sql-parser.cjs');

const EXPECTED_TABLES = Object.freeze([
  'outbound_ai_usage',
  'outbound_audit_log',
  'outbound_campaign_variants',
  'outbound_campaigns',
  'outbound_contacts',
  'outbound_cost_ledger',
  'outbound_email_events',
  'outbound_jobs',
  'outbound_messages',
  'outbound_opportunities',
  'outbound_order_attributions',
  'outbound_prospects',
  'outbound_provider_configs',
  'outbound_provider_usage',
  'outbound_replies',
  'outbound_research_snapshots',
  'outbound_settings',
  'outbound_suppressions',
]);

const EXPECTED_TRIGGERS = Object.freeze([
  'outbound_audit_log_immutable_trigger',
  'outbound_opportunity_status_audit_trigger',
  'outbound_prospect_status_audit_trigger',
]);

const EXPECTED_FUNCTIONS = Object.freeze([
  'outbound_record_opportunity_status_change',
  'outbound_record_prospect_status_change',
  'outbound_reject_audit_mutation',
]);

const CONFIRMATION = 'isolated-neon-preview';
const MODES = new Set(['--apply', '--verify', '--rollback-cycle']);

function fail(message) {
  const error = new Error(message);
  error.code = 'OUTBOUND_STAGING_VALIDATION_FAILED';
  throw error;
}

function safeError(error) {
  return String(error?.message || error || 'Unknown validation failure')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b(?:sk|rk|re)_[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .slice(0, 2000);
}

function loadDatabaseUrl() {
  const filePath = process.env.OUTBOUND_TEST_DATABASE_URL_FILE;
  const directValue = process.env.OUTBOUND_TEST_DATABASE_URL;
  if (filePath && directValue) fail('Use exactly one staging database URL source.');
  if (filePath) {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);
    if ((stats.mode & 0o077) !== 0) fail('The staging URL file must be readable only by its owner.');
    return fs.readFileSync(resolved, 'utf8').trim();
  }
  if (directValue) return directValue.trim();
  fail('OUTBOUND_TEST_DATABASE_URL or OUTBOUND_TEST_DATABASE_URL_FILE is required.');
}

function validateTarget(databaseUrl) {
  if (process.env.OUTBOUND_TEST_DATABASE_CONFIRMATION !== CONFIRMATION) {
    fail(`Set OUTBOUND_TEST_DATABASE_CONFIRMATION=${CONFIRMATION} for an isolated preview branch.`);
  }
  const branchLabel = String(process.env.OUTBOUND_TEST_BRANCH_LABEL || '').trim();
  if (!/(preview|staging|test|phase[-_ ]?1)/i.test(branchLabel)) {
    fail('OUTBOUND_TEST_BRANCH_LABEL must identify an isolated preview or staging branch.');
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('The staging database URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail('A PostgreSQL URL is required.');
  if (!parsed.password) fail('The staging database URL must include a password.');
  if (!/\.neon\.tech$/i.test(parsed.hostname)) fail('The target must be a Neon database endpoint.');

  const endpointId = parsed.hostname.split('.')[0].toLowerCase();
  const expectedEndpointId = String(process.env.OUTBOUND_TEST_ENDPOINT_ID || '').trim().toLowerCase();
  if (!expectedEndpointId || endpointId !== expectedEndpointId) {
    fail('OUTBOUND_TEST_ENDPOINT_ID must exactly match the isolated Neon endpoint.');
  }

  const possibleProductionUrls = [
    process.env.NETLIFY_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.VITE_DATABASE_URL,
    process.env.NEON_DATABASE_URL,
  ].filter(Boolean);
  for (const candidate of possibleProductionUrls) {
    try {
      if (new URL(candidate).hostname.toLowerCase() === parsed.hostname.toLowerCase()) {
        fail('The test endpoint matches an ordinary application database endpoint.');
      }
    } catch {
      // Invalid comparison values do not weaken the explicit endpoint check.
    }
  }

  return { databaseUrl, endpointId, branchLabel };
}

function hashRows(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function sameList(actual, expected, label) {
  const normalized = [...actual].sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(wanted)) {
    fail(`${label} mismatch. Expected ${wanted.join(', ')}; received ${normalized.join(', ')}.`);
  }
}

function explicitIndexNames(migrationSql) {
  return [...migrationSql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX IF NOT EXISTS\s+([a-z0-9_]+)/gi)]
    .map((match) => match[1])
    .sort();
}

async function executeTransactionalSql(sql, source, label) {
  const statements = transactionBodyStatements(source, label);
  await sql.transaction(statements.map((statement) => sql(statement)));
}

async function legacyCatalogSnapshot(sql) {
  const rows = await sql(`
    WITH catalog AS (
      SELECT 'relation' AS object_type,
             c.relname AS object_name,
             jsonb_build_object(
               'kind', c.relkind,
               'persistence', c.relpersistence,
               'row_security', c.relrowsecurity,
               'owner', pg_get_userbyid(c.relowner)
             )::text AS definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND c.relname NOT LIKE 'outbound\\_%' ESCAPE '\\'
      UNION ALL
      SELECT 'column', c.relname || '.' || a.attname,
             jsonb_build_object(
               'ordinal', a.attnum,
               'type', format_type(a.atttypid, a.atttypmod),
               'not_null', a.attnotnull,
               'identity', a.attidentity,
               'generated', a.attgenerated,
               'default', pg_get_expr(d.adbin, d.adrelid)
             )::text
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = 'public'
         AND c.relname NOT LIKE 'outbound\\_%' ESCAPE '\\'
         AND a.attnum > 0
         AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint', c.relname || '.' || con.conname, pg_get_constraintdef(con.oid, TRUE)
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname NOT LIKE 'outbound\\_%' ESCAPE '\\'
      UNION ALL
      SELECT 'index', schemaname || '.' || indexname, indexdef
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename NOT LIKE 'outbound\\_%' ESCAPE '\\'
      UNION ALL
      SELECT 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid, TRUE)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname NOT LIKE 'outbound\\_%' ESCAPE '\\'
         AND NOT t.tgisinternal
      UNION ALL
      SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
             pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname NOT LIKE 'outbound\\_%' ESCAPE '\\'
    )
    SELECT object_type, object_name, definition
      FROM catalog
     ORDER BY object_type, object_name, definition
  `);
  return { count: rows.length, hash: hashRows(rows) };
}

async function legacyRowCounts(sql) {
  const tables = await sql(`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT LIKE 'outbound\\_%' ESCAPE '\\'
     ORDER BY tablename
  `);
  const result = [];
  for (const { tablename } of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tablename)) fail('Unsafe legacy table identifier.');
    const rows = await sql(`SELECT COUNT(*)::text AS row_count FROM public."${tablename}"`);
    result.push({ table: tablename, rowCount: rows[0]?.row_count || '0' });
  }
  return { count: result.length, hash: hashRows(result) };
}

async function outboundCatalog(sql) {
  const [tables, indexes, constraints, triggers, functions, defaults, settings] = await Promise.all([
    sql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'outbound\\_%' ESCAPE '\\' ORDER BY tablename`),
    sql(`
      SELECT i.relname AS index_name, t.relname AS table_name,
             x.indisvalid, x.indisready, pg_get_indexdef(i.oid) AS definition
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public' AND t.relname LIKE 'outbound\\_%' ESCAPE '\\'
       ORDER BY i.relname
    `),
    sql(`
      SELECT source.relname AS table_name, con.conname AS constraint_name,
             con.contype AS constraint_type, con.convalidated,
             target.relname AS referenced_table,
             pg_get_constraintdef(con.oid, TRUE) AS definition
        FROM pg_constraint con
        JOIN pg_class source ON source.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = source.relnamespace
        LEFT JOIN pg_class target ON target.oid = con.confrelid
       WHERE n.nspname = 'public' AND source.relname LIKE 'outbound\\_%' ESCAPE '\\'
       ORDER BY source.relname, con.conname
    `),
    sql(`
      SELECT t.tgname AS trigger_name, c.relname AS table_name, t.tgenabled,
             pg_get_triggerdef(t.oid, TRUE) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND t.tgname LIKE 'outbound\\_%' ESCAPE '\\'
         AND NOT t.tgisinternal
       ORDER BY t.tgname
    `),
    sql(`
      SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
             pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'outbound\\_%' ESCAPE '\\'
       ORDER BY p.proname
    `),
    sql(`
      SELECT c.relname AS table_name, a.attname AS column_name,
             pg_get_expr(d.adbin, d.adrelid) AS default_expression
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = 'public' AND c.relname LIKE 'outbound\\_%' ESCAPE '\\'
       ORDER BY c.relname, a.attnum
    `),
    sql(`SELECT * FROM outbound_settings WHERE id = 1`),
  ]);
  return { tables, indexes, constraints, triggers, functions, defaults, settings };
}

async function verifyOutboundCatalog(sql, migrationSql) {
  const catalog = await outboundCatalog(sql);
  sameList(catalog.tables.map((row) => row.tablename), EXPECTED_TABLES, 'Outbound tables');
  sameList(catalog.triggers.map((row) => row.trigger_name), EXPECTED_TRIGGERS, 'Outbound triggers');
  sameList(catalog.functions.map((row) => row.function_name), EXPECTED_FUNCTIONS, 'Outbound functions');

  const invalidIndexes = catalog.indexes.filter((row) => !row.indisvalid || !row.indisready);
  if (invalidIndexes.length) fail(`Invalid outbound indexes: ${invalidIndexes.map((row) => row.index_name).join(', ')}.`);
  const presentIndexes = new Set(catalog.indexes.map((row) => row.index_name));
  const missingIndexes = explicitIndexNames(migrationSql).filter((name) => !presentIndexes.has(name));
  if (missingIndexes.length) fail(`Missing explicit outbound indexes: ${missingIndexes.join(', ')}.`);

  const invalidConstraints = catalog.constraints.filter((row) => !row.convalidated);
  if (invalidConstraints.length) fail(`Unvalidated outbound constraints: ${invalidConstraints.map((row) => row.constraint_name).join(', ')}.`);
  const tablesWithPrimaryKeys = new Set(catalog.constraints.filter((row) => row.constraint_type === 'p').map((row) => row.table_name));
  const missingPrimaryKeys = EXPECTED_TABLES.filter((table) => !tablesWithPrimaryKeys.has(table));
  if (missingPrimaryKeys.length) fail(`Outbound tables missing primary keys: ${missingPrimaryKeys.join(', ')}.`);
  const externalReferences = catalog.constraints.filter((row) => row.constraint_type === 'f' && !String(row.referenced_table || '').startsWith('outbound_'));
  if (externalReferences.length) fail('An outbound foreign key references a legacy table.');
  if (catalog.triggers.some((row) => row.tgenabled !== 'O')) fail('Every outbound trigger must be enabled.');

  const defaultMap = new Map(catalog.defaults.map((row) => [`${row.table_name}.${row.column_name}`, row.default_expression]));
  const expectedDefaults = {
    'outbound_settings.shadow_mode_enabled': 'true',
    'outbound_settings.live_sending_enabled': 'false',
    'outbound_settings.emergency_paused': 'false',
    'outbound_settings.daily_send_limit': '30',
    'outbound_settings.monthly_openai_budget_cents': '800',
    'outbound_settings.openai_project_limit_recommendation_cents': '1000',
    'outbound_settings.monthly_provider_budget_cents': '0',
  };
  for (const [key, expected] of Object.entries(expectedDefaults)) {
    if (String(defaultMap.get(key)).toLowerCase() !== expected) fail(`Unexpected default for ${key}.`);
  }

  const row = catalog.settings[0];
  if (catalog.settings.length !== 1
      || Number(row.id) !== 1
      || row.shadow_mode_enabled !== true
      || row.live_sending_enabled !== false
      || row.emergency_paused !== false
      || Number(row.daily_send_limit) !== 30
      || Number(row.monthly_openai_budget_cents) !== 800
      || Number(row.openai_project_limit_recommendation_cents) !== 1000
      || Number(row.monthly_provider_budget_cents) !== 0) {
    fail('The default outbound settings row is not in the required safe state.');
  }

  return {
    tables: catalog.tables.length,
    indexes: catalog.indexes.length,
    constraints: catalog.constraints.length,
    triggers: catalog.triggers.length,
    functions: catalog.functions.length,
    defaults: catalog.defaults.length,
  };
}

async function verifyBehavior(sql) {
  const marker = `phase1-validation-${crypto.randomUUID()}`;
  const prospects = await sql(
    `INSERT INTO outbound_prospects (
       source_provider_id, source_record_id, business_name, normalized_business_name, dedupe_fingerprint
     ) VALUES ('validation_provider', $1, 'Phase 1 Validation', 'phase 1 validation', $2)
     RETURNING id`,
    [marker, `validation:${marker}`],
  );
  const prospectId = prospects[0].id;
  const opportunities = await sql(
    `INSERT INTO outbound_opportunities (prospect_id, name)
     VALUES ($1, 'Phase 1 Validation') RETURNING id`,
    [prospectId],
  );
  const opportunityId = opportunities[0].id;

  await sql(`UPDATE outbound_prospects SET status = 'qualified' WHERE id = $1`, [prospectId]);
  await sql(`UPDATE outbound_opportunities SET status = 'interested' WHERE id = $1`, [opportunityId]);
  const auditRows = await sql(
    `SELECT id, action FROM outbound_audit_log
      WHERE entity_id IN ($1, $2)
      ORDER BY id`,
    [prospectId, opportunityId],
  );
  sameList(auditRows.map((row) => row.action), ['opportunity.status_changed', 'prospect.status_changed'], 'Status audit actions');

  let immutable = false;
  try {
    await sql(`UPDATE outbound_audit_log SET action = 'validation.invalid' WHERE id = $1`, [auditRows[0].id]);
  } catch (error) {
    immutable = /append-only/i.test(String(error?.message || ''));
  }
  if (!immutable) fail('The audit log accepted or did not clearly reject an update.');

  await sql(`DELETE FROM outbound_opportunities WHERE id = $1`, [opportunityId]);
  await sql(`DELETE FROM outbound_prospects WHERE id = $1`, [prospectId]);
  return { statusAuditRows: auditRows.length, auditImmutable: true };
}

async function assertOutboundAbsent(sql) {
  const rows = await sql(`
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE 'outbound\\_%' ESCAPE '\\'
    UNION ALL
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'outbound\\_%' ESCAPE '\\'
  `);
  if (rows.length) fail(`Rollback left ${rows.length} outbound catalog objects.`);
}

async function main() {
  const mode = process.argv[2] || '--verify';
  if (!MODES.has(mode)) fail(`Mode must be one of: ${[...MODES].join(', ')}.`);

  const target = validateTarget(loadDatabaseUrl());
  const migrationSql = fs.readFileSync(path.join(__dirname, '../migrations/021_outbound_sales_foundation.sql'), 'utf8');
  const rollbackSql = fs.readFileSync(path.join(__dirname, '../migrations/021_outbound_sales_foundation.rollback.sql'), 'utf8');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(target.databaseUrl);

  const identity = await sql(`
    SELECT current_database() AS database_name,
           current_user AS database_user,
           current_setting('transaction_read_only') AS transaction_read_only
  `);
  if (identity[0]?.transaction_read_only !== 'off') fail('The isolated staging connection is read-only.');

  const legacyBefore = await legacyCatalogSnapshot(sql);
  const rowsBefore = await legacyRowCounts(sql);

  if (mode === '--apply' || mode === '--rollback-cycle') {
    await executeTransactionalSql(sql, migrationSql, 'Migration 021');
  }
  const firstValidation = await verifyOutboundCatalog(sql, migrationSql);
  const behavior = await verifyBehavior(sql);

  const legacyAfterApply = await legacyCatalogSnapshot(sql);
  const rowsAfterApply = await legacyRowCounts(sql);
  if (legacyAfterApply.hash !== legacyBefore.hash || rowsAfterApply.hash !== rowsBefore.hash) {
    fail('Migration 021 changed the catalog or row counts of a legacy table.');
  }

  let rollback = null;
  let finalValidation = firstValidation;
  if (mode === '--rollback-cycle') {
    await executeTransactionalSql(sql, rollbackSql, 'Migration 021 rollback');
    await assertOutboundAbsent(sql);
    const legacyAfterRollback = await legacyCatalogSnapshot(sql);
    const rowsAfterRollback = await legacyRowCounts(sql);
    if (legacyAfterRollback.hash !== legacyBefore.hash || rowsAfterRollback.hash !== rowsBefore.hash) {
      fail('Rollback changed the catalog or row counts of a legacy table.');
    }

    await executeTransactionalSql(sql, migrationSql, 'Migration 021');
    finalValidation = await verifyOutboundCatalog(sql, migrationSql);
    rollback = { removedEveryOutboundObject: true, migrationReapplied: true };
  }

  console.log(JSON.stringify({
    ok: true,
    target: {
      provider: 'Neon',
      endpointId: target.endpointId,
      branchLabel: target.branchLabel,
      databaseName: identity[0]?.database_name,
      databaseUser: identity[0]?.database_user,
      writable: true,
    },
    catalog: finalValidation,
    behavior,
    legacyIsolation: {
      catalogObjectsCompared: legacyBefore.count,
      tablesCompared: rowsBefore.count,
      catalogUnchanged: true,
      rowCountsUnchanged: true,
    },
    rollback,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, code: error?.code || 'OUTBOUND_STAGING_VALIDATION_FAILED', message: safeError(error) }));
    process.exitCode = 1;
  });
}
