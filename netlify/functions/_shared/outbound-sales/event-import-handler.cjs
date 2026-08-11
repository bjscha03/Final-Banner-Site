'use strict';

const crypto = require('node:crypto');
const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { authorize, json, parseJsonBody, safeFailure } = require('./security.cjs');
const morningRepository = require('./morning-repository.cjs');
const eventRepository = require('./event-import-repository.cjs');
const eventImport = require('./event-import.cjs');
const { authorizedBackground, deploymentOrigin } = require('./morning-handler.cjs');
const { businessDate, MORNING_TARGET } = require('./morning-preparation.cjs');

const MAX_FINALIZER_PASSES = 8;

function safeCode(error, fallback = 'EVENT_IMPORT_FAILED') {
  return String(error?.code || fallback).toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '_').slice(0, 100) || fallback;
}

function constantTimeTokenMatch(presented, expected) {
  const candidate = Buffer.from(String(presented || ''));
  const secret = Buffer.from(String(expected || ''));
  return secret.length >= 32 && candidate.length === secret.length
    && crypto.timingSafeEqual(candidate, secret);
}

function eventTokenAuthorized(event, env = process.env) {
  const header = event?.headers?.['x-outbound-event-import-token']
    || event?.headers?.['X-Outbound-Event-Import-Token'];
  return constantTimeTokenMatch(header, env.OUTBOUND_EVENT_IMPORT_TOKEN);
}

function authorizeEventRequest(event, { env = process.env, mutating = false } = {}) {
  if (eventTokenAuthorized(event, env)) return { actorId: 'event-import-token' };
  const auth = authorize(event, { requireOrigin: mutating });
  if (auth.response) return { response: auth.response };
  return { actorId: String(auth.session.email || auth.session.sub || 'admin').slice(0, 200) };
}

function assertDispatchConfiguration(env = process.env) {
  if (String(env.OUTBOUND_MORNING_PREP_SECRET || '').length < 32) {
    const error = new Error('Event preparation background dispatch is not configured.');
    error.code = 'EVENT_IMPORT_NOT_CONFIGURED';
    throw error;
  }
  deploymentOrigin(env);
}

async function dispatchEventBackground(action, payload, {
  env = process.env, fetchImpl = globalThis.fetch,
} = {}) {
  assertDispatchConfiguration(env);
  const response = await fetchImpl(
    `${deploymentOrigin(env)}/.netlify/functions/outbound-sales-event-import-background`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Morning-Prep-Token': String(env.OUTBOUND_MORNING_PREP_SECRET),
      },
      body: JSON.stringify({ action, ...payload }),
    },
  );
  if (![200, 202, 204].includes(response.status)) {
    const error = new Error('Event preparation background dispatch failed.');
    error.code = 'EVENT_IMPORT_DISPATCH_FAILED';
    throw error;
  }
  return response.status;
}

function mapBatchStatus(row) {
  if (!row) return null;
  const metadata = row.run_metadata || {};
  return {
    batchId: row.id,
    businessDate: row.business_date,
    targetCount: Number(row.target_count) || MORNING_TARGET,
    status: row.status,
    discoveredCount: Number(row.discovered_count) || 0,
    attachedCount: Number(row.new_prospect_count) || 0,
    qualifiedCount: Number(row.qualified_count) || 0,
    messageReadyCount: Number(row.message_ready_count) || 0,
    mockupReadyCount: Number(row.mockup_ready_count) || 0,
    importShardCount: Number(row.import_shard_count) || 0,
    completedImportShardCount: Number(row.completed_import_shard_count) || 0,
    runningImportShardCount: Number(row.running_import_shard_count) || 0,
    failedImportShardCount: Number(row.failed_import_shard_count) || 0,
    phase: String(metadata.phase || row.status || '').slice(0, 40),
    sourceRecordCount: Math.max(0, Number(metadata.sourceRecordCount) || 0),
    primaryRecordCount: Math.max(0, Number(metadata.primaryRecordCount) || 0),
    reserveRecordCount: Math.max(0, Number(metadata.reserveRecordCount) || 0),
    finalizerPass: Math.max(0, Number(metadata.finalizerPass) || 0),
    lastErrorCode: row.last_error_code || null,
    startedAt: row.started_at || null,
    readyAt: row.ready_at || null,
    updatedAt: row.updated_at || null,
    externalEmailsSent: 0,
    manualSendingOnly: true,
  };
}

function createEventImportHandler({ dependencies = {}, env = process.env } = {}) {
  const repository = { ...morningRepository, ...eventRepository, ...(dependencies.repository || {}) };
  return async function eventImportHandler(event = {}) {
    if (event.httpMethod === 'OPTIONS') {
      return json(204, {}, {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session, X-Outbound-Event-Import-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
    }
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
    }
    const auth = authorizeEventRequest(event, { env, mutating: event.httpMethod === 'POST' });
    if (auth.response) return auth.response;
    if (!getDatabaseUrl(env)) return safeFailure(Object.assign(new Error('Database is not configured.'), { code: 'DATABASE_NOT_CONFIGURED' }));
    const date = businessDate(new Date());
    try {
      const sql = (dependencies.createSql || createSql)(env);
      if (event.httpMethod === 'GET') {
        const row = await repository.loadEventBatchStatus(sql, {
          businessDate: date, eventKey: eventImport.eventData.key,
        });
        return json(200, {
          ok: true, eventKey: eventImport.eventData.key, batch: mapBatchStatus(row),
          externalEmailsSent: 0, manualSendingOnly: true,
        });
      }
      const body = parseJsonBody(event);
      if (body?.action && body.action !== 'start') {
        return json(400, { ok: false, error: 'INVALID_EVENT_IMPORT', message: 'Only preparation can be started here.' });
      }
      if (body?.eventKey && body.eventKey !== eventImport.eventData.key) {
        return json(400, { ok: false, error: 'INVALID_EVENT_IMPORT', message: 'The requested event source is unavailable.' });
      }
      assertDispatchConfiguration(env);
      const batch = await repository.ensureEventBatch(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        targetCount: MORNING_TARGET, providerId: eventImport.EVENT_PROVIDER_ID,
      });
      if (!batch) throw Object.assign(new Error('The event batch failed its logical identity check.'), { code: 'EVENT_IMPORT_BATCH_CONFLICT' });
      const current = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
      });
      if (current?.status === 'ready' && Number(current.mockup_ready_count) >= MORNING_TARGET) {
        return json(200, {
          ok: true, queued: false, alreadyReady: true,
          eventKey: eventImport.eventData.key, batch: mapBatchStatus(current),
          externalEmailsSent: 0, manualSendingOnly: true,
        });
      }
      await repository.recordEventProgress(sql, {
        batchId: batch.id, status: 'discovering', lastErrorCode: null,
        metadata: {
          phase: 'queued', eventKey: eventImport.eventData.key,
          sourceDataVersion: eventImport.eventData.version,
          sourceDatasetSha256: eventImport.eventData.sourceDatasetSha256,
          sourceRecordCount: eventImport.eventData.records.length,
          primaryRecordCount: eventImport.eventData.primaryRecordCount,
          reserveRecordCount: eventImport.eventData.records.length - eventImport.eventData.primaryRecordCount,
          requestedBy: auth.actorId, manualSendingOnly: true, externalEmailsSent: 0,
        },
      });
      await (dependencies.dispatchEventBackground || dispatchEventBackground)('import', {
        eventKey: eventImport.eventData.key, businessDate: date, shardIndex: 0,
      }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
      const queued = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
      });
      return json(202, {
        ok: true, queued: true, alreadyReady: false,
        eventKey: eventImport.eventData.key, batch: mapBatchStatus(queued),
        externalEmailsSent: 0, manualSendingOnly: true,
      });
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        return safeFailure(Object.assign(new Error('Outbound schema is not ready.'), { code: 'OUTBOUND_SCHEMA_NOT_READY' }));
      }
      return safeFailure(error);
    }
  };
}

function emptyResponse(statusCode = 204) {
  return { statusCode, headers: { 'Cache-Control': 'no-store' }, body: '' };
}

function createEventImportBackgroundHandler({
  dependencies = {}, env = process.env, getStore, sharp,
} = {}) {
  const repository = { ...morningRepository, ...eventRepository, ...(dependencies.repository || {}) };
  return async function eventImportBackgroundHandler(event = {}) {
    if (event.httpMethod !== 'POST') return emptyResponse(405);
    if (!authorizedBackground(event, env)) return emptyResponse(404);
    if (!getDatabaseUrl(env)) return emptyResponse();
    let body;
    try { body = parseJsonBody(event); } catch { return emptyResponse(400); }
    if (body.eventKey !== eventImport.eventData.key) return emptyResponse(400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.businessDate || ''))
      ? String(body.businessDate)
      : businessDate(new Date());
    const sql = (dependencies.createSql || createSql)(env);
    const requestId = event.headers?.['x-nf-request-id'] || null;
    try {
      if (body.action === 'import') {
        const shardIndex = Number(body.shardIndex);
        const result = await (dependencies.runEventImportShard || eventImport.runEventImportShard)({
          sql, env, businessDate: date, shardIndex, requestId,
          dependencies: dependencies.preparation,
        });
        if (result.shardStatus === 'succeeded') {
          if (shardIndex + 1 < result.shardCount) {
            await (dependencies.dispatchEventBackground || dispatchEventBackground)('import', {
              eventKey: eventImport.eventData.key, businessDate: date, shardIndex: shardIndex + 1,
            }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
          } else {
            await (dependencies.dispatchEventBackground || dispatchEventBackground)('finalize', {
              eventKey: eventImport.eventData.key, businessDate: date, finalizerPass: 0,
            }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
          }
        }
      } else if (body.action === 'finalize') {
        const finalizerPass = Math.max(0, Math.min(MAX_FINALIZER_PASSES - 1, Number(body.finalizerPass) || 0));
        const result = await (dependencies.runEventFinalizer || eventImport.runEventFinalizer)({
          sql, env, businessDate: date, finalizerPass, requestId,
          store: typeof getStore === 'function' ? getStore() : undefined,
          sharp,
          timeBudgetMs: eventImport.EVENT_FINALIZER_BUDGET_MS,
          dependencies: dependencies.preparation,
        });
        const hasMoreCandidates = result.processedCount < result.candidateCount
          || result.mockupFailureCount > 0 || result.timeBudgetReached;
        if (result.readyCount < MORNING_TARGET
            && finalizerPass + 1 < MAX_FINALIZER_PASSES
            && hasMoreCandidates) {
          await (dependencies.dispatchEventBackground || dispatchEventBackground)('finalize', {
            eventKey: eventImport.eventData.key, businessDate: date, finalizerPass: finalizerPass + 1,
          }, { env, fetchImpl: dependencies.fetch || globalThis.fetch });
        }
      } else {
        return emptyResponse(400);
      }
    } catch (error) {
      const code = safeCode(error);
      const batch = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
      }).catch(() => null);
      if (batch?.id) {
        await repository.recordEventProgress(sql, {
          batchId: batch.id, status: 'failed', lastErrorCode: code,
          metadata: { phase: 'failed', externalEmailsSent: 0 },
        }).catch(() => null);
      }
      console.error('[outbound-sales] event import/preparation failed safely', {
        action: String(body.action || '').slice(0, 20), code,
      });
    }
    return emptyResponse();
  };
}

module.exports = {
  MAX_FINALIZER_PASSES,
  constantTimeTokenMatch,
  eventTokenAuthorized,
  authorizeEventRequest,
  assertDispatchConfiguration,
  dispatchEventBackground,
  mapBatchStatus,
  createEventImportHandler,
  createEventImportBackgroundHandler,
};
