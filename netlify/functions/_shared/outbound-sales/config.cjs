'use strict';

const FOUNDATION_PHASE = 'production_ready_shadow_locked';
const PHASE_ALLOWS_LIVE_SENDING = false;
const PHASE_ALLOWS_SHADOW_PERSONALIZATION = true;
const PHASE_ALLOWS_PRODUCTION_AUTOMATION = false;
const PHASE_ALLOWS_AUTOMATIC_REPLIES = false;
const DEFAULT_DAILY_SEND_LIMIT = 30;
const MAX_DAILY_SEND_LIMIT = 30;
const DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS = 800;
const OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS = 1000;
const OUTBOUND_OPENAI_MODEL = 'gpt-5.4-mini-2026-03-17';
const OUTBOUND_OPENAI_MODEL_DISPLAY_NAME = 'GPT-5.4 mini';
const OUTBOUND_OPENAI_EXECUTION_CONTEXTS = new Set(['dev', 'deploy-preview', 'branch-deploy', 'test']);

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function executionContext(env = process.env) {
  return String(env.CONTEXT || (env.NODE_ENV === 'test' ? 'test' : '')).trim().toLowerCase();
}

function shadowPersonalizationContextAllowed(env = process.env) {
  const context = executionContext(env);
  const explicitTest = context === 'test' && env.NODE_ENV === 'test';
  return context !== 'production'
    && OUTBOUND_OPENAI_EXECUTION_CONTEXTS.has(context)
    && (explicitTest || env.OUTBOUND_PHASE3_SHADOW_EXECUTION_ENABLED === 'true');
}

function nonProductionExecutionAllowed(env, flagName) {
  const context = executionContext(env);
  const explicitTest = context === 'test' && env.NODE_ENV === 'test';
  return context !== 'production'
    && OUTBOUND_OPENAI_EXECUTION_CONTEXTS.has(context)
    && (explicitTest || env[flagName] === 'true');
}

function getRuntimeConfig(env = process.env) {
  const liveSendingEnvironmentApproved = env.OUTBOUND_LIVE_SENDING_AVAILABLE === 'true';
  const openAIConfigured = configured(env.OUTBOUND_OPENAI_API_KEY);
  const automationConfigured = configured(env.OUTBOUND_AUTOMATION_SECRET);
  const personalizationContextAllowed = shadowPersonalizationContextAllowed(env);
  const automationContextAllowed = nonProductionExecutionAllowed(env, 'OUTBOUND_SHADOW_AUTOMATION_ENABLED');
  const inboundContextAllowed = nonProductionExecutionAllowed(env, 'OUTBOUND_INBOUND_VALIDATION_ENABLED');
  const replyAIContextAllowed = inboundContextAllowed
    && personalizationContextAllowed
    && env.OUTBOUND_REPLY_AI_VALIDATION_ENABLED === 'true';
  return Object.freeze({
    phase: FOUNDATION_PHASE,
    outboundSalesEnabled: env.OUTBOUND_SALES_ENABLED === 'true',
    // Live delivery remains a code-level lock. Environment and database
    // configuration cannot make the subsystem report or enter live mode.
    liveSendingAvailable: PHASE_ALLOWS_LIVE_SENDING && liveSendingEnvironmentApproved,
    shadowPersonalizationAvailable: PHASE_ALLOWS_SHADOW_PERSONALIZATION && personalizationContextAllowed,
    shadowPersonalizationExecutionScope: 'test_staging_only',
    shadowPersonalizationProductionBlocked: true,
    automationAvailable: PHASE_ALLOWS_PRODUCTION_AUTOMATION && automationContextAllowed,
    shadowAutomationAvailable: automationContextAllowed && automationConfigured,
    automationExecutionScope: 'test_staging_only',
    automationProductionBlocked: true,
    inboundProcessingAvailable: inboundContextAllowed,
    inboundExecutionScope: 'test_staging_only',
    inboundProcessingProductionBlocked: true,
    replyAIFallbackAvailable: replyAIContextAllowed && openAIConfigured,
    replyAIFallbackExecutionScope: 'test_staging_only',
    replyAIFallbackProductionBlocked: true,
    automaticRepliesAvailable: PHASE_ALLOWS_AUTOMATIC_REPLIES,
    openAIModel: OUTBOUND_OPENAI_MODEL,
    openAIModelDisplayName: OUTBOUND_OPENAI_MODEL_DISPLAY_NAME,
    defaultShadowModeEnabled: true,
    defaultLiveSendingEnabled: false,
    defaultEmergencyPaused: false,
    defaultDailySendLimit: DEFAULT_DAILY_SEND_LIMIT,
    maxDailySendLimit: MAX_DAILY_SEND_LIMIT,
    defaultMonthlyOpenAIBudgetCents: DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
    openAIProjectLimitRecommendationCents: OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
    secretStatus: Object.freeze({
      openAI: openAIConfigured,
      resend: configured(env.OUTBOUND_RESEND_API_KEY),
      resendWebhook: configured(env.OUTBOUND_RESEND_WEBHOOK_SECRET),
      unsubscribeSigning: configured(env.OUTBOUND_UNSUBSCRIBE_SIGNING_SECRET),
      automation: configured(env.OUTBOUND_AUTOMATION_SECRET),
      deliveryIdentity: configured(env.OUTBOUND_FROM_EMAIL)
        && configured(env.OUTBOUND_REPLY_TO_EMAIL)
        && configured(env.OUTBOUND_PHYSICAL_ADDRESS)
        && configured(env.URL),
      emailVerification: configured(env.OUTBOUND_EMAIL_VERIFICATION_API_KEY),
      apolloDiscovery: configured(env.OUTBOUND_APOLLO_API_KEY),
    }),
  });
}

function defaultSettings() {
  return {
    shadowModeEnabled: true,
    shadowGenerationEnabled: false,
    liveSendingEnabled: false,
    emergencyPaused: false,
    dailySendLimit: DEFAULT_DAILY_SEND_LIMIT,
    monthlyOpenAIBudgetCents: DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
    openAIProjectLimitRecommendationCents: OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
    monthlyProviderBudgetCents: 0,
    replyIngestionEnabled: false,
    replyAIFallbackEnabled: false,
    suggestedReplyGenerationEnabled: false,
    automationEnabled: false,
    deliveryWebhookEnabled: false,
    attributionEnabled: false,
    learningEnabled: false,
    monitoringEnabled: false,
    minimumLearningSample: 60,
    explorationPercent: 15,
    sendingWindowStartLocal: '09:30:00',
    sendingWindowEndLocal: '16:30:00',
    minimumSpacingSeconds: 600,
    maximumBounceRate: 0.05,
    maximumComplaintRate: 0.001,
    maximumErrorRate: 0.1,
    businessTimezone: 'America/New_York',
    settingsVersion: 0,
  };
}

function effectiveControlState(settings = defaultSettings(), runtime = getRuntimeConfig()) {
  const emergencyPaused = settings.emergencyPaused === true;
  const shadowModeEnabled = settings.shadowModeEnabled !== false;
  const requestedLive = settings.liveSendingEnabled === true;
  const liveSendingEnabled = Boolean(
    runtime.outboundSalesEnabled
      && runtime.liveSendingAvailable
      && requestedLive
      && !shadowModeEnabled
      && !emergencyPaused,
  );
  const shadowGenerationRequested = settings.shadowGenerationEnabled === true;
  const shadowGenerationEnabled = Boolean(
    runtime.outboundSalesEnabled
      && runtime.shadowPersonalizationAvailable
      && runtime.secretStatus.openAI
      && shadowGenerationRequested
      && shadowModeEnabled
      && !liveSendingEnabled
      && !emergencyPaused,
  );
  const automationEnabled = Boolean(
    runtime.outboundSalesEnabled
      && runtime.shadowAutomationAvailable
      && settings.automationEnabled === true
      && shadowModeEnabled
      && !liveSendingEnabled
      && !emergencyPaused,
  );
  const replyIngestionEnabled = Boolean(
    runtime.outboundSalesEnabled
      && runtime.inboundProcessingAvailable
      && runtime.secretStatus.resendWebhook
      && settings.replyIngestionEnabled === true
      && !emergencyPaused,
  );
  const replyAIFallbackRequested = settings.replyAIFallbackEnabled === true;
  const replyAIFallbackEnabled = Boolean(
    replyIngestionEnabled
      && runtime.replyAIFallbackAvailable
      && runtime.secretStatus.openAI
      && replyAIFallbackRequested
      && !emergencyPaused,
  );

  let mode = 'disabled';
  if (emergencyPaused) mode = 'emergency_paused';
  else if (!runtime.outboundSalesEnabled) mode = 'disabled';
  else if (liveSendingEnabled) mode = 'live';
  else mode = 'shadow';

  return {
    mode,
    outboundSalesEnabled: runtime.outboundSalesEnabled,
    shadowModeEnabled,
    shadowGenerationRequested,
    shadowGenerationAvailable: runtime.shadowPersonalizationAvailable,
    shadowGenerationEnabled,
    automationRequested: settings.automationEnabled === true,
    automationAvailable: runtime.shadowAutomationAvailable,
    automationEnabled,
    replyIngestionRequested: settings.replyIngestionEnabled === true,
    replyIngestionAvailable: runtime.inboundProcessingAvailable,
    replyIngestionEnabled,
    replyAIFallbackRequested,
    replyAIFallbackAvailable: runtime.replyAIFallbackAvailable,
    replyAIFallbackEnabled,
    automaticRepliesEnabled: false,
    liveSendingRequested: requestedLive,
    liveSendingAvailable: runtime.liveSendingAvailable,
    liveSendingEnabled,
    emergencyPaused,
    dailySendLimit: Math.min(
      MAX_DAILY_SEND_LIMIT,
      Math.max(0, Number(settings.dailySendLimit ?? DEFAULT_DAILY_SEND_LIMIT)),
    ),
    monthlyOpenAIBudgetCents: Math.max(
      0,
      Number(settings.monthlyOpenAIBudgetCents ?? DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS),
    ),
    openAIProjectLimitRecommendationCents: OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
  };
}

module.exports = {
  FOUNDATION_PHASE,
  PHASE_ALLOWS_LIVE_SENDING,
  PHASE_ALLOWS_SHADOW_PERSONALIZATION,
  PHASE_ALLOWS_PRODUCTION_AUTOMATION,
  PHASE_ALLOWS_AUTOMATIC_REPLIES,
  DEFAULT_DAILY_SEND_LIMIT,
  MAX_DAILY_SEND_LIMIT,
  DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
  OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
  OUTBOUND_OPENAI_MODEL,
  OUTBOUND_OPENAI_MODEL_DISPLAY_NAME,
  OUTBOUND_OPENAI_EXECUTION_CONTEXTS,
  executionContext,
  shadowPersonalizationContextAllowed,
  nonProductionExecutionAllowed,
  getRuntimeConfig,
  defaultSettings,
  effectiveControlState,
};
