'use strict';

const crypto = require('node:crypto');
const { createSql, getDatabaseUrl } = require('./database.cjs');
const repository = require('./morning-repository.cjs');
const preparation = require('./morning-preparation.cjs');

function authorizedBackground(event, env = process.env) {
  const expected = Buffer.from(String(env.OUTBOUND_MORNING_PREP_SECRET || ''));
  const presented = Buffer.from(String(event?.headers?.['x-morning-prep-token'] || event?.headers?.['X-Morning-Prep-Token'] || ''));
  return expected.length >= 32 && expected.length === presented.length && crypto.timingSafeEqual(expected, presented);
}

function deploymentOrigin(env = process.env) {
  for (const candidate of [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL, env.PUBLIC_SITE_URL]) {
    try {
      const url = new URL(String(candidate || ''));
      if (url.protocol === 'https:' && url.hostname) return url.origin;
    } catch {
      // Try the next platform-provided origin.
    }
  }
  throw Object.assign(new Error('A secure deployment origin is required.'), { code: 'MORNING_DEPLOYMENT_ORIGIN_MISSING' });
}

function response(statusCode = 204) {
  return { statusCode, headers: { 'Cache-Control': 'no-store' }, body: '' };
}

async function dispatchBackground(action, payload, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const result = await fetchImpl(`${deploymentOrigin(env)}/.netlify/functions/outbound-sales-morning-prepare-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Morning-Prep-Token': String(env.OUTBOUND_MORNING_PREP_SECRET || ''),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!result.ok && result.status !== 202) {
    const error = new Error(`Morning background dispatch failed with ${result.status}.`);
    error.code = 'MORNING_BACKGROUND_DISPATCH_FAILED';
    throw error;
  }
  return result.status;
}

function createMorningScheduledHandler({ action, dependencies = {}, env = process.env } = {}) {
  return async function morningScheduledHandler(event = {}) {
    if (!getDatabaseUrl(env)) return response();
    const sql = (dependencies.createSql || createSql)(env);
    const date = preparation.businessDate(new Date());
    const batch = await (dependencies.ensureMorningBatch || repository.ensureMorningBatch)(sql, {
      businessDate: date, targetCount: preparation.MORNING_TARGET, providerId: 'apollo',
    });
    try {
      preparation.assertMorningConfiguration(env);
      if (batch?.status === 'ready') return response();
      if (action === 'launch') {
        await Promise.all(preparation.MORNING_COHORTS.map((_, shardIndex) => (
          (dependencies.dispatchBackground || dispatchBackground)('discover', {
            businessDate: date, shardIndex,
          }, { env, fetchImpl: dependencies.fetch || globalThis.fetch })
        )));
      } else if (action === 'replenish') {
        await Promise.all(preparation.MORNING_COHORTS.map((_, cohortIndex) => {
          const shardIndex = preparation.MORNING_COHORTS.length + cohortIndex;
          return (dependencies.dispatchBackground || dispatchBackground)('discover', {
            businessDate: date, shardIndex,
          }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
        }));
      } else if (action === 'finalize') {
        await (dependencies.dispatchBackground || dispatchBackground)('finalize', {
          businessDate: date,
        }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
      }
    } catch (error) {
      await (dependencies.markMorningBatchFailure || repository.markMorningBatchFailure)(sql, {
        batchId: batch.id, errorCode: error?.code || 'MORNING_SCHEDULE_FAILED',
      }).catch(() => null);
    }
    return response();
  };
}

function createMorningBackgroundHandler({ dependencies = {}, env = process.env, getStore } = {}) {
  return async function morningBackgroundHandler(event) {
    if (event?.httpMethod !== 'POST') return response(405);
    if (!authorizedBackground(event, env)) return response(404);
    if (!getDatabaseUrl(env)) return response();
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return response(400); }
    const sql = (dependencies.createSql || createSql)(env);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.businessDate || ''))
      ? String(body.businessDate)
      : preparation.businessDate(new Date());
    try {
      if (body.action === 'discover') {
        await (dependencies.runMorningDiscoveryShard || preparation.runMorningDiscoveryShard)({
          sql, env, businessDate: date,
          shardIndex: Math.max(0, Math.min(preparation.MORNING_SHARD_COUNT - 1, Number(body.shardIndex) || 0)),
          dependencies: dependencies.preparation,
          requestId: event.headers?.['x-nf-request-id'] || null,
        });
      } else if (body.action === 'finalize') {
        await (dependencies.runMorningFinalizer || preparation.runMorningFinalizer)({
          sql, env, businessDate: date,
          store: typeof getStore === 'function' ? getStore() : undefined,
          dependencies: dependencies.preparation,
          requestId: event.headers?.['x-nf-request-id'] || null,
        });
      } else {
        return response(400);
      }
    } catch (error) {
      console.error('[outbound-sales] morning preparation failed safely', {
        action: String(body.action || '').slice(0, 20),
        code: String(error?.code || 'MORNING_PREPARATION_FAILED').replace(/[^A-Z0-9_.-]/gi, '').slice(0, 100),
      });
    }
    return response();
  };
}

module.exports = {
  authorizedBackground,
  deploymentOrigin,
  dispatchBackground,
  createMorningScheduledHandler,
  createMorningBackgroundHandler,
};
