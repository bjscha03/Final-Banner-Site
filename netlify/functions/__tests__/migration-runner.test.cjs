'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  prepareMigrationStatements,
  runMigration,
  splitSqlStatements,
} = require('../../../migrations/run-migration.cjs');

test('SQL splitter ignores semicolons in comments, quotes, and dollar-quoted bodies', () => {
  const source = String.raw`
    -- ignored ; BEGIN; COMMIT;
    SELECT 'single;quote', 'doubled '' quote;', "identifier;name";
    /* outer ; /* nested ; */ still ignored ; */
    DO $body$
    BEGIN
      PERFORM 'inside;body';
      -- internal ; comment
      PERFORM 2;
    END
    $body$;
    SELECT E'escaped\\\';semicolon;', 3;
  `;

  const statements = splitSqlStatements(source);
  assert.equal(statements.length, 3);
  assert.match(statements[0], /single;quote/);
  assert.match(statements[1], /^DO \$body\$/);
  assert.match(statements[1], /PERFORM 2;/);
  assert.match(statements[2], /^SELECT E'escaped/);
});

test('migration preparation removes only a matched outer transaction wrapper', () => {
  const statements = prepareMigrationStatements(`
    BEGIN;
    SELECT 1;
    DO $$ BEGIN PERFORM 2; END $$;
    COMMIT;
  `);
  assert.deepEqual(statements, ['SELECT 1', 'DO $$ BEGIN PERFORM 2; END $$']);
  assert.throws(() => prepareMigrationStatements('BEGIN; SELECT 1;'), /both outer BEGIN and COMMIT/);
  assert.throws(() => prepareMigrationStatements('SELECT 1; COMMIT;'), /both outer BEGIN and COMMIT/);
  assert.throws(
    () => prepareMigrationStatements('SELECT 1; BEGIN; SELECT 2;'),
    /Nested transaction control/,
  );
});

test('migration 035 parses its DO block as one statement and runs in one Neon transaction', async () => {
  const migrationPath = path.resolve(__dirname, '../../../migrations/035_abandoned_cart_analytics_and_delivery_safety.sql');
  const parsed = prepareMigrationStatements(fs.readFileSync(migrationPath, 'utf8'));
  assert.equal(parsed.filter((statement) => statement.startsWith('DO $schema_repair$')).length, 1);
  assert.equal(parsed.some((statement) => /^(BEGIN|COMMIT)$/i.test(statement)), false);

  const executed = [];
  let transactionCalls = 0;
  const db = () => {
    throw new Error('migration statements must be submitted through transaction()');
  };
  db.transaction = async (builder) => {
    transactionCalls += 1;
    const transactionSql = (statement, parameters) => {
      executed.push({ statement, parameters });
      return { statement, parameters };
    };
    const queries = builder(transactionSql);
    assert.equal(queries.length, parsed.length);
    return queries;
  };

  await runMigration('035_abandoned_cart_analytics_and_delivery_safety.sql', {
    databaseUrl: 'postgres://migration-test.invalid/database',
    neonFactory: () => db,
  });

  assert.equal(transactionCalls, 1);
  assert.deepEqual(executed.map(({ statement }) => statement), parsed);
  assert.equal(executed.every(({ parameters }) => Array.isArray(parameters) && parameters.length === 0), true);
});

test('SQL splitter fails closed for unterminated lexical constructs', () => {
  assert.throws(() => splitSqlStatements("SELECT 'unterminated"), /Unterminated SQL string/);
  assert.throws(() => splitSqlStatements('DO $tag$ BEGIN;'), /Unterminated SQL dollar quote/);
  assert.throws(() => splitSqlStatements('SELECT 1 /* missing'), /Unterminated SQL block comment/);
});
