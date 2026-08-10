'use strict';

const crypto = require('node:crypto');
const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const repository = require('./manual-review-repository.cjs');
const { saveUnsubscribeToken } = require('./delivery-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const {
  createUnsubscribeToken,
  resolveUnsubscribeSigningSecret,
  sendPermissionedMarketingMessage,
} = require('./outbound-delivery.cjs');
const {
  polishOutboundBodyText,
  renderOutboundDeliveryContent,
  renderOutboundEmailPreview,
} = require('./personalization-template.cjs');
const { assessEmail } = require('./email.cjs');
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

function publicOrigin(env = process.env) {
  const deployPreview = String(env.CONTEXT || '').trim() === 'deploy-preview';
  const candidates = [
    ...(deployPreview ? [env.DEPLOY_PRIME_URL, env.DEPLOY_URL] : []),
    env.PUBLIC_SITE_URL,
    env.SITE_URL,
    env.APP_URL,
    env.URL,
    'https://bannersonthefly.com',
  ];
  for (const candidate of candidates) {
    try {
      const origin = new URL(String(candidate || '').trim());
      if (origin.protocol === 'https:' && !origin.username && !origin.password && origin.hostname) return origin.origin;
    } catch {
      // Try the next configured site URL.
    }
  }
  const error = new Error('A secure public site URL is required for unsubscribe links.');
  error.code = 'MANUAL_MARKETING_NOT_CONFIGURED';
  throw error;
}

function validateManualDeliveryConfiguration(env = process.env) {
  const origin = publicOrigin(env);
  const rawFrom = String(
    env.OUTBOUND_PERMISSIONED_FROM_EMAIL
      || env.EMAIL_FROM_INFO
      || 'info@bannersonthefly.com',
  ).trim();
  const from = rawFrom && !rawFrom.includes('<') ? `Banners On The Fly <${rawFrom}>` : rawFrom;
  const replyTo = String(
    env.OUTBOUND_PERMISSIONED_REPLY_TO_EMAIL
      || env.EMAIL_REPLY_TO
      || 'support@bannersonthefly.com',
  ).trim();
  const physicalAddress = String(
    env.OUTBOUND_PHYSICAL_ADDRESS
      || 'PO Box 369, Crestwood, KY 40014',
  ).replace(/\s+/g, ' ').trim();
  const apiKey = String(env.OUTBOUND_PERMISSIONED_RESEND_API_KEY || env.RESEND_API_KEY || '').trim();
  const mailboxPattern = /^(?:[^<>\r\n]{1,100}\s+<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/;
  const issues = [];
  if (!mailboxPattern.test(from)) issues.push('sender identity');
  if (!mailboxPattern.test(replyTo)) issues.push('reply-to identity');
  if (apiKey.length < 16) issues.push('Resend API key');
  try { resolveUnsubscribeSigningSecret(env); } catch { issues.push('unsubscribe signing'); }
  if (physicalAddress.length < 10 || physicalAddress.length > 300) issues.push('physical address');
  if (issues.length) {
    const error = new Error('Manual marketing delivery configuration is incomplete.');
    error.code = 'MANUAL_MARKETING_NOT_CONFIGURED';
    error.deliveryIssues = issues;
    throw error;
  }
  return { origin, from, replyTo, physicalAddress };
}

function deliveryStatus(env = process.env) {
  try {
    validateManualDeliveryConfiguration(env);
    return { deliveryReady: true, deliveryIssues: [] };
  } catch (error) {
    return {
      deliveryReady: false,
      deliveryIssues: Array.isArray(error?.deliveryIssues) ? error.deliveryIssues : ['delivery configuration'],
    };
  }
}

function deliveryReady(env = process.env) {
  return deliveryStatus(env).deliveryReady;
}

function emptyQueue(env = process.env) {
  const status = deliveryStatus(env);
  return {
    leads: [], total: 0, limit: 50, offset: 0,
    minimumScore: repository.MIN_HIGH_VALUE_SCORE,
    reviewView: 'ready',
    counts: { pending: 0, approved: 0, rejected: 0, sent: 0 },
    today: { attempted: 0, sent: 0, limit: repository.MAX_MANUAL_DAILY_ATTEMPTS },
    ...status,
  };
}

function createManualReviewHandler(options = {}) {
  const dependencies = {
    ...repository,
    createSql,
    appendAudit,
    saveUnsubscribeToken,
    sendPermissionedMarketingMessage,
    assessEmail,
    ...options.dependencies,
  };
  const env = options.env || process.env;

  return async function manualReviewHandler(event) {
    if (event.httpMethod === 'OPTIONS') {
      return json(204, {}, {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
    }
    const mutating = event.httpMethod === 'POST';
    const auth = authorize(event, { requireOrigin: mutating });
    if (auth.response) return auth.response;
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
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
          reviewView: String(query.view || 'ready').toLowerCase(),
        });
        const leads = queue.leads.map((lead) => {
          if (!lead.message?.bodyText) return lead;
          const bodyText = polishOutboundBodyText(lead.message.bodyText);
          return {
            ...lead,
            message: {
              ...lead.message,
              bodyText,
              bodyHtml: renderOutboundEmailPreview({
                subject: lead.message.subject,
                bodyText,
              }),
            },
          };
        });
        return json(200, { ok: true, schemaReady: true, ...deliveryStatus(env), ...queue, leads });
      }

      const body = parseJsonBody(event);
      const prospectId = String(body?.prospectId || '').trim();
      if (!UUID_PATTERN.test(prospectId)) {
        const error = new Error('Prospect ID is invalid.');
        error.code = 'INVALID_MANUAL_REVIEW';
        throw error;
      }
      const config = validateManualDeliveryConfiguration(env);
      const reviewedBy = String(auth.session.email || auth.session.sub || '').trim();
      const contact = await dependencies.loadManualReviewContact(sql, prospectId);
      if (!contact) {
        const error = new Error('This lead does not have an active business email.');
        error.code = 'MANUAL_MARKETING_NOT_ELIGIBLE';
        throw error;
      }
      const contactAssessment = await dependencies.assessEmail(contact.email, {
        businessDomain: contact.canonical_domain,
      });
      await dependencies.saveManualContactAssessment(sql, contact.id, contactAssessment);
      await dependencies.authorizeManualSend(sql, { prospectId, reviewedBy });
      await dependencies.appendAudit(sql, {
        actorType: 'admin', actorId: reviewedBy,
        action: 'manual_lead.send_authorized', entityType: 'prospect', entityId: prospectId,
        newValues: { reviewStatus: 'approved', permissionStatus: 'admin_authorized' },
        metadata: {
          authorizationSource: 'authenticated_send_click',
          emailDnsRechecked: Boolean(contactAssessment?.mxCheckedAt),
          emailMxStatus: contactAssessment?.mxStatus || null,
        },
        requestId: event.headers?.['x-nf-request-id'] || null,
      });
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
        const error = new Error('This lead is not eligible to send. Recheck suppression status, email quality, preview readiness, prior contact, and the daily limit.');
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
          permissionStatus: 'admin_authorized', adminAuthorized: true,
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
          metadata: { messageId: claimed.message_id, provider: 'resend', permissionBasis: 'admin_authorized' },
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
  publicOrigin,
  validateManualDeliveryConfiguration,
  deliveryStatus,
  deliveryReady,
  emptyQueue,
  createManualReviewHandler,
  manualReviewHandler,
};
