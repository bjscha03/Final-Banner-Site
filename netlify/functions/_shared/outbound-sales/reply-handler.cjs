'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { getRuntimeConfig, effectiveControlState } = require('./config.cjs');
const { loadFoundationSnapshot } = require('./repository.cjs');
const { listReplies, updateReplyReview } = require('./reply-repository.cjs');
const { CLASSIFICATIONS } = require('./reply-classification.cjs');
const { appendAudit } = require('./audit.cjs');
const { csvCell } = require('./prospects-handler.cjs');
const { json, authorize, parseJsonBody, safeFailure } = require('./security.cjs');

const REVIEW_STATUSES = new Set(['unreviewed', 'reviewed', 'handled', 'ignored']);

function repliesCsv(replies) {
  const headers = ['reply_id','prospect_id','business_name','message_id','from_email','to_email','subject','body_text','classification','classification_source','classification_confidence','classification_reason','suggested_response_subject','suggested_response_body','suggested_response_status','review_status','received_at','handled_at'];
  const rows = replies.map((r) => [r.id,r.prospectId,r.businessName,r.messageId,r.fromEmail,r.toEmail,r.subject,r.bodyText,r.classification,r.classificationSource,r.classificationConfidence,r.classificationReason,r.suggestedResponseSubject,r.suggestedResponseBody,r.suggestedResponseStatus,r.reviewStatus,r.receivedAt,r.handledAt]);
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
}

function createReplyHandlers(dependencies = {}) {
  const sqlFactory = dependencies.createSql || createSql;
  const list = dependencies.listReplies || listReplies;
  const update = dependencies.updateReplyReview || updateReplyReview;
  const auditor = dependencies.appendAudit || appendAudit;

  async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const mutation = event.httpMethod === 'PUT';
    const auth = authorize(event, { requireOrigin: mutation });
    if (auth.response) return auth.response;
    if (!['GET','PUT'].includes(event.httpMethod)) return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use GET or PUT.' }, { Allow: 'GET, PUT, OPTIONS' });
    if (!getDatabaseUrl()) return json(200, { ok: true, schemaReady: false, shadowMode: true, liveSending: false, automaticReplies: false, replies: [], total: 0, classificationCounts: {}, limit: 50, offset: 0 });
    try {
      const sql = sqlFactory();
      if (mutation) {
        const body = parseJsonBody(event, 8 * 1024);
        if (!/^[0-9a-f-]{36}$/i.test(String(body.replyId || '')) || !REVIEW_STATUSES.has(body.reviewStatus)
            || (body.classification && !CLASSIFICATIONS.includes(body.classification))) {
          const error = new Error('Reply review fields are invalid.'); error.code = 'INVALID_REPLY_REVIEW'; throw error;
        }
        const saved = await update(sql, { replyId: body.replyId, reviewStatus: body.reviewStatus, classification: body.classification || null, actorId: auth.session.email || auth.session.sub || null });
        if (!saved) { const error = new Error('Reply was not found.'); error.code = 'REPLY_NOT_FOUND'; throw error; }
        await auditor(sql, { actorType: 'admin', actorId: auth.session.email || auth.session.sub || null, action: 'reply.review_updated', entityType: 'reply', entityId: saved.id, newValues: { classification: saved.classification, reviewStatus: saved.review_status }, requestId: event?.headers?.['x-nf-request-id'] || null });
        return json(200, { ok: true, reply: saved, automaticReplySent: false });
      }
      const query = event.queryStringParameters || {};
      const format = String(query.format || '').toLowerCase();
      const result = await list(sql, { limit: format === 'csv' ? 5000 : Number(query.limit), offset: Number(query.offset), classification: CLASSIFICATIONS.includes(query.classification) ? query.classification : null });
      if (format === 'csv') {
        await auditor(sql, {
          actorType: 'admin', actorId: auth.session.email || auth.session.sub || null,
          action: 'replies.exported', entityType: 'reply_activity',
          metadata: { rowCount: result.replies.length, classification: query.classification || null },
          requestId: event?.headers?.['x-nf-request-id'] || null,
        });
        return { statusCode: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="outbound-replies.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Authorization, X-Banners-Admin-Session, Cookie' }, body: repliesCsv(result.replies) };
      }
      const snapshot = await (dependencies.loadFoundationSnapshot || loadFoundationSnapshot)(sql);
      const controls = effectiveControlState(snapshot.settings, (dependencies.getRuntimeConfig || getRuntimeConfig)());
      return json(200, { ok: true, schemaReady: true, shadowMode: true, liveSending: false, automaticReplies: false, ingestionEnabled: controls.replyIngestionEnabled, ...result });
    } catch (error) {
      if (isMissingOutboundSchema(error)) return json(200, { ok: true, schemaReady: false, shadowMode: true, liveSending: false, automaticReplies: false, replies: [], total: 0, classificationCounts: {}, limit: 50, offset: 0 });
      return safeFailure(error);
    }
  }
  return { handler };
}

module.exports = { REVIEW_STATUSES, repliesCsv, createReplyHandlers, ...createReplyHandlers() };
