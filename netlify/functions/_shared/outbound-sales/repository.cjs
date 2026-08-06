'use strict';

const { safeRequestId } = require('./security.cjs');

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function mapSettings(row) {
  if (!row) return null;
  return {
    shadowModeEnabled: row.shadow_mode_enabled === true,
    shadowGenerationEnabled: row.shadow_generation_enabled === true,
    liveSendingEnabled: row.live_sending_enabled === true,
    emergencyPaused: row.emergency_paused === true,
    dailySendLimit: integer(row.daily_send_limit, 30),
    monthlyOpenAIBudgetCents: integer(row.monthly_openai_budget_cents, 800),
    openAIProjectLimitRecommendationCents: integer(row.openai_project_limit_recommendation_cents, 1000),
    monthlyProviderBudgetCents: integer(row.monthly_provider_budget_cents, 0),
    replyIngestionEnabled: row.reply_ingestion_enabled === true,
    replyAIFallbackEnabled: row.reply_ai_fallback_enabled === true,
    suggestedReplyGenerationEnabled: row.suggested_reply_generation_enabled === true,
    automationEnabled: row.automation_enabled === true,
    deliveryWebhookEnabled: row.delivery_webhook_enabled === true,
    attributionEnabled: row.attribution_enabled === true,
    learningEnabled: row.learning_enabled === true,
    monitoringEnabled: row.monitoring_enabled === true,
    minimumLearningSample: integer(row.minimum_learning_sample, 60),
    explorationPercent: Number(row.exploration_percent ?? 15),
    sendingWindowStartLocal: row.sending_window_start_local || '09:30:00',
    sendingWindowEndLocal: row.sending_window_end_local || '16:30:00',
    minimumSpacingSeconds: integer(row.minimum_spacing_seconds, 600),
    maximumBounceRate: Number(row.maximum_bounce_rate ?? 0.05),
    maximumComplaintRate: Number(row.maximum_complaint_rate ?? 0.001),
    maximumErrorRate: Number(row.maximum_error_rate ?? 0.1),
    businessTimezone: row.business_timezone || 'America/New_York',
    settingsVersion: integer(row.settings_version, 1),
    updatedAt: row.updated_at || null,
  };
}

async function loadFoundationSnapshot(sql) {
  const queries = (tx) => [
    tx(
      `SELECT shadow_mode_enabled, shadow_generation_enabled,
              live_sending_enabled, emergency_paused,
              daily_send_limit, monthly_openai_budget_cents,
              openai_project_limit_recommendation_cents,
              monthly_provider_budget_cents, business_timezone,
              reply_ingestion_enabled, reply_ai_fallback_enabled,
              suggested_reply_generation_enabled, automation_enabled,
              delivery_webhook_enabled, attribution_enabled, learning_enabled,
              monitoring_enabled, minimum_learning_sample, exploration_percent,
              sending_window_start_local::text, sending_window_end_local::text,
              minimum_spacing_seconds, maximum_bounce_rate,
              maximum_complaint_rate, maximum_error_rate,
              settings_version, updated_at
         FROM outbound_settings
        WHERE id = 1`,
    ),
    tx(
      `SELECT
         (SELECT COUNT(*) FROM outbound_prospects) AS prospects_total,
         (SELECT COUNT(*) FROM outbound_prospects WHERE status = 'ready_for_outreach') AS ready_for_outreach,
         (SELECT COUNT(*) FROM outbound_messages) AS messages_total,
         (SELECT COUNT(*) FROM outbound_messages WHERE generation_status = 'generated') AS messages_generated,
         (SELECT COUNT(*) FROM outbound_messages WHERE status = 'sent') AS messages_sent,
         (SELECT COUNT(*) FROM outbound_replies) AS replies_total,
         (SELECT COUNT(*) FROM outbound_order_attributions WHERE is_test_order = FALSE) AS attributed_orders,
         (SELECT COALESCE(SUM(attributed_revenue_cents), 0)
            FROM outbound_order_attributions
           WHERE is_test_order = FALSE) AS revenue_generated_cents,
         (SELECT COUNT(*) FROM outbound_jobs WHERE status IN ('queued', 'retry', 'running')) AS active_jobs,
         (SELECT COUNT(*) FROM outbound_jobs WHERE status = 'dead') AS dead_jobs`,
    ),
    tx(
      `SELECT category,
              COALESCE(SUM(CASE
                WHEN status = 'committed' THEN COALESCE(actual_cost_microusd, estimated_cost_microusd)
                WHEN status = 'reserved' THEN estimated_cost_microusd
                ELSE 0
              END), 0) AS cost_microusd
         FROM outbound_cost_ledger
        WHERE occurred_at >= date_trunc('month', NOW())
          AND occurred_at < date_trunc('month', NOW()) + INTERVAL '1 month'
        GROUP BY category`,
    ),
    tx(
      `SELECT provider_id, provider_kind, display_name, enabled,
              daily_request_limit, monthly_budget_cents, settings_version
         FROM outbound_provider_configs
        ORDER BY provider_kind, provider_id`,
    ),
  ];

  const [settingsRows, metricRows, costRows, providerRows] = typeof sql.transaction === 'function'
    ? await sql.transaction(queries, { readOnly: true, isolationLevel: 'RepeatableRead' })
    : await Promise.all(queries(sql));

  const metrics = metricRows?.[0] || {};
  const costs = Object.fromEntries((costRows || []).map((row) => [row.category, integer(row.cost_microusd)]));
  const settings = mapSettings(settingsRows?.[0]);
  return {
    schemaReady: Boolean(settings),
    settings,
    metrics: {
      prospectsTotal: integer(metrics.prospects_total),
      readyForOutreach: integer(metrics.ready_for_outreach),
      messagesTotal: integer(metrics.messages_total),
      messagesGenerated: integer(metrics.messages_generated),
      messagesSent: integer(metrics.messages_sent),
      repliesTotal: integer(metrics.replies_total),
      attributedOrders: integer(metrics.attributed_orders),
      revenueGeneratedCents: integer(metrics.revenue_generated_cents),
      activeJobs: integer(metrics.active_jobs),
      deadJobs: integer(metrics.dead_jobs),
    },
    monthlyCostsMicrousd: {
      openAI: costs.openai || 0,
      discovery: costs.discovery || 0,
      emailVerification: costs.email_verification || 0,
      resend: costs.resend || 0,
    },
    providerConfigs: (providerRows || []).map((row) => ({
      id: row.provider_id,
      kind: row.provider_kind,
      displayName: row.display_name,
      enabled: row.enabled === true,
      dailyRequestLimit: integer(row.daily_request_limit),
      monthlyBudgetCents: integer(row.monthly_budget_cents),
      settingsVersion: integer(row.settings_version, 1),
    })),
  };
}

async function updateSettings(sql, next, { expectedVersion, actorId, requestId } = {}) {
  const rows = await sql(
    `WITH existing AS (
       SELECT *
         FROM outbound_settings
        WHERE id = 1
        FOR UPDATE
     ), updated AS (
       UPDATE outbound_settings AS settings
          SET shadow_mode_enabled = $1,
              shadow_generation_enabled = $2,
              live_sending_enabled = $3,
              emergency_paused = $4,
              daily_send_limit = $5,
              monthly_openai_budget_cents = $6,
              reply_ingestion_enabled = $10,
              reply_ai_fallback_enabled = $11,
              suggested_reply_generation_enabled = $12,
              automation_enabled = $13,
              delivery_webhook_enabled = $14,
              attribution_enabled = $15,
              learning_enabled = $16,
              monitoring_enabled = $17,
              minimum_learning_sample = $18,
              exploration_percent = $19,
              settings_version = settings.settings_version + 1,
              updated_by = $8,
              updated_at = NOW()
         FROM existing
        WHERE settings.id = existing.id
          AND existing.settings_version = $7
       RETURNING settings.*
     ), audit AS (
       INSERT INTO outbound_audit_log (
         actor_type, actor_id, action, entity_type, entity_id,
         previous_values, new_values, metadata, request_id
       )
       SELECT 'admin', $8, 'settings.updated', 'settings', '1',
              to_jsonb(existing), to_jsonb(updated),
              jsonb_build_object('phase', 'shadow_personalization'), $9
         FROM existing
         JOIN updated ON TRUE
       RETURNING id
     )
     SELECT updated.*
       FROM updated`,
    [
      next.shadowModeEnabled,
      next.shadowGenerationEnabled,
      next.liveSendingEnabled,
      next.emergencyPaused,
      next.dailySendLimit,
      next.monthlyOpenAIBudgetCents,
      expectedVersion,
      actorId || null,
      safeRequestId(requestId),
      next.replyIngestionEnabled === true,
      next.replyAIFallbackEnabled === true,
      next.suggestedReplyGenerationEnabled === true,
      next.automationEnabled === true,
      next.deliveryWebhookEnabled === true,
      next.attributionEnabled === true,
      next.learningEnabled === true,
      next.monitoringEnabled === true,
      integer(next.minimumLearningSample, 60),
      Number(next.explorationPercent ?? 15),
    ],
  );
  if (!rows[0]) {
    const error = new Error('Outbound settings changed concurrently.');
    error.code = 'SETTINGS_CONFLICT';
    throw error;
  }
  return mapSettings(rows[0]);
}

module.exports = { mapSettings, loadFoundationSnapshot, updateSettings };
