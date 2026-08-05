'use strict';

function fail(message) {
  const error = new Error(message);
  error.code = 'OUTBOUND_STAGING_VALIDATION_FAILED';
  throw error;
}

function splitSqlStatements(source) {
  if (typeof source !== 'string') fail('SQL source must be a string.');

  const statements = [];
  let current = '';
  let state = 'normal';
  let dollarTag = '';
  let blockCommentDepth = 0;

  for (let index = 0; index < source.length;) {
    const character = source[index];
    const next = source[index + 1];

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = '';
      } else {
        current += character;
        index += 1;
      }
      continue;
    }

    if (state === 'single_quote') {
      current += character;
      index += 1;
      if (character === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (character === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double_quote') {
      current += character;
      index += 1;
      if (character === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (character === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'line_comment') {
      index += 1;
      if (character === '\n') {
        current += '\n';
        state = 'normal';
      }
      continue;
    }

    if (state === 'block_comment') {
      if (character === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 2;
      } else if (character === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 2;
        if (blockCommentDepth === 0) {
          current += ' ';
          state = 'normal';
        }
      } else {
        index += 1;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      state = 'line_comment';
      index += 2;
      continue;
    }
    if (character === '/' && next === '*') {
      state = 'block_comment';
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      state = 'single_quote';
      current += character;
      index += 1;
      continue;
    }
    if (character === '"') {
      state = 'double_quote';
      current += character;
      index += 1;
      continue;
    }
    if (character === '$') {
      const tag = source.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (tag) {
        dollarTag = tag;
        current += tag;
        index += tag.length;
        continue;
      }
    }
    if (character === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  if (dollarTag || ['single_quote', 'double_quote', 'block_comment'].includes(state)) {
    fail('SQL source contains an unterminated quoted value or comment.');
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function transactionBodyStatements(source, label = 'SQL file') {
  const statements = splitSqlStatements(source);
  const normalize = (statement) => statement.replace(/\s+/g, ' ').trim().toUpperCase();
  if (statements.length < 3 || normalize(statements[0]) !== 'BEGIN' || normalize(statements.at(-1)) !== 'COMMIT') {
    fail(`${label} must have one explicit BEGIN/COMMIT wrapper.`);
  }
  const body = statements.slice(1, -1);
  if (body.some((statement) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalize(statement)))) {
    fail(`${label} contains a nested transaction control statement.`);
  }
  return body;
}

module.exports = { splitSqlStatements, transactionBodyStatements };
