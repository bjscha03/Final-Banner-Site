'use strict';

const FOUNDATION_PHASE = 'foundation';
const PHASE_ALLOWS_LIVE_SENDING = false;
const DEFAULT_DAILY_SEND_LIMIT = 30;
const MAX_DAILY_SEND_LIMIT = 30;
const DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS = 800;
const OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS = 1000;

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getRuntimeConfig(env = process.env) {
  const liveSendingEnvironmentApproved = env.OUTBOUND_LIVE_SENDING_AVAILABLE === 'true';
  return Object.freeze({
    phase: FOUNDATION_PHASE,
    outboundSalesEnabled: env.OUTBOUND_SALES_ENABLED === 'true',
    // Phase 1 is a code-level lock. Environment and database configuration
    // cannot make the foundation report or enter live mode.
    liveSendingAvailable: PHASE_ALLOWS_LIVE_SENDING && liveSendingEnvironmentApproved,
    defaultShadowModeEnabled: true,
    defaultLiveSendingEnabled: false,
    defaultEmergencyPaused: false,
    defaultDailySendLimit: DEFAULT_DAILY_SEND_LIMIT,
    maxDailySendLimit: MAX_DAILY_SEND_LIMIT,
    defaultMonthlyOpenAIBudgetCents: DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
    openAIProjectLimitRecommendationCents: OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
    secretStatus: Object.freeze({
      openAI: configured(env.OUTBOUND_OPENAI_API_KEY),
      resend: configured(env.OUTBOUND_RESEND_API_KEY),
      resendWebhook: configured(env.OUTBOUND_RESEND_WEBHOOK_SECRET),
      emailVerification: configured(env.OUTBOUND_EMAIL_VERIFICATION_API_KEY),
    }),
  });
}

function defaultSettings() {
  return {
    shadowModeEnabled: true,
    liveSendingEnabled: false,
    emergencyPaused: false,
    dailySendLimit: DEFAULT_DAILY_SEND_LIMIT,
    monthlyOpenAIBudgetCents: DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
    openAIProjectLimitRecommendationCents: OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
    monthlyProviderBudgetCents: 0,
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

  let mode = 'disabled';
  if (emergencyPaused) mode = 'emergency_paused';
  else if (!runtime.outboundSalesEnabled) mode = 'disabled';
  else if (liveSendingEnabled) mode = 'live';
  else mode = 'shadow';

  return {
    mode,
    outboundSalesEnabled: runtime.outboundSalesEnabled,
    shadowModeEnabled,
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
  DEFAULT_DAILY_SEND_LIMIT,
  MAX_DAILY_SEND_LIMIT,
  DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
  OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
  getRuntimeConfig,
  defaultSettings,
  effectiveControlState,
};
