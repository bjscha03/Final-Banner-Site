'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { getRuntimeConfig, defaultSettings, effectiveControlState } = require('./config.cjs');
const { getProviderConfigurationStatus } = require('./providers/manifest.cjs');
const { loadFoundationSnapshot, updateSettings } = require('./repository.cjs');
const { json, authorize, parseJsonBody, redactSecretText, safeFailure } = require('./security.cjs');

const EMPTY_METRICS = Object.freeze({
  prospectsTotal: 0,
  readyForOutreach: 0,
  messagesTotal: 0,
  messagesGenerated: 0,
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
      enabled: Boolean(provider.adapterInstalled && provider.configured && provider.executionAllowed && saved?.enabled),
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
            code: redactSecretText(error?.code || 'DATABASE_UNAVAILABLE').slice(0, 80),
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
        providerExecutionInstalled: true,
        providerExecutionProductionBlocked: true,
        openAICallsInstalled: true,
        openAIExecutionScope: runtime.shadowPersonalizationExecutionScope,
        openAIExecutionProductionBlocked: runtime.shadowPersonalizationProductionBlocked,
        emailSendingInstalled: true,
        emailSendingProductionBlocked: true,
        scheduledAutomationInstalled: false,
        shadowAutomationInstalled: true,
        shadowAutomationProductionBlocked: runtime.automationProductionBlocked,
        inboundProcessingInstalled: true,
        inboundProcessingProductionBlocked: runtime.inboundProcessingProductionBlocked,
        replyAIFallbackInstalled: true,
        replyAIFallbackProductionBlocked: runtime.replyAIFallbackProductionBlocked,
        automaticRepliesInstalled: false,
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
        'shadowGenerationEnabled',
        'liveSendingEnabled',
        'emergencyPaused',
        'dailySendLimit',
        'monthlyOpenAIBudgetCents',
        'replyIngestionEnabled',
        'replyAIFallbackEnabled',
        'suggestedReplyGenerationEnabled',
        'automationEnabled',
        'deliveryWebhookEnabled',
        'attributionEnabled',
        'learningEnabled',
        'monitoringEnabled',
        'minimumLearningSample',
        'explorationPercent',
      ]);
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        const error = new Error('Only documented outbound control fields may be changed.');
        error.code = 'INVALID_SETTINGS';
        throw error;
      }

      const current = status.settings;
      const next = {
        shadowModeEnabled: body.shadowModeEnabled ?? current.shadowModeEnabled,
        shadowGenerationEnabled: body.shadowGenerationEnabled ?? current.shadowGenerationEnabled,
        liveSendingEnabled: body.liveSendingEnabled ?? current.liveSendingEnabled,
        emergencyPaused: body.emergencyPaused ?? current.emergencyPaused,
        dailySendLimit: body.dailySendLimit ?? current.dailySendLimit,
        monthlyOpenAIBudgetCents: body.monthlyOpenAIBudgetCents ?? current.monthlyOpenAIBudgetCents,
        replyIngestionEnabled: body.replyIngestionEnabled ?? current.replyIngestionEnabled,
        replyAIFallbackEnabled: body.replyAIFallbackEnabled ?? current.replyAIFallbackEnabled,
        suggestedReplyGenerationEnabled: body.suggestedReplyGenerationEnabled ?? current.suggestedReplyGenerationEnabled,
        automationEnabled: body.automationEnabled ?? current.automationEnabled,
        deliveryWebhookEnabled: body.deliveryWebhookEnabled ?? current.deliveryWebhookEnabled,
        attributionEnabled: body.attributionEnabled ?? current.attributionEnabled,
        learningEnabled: body.learningEnabled ?? current.learningEnabled,
        monitoringEnabled: body.monitoringEnabled ?? current.monitoringEnabled,
        minimumLearningSample: body.minimumLearningSample ?? current.minimumLearningSample,
        explorationPercent: body.explorationPercent ?? current.explorationPercent,
      };
      const allBooleans = [
        next.shadowModeEnabled, next.shadowGenerationEnabled, next.liveSendingEnabled,
        next.emergencyPaused, next.replyIngestionEnabled, next.replyAIFallbackEnabled,
        next.suggestedReplyGenerationEnabled, next.automationEnabled,
        next.deliveryWebhookEnabled, next.attributionEnabled, next.learningEnabled,
        next.monitoringEnabled,
      ]
        .every((value) => typeof value === 'boolean');
      const dailyLimitValid = Number.isInteger(next.dailySendLimit)
        && next.dailySendLimit >= 0
        && next.dailySendLimit <= 30;
      const monthlyBudgetValid = Number.isInteger(next.monthlyOpenAIBudgetCents)
        && next.monthlyOpenAIBudgetCents >= 0
        && next.monthlyOpenAIBudgetCents <= 100000;
      const versionValid = Number.isInteger(body.settingsVersion) && body.settingsVersion > 0;
      const learningValuesValid = Number.isInteger(next.minimumLearningSample)
        && next.minimumLearningSample >= 30
        && Number.isFinite(next.explorationPercent)
        && next.explorationPercent >= 5
        && next.explorationPercent <= 30;
      if (!allBooleans || !dailyLimitValid || !monthlyBudgetValid || !learningValuesValid || !versionValid) {
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
        const error = new Error('Live sending is locked pending explicit final activation.');
        error.code = 'LIVE_SENDING_PHASE_LOCKED';
        throw error;
      }
      if (!next.shadowModeEnabled) {
        const error = new Error('Shadow Mode is required until explicit final activation.');
        error.code = 'SHADOW_MODE_PHASE_LOCKED';
        throw error;
      }
      if (next.shadowGenerationEnabled && !runtime.shadowPersonalizationAvailable) {
        const error = new Error('Shadow personalization is available only in explicitly enabled test or staging contexts.');
        error.code = 'SHADOW_GENERATION_CONTEXT_LOCKED';
        throw error;
      }
      if (next.automationEnabled && !runtime.shadowAutomationAvailable) {
        const error = new Error('Automation is available only in explicitly enabled test or staging contexts.');
        error.code = 'AUTOMATION_CONTEXT_LOCKED';
        throw error;
      }
      if ((next.replyIngestionEnabled || next.deliveryWebhookEnabled) && !runtime.inboundProcessingAvailable) {
        const error = new Error('Inbound processing is available only in explicitly enabled test or staging contexts.');
        error.code = 'INBOUND_CONTEXT_LOCKED';
        throw error;
      }
      if (next.replyAIFallbackEnabled && !runtime.replyAIFallbackAvailable) {
        const error = new Error('Optional AI reply classification is available only in an explicitly enabled test or staging context.');
        error.code = 'REPLY_AI_CONTEXT_LOCKED';
        throw error;
      }
      if (next.suggestedReplyGenerationEnabled) {
        const error = new Error('Automatic and AI-generated reply sending remain locked.');
        error.code = 'AUTOMATIC_REPLY_PHASE_LOCKED';
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
