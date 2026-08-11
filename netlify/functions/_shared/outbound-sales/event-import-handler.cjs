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
const DISPATCH_STALL_MS = 90 * 1000;

function safeDispatchHttpStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

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

function assertDispatchConfiguration(env = process.env, requestEvent) {
  if (String(env.OUTBOUND_MORNING_PREP_SECRET || '').length < 32) {
    const error = new Error('Event preparation background dispatch is not configured.');
    error.code = 'EVENT_IMPORT_NOT_CONFIGURED';
    throw error;
  }
  eventDispatchOrigin(env, requestEvent);
}

function secureOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password
      ? url.origin : null;
  } catch {
    return null;
  }
}

function safeSiteName(value) {
  const name = String(value || '').trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) ? name : null;
}

function immutableNetlifyDeployOrigin(event) {
  const deployId = String(event?.netlify?.deployId || '').trim().toLowerCase();
  const siteName = safeSiteName(event?.netlify?.siteName);
  if (!/^[0-9a-f]{24}$/.test(deployId) || !siteName) return null;
  return `https://${deployId}--${siteName}.netlify.app`;
}

function trustedRequestOrigin(event, env = process.env) {
  let requestUrl;
  try {
    requestUrl = new URL(String(event?.rawUrl || ''));
  } catch {
    return null;
  }
  if (requestUrl.protocol !== 'https:' || requestUrl.username || requestUrl.password) return null;

  const siteName = safeSiteName(event?.netlify?.siteName || env.SITE_NAME);
  if (siteName && (
    requestUrl.hostname === `${siteName}.netlify.app`
    || requestUrl.hostname.endsWith(`--${siteName}.netlify.app`)
  )) return requestUrl.origin;

  const productionOrigins = new Set([
    secureOrigin(env.URL), secureOrigin(env.PUBLIC_SITE_URL),
  ].filter(Boolean));
  return productionOrigins.has(requestUrl.origin) ? requestUrl.origin : null;
}

function eventDispatchOrigin(env = process.env, requestEvent) {
  const immutableOrigin = immutableNetlifyDeployOrigin(requestEvent);
  if (immutableOrigin) return immutableOrigin;

  const requestOrigin = trustedRequestOrigin(requestEvent, env);
  if (requestOrigin) return requestOrigin;

  const context = String(requestEvent?.netlify?.deployContext || env.CONTEXT || '')
    .trim().toLowerCase();
  if (['deploy-preview', 'branch-deploy'].includes(context)) {
    for (const candidate of [env.DEPLOY_PRIME_URL, env.DEPLOY_URL]) {
      const origin = secureOrigin(candidate);
      if (origin) return origin;
    }
    const error = new Error('A deploy-scoped preview origin is required.');
    error.code = 'EVENT_IMPORT_NOT_CONFIGURED';
    throw error;
  }
  return deploymentOrigin(env);
}

async function dispatchEventBackground(action, payload, {
  env = process.env, fetchImpl = globalThis.fetch, requestEvent,
} = {}) {
  assertDispatchConfiguration(env, requestEvent);
  const expectedOrigin = eventDispatchOrigin(env, requestEvent);
  const targetUrl = new URL(
    '/.netlify/functions/outbound-sales-event-import-background',
    `${expectedOrigin}/`,
  );
  if (targetUrl.origin !== expectedOrigin) {
    const error = new Error('Event preparation background dispatch origin is invalid.');
    error.code = 'EVENT_IMPORT_DISPATCH_ORIGIN_INVALID';
    throw error;
  }
  const headers = {
    'Content-Type': 'application/json',
    'X-Morning-Prep-Token': String(env.OUTBOUND_MORNING_PREP_SECRET),
  };
  const response = await fetchImpl(
    targetUrl.toString(),
    {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: JSON.stringify({ action, ...payload }),
    },
  );
  const responseStatus = safeDispatchHttpStatus(response?.status);
  if (responseStatus !== 202) {
    const error = new Error('Event preparation background dispatch failed.');
    error.code = 'EVENT_IMPORT_DISPATCH_FAILED';
    error.dispatchResponseStatus = responseStatus;
    throw error;
  }
  return responseStatus;
}

function mapBatchStatus(row) {
  if (!row) return null;
  const metadata = row.run_metadata || {};
  const dispatchReferenceAt = Date.parse(String(metadata.dispatchAcknowledgedAt || row.updated_at || ''));
  const waitingForBackground = metadata.dispatchState === 'acknowledged'
    || ['queued', 'dispatching', 'dispatched'].includes(metadata.phase);
  const dispatchStalled = waitingForBackground
    && !metadata.backgroundReceivedAt
    && Number.isFinite(dispatchReferenceAt)
    && Date.now() - dispatchReferenceAt >= DISPATCH_STALL_MS;
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
    dispatchState: ['requesting', 'acknowledged', 'failed'].includes(metadata.dispatchState)
      ? metadata.dispatchState : null,
    dispatchAckStatus: Number(metadata.dispatchAckStatus) === 202 ? 202 : null,
    dispatchResponseStatus: safeDispatchHttpStatus(metadata.dispatchResponseStatus),
    dispatchRequestedAt: metadata.dispatchRequestedAt || null,
    dispatchAcknowledgedAt: metadata.dispatchAcknowledgedAt || null,
    dispatchStalled,
    backgroundState: ['running', 'claim_deferred'].includes(metadata.backgroundState)
      ? metadata.backgroundState : null,
    backgroundAction: ['import', 'finalize'].includes(metadata.backgroundAction)
      ? metadata.backgroundAction : null,
    backgroundShardIndex: metadata.backgroundShardIndex !== null
      && metadata.backgroundShardIndex !== undefined
      && Number.isInteger(Number(metadata.backgroundShardIndex))
      ? Number(metadata.backgroundShardIndex) : null,
    backgroundReceivedAt: metadata.backgroundReceivedAt || null,
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
          sourceDataVersion: eventImport.eventData.version,
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
      assertDispatchConfiguration(env, event);
      const dispatchPreviewAccessState = 'not_used';
      const batch = await repository.ensureEventBatch(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        targetCount: MORNING_TARGET, providerId: eventImport.EVENT_PROVIDER_ID,
      });
      if (!batch) throw Object.assign(new Error('The event batch failed its logical identity check.'), { code: 'EVENT_IMPORT_BATCH_CONFLICT' });
      const current = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        sourceDataVersion: eventImport.eventData.version,
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
          phase: 'dispatching', eventKey: eventImport.eventData.key,
          sourceDataVersion: eventImport.eventData.version,
          sourceDatasetSha256: eventImport.eventData.sourceDatasetSha256,
          sourceRecordCount: eventImport.eventData.records.length,
          primaryRecordCount: eventImport.eventData.primaryRecordCount,
          reserveRecordCount: eventImport.eventData.records.length - eventImport.eventData.primaryRecordCount,
          dispatchState: 'requesting', dispatchAction: 'import', dispatchShardIndex: 0,
          dispatchAckStatus: null, dispatchRequestedAt: new Date().toISOString(),
          dispatchResponseStatus: null,
          dispatchAcknowledgedAt: null, backgroundState: null, backgroundAction: null,
          backgroundShardIndex: null, backgroundReceivedAt: null,
          dispatchPreviewAccessState,
          requestedBy: auth.actorId, manualSendingOnly: true, externalEmailsSent: 0,
        },
      });
      let dispatchStatus;
      try {
        dispatchStatus = await (dependencies.dispatchEventBackground || dispatchEventBackground)('import', {
          eventKey: eventImport.eventData.key, sourceDataVersion: eventImport.eventData.version,
          businessDate: date, shardIndex: 0,
        }, { env, fetchImpl: dependencies.fetch || globalThis.fetch, requestEvent: event });
      } catch (error) {
        const code = safeCode(error, 'EVENT_IMPORT_DISPATCH_FAILED');
        await repository.recordEventProgress(sql, {
          batchId: batch.id, status: 'failed', lastErrorCode: code,
          metadata: {
            phase: 'dispatch_failed', dispatchState: 'failed', dispatchAction: 'import',
            dispatchShardIndex: 0, dispatchAckStatus: null,
            dispatchResponseStatus: safeDispatchHttpStatus(error?.dispatchResponseStatus),
            dispatchAcknowledgedAt: null, manualSendingOnly: true, externalEmailsSent: 0,
            dispatchPreviewAccessState,
          },
        }).catch(() => null);
        throw error;
      }
      await repository.recordEventProgress(sql, {
        batchId: batch.id, status: 'discovering', lastErrorCode: null,
        metadata: {
          phase: 'dispatched', dispatchState: 'acknowledged', dispatchAction: 'import',
          dispatchShardIndex: 0, dispatchAckStatus: dispatchStatus,
          dispatchResponseStatus: dispatchStatus,
          dispatchAcknowledgedAt: new Date().toISOString(),
          dispatchPreviewAccessState,
          manualSendingOnly: true, externalEmailsSent: 0,
        },
      });
      const queued = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        sourceDataVersion: eventImport.eventData.version,
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
  dependencies = {}, env = process.env, getStore, sharp, loadSharp,
} = {}) {
  const repository = { ...morningRepository, ...eventRepository, ...(dependencies.repository || {}) };
  return async function eventImportBackgroundHandler(event = {}) {
    if (event.httpMethod !== 'POST') return emptyResponse(405);
    if (!authorizedBackground(event, env)) {
      console.error('[outbound-sales] event preparation background rejected safely', {
        code: 'EVENT_IMPORT_BACKGROUND_UNAUTHORIZED',
      });
      return emptyResponse(404);
    }
    if (!getDatabaseUrl(env)) {
      console.error('[outbound-sales] event preparation background rejected safely', {
        code: 'DATABASE_NOT_CONFIGURED',
      });
      return emptyResponse();
    }
    let body;
    try { body = parseJsonBody(event); } catch {
      console.error('[outbound-sales] event preparation background rejected safely', {
        code: 'EVENT_IMPORT_BACKGROUND_BODY_INVALID',
      });
      return emptyResponse(400);
    }
    if (body.eventKey !== eventImport.eventData.key
        || body.sourceDataVersion !== eventImport.eventData.version) {
      console.error('[outbound-sales] event preparation background rejected safely', {
        code: 'EVENT_IMPORT_BACKGROUND_EVENT_INVALID',
      });
      return emptyResponse(400);
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.businessDate || ''))
      ? String(body.businessDate)
      : businessDate(new Date());
    let sql;
    const requestId = event.headers?.['x-nf-request-id'] || null;
    try {
      sql = (dependencies.createSql || createSql)(env);
      const action = ['import', 'finalize'].includes(body.action) ? body.action : null;
      if (!action) {
        throw Object.assign(new Error('The event preparation background action is invalid.'), {
          code: 'EVENT_IMPORT_BACKGROUND_ACTION_INVALID',
        });
      }
      const batch = await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        sourceDataVersion: eventImport.eventData.version,
      });
      if (!batch?.id) {
        throw Object.assign(new Error('The event preparation batch was not found.'), {
          code: 'EVENT_IMPORT_BACKGROUND_BATCH_NOT_FOUND',
        });
      }
      const shardIndex = action === 'import' ? Number(body.shardIndex) : null;
      const finalizerPass = action === 'finalize'
        ? Math.max(0, Math.min(MAX_FINALIZER_PASSES - 1, Number(body.finalizerPass) || 0))
        : null;
      await repository.recordEventProgress(sql, {
        batchId: batch.id, status: action === 'finalize' ? 'preparing' : 'discovering',
        lastErrorCode: null,
        metadata: {
          phase: 'background_received', backgroundState: 'running', backgroundAction: action,
          backgroundShardIndex: shardIndex, backgroundFinalizerPass: finalizerPass,
          backgroundReceivedAt: new Date().toISOString(),
          manualSendingOnly: true, externalEmailsSent: 0,
        },
      });
      if (body.action === 'import') {
        const result = await (dependencies.runEventImportShard || eventImport.runEventImportShard)({
          sql, env, businessDate: date, shardIndex, requestId,
          dependencies: dependencies.preparation,
        });
        if (result.shardStatus === 'succeeded') {
          if (shardIndex + 1 < result.shardCount) {
            await (dependencies.dispatchEventBackground || dispatchEventBackground)('import', {
              eventKey: eventImport.eventData.key, sourceDataVersion: eventImport.eventData.version,
              businessDate: date, shardIndex: shardIndex + 1,
            }, { env, fetchImpl: dependencies.fetch || globalThis.fetch, requestEvent: event });
          } else {
            await (dependencies.dispatchEventBackground || dispatchEventBackground)('finalize', {
              eventKey: eventImport.eventData.key, sourceDataVersion: eventImport.eventData.version,
              businessDate: date, finalizerPass: 0,
            }, { env, fetchImpl: dependencies.fetch || globalThis.fetch, requestEvent: event });
          }
        } else {
          await repository.recordEventProgress(sql, {
            batchId: batch.id, status: 'discovering', lastErrorCode: null,
            metadata: {
              phase: 'import_claim_deferred', backgroundState: 'claim_deferred',
              backgroundAction: 'import', backgroundShardIndex: shardIndex,
              backgroundShardStatus: ['running', 'failed', 'unknown'].includes(result.shardStatus)
                ? result.shardStatus : 'unknown',
              manualSendingOnly: true, externalEmailsSent: 0,
            },
          });
        }
      } else if (body.action === 'finalize') {
        const resolvedStore = typeof getStore === 'function' ? await getStore() : undefined;
        const resolvedSharp = typeof loadSharp === 'function' ? await loadSharp() : sharp;
        const result = await (dependencies.runEventFinalizer || eventImport.runEventFinalizer)({
          sql, env, businessDate: date, finalizerPass, requestId,
          store: resolvedStore,
          sharp: resolvedSharp,
          timeBudgetMs: eventImport.EVENT_FINALIZER_BUDGET_MS,
          dependencies: dependencies.preparation,
        });
        const hasMoreCandidates = result.processedCount < result.candidateCount
          || result.mockupFailureCount > 0 || result.timeBudgetReached;
        if (result.readyCount < MORNING_TARGET
            && finalizerPass + 1 < MAX_FINALIZER_PASSES
            && hasMoreCandidates) {
          await (dependencies.dispatchEventBackground || dispatchEventBackground)('finalize', {
            eventKey: eventImport.eventData.key, sourceDataVersion: eventImport.eventData.version,
            businessDate: date, finalizerPass: finalizerPass + 1,
          }, { env, fetchImpl: dependencies.fetch || globalThis.fetch, requestEvent: event });
        }
      }
    } catch (error) {
      const code = safeCode(error);
      const batch = sql ? await repository.loadEventBatchStatus(sql, {
        businessDate: date, eventKey: eventImport.eventData.key,
        sourceDataVersion: eventImport.eventData.version,
      }).catch(() => null) : null;
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
  DISPATCH_STALL_MS,
  safeDispatchHttpStatus,
  constantTimeTokenMatch,
  eventTokenAuthorized,
  authorizeEventRequest,
  assertDispatchConfiguration,
  eventDispatchOrigin,
  immutableNetlifyDeployOrigin,
  trustedRequestOrigin,
  dispatchEventBackground,
  mapBatchStatus,
  createEventImportHandler,
  createEventImportBackgroundHandler,
};
