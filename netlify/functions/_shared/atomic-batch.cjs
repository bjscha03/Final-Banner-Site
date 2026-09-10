'use strict';

/**
 * Execute a fixed list of Neon HTTP queries in one non-interactive Postgres
 * transaction. The HTTP driver's transaction API does not support async
 * callbacks; all queries must be constructed before this function is called.
 */
async function runAtomicBatch(sql, queries, options) {
  if (!sql || typeof sql.transaction !== 'function') {
    throw new TypeError('A Neon SQL client with transaction() is required.');
  }
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new TypeError('Atomic transactions require a non-empty query array.');
  }

  return options
    ? sql.transaction(queries, options)
    : sql.transaction(queries);
}

function isUniqueViolation(error) {
  return Boolean(error && (error.code === '23505' || error.cause?.code === '23505'));
}

module.exports = {
  runAtomicBatch,
  isUniqueViolation,
};
