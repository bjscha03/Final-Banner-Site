'use strict';

const fs = require('fs');
const path = require('path');

function dollarQuoteAt(sql, index) {
  const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
  return match ? match[0] : null;
}

/**
 * Split PostgreSQL source without treating semicolons inside strings,
 * identifiers, comments, or dollar-quoted function/DO bodies as terminators.
 * Comments are replaced with whitespace so they cannot hide transaction
 * control statements or accidentally join adjacent tokens.
 */
function splitSqlStatements(source) {
  const sql = String(source || '');
  const statements = [];
  let current = '';
  let state = 'normal';
  let dollarDelimiter = null;
  let blockCommentDepth = 0;
  let singleQuoteBackslashEscapes = false;

  const finishStatement = () => {
    const statement = current.trim();
    if (statement) statements.push(statement);
    current = '';
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        current += char;
        state = 'normal';
      } else {
        current += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockCommentDepth += 1;
        current += '  ';
        index += 1;
      } else if (char === '*' && next === '/') {
        blockCommentDepth -= 1;
        current += '  ';
        index += 1;
        if (blockCommentDepth === 0) state = 'normal';
      } else {
        current += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (state === 'single-quote') {
      current += char;
      if (singleQuoteBackslashEscapes && char === '\\' && next !== undefined) {
        current += next;
        index += 1;
      } else if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        state = 'normal';
        singleQuoteBackslashEscapes = false;
      }
      continue;
    }

    if (state === 'double-quote') {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarDelimiter, index)) {
        current += dollarDelimiter;
        index += dollarDelimiter.length - 1;
        dollarDelimiter = null;
        state = 'normal';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += '  ';
      index += 1;
      state = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      current += '  ';
      index += 1;
      blockCommentDepth = 1;
      state = 'block-comment';
      continue;
    }
    if (char === "'") {
      singleQuoteBackslashEscapes = /(?:^|[^A-Za-z0-9_$])(?:E|U&)$/.test(current);
      current += char;
      state = 'single-quote';
      continue;
    }
    if (char === '"') {
      current += char;
      state = 'double-quote';
      continue;
    }
    if (char === '$') {
      const delimiter = dollarQuoteAt(sql, index);
      if (delimiter) {
        current += delimiter;
        index += delimiter.length - 1;
        dollarDelimiter = delimiter;
        state = 'dollar-quote';
        continue;
      }
    }
    if (char === ';') {
      finishStatement();
      continue;
    }
    current += char;
  }

  if (state === 'block-comment') throw new SyntaxError('Unterminated SQL block comment');
  if (state === 'single-quote') throw new SyntaxError('Unterminated SQL string literal');
  if (state === 'double-quote') throw new SyntaxError('Unterminated SQL quoted identifier');
  if (state === 'dollar-quote') {
    throw new SyntaxError(`Unterminated SQL dollar quote ${dollarDelimiter}`);
  }

  finishStatement();
  return statements;
}

function transactionControl(statement) {
  const normalized = statement.trim().replace(/\s+/g, ' ');
  if (/^(?:BEGIN(?: (?:WORK|TRANSACTION))?|START TRANSACTION)(?: .*)?$/i.test(normalized)) return 'begin';
  if (/^(?:COMMIT|END)(?: WORK)?$/i.test(normalized)) return 'commit';
  if (/^ROLLBACK(?: WORK)?$/i.test(normalized)) return 'rollback';
  return null;
}

/**
 * The Neon HTTP transaction API owns BEGIN/COMMIT. Accept a conventional outer
 * wrapper in migration files, remove it, and reject nested transaction control
 * that the non-interactive API cannot represent safely.
 */
function prepareMigrationStatements(source) {
  const statements = splitSqlStatements(source);
  const firstControl = statements.length ? transactionControl(statements[0]) : null;
  const lastControl = statements.length ? transactionControl(statements.at(-1)) : null;

  if ((firstControl === 'begin') !== (lastControl === 'commit')) {
    throw new SyntaxError('Migration must contain both outer BEGIN and COMMIT, or neither');
  }

  const prepared = firstControl === 'begin' ? statements.slice(1, -1) : statements.slice();
  const nestedControl = prepared.find(transactionControl);
  if (nestedControl) {
    throw new SyntaxError(`Nested transaction control is not supported: ${nestedControl.slice(0, 80)}`);
  }
  return prepared;
}

async function runMigration(filename, options = {}) {
  const databaseUrl = options.databaseUrl
    || process.env.DATABASE_URL
    || process.env.NETLIFY_DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL or NETLIFY_DATABASE_URL environment variable not set');

  let neonFactory = options.neonFactory;
  if (!neonFactory) {
    try {
      ({ neon: neonFactory } = require('@neondatabase/serverless'));
    } catch (error) {
      throw new Error('Failed to import @neondatabase/serverless. Run: npm install @neondatabase/serverless', {
        cause: error,
      });
    }
  }

  const migrationPath = path.resolve(__dirname, filename);
  if (!migrationPath.startsWith(`${path.resolve(__dirname)}${path.sep}`)) {
    throw new Error('Migration file must be inside the migrations directory');
  }
  if (!fs.existsSync(migrationPath)) throw new Error(`Migration file not found: ${migrationPath}`);

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const statements = prepareMigrationStatements(migrationSql);
  if (statements.length === 0) throw new Error(`Migration contains no executable statements: ${filename}`);

  const db = neonFactory(databaseUrl);
  if (typeof db.transaction !== 'function') {
    throw new Error('Configured Neon client does not support atomic transactions');
  }

  console.log(`✓ Running ${filename} atomically (${statements.length} statements)`);
  await db.transaction((transactionSql) => (
    statements.map((statement) => transactionSql(statement, []))
  ));
  console.log('✓ Migration completed successfully');
}

if (require.main === module) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node migrations/run-migration.cjs <migration-file.sql>');
    process.exitCode = 1;
  } else {
    runMigration(filename).catch((error) => {
      console.error('❌ Migration failed:', error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = {
  dollarQuoteAt,
  prepareMigrationStatements,
  runMigration,
  splitSqlStatements,
  transactionControl,
};
