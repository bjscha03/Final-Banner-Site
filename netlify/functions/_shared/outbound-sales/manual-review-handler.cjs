'use strict';

const crypto = require('node:crypto');
const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const repository = require('./manual-review-repository.cjs');
const { saveUnsubscribeToken } = require('./delivery-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const {
  createUnsubscribeToken,
  sendPermissionedMarketingMessage,
} = require('./outbound-delivery.cjs');
const { renderOutboundDeliveryContent } = require('./personalization-template.cjs');
const { json, authorize, parseJsonBody, redactSecretText, safeFailure } = require('./security.cjs');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableManualSendKey(prospectId) {
  return `manual-lead:${crypto.createHash('sha256').update(String(prospectId)).digest('hex')}`;
}

function businessDate(now = new Date(), timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function normalizeReviewInput(body) {
  const prospectId = String(body?.prospectId || '').trim();
  const reviewStatus = String(body?.reviewStatus || '').trim();
  const permissionEvidence = String(body?.permissionEvidence || '').replace(/\s+/g, ' ').trim();
  const notes = String(body?.notes || '').replace(/\s+/g, ' ').trim();
  if (!UUID_PATTERN.test(prospectId) || !['approved', 'rejected'].includes(reviewStatus)) {
    const error = new Error('Lead review fields are invalid.');
    error.code = 'INVALID_MANUAL_REVIEW';
    throw error;
  }
  if (reviewStatus === 'approved' && (body?.explicitOptIn !== true || permissionEvidence.length < 8 || permissionEvidence.length > 1000)) {
    const error = new Error('Approval requires explicit opt-in confirmation and permission evidence.');
    error.code = 'PERMISSIONED_MARKETING_REQUIRED';
    throw error;
  }
  if (notes.length > 1000) {
    const error = new Error('Lead review notes are too long.');
    error.code = 'INVALID_MANUAL_REVIEW';
    throw error;
  }
  return { prospectId, reviewStatus, permissionEvidence, notes };
}

function publicOrigin(env = process.env) {
  const candidate = String(env.PUBLIC_SITE_URL || env.URL || '').trim();
  try {
    const origin = new URL(candidate);
    if (origin.protocol === 'https:' && !origin.username && !origin.password && origin.hostname) return origin.origin;
  } catch {
    // Return the fail-closed configuration error below.
  }
  const error = new Error('A secure public site URL is required for unsubscribe links.');
  error.code = 'MANUAL_MARKETING_NOT_CONFIGURED';
  throw error;
}

function validateManualDeliveryConfiguration(env = process.env) {
  const origin = publicOrigin(env);
  const rawFrom = String(env.OUTBOUND_PERMISSIONED_FROM_EMAIL || '').trim();
  const from = rawFrom && !rawFrom.includes('<') ? `Banners On The Fly <${rawFrom}>` : rawFrom;
  const replyTo = String(env.OUTBOUND_PERMISSIONED_REPLY_TO_EMAIL || '').trim();
  const physicalAddress = String(env.OUTBOUND_PHYSICAL_ADDRESS || '').replace(/\s+/g, ' ').trim();
  const apiKey = String(env.OUTBOUND_PERMISSIONED_RESEND_API_KEY || env.RESEND_API_KEY || '').trim();
  const signingSecret = String(env.OUTBOUND_UNSUBSCRIBE_SIGNING_SECRET || '').trim();
  const mailboxPattern = /^(?:[^<>\r\n]{1,100}\s+<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/;
  if (!mailboxPattern.test(from) || !mailboxPattern.test(replyTo)
      || apiKey.length < 16 || signingSecret.length < 32
      || physicalAddress.length < 10 || physicalAddress.length > 300) {
    const error = new Error('Manual marketing delivery configuration is incomplete.');
    error.code = 'MANUAL_MARKETING_NOT_CONFIGURED';
    throw error;
  }
  return { origin, from, replyTo, physicalAddress };
}

function deliveryReady(env = process.env) {
  try {
    validateManualDeliveryConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

function emptyQueue(env = process.env) {
  return {
    leads: [], total: 0, limit: 50, offset: 0,
    minimumScore: repository.MIN_HIGH_VALUE_SCORE,
    reviewView: 'pending',
    counts: { pending: 0, approved: 0, rejected: 0, sent: 0 },
    today: { attempted: 0, sent: 0, limit: repository.MAX_MANUAL_DAILY_ATTEMPTS },
    deliveryReady: deliveryReady(env),
  };
}

function createManualReviewHandler(options = {}) {
  const dependencies = {
    ...repository,
    createSql,
    appendAudit,
    saveUnsubscribeToken,
    sendPermissionedMarketingMessage,
    ...options.dependencies,
  };
  const env = options.env || process.env;

  return async function manualReviewHandler(event) {
    if (event.httpMethod === 'OPTIONS') {
      return json(204, {}, {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
        'Access-Control-Allow-Methods': 'GET, PATCH, POST, OPTIONS',
      });
    }
    const mutating = ['PATCH', 'POST'].includes(event.httpMethod);
    const auth = authorize(event, { requireOrigin: mutating });
    if (auth.response) return auth.response;
    if (!['GET', 'PATCH', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, PATCH, POST, OPTIONS' });
    }
    if (!getDatabaseUrl(env)) {
      if (event.httpMethod === 'GET') return json(200, { ok: true, schemaReady: false, ...emptyQueue(env) });
      return safeFailure(Object.assign(new Error('Database is not configured.'), { code: 'DATABASE_NOT_CONFIGURED' }));
    }

    let sql;
    try {
      sql = dependencies.createSql(env);
      if (event.httpMethod === 'GET') {
        const query = event.queryStringParameters || {};
        const queue = await dependencies.listManualReviewLeads(sql, {
          limit: Number(query.limit), offset: Number(query.offset), minimumScore: Number(query.minimumScore),
          reviewView: String(query.view || 'pending').toLowerCase(),
        });
        return json(200, { ok: true, schemaReady: true, deliveryReady: deliveryReady(env), ...queue });
      }

      const body = parseJsonBody(event);
      if (event.httpMethod === 'PATCH') {
        const input = normalizeReviewInput(body);
        const reviewedBy = String(auth.session.email || auth.session.sub || '').trim();
        const saved = await dependencies.saveManualReview(sql, { ...input, reviewedBy });
        if (!saved) {
          const error = new Error('A sent lead review cannot be changed.');
          error.code = 'MANUAL_MARKETING_NOT_ELIGIBLE';
          throw error;
        }
        await dependencies.appendAudit(sql, {
          actorType: 'admin', actorId: reviewedBy,
          action: input.reviewStatus === 'approved' ? 'manual_lead.approved' : 'manual_lead.rejected',
          entityType: 'prospect', entityId: input.prospectId,
          newValues: {
            reviewStatus: input.reviewStatus,
            permissionStatus: input.reviewStatus === 'approved' ? 'explicit_opt_in' : 'unknown',
          },
          metadata: { permissionEvidenceRecorded: input.reviewStatus === 'approved', notesPresent: Boolean(input.notes) },
          requestId: event.headers?.['x-nf-request-id'] || null,
        });
        return json(200, { ok: true, review: {
          prospectId: saved.prospect_id,
          status: saved.review_status,
          permissionStatus: saved.permission_status,
          sendState: saved.send_state,
        } });
      }

      const prospectId = String(body?.prospectId || '').trim();
      if (!UUID_PATTERN.test(prospectId)) {
        const error = new Error('Prospect ID is invalid.');
        error.code = 'INVALID_MANUAL_REVIEW';
        throw error;
      }
      const config = validateManualDeliveryConfiguration(env);
      const now = new Date();
      const sendKey = stableManualSendKey(prospectId);
      const deliveryDate = businessDate(now);
      const claimed = await dependencies.claimManualReviewSend(sql, {
        prospectId, sendKey, businessDate: deliveryDate,
        dailyLimit: repository.MAX_MANUAL_DAILY_ATTEMPTS,
      });
      if (!claimed) {
        const state = await dependencies.loadManualReviewState(sql, prospectId);
        if (state?.send_state === 'sent') {
          return json(200, { ok: true, duplicate: true, prospectId, messageId: state.resend_message_id });
        }
        const error = new Error('This lead is not eligible to send. Recheck approval, permission, suppression, contact quality, preview readiness, and the daily limit.');
        error.code = 'MANUAL_MARKETING_NOT_ELIGIBLE';
        throw error;
      }

      const started = Date.now();
      try {
        const token = createUnsubscribeToken({ messageId: claimed.message_id, contactId: claimed.contact_id }, env);
        await dependencies.saveUnsubscribeToken(sql, {
          tokenHash: token.hash, prospectId: claimed.prospect_id, contactId: claimed.contact_id,
          messageId: claimed.message_id, expiresAt: new Date(now.getTime() + (180 * 86400000)).toISOString(),
        });
        const unsubscribeUrl = `${config.origin}/.netlify/functions/outbound-sales-unsubscribe?token=${encodeURIComponent(token.token)}`;
        const content = renderOutboundDeliveryContent({
          subject: claimed.subject, bodyText: claimed.body_text,
          physicalAddress: config.physicalAddress, unsubscribeUrl,
        });
        const result = await dependencies.sendPermissionedMarketingMessage({
          permissionStatus: 'explicit_opt_in', permissionAttested: true,
          message: {
            id: claimed.message_id, sendKey: claimed.send_key,
            subject: claimed.subject, bodyText: content.text, bodyHtml: content.html,
          },
          contact: { email: claimed.email },
          from: config.from, replyTo: config.replyTo,
          unsubscribeUrl, publicOrigin: config.origin, env,
        });
        const marked = await dependencies.markManualReviewSent(sql, {
          prospectId, sendKey: claimed.send_key, messageId: claimed.message_id,
          providerMessageId: result.providerMessageId,
          latencyMs: result.latencyMs, businessDate: deliveryDate,
        });
        if (!marked) {
          const error = new Error('The accepted email could not be committed. Retry will use the same provider idempotency key.');
          error.code = 'MANUAL_MARKETING_SEND_FAILED';
          throw error;
        }
        await dependencies.appendAudit(sql, {
          actorType: 'admin', actorId: auth.session.email || auth.session.sub || null,
          action: 'manual_lead.email_sent', entityType: 'prospect', entityId: prospectId,
          newValues: { status: 'contacted', sendState: 'sent' },
          metadata: { messageId: claimed.message_id, provider: 'resend', permissionBasis: 'explicit_opt_in' },
          requestId: event.headers?.['x-nf-request-id'] || null,
        });
        return json(200, { ok: true, duplicate: false, prospectId, messageId: result.providerMessageId });
      } catch (error) {
        const errorCode = redactSecretText(error?.code || 'MANUAL_MARKETING_SEND_FAILED').slice(0, 100);
        await dependencies.markManualReviewFailed(sql, { prospectId, sendKey: claimed.send_key, errorCode }).catch(() => null);
        await dependencies.appendAudit(sql, {
          actorType: 'admin', actorId: auth.session.email || auth.session.sub || null,
          action: 'manual_lead.email_failed', entityType: 'prospect', entityId: prospectId,
          newValues: { sendState: 'failed', errorCode },
          metadata: { messageId: claimed.message_id, elapsedMs: Math.max(0, Date.now() - started) },
          requestId: event.headers?.['x-nf-request-id'] || null,
        }).catch(() => null);
        throw error;
      }
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        if (event.httpMethod === 'GET') return json(200, { ok: true, schemaReady: false, ...emptyQueue(env) });
        return safeFailure(Object.assign(new Error('Manual lead review migration is not ready.'), { code: 'OUTBOUND_SCHEMA_NOT_READY' }));
      }
      console.error('[outbound-sales] manual lead review request failed', {
        code: redactSecretText(error?.code || 'OUTBOUND_REQUEST_FAILED').slice(0, 80),
      });
      return safeFailure(error);
    }
  };
}

const manualReviewHandler = createManualReviewHandler();

module.exports = {
  UUID_PATTERN,
  stableManualSendKey,
  businessDate,
  normalizeReviewInput,
  publicOrigin,
  validateManualDeliveryConfiguration,
  deliveryReady,
  emptyQueue,
  createManualReviewHandler,
  manualReviewHandler,
};
