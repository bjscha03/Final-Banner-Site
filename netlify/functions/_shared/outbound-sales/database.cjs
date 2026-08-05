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
  const message = String(error?.message || '');
  if (error?.code === '42P01' && /outbound_/i.test(message)) return true;
  return error?.code === '42703' && /(research_state|contact_state|qualification_version|exclusion_codes|send_eligible|mx_status|page_manifest|provider_credits|request_key)/i.test(message);
}

module.exports = { getDatabaseUrl, createSql, isMissingOutboundSchema };
