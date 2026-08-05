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
const EXPECTED_PHASE2_TABLES = Object.freeze([...EXPECTED_TABLES, 'outbound_prospect_sources'].sort());

const EXPECTED_PHASE2_COLUMNS = Object.freeze({
  outbound_prospects: ['contact_state', 'exclusion_codes', 'last_qualified_at', 'qualification_version', 'research_state'],
  outbound_contacts: ['active', 'domain_matches', 'is_free_mailbox', 'is_role_address', 'last_seen_at', 'mx_checked_at', 'mx_status', 'send_eligible', 'source_url', 'syntax_valid'],
  outbound_research_snapshots: ['cache_status', 'content_bytes', 'content_type', 'extraction_version', 'final_url', 'http_etag', 'http_last_modified', 'http_status', 'page_manifest'],
  outbound_provider_usage: ['provider_credits', 'rate_limit_remaining', 'rate_limit_reset_at', 'request_key', 'usage_metadata'],
});

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
const MODES = new Set([
  '--apply', '--verify', '--rollback-cycle',
  '--phase2-apply', '--phase2-verify', '--phase2-rollback-cycle',
]);

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
  if (!/(preview|staging|test|phase[-_ ]?[12])/i.test(branchLabel)) {
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

  const endpointId = parsed.hostname.split('.')[0].toLowerCase().replace(/-pooler$/, '');
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

async function verifyOutboundCatalog(sql, migrationSql, expectedTables = EXPECTED_TABLES) {
  const catalog = await outboundCatalog(sql);
  sameList(catalog.tables.map((row) => row.tablename), expectedTables, 'Outbound tables');
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
  const missingPrimaryKeys = expectedTables.filter((table) => !tablesWithPrimaryKeys.has(table));
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

async function verifyPhase2Catalog(sql, combinedMigrationSql) {
  const base = await verifyOutboundCatalog(sql, combinedMigrationSql, EXPECTED_PHASE2_TABLES);
  const columns = await sql(`
    SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY($1::text[])
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY c.relname, a.attname
  `, [Object.keys(EXPECTED_PHASE2_COLUMNS)]);
  const present = new Map();
  for (const row of columns) {
    if (!present.has(row.table_name)) present.set(row.table_name, new Set());
    present.get(row.table_name).add(row.column_name);
  }
  for (const [table, expected] of Object.entries(EXPECTED_PHASE2_COLUMNS)) {
    const missing = expected.filter((column) => !present.get(table)?.has(column));
    if (missing.length) fail(`Missing Phase 2 columns on ${table}: ${missing.join(', ')}.`);
  }

  const providerRows = await sql(`
    SELECT provider_id, provider_kind, display_name, enabled, non_secret_config,
           daily_request_limit, monthly_budget_cents
      FROM outbound_provider_configs
     WHERE provider_id = 'apollo'
  `);
  const provider = providerRows[0];
  if (providerRows.length !== 1
      || provider.provider_kind !== 'discovery'
      || provider.enabled !== false
      || Number(provider.daily_request_limit) !== 0
      || Number(provider.monthly_budget_cents) !== 0
      || provider.non_secret_config?.mode !== 'shadow'
      || provider.non_secret_config?.endpoint !== 'organization_search') {
    fail('Apollo provider defaults are not disabled and Shadow-Mode safe.');
  }
  return { ...base, phase2Columns: Object.values(EXPECTED_PHASE2_COLUMNS).flat().length, apolloDisabled: true };
}

async function verifyPhase2Behavior(sql) {
  const marker = crypto.randomUUID();
  const prospectRows = await sql(
    `INSERT INTO outbound_prospects (
       source_provider_id, source_record_id, business_name, normalized_business_name,
       dedupe_fingerprint, canonical_domain, website_url
     ) VALUES ('apollo', $1, 'Phase 2 Validation', 'phase 2 validation', $2, $3, $4)
     RETURNING id, research_state, contact_state, qualification_version`,
    [`phase2-${marker}`, `domain:phase2-${marker}.example.com`, `phase2-${marker}.example.com`, `https://phase2-${marker}.example.com`],
  );
  const prospect = prospectRows[0];
  if (prospect.research_state !== 'pending' || prospect.contact_state !== 'pending' || prospect.qualification_version !== 'deterministic-v1') {
    fail('Phase 2 prospect defaults are incorrect.');
  }
  await sql(
    `INSERT INTO outbound_prospect_sources (prospect_id, provider_id, provider_record_id, source_url)
     VALUES ($1, 'apollo', $2, $3), ($1, 'licensed_fixture', $4, $3)`,
    [prospect.id, `phase2-${marker}`, `https://phase2-${marker}.example.com`, `fixture-${marker}`],
  );
  const sourceRows = await sql(`SELECT COUNT(*)::integer AS count FROM outbound_prospect_sources WHERE prospect_id = $1`, [prospect.id]);
  if (Number(sourceRows[0]?.count) !== 2) fail('Provider-neutral prospect source mapping failed.');

  const contactRows = await sql(
    `INSERT INTO outbound_contacts (
       prospect_id, email, email_normalized, syntax_valid, mx_status,
       is_role_address, domain_matches, verification_status, contact_quality_score
     ) VALUES ($1, $2, $2, TRUE, 'present', FALSE, TRUE, 'unverified', 85)
     RETURNING active, send_eligible`,
    [prospect.id, `validation-${marker}@phase2-${marker}.example.com`],
  );
  if (contactRows[0]?.active !== true || contactRows[0]?.send_eligible !== false) {
    fail('Phase 2 contact defaults are not active and send-ineligible.');
  }

  const contentHash = crypto.createHash('sha256').update(marker).digest('hex');
  await sql(
    `INSERT INTO outbound_research_snapshots (
       prospect_id, content_hash, website_url, final_url, http_status, content_type,
       content_bytes, extraction_version, cache_status, page_manifest
     ) VALUES ($1, $2, $3, $3, 200, 'text/html', 128, 'deterministic-html-v1', 'fresh', '[]'::jsonb)`,
    [prospect.id, contentHash, `https://phase2-${marker}.example.com`],
  );
  await sql(
    `INSERT INTO outbound_provider_usage (
       provider_id, provider_kind, operation, request_key, request_count,
       result_count, estimated_cost_microusd, status, provider_credits
     ) VALUES ('apollo', 'discovery', 'organization_search', $1, 1, 1, 19600, 'completed', 1)`,
    [`phase2-validation-${marker}`],
  );
  await sql(
    `UPDATE outbound_prospects
        SET status = 'ready_for_outreach', lead_score = 70,
            score_breakdown = '{"industry":15,"visible_print_marketing_need":15}'::jsonb,
            score_explanation = '[{"factor":"industry","points":15}]'::jsonb,
            qualification_version = 'deterministic-v1', last_qualified_at = NOW()
      WHERE id = $1`,
    [prospect.id],
  );
  const auditRows = await sql(
    `SELECT COUNT(*)::integer AS count FROM outbound_audit_log
      WHERE entity_id = $1 AND action = 'prospect.status_changed'`,
    [prospect.id],
  );
  if (Number(auditRows[0]?.count) !== 1) fail('Phase 2 prospect status did not enter immutable audit history.');

  await sql(`DELETE FROM outbound_provider_usage WHERE request_key = $1`, [`phase2-validation-${marker}`]);
  await sql(`DELETE FROM outbound_prospects WHERE id = $1`, [prospect.id]);
  return { canonicalProspectSources: 2, sendEligibleDefault: false, deterministicStatusAudit: true };
}

async function assertPhase2RolledBack(sql) {
  const tables = await sql(`SELECT to_regclass('public.outbound_prospect_sources') AS source_table`);
  if (tables[0]?.source_table !== null) fail('Phase 2 rollback left outbound_prospect_sources.');
  const columns = await sql(`
    SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY($1::text[])
       AND a.attname = ANY($2::text[])
       AND a.attnum > 0 AND NOT a.attisdropped
  `, [Object.keys(EXPECTED_PHASE2_COLUMNS), Object.values(EXPECTED_PHASE2_COLUMNS).flat()]);
  if (columns.length) fail(`Phase 2 rollback left ${columns.length} additive columns.`);
  const provider = await sql(`SELECT 1 FROM outbound_provider_configs WHERE provider_id = 'apollo'`);
  if (provider.length) fail('Phase 2 rollback left the disabled Apollo configuration row.');
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
  const phase2MigrationSql = fs.readFileSync(path.join(__dirname, '../migrations/022_outbound_discovery_qualification.sql'), 'utf8');
  const phase2RollbackSql = fs.readFileSync(path.join(__dirname, '../migrations/022_outbound_discovery_qualification.rollback.sql'), 'utf8');
  const phase2 = mode.startsWith('--phase2-');
  const operation = phase2 ? `--${mode.slice('--phase2-'.length)}` : mode;
  const effectiveMigrationSql = phase2 ? `${migrationSql}\n${phase2MigrationSql}` : migrationSql;
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

  if (operation === '--apply' || operation === '--rollback-cycle') {
    await executeTransactionalSql(sql, migrationSql, 'Migration 021');
    if (phase2) await executeTransactionalSql(sql, phase2MigrationSql, 'Migration 022');
  }
  const firstValidation = phase2
    ? await verifyPhase2Catalog(sql, effectiveMigrationSql)
    : await verifyOutboundCatalog(sql, migrationSql);
  const behavior = phase2 ? await verifyPhase2Behavior(sql) : await verifyBehavior(sql);

  const legacyAfterApply = await legacyCatalogSnapshot(sql);
  const rowsAfterApply = await legacyRowCounts(sql);
  if (legacyAfterApply.hash !== legacyBefore.hash || rowsAfterApply.hash !== rowsBefore.hash) {
    fail(`Migration ${phase2 ? '021/022' : '021'} changed the catalog or row counts of a legacy table.`);
  }

  let rollback = null;
  let finalValidation = firstValidation;
  if (operation === '--rollback-cycle') {
    if (phase2) {
      await executeTransactionalSql(sql, phase2RollbackSql, 'Migration 022 rollback');
      await assertPhase2RolledBack(sql);
      await verifyOutboundCatalog(sql, migrationSql);
    } else {
      await executeTransactionalSql(sql, rollbackSql, 'Migration 021 rollback');
      await assertOutboundAbsent(sql);
    }
    const legacyAfterRollback = await legacyCatalogSnapshot(sql);
    const rowsAfterRollback = await legacyRowCounts(sql);
    if (legacyAfterRollback.hash !== legacyBefore.hash || rowsAfterRollback.hash !== rowsBefore.hash) {
      fail('Rollback changed the catalog or row counts of a legacy table.');
    }

    if (phase2) {
      await executeTransactionalSql(sql, phase2MigrationSql, 'Migration 022');
      finalValidation = await verifyPhase2Catalog(sql, effectiveMigrationSql);
      rollback = { removedEveryPhase2Object: true, phase1ObjectsPreserved: true, migrationReapplied: true };
    } else {
      await executeTransactionalSql(sql, migrationSql, 'Migration 021');
      finalValidation = await verifyOutboundCatalog(sql, migrationSql);
      rollback = { removedEveryOutboundObject: true, migrationReapplied: true };
    }
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
    phase: phase2 ? 2 : 1,
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
