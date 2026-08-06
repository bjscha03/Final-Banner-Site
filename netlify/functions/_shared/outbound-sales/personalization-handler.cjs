'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { getRuntimeConfig, effectiveControlState } = require('./config.cjs');
const { loadFoundationSnapshot } = require('./repository.cjs');
const { generateShadowPersonalization } = require('./personalization.cjs');
const { listPersonalizationActivity } = require('./personalization-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { csvCell } = require('./prospects-handler.cjs');
const { json, authorize, parseJsonBody, redactSecretText, safeFailure } = require('./security.cjs');

function publicMessage(message) {
  if (!message) return null;
  const { generationKey: _generationKey, ...safe } = message;
  return safe;
}

function activityCsv(messages) {
  const headers = [
    'message_id', 'message_kind', 'prospect_id', 'business_name', 'industry', 'lead_score',
    'generation_status', 'subject', 'body_text', 'research_summary',
    'evidence', 'source_urls', 'variant_assignments', 'recommended_follow_up_at',
    'model', 'prompt_version', 'research_content_hash', 'input_tokens',
    'cached_input_tokens', 'output_tokens', 'estimated_openai_cost_microusd',
    'actual_openai_cost_microusd', 'evidence_validation_status', 'delivery_state',
    'planned_send_at', 'send_attempt_count', 'resend_message_id', 'sent_at',
    'delivered_at', 'generated_at',
  ];
  const rows = messages.map((message) => [
    message.id, message.messageKind, message.prospectId, message.businessName, message.industry, message.leadScore,
    message.generationStatus, message.subject, message.bodyText, message.researchSummary,
    message.personalizationEvidence, message.sourceUrls, message.variantAssignments,
    message.recommendedFollowUpAt, message.model, message.promptVersion,
    message.researchContentHash, message.inputTokens, message.cachedInputTokens,
    message.outputTokens, message.estimatedOpenAICostMicrousd,
    message.actualOpenAICostMicrousd, message.evidenceValidationStatus, message.deliveryState,
    message.plannedSendAt, message.sendAttemptCount, message.resendMessageId,
    message.sentAt, message.deliveredAt, message.generatedAt,
  ]);
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
}

function createPersonalizationHandlers(dependencies = {}) {
  const sqlFactory = dependencies.createSql || createSql;
  const snapshotLoader = dependencies.loadFoundationSnapshot || loadFoundationSnapshot;
  const generator = dependencies.generateShadowPersonalization || generateShadowPersonalization;
  const activityLoader = dependencies.listPersonalizationActivity || listPersonalizationActivity;
  const auditor = dependencies.appendAudit || appendAudit;
  const runtimeReader = dependencies.getRuntimeConfig || getRuntimeConfig;

  async function loadControls(sql) {
    const snapshot = await snapshotLoader(sql);
    if (!snapshot.schemaReady) {
      const error = new Error('Outbound schema is not ready.');
      error.code = 'OUTBOUND_SCHEMA_NOT_READY';
      throw error;
    }
    return effectiveControlState(snapshot.settings, runtimeReader());
  }

  async function personalizeHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const auth = authorize(event, { requireOrigin: event.httpMethod === 'POST' });
    if (auth.response) return auth.response;
    if (event.httpMethod !== 'POST') {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
    }
    try {
      if (!getDatabaseUrl()) {
        const error = new Error('Outbound database connection is not configured.');
        error.code = 'DATABASE_NOT_CONFIGURED';
        throw error;
      }
      const body = parseJsonBody(event, 4 * 1024);
      const allowedKeys = new Set(['adminSessionToken', 'prospectId']);
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        const error = new Error('Only a prospect identifier may be submitted.');
        error.code = 'PERSONALIZATION_NOT_ELIGIBLE';
        throw error;
      }
      const sql = sqlFactory();
      const controls = await loadControls(sql);
      const result = await generator({
        sql,
        prospectId: body.prospectId,
        controls,
        requestId: event?.headers?.['x-nf-request-id'] || event?.headers?.['x-request-id'] || null,
        dependencies: dependencies.generatorDependencies,
      });
      return json(200, {
        ok: true,
        shadowMode: true,
        liveSending: false,
        skipped: result.skipped,
        cacheHit: result.cacheHit,
        prospectId: result.prospectId,
        message: publicMessage(result.message),
      });
    } catch (error) {
      console.error('[outbound-sales] shadow personalization unavailable', {
        code: redactSecretText(error?.code || 'PERSONALIZATION_FAILED').slice(0, 100),
      });
      return safeFailure(error);
    }
  }

  async function activityHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const auth = authorize(event);
    if (auth.response) return auth.response;
    if (event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use GET.' }, { Allow: 'GET, OPTIONS' });
    }
    if (!getDatabaseUrl()) {
      return json(200, {
        ok: true, schemaReady: false, shadowMode: true, liveSending: false,
        messages: [], total: 0, limit: 50, offset: 0,
        summary: { generated: 0, failed: 0, blocked: 0, actualCostMicrousd: 0, averageCostMicrousd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      });
    }
    try {
      const query = event.queryStringParameters || {};
      const format = String(query.format || '').toLowerCase();
      const result = await activityLoader(sqlFactory(), {
        limit: format === 'csv' ? 5000 : Number(query.limit),
        offset: Number(query.offset),
        maximumLimit: format === 'csv' ? 5000 : 100,
      });
      const messages = result.messages.map((message) => publicMessage(message));
      if (format === 'csv') {
        await auditor(sqlFactory(), {
          actorType: 'admin', actorId: auth.session.email || auth.session.sub || null,
          action: 'messages.exported', entityType: 'message_activity',
          metadata: { rowCount: messages.length, phase: 'shadow_personalization' },
          requestId: event?.headers?.['x-nf-request-id'] || null,
        });
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="outbound-shadow-messages.csv"',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            Vary: 'Authorization, X-Banners-Admin-Session, Cookie',
          },
          body: activityCsv(messages),
        };
      }
      return json(200, {
        ok: true, schemaReady: true, shadowMode: true, liveSending: false,
        ...result, messages,
      });
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        return json(200, {
          ok: true, schemaReady: false, shadowMode: true, liveSending: false,
          messages: [], total: 0, limit: 50, offset: 0,
          summary: { generated: 0, failed: 0, blocked: 0, actualCostMicrousd: 0, averageCostMicrousd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        });
      }
      console.error('[outbound-sales] personalization activity unavailable', {
        code: redactSecretText(error?.code || 'DATABASE_UNAVAILABLE').slice(0, 100),
      });
      return safeFailure(error);
    }
  }

  return { personalizeHandler, activityHandler, loadControls };
}

const handlers = createPersonalizationHandlers();

module.exports = {
  publicMessage,
  activityCsv,
  createPersonalizationHandlers,
  ...handlers,
};
