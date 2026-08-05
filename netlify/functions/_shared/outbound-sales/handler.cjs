'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { getRuntimeConfig, defaultSettings, effectiveControlState } = require('./config.cjs');
const { getProviderConfigurationStatus } = require('./providers/manifest.cjs');
const { loadFoundationSnapshot, updateSettings } = require('./repository.cjs');
const { json, authorize, parseJsonBody, safeFailure } = require('./security.cjs');

const EMPTY_METRICS = Object.freeze({
  prospectsTotal: 0,
  readyForOutreach: 0,
  messagesTotal: 0,
  messagesSent: 0,
  repliesTotal: 0,
  attributedOrders: 0,
  revenueGeneratedCents: 0,
  activeJobs: 0,
  deadJobs: 0,
});

const EMPTY_COSTS = Object.freeze({
  openAI: 0,
  discovery: 0,
  emailVerification: 0,
  resend: 0,
});

function mergeProviderStatus(manifestStatus, storedProviders = []) {
  const stored = new Map(storedProviders.map((provider) => [provider.id, provider]));
  return manifestStatus.map((provider) => {
    const saved = stored.get(provider.id);
    return {
      ...provider,
      enabled: Boolean(provider.adapterInstalled && provider.configured && saved?.enabled),
      dailyRequestLimit: saved?.dailyRequestLimit || 0,
      monthlyBudgetCents: saved?.monthlyBudgetCents || 0,
    };
  });
}

function fallbackSnapshot() {
  return {
    schemaReady: false,
    settings: defaultSettings(),
    metrics: { ...EMPTY_METRICS },
    monthlyCostsMicrousd: { ...EMPTY_COSTS },
    providerConfigs: [],
  };
}

function createHandlers(dependencies = {}) {
  const runtimeConfig = dependencies.getRuntimeConfig || getRuntimeConfig;
  const sqlFactory = dependencies.createSql || createSql;
  const snapshotLoader = dependencies.loadFoundationSnapshot || loadFoundationSnapshot;
  const settingsWriter = dependencies.updateSettings || updateSettings;
  const providerStatusReader = dependencies.getProviderConfigurationStatus || getProviderConfigurationStatus;

  async function getStatusPayload() {
    const runtime = runtimeConfig();
    const databaseConfigured = Boolean(getDatabaseUrl());
    let snapshot = fallbackSnapshot();
    let databaseAvailable = databaseConfigured;

    if (databaseConfigured) {
      try {
        snapshot = await snapshotLoader(sqlFactory());
      } catch (error) {
        if (!isMissingOutboundSchema(error)) {
          databaseAvailable = false;
          console.error('[outbound-sales] foundation status unavailable', {
            code: String(error?.code || 'DATABASE_UNAVAILABLE').slice(0, 80),
          });
        }
      }
    }

    const settings = snapshot.settings || defaultSettings();
    const controls = effectiveControlState(settings, runtime);
    return {
      ok: true,
      authorized: true,
      phase: runtime.phase,
      schemaReady: snapshot.schemaReady,
      databaseConfigured,
      databaseAvailable,
      controls,
      settings,
      secretStatus: runtime.secretStatus,
      providers: mergeProviderStatus(providerStatusReader(), snapshot.providerConfigs),
      metrics: snapshot.metrics,
      monthlyCostsMicrousd: snapshot.monthlyCostsMicrousd,
      safeguards: {
        providerExecutionInstalled: false,
        openAICallsInstalled: false,
        emailSendingInstalled: false,
        scheduledAutomationInstalled: false,
        liveSendingPhaseLocked: !runtime.liveSendingAvailable,
      },
    };
  }

  async function statusHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const auth = authorize(event);
    if (auth.response) return auth.response;
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
    }
    return json(200, await getStatusPayload());
  }

  async function settingsHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const isMutation = event.httpMethod === 'PUT';
    const auth = authorize(event, { requireOrigin: isMutation });
    if (auth.response) return auth.response;
    if (event.httpMethod === 'GET') return json(200, await getStatusPayload());
    if (!isMutation) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, PUT, OPTIONS' });
    }

    try {
      const body = parseJsonBody(event);
      const status = await getStatusPayload();
      if (!status.schemaReady) {
        const error = new Error('Outbound schema is not ready.');
        error.code = 'OUTBOUND_SCHEMA_NOT_READY';
        throw error;
      }

      const allowedKeys = new Set([
        'adminSessionToken',
        'settingsVersion',
        'shadowModeEnabled',
        'liveSendingEnabled',
        'emergencyPaused',
        'dailySendLimit',
        'monthlyOpenAIBudgetCents',
      ]);
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        const error = new Error('Only documented outbound control fields may be changed.');
        error.code = 'INVALID_SETTINGS';
        throw error;
      }

      const current = status.settings;
      const next = {
        shadowModeEnabled: body.shadowModeEnabled ?? current.shadowModeEnabled,
        liveSendingEnabled: body.liveSendingEnabled ?? current.liveSendingEnabled,
        emergencyPaused: body.emergencyPaused ?? current.emergencyPaused,
        dailySendLimit: body.dailySendLimit ?? current.dailySendLimit,
        monthlyOpenAIBudgetCents: body.monthlyOpenAIBudgetCents ?? current.monthlyOpenAIBudgetCents,
      };
      const allBooleans = [next.shadowModeEnabled, next.liveSendingEnabled, next.emergencyPaused]
        .every((value) => typeof value === 'boolean');
      const dailyLimitValid = Number.isInteger(next.dailySendLimit)
        && next.dailySendLimit >= 0
        && next.dailySendLimit <= 30;
      const monthlyBudgetValid = Number.isInteger(next.monthlyOpenAIBudgetCents)
        && next.monthlyOpenAIBudgetCents >= 0
        && next.monthlyOpenAIBudgetCents <= 100000;
      const versionValid = Number.isInteger(body.settingsVersion) && body.settingsVersion > 0;
      if (!allBooleans || !dailyLimitValid || !monthlyBudgetValid || !versionValid) {
        const error = new Error('Outbound controls contain an invalid value. Daily sends must be 0–30 and the monthly budget must be a non-negative whole number of cents.');
        error.code = 'INVALID_SETTINGS';
        throw error;
      }
      if (next.shadowModeEnabled && next.liveSendingEnabled) {
        const error = new Error('Shadow Mode and Live Sending cannot be enabled at the same time.');
        error.code = 'INVALID_SETTINGS';
        throw error;
      }
      const runtime = runtimeConfig();
      if (next.liveSendingEnabled && !runtime.liveSendingAvailable) {
        const error = new Error('Live sending is locked during Phase 1.');
        error.code = 'LIVE_SENDING_PHASE_LOCKED';
        throw error;
      }

      const saved = await settingsWriter(sqlFactory(), next, {
        expectedVersion: body.settingsVersion,
        actorId: auth.session.email || auth.session.sub || null,
        requestId: event?.headers?.['x-nf-request-id'] || event?.headers?.['x-request-id'] || null,
      });
      return json(200, {
        ok: true,
        settings: saved,
        controls: effectiveControlState(saved, runtime),
      });
    } catch (error) {
      return safeFailure(error);
    }
  }

  return { statusHandler, settingsHandler, getStatusPayload };
}

const handlers = createHandlers();

module.exports = {
  ...handlers,
  createHandlers,
  _test: { mergeProviderStatus, fallbackSnapshot },
};
