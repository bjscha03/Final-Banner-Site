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
  const additiveColumn = /research_state|contact_state|qualification_version|exclusion_codes|send_eligible|mx_status|page_manifest|provider_credits|request_key|shadow_generation_enabled|personalization_state|generation_status|prompt_version|research_content_hash|reply_ingestion_enabled|reply_ai_fallback_enabled|suggested_reply_generation_enabled|automation_enabled|delivery_webhook_enabled|sending_window_start_local|sending_window_end_local|minimum_spacing_seconds|maximum_bounce_rate|maximum_complaint_rate|maximum_error_rate|delivery_state|planned_send_at|attribution_enabled|learning_enabled|monitoring_enabled|minimum_learning_sample|exploration_percent|manual_attempted_count|manual_sent_count|permission_status|send_state|scene_id|render_version|quality_level|morning_batch_id|imported_business_date|morning_queue_position|morning_ready_at/i;
  return error?.code === '42703' && additiveColumn.test(message);
}

module.exports = { getDatabaseUrl, createSql, isMissingOutboundSchema };
