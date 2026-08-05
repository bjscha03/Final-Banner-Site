'use strict';

const { neon } = require('@neondatabase/serverless');

function getDatabaseUrl(env = process.env) {
  return env.NETLIFY_DATABASE_URL || env.DATABASE_URL || '';
}

function createSql(env = process.env) {
  const databaseUrl = getDatabaseUrl(env);
  if (!databaseUrl) {
    const error = new Error('Outbound database connection is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return neon(databaseUrl);
}

function isMissingOutboundSchema(error) {
  return error?.code === '42P01' && /outbound_/i.test(String(error?.message || ''));
}

module.exports = { getDatabaseUrl, createSql, isMissingOutboundSchema };
