'use strict';

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function mapSettings(row) {
  if (!row) return null;
  return {
    shadowModeEnabled: row.shadow_mode_enabled === true,
    liveSendingEnabled: row.live_sending_enabled === true,
    emergencyPaused: row.emergency_paused === true,
    dailySendLimit: integer(row.daily_send_limit, 30),
    monthlyOpenAIBudgetCents: integer(row.monthly_openai_budget_cents, 800),
    openAIProjectLimitRecommendationCents: integer(row.openai_project_limit_recommendation_cents, 1000),
    monthlyProviderBudgetCents: integer(row.monthly_provider_budget_cents, 0),
    businessTimezone: row.business_timezone || 'America/New_York',
    settingsVersion: integer(row.settings_version, 1),
    updatedAt: row.updated_at || null,
  };
}

async function loadFoundationSnapshot(sql) {
  const queries = (tx) => [
    tx(
      `SELECT shadow_mode_enabled, live_sending_enabled, emergency_paused,
              daily_send_limit, monthly_openai_budget_cents,
              openai_project_limit_recommendation_cents,
              monthly_provider_budget_cents, business_timezone,
              settings_version, updated_at
         FROM outbound_settings
        WHERE id = 1`,
    ),
    tx(
      `SELECT
         (SELECT COUNT(*) FROM outbound_prospects) AS prospects_total,
         (SELECT COUNT(*) FROM outbound_prospects WHERE status = 'ready_for_outreach') AS ready_for_outreach,
         (SELECT COUNT(*) FROM outbound_messages) AS messages_total,
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
              live_sending_enabled = $2,
              emergency_paused = $3,
              daily_send_limit = $4,
              monthly_openai_budget_cents = $5,
              settings_version = settings.settings_version + 1,
              updated_by = $7,
              updated_at = NOW()
         FROM existing
        WHERE settings.id = existing.id
          AND existing.settings_version = $6
       RETURNING settings.*
     ), audit AS (
       INSERT INTO outbound_audit_log (
         actor_type, actor_id, action, entity_type, entity_id,
         previous_values, new_values, metadata, request_id
       )
       SELECT 'admin', $7, 'settings.updated', 'settings', '1',
              to_jsonb(existing), to_jsonb(updated),
              jsonb_build_object('phase', 'foundation'), $8
         FROM existing
         JOIN updated ON TRUE
       RETURNING id
     )
     SELECT updated.*
       FROM updated`,
    [
      next.shadowModeEnabled,
      next.liveSendingEnabled,
      next.emergencyPaused,
      next.dailySendLimit,
      next.monthlyOpenAIBudgetCents,
      expectedVersion,
      actorId || null,
      requestId || null,
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
