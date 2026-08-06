'use strict';

const crypto = require('node:crypto');
const { redactSecretText, sanitizeForAudit } = require('./security.cjs');
const { classifyReply, replyContentHash, suggestedResponseDraft } = require('./reply-classification.cjs');
const { classifyUnclearReplyWithAI, REPLY_AI_PROMPT_VERSION } = require('./reply-ai.cjs');
const repository = require('./reply-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { mailboxAddress, extractRoutedMessageId } = require('./reply-routing.cjs');

const RESEND_API_ORIGIN = 'https://api.resend.com';
const RECEIVED_EMAIL_TIMEOUT_MS = 15000;
const MAX_RECEIVED_BODY_CHARS = 30000;

function inboundError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function header(event, name) {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function verifyResendWebhook(rawBody, event, env = process.env, dependencies = {}) {
  const secret = String(env.OUTBOUND_RESEND_WEBHOOK_SECRET || '').trim();
  if (!secret) throw inboundError('OUTBOUND_WEBHOOK_NOT_CONFIGURED', 'The outbound webhook verifier is not configured.');
  const signatureHeaders = {
    id: String(header(event, 'svix-id')),
    timestamp: String(header(event, 'svix-timestamp')),
    signature: String(header(event, 'svix-signature')),
  };
  if (Object.values(signatureHeaders).some((value) => !value)) {
    throw inboundError('OUTBOUND_WEBHOOK_INVALID', 'The outbound webhook signature is incomplete.');
  }
  try {
    if (dependencies.verify) return dependencies.verify({ payload: rawBody, headers: signatureHeaders, webhookSecret: secret });
    // Lazy loading prevents the isolated webhook verifier from changing any
    // existing transactional Resend initialization path.
    const { Resend } = require('resend');
    return new Resend().webhooks.verify({ payload: rawBody, headers: signatureHeaders, webhookSecret: secret });
  } catch {
    throw inboundError('OUTBOUND_WEBHOOK_INVALID', 'The outbound webhook signature is invalid.');
  }
}

function allowlistedHeaders(headers = {}) {
  const source = headers && typeof headers === 'object' ? headers : {};
  const allowed = ['message-id', 'in-reply-to', 'references', 'auto-submitted', 'precedence'];
  return Object.fromEntries(allowed
    .filter((key) => source[key] || source[key.toLowerCase()])
    .map((key) => [key, String(source[key] || source[key.toLowerCase()]).slice(0, 1000)]));
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<\s*(?:script|style)[^>]*>[\s\S]*?<\s*\/\s*(?:script|style)\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_RECEIVED_BODY_CHARS);
}

async function retrieveReceivedEmail(emailId, env = process.env, dependencies = {}) {
  const apiKey = String(env.OUTBOUND_RESEND_API_KEY || '').trim();
  if (!apiKey) throw inboundError('OUTBOUND_RESEND_NOT_CONFIGURED', 'The dedicated outbound Resend project is not configured.');
  if (!/^[0-9a-z_-]{8,100}$/i.test(String(emailId || ''))) throw inboundError('OUTBOUND_WEBHOOK_INVALID', 'The received email identifier is invalid.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECEIVED_EMAIL_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const fetchImpl = dependencies.fetch || globalThis.fetch;
    const response = await fetchImpl(`${RESEND_API_ORIGIN}/emails/receiving/${encodeURIComponent(emailId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response?.ok) throw inboundError('OUTBOUND_RECEIVED_EMAIL_UNAVAILABLE', 'The received email content is temporarily unavailable.');
    const body = await response.json();
    const data = body?.data && !body?.id ? body.data : body;
    return {
      id: String(data?.id || emailId),
      from: mailboxAddress(data?.from) || '',
      to: (Array.isArray(data?.to) ? data.to : [data?.to]).map(mailboxAddress).filter(Boolean).slice(0, 20),
      subject: String(data?.subject || '').slice(0, 500),
      text: String(data?.text || '').slice(0, MAX_RECEIVED_BODY_CHARS),
      html: String(data?.html || '').slice(0, MAX_RECEIVED_BODY_CHARS * 2),
      messageId: String(data?.message_id || '').slice(0, 1000),
      headers: allowlistedHeaders(data?.headers),
      createdAt: data?.created_at || null,
    };
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === 'AbortError') throw inboundError('OUTBOUND_RECEIVED_EMAIL_TIMEOUT', 'The received email lookup timed out.');
    throw inboundError('OUTBOUND_RECEIVED_EMAIL_UNAVAILABLE', 'The received email content is temporarily unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

function eventId(event, verifiedPayload) {
  return String(header(event, 'svix-id') || verifiedPayload?.id || '').trim().slice(0, 300);
}

function replyPipelineStatus(classification, currentStatus = null) {
  if (classification === 'unsubscribe') return 'unsubscribed';
  if (['won', 'lost', 'unsubscribed', 'suppressed'].includes(currentStatus)) return currentStatus;
  if (classification === 'interested') return 'interested';
  if (classification === 'quote_request') return 'quote_requested';
  if (['not_interested', 'wrong_contact'].includes(classification)) return 'lost';
  return 'replied';
}

async function claimInboundEvent(sql, data) {
  const rows = await sql(
    `INSERT INTO outbound_inbound_events (
       provider_event_id, provider_id, event_kind, event_type, payload_hash,
       signature_verified, processing_status, diagnostic_metadata, received_at
     ) VALUES ($1,'resend',$2,$3,$4,TRUE,'received',$5::jsonb,$6)
     ON CONFLICT (provider_event_id) DO NOTHING
     RETURNING id`,
    [data.providerEventId, data.eventKind, data.eventType, data.payloadHash,
      JSON.stringify(sanitizeForAudit(data.metadata || {})), data.receivedAt],
  );
  return rows[0] || null;
}

async function finishInboundEvent(sql, data) {
  await sql(
    `UPDATE outbound_inbound_events
        SET processing_status=$2, related_message_id=$3, related_reply_id=$4,
            error_code=$5, diagnostic_metadata=diagnostic_metadata || $6::jsonb,
            processed_at=NOW()
      WHERE id=$1`,
    [data.id, data.status, data.messageId || null, data.replyId || null,
      data.errorCode || null, JSON.stringify(sanitizeForAudit(data.metadata || {}))],
  );
}

async function processReceivedReply(options) {
  const dependencies = { ...repository, appendAudit, retrieveReceivedEmail, classifyUnclearReplyWithAI, ...options.dependencies };
  const sql = options.sql;
  const payload = options.payload;
  const data = payload?.data || {};
  const providerEventId = options.providerEventId;
  const claim = await claimInboundEvent(sql, {
    providerEventId, eventKind: 'reply', eventType: payload.type,
    payloadHash: crypto.createHash('sha256').update(options.rawBody).digest('hex'),
    metadata: { providerEmailId: data.email_id || null },
    receivedAt: payload.created_at || new Date().toISOString(),
  });
  if (!claim) return { duplicate: true, processed: false };
  try {
    const received = await dependencies.retrieveReceivedEmail(data.email_id, options.env || process.env, options.providerDependencies || {});
    const routedMessageId = extractRoutedMessageId(received.to, options.env?.OUTBOUND_REPLY_TO_EMAIL);
    const target = await dependencies.resolveReplyTarget(
      sql,
      received.from,
      received.headers['in-reply-to'] || data.message_id || null,
      routedMessageId,
    );
    if (!target) {
      await finishInboundEvent(sql, { id: claim.id, status: 'ignored', metadata: { reason: 'sender_not_in_outbound_contacts' } });
      return { duplicate: false, processed: false, ignored: true };
    }
    const bodyText = (received.text || htmlToPlainText(received.html)).slice(0, MAX_RECEIVED_BODY_CHARS);
    let classified = classifyReply({ subject: received.subject, bodyText });
    let aiDiagnostic = null;
    if (classified.needsAI && options.allowAIFallback === true) {
      try {
        const aiResult = await dependencies.classifyUnclearReplyWithAI({
          sql, prospectId: target.prospect_id, deterministicResult: classified,
          reply: { subject: received.subject, bodyText }, env: options.env || process.env,
          dependencies: options.aiDependencies || {},
        });
        classified = aiResult;
        aiDiagnostic = { ...aiResult, status: 'completed' };
      } catch (error) {
        aiDiagnostic = { ...(error?.replyAIDiagnostic || {}), status: 'failed' };
      }
    }
    const suggestedResponse = suggestedResponseDraft(classified.classification, {
      businessName: target.business_name, subject: received.subject,
    });
    const reply = await dependencies.insertReply(sql, {
      prospectId: target.prospect_id, contactId: target.contact_id,
      messageId: target.message_id, providerEventId, providerMessageId: received.messageId || received.id,
      inReplyToProviderMessageId: received.headers['in-reply-to'] || null,
      fromEmail: received.from, toEmail: received.to[0] || null,
      subject: received.subject, bodyText, classification: classified.classification,
      classificationSource: classified.source || 'deterministic',
      confidence: classified.confidence, reasons: classified.reasons,
      ruleVersion: classified.ruleVersion,
      rawContentHash: replyContentHash({ fromEmail: received.from, subject: received.subject, bodyText }),
      headersSummary: received.headers, suggestedResponse,
      receivedAt: received.createdAt || payload.created_at || new Date().toISOString(),
    });
    if (!reply) {
      await finishInboundEvent(sql, { id: claim.id, status: 'duplicate', messageId: target.message_id });
      return { duplicate: true, processed: false };
    }
    if (aiDiagnostic?.requestKey) {
      await dependencies.recordReplyAIUsage(sql, {
        prospectId: target.prospect_id, replyId: reply.id,
        requestKey: aiDiagnostic.requestKey, costLedgerId: aiDiagnostic.costLedgerId,
        model: aiDiagnostic.model, inputTokens: aiDiagnostic.usage?.inputTokens || 0,
        cachedInputTokens: aiDiagnostic.usage?.cachedInputTokens || 0,
        outputTokens: aiDiagnostic.usage?.outputTokens || 0,
        estimatedCostMicrousd: aiDiagnostic.estimatedCostMicrousd,
        actualCostMicrousd: aiDiagnostic.actualCostMicrousd,
        providerRequestId: aiDiagnostic.providerRequestId,
        status: aiDiagnostic.status, promptVersion: REPLY_AI_PROMPT_VERSION,
        latencyMs: aiDiagnostic.latencyMs, errorCode: aiDiagnostic.errorCode || null,
        metadata: { attempts: aiDiagnostic.attempts || 0, reviewRequired: true, automaticReplySent: false },
      }).catch(() => null);
    }
    await dependencies.upsertReplySuppression(sql, {
      replyId: reply.id, prospectId: target.prospect_id, contactId: target.contact_id,
      messageId: target.message_id, fromEmail: received.from, classification: classified.classification,
    });
    const nextProspectStatus = replyPipelineStatus(classified.classification, target.prospect_status);
    if (target.prospect_status !== nextProspectStatus) {
      await dependencies.appendAudit(sql, {
        actorType: 'webhook', action: 'prospect.pipeline_status_changed',
        entityType: 'prospect', entityId: target.prospect_id,
        previousValues: { status: target.prospect_status },
        newValues: { status: nextProspectStatus },
        metadata: { source: 'classified_reply', replyId: reply.id, classification: classified.classification },
        requestId: providerEventId,
      });
    }
    await finishInboundEvent(sql, {
      id: claim.id, status: 'processed', messageId: target.message_id, replyId: reply.id,
      metadata: {
        classification: classified.classification,
        confidence: classified.confidence,
        aiRequired: classified.needsAI,
        routedMessageMatch: Boolean(routedMessageId),
      },
    });
    await dependencies.appendAudit(sql, {
      actorType: 'webhook', action: 'reply.received_and_classified', entityType: 'reply', entityId: reply.id,
      newValues: { classification: classified.classification, reviewStatus: 'unreviewed' },
      metadata: { ruleVersion: classified.ruleVersion || null, classificationSource: classified.source || 'deterministic', confidence: classified.confidence, automaticReplySent: false },
      requestId: providerEventId,
    });
    return { duplicate: false, processed: true, replyId: reply.id, classification: classified.classification, aiRequired: classified.needsAI };
  } catch (error) {
    await finishInboundEvent(sql, {
      id: claim.id, status: 'failed', errorCode: redactSecretText(error?.code || 'INBOUND_PROCESSING_FAILED').slice(0, 100),
    }).catch(() => null);
    throw error;
  }
}

const DELIVERY_EVENT_MAP = Object.freeze({
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
});

async function processDeliveryEvent(options) {
  const dependencies = { appendAudit, ...options.dependencies };
  const payload = options.payload;
  const mapped = DELIVERY_EVENT_MAP[payload?.type];
  if (!mapped) return { processed: false, ignored: true };
  const sql = options.sql;
  const data = payload.data || {};
  const claim = await claimInboundEvent(sql, {
    providerEventId: options.providerEventId, eventKind: 'delivery', eventType: payload.type,
    payloadHash: crypto.createHash('sha256').update(options.rawBody).digest('hex'),
    metadata: { providerEmailId: data.email_id || null },
    receivedAt: payload.created_at || new Date().toISOString(),
  });
  if (!claim) return { duplicate: true, processed: false };
  try {
    const messageRows = await sql(
      `SELECT m.id, m.prospect_id, m.contact_id, c.email, p.canonical_domain
         FROM outbound_messages m
         LEFT JOIN outbound_contacts c ON c.id=m.contact_id
         LEFT JOIN outbound_prospects p ON p.id=m.prospect_id
        WHERE m.resend_message_id=$1
        LIMIT 1`,
      [data.email_id || null],
    );
    const message = messageRows[0];
    if (!message) {
      await finishInboundEvent(sql, { id: claim.id, status: 'ignored', metadata: { reason: 'unknown_outbound_message' } });
      return { processed: false, ignored: true };
    }
    await sql(
      `INSERT INTO outbound_email_events (
         message_id, provider_event_id, event_type, event_status,
         event_summary, event_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [message.id, options.providerEventId, mapped, String(data.status || mapped).slice(0, 100),
        JSON.stringify(sanitizeForAudit({ bounceType: data.bounce?.type || null, providerEmailId: data.email_id || null })),
        payload.created_at || new Date().toISOString()],
    );
    const terminal = ['bounced','complained','failed','suppressed'].includes(mapped);
    await sql(
      `UPDATE outbound_messages
          SET status=CASE
            WHEN status IN ('bounced','complained','suppressed') THEN status
            WHEN $2='delivered' THEN 'delivered'
            WHEN $2='sent' THEN 'sent'
            WHEN $2='bounced' THEN 'bounced'
            WHEN $2='complained' THEN 'complained'
            WHEN $2='suppressed' THEN 'suppressed'
            WHEN $2='failed' THEN 'failed'
            ELSE status END,
              delivered_at=CASE WHEN $2='delivered' THEN COALESCE(delivered_at,$3) ELSE delivered_at END,
              delivery_state=CASE WHEN $2 IN ('sent','delivered') THEN 'sent' WHEN $4 THEN 'failed' ELSE delivery_state END,
              updated_at=NOW()
        WHERE id=$1`,
      [message.id, mapped, payload.created_at || new Date().toISOString(), terminal],
    );
    if (['delivered','bounced','complained','failed'].includes(mapped)) {
      await sql(
        `UPDATE outbound_daily_delivery_counters
            SET delivered_count=delivered_count+CASE WHEN $1='delivered' THEN 1 ELSE 0 END,
                bounced_count=bounced_count+CASE WHEN $1='bounced' THEN 1 ELSE 0 END,
                complained_count=complained_count+CASE WHEN $1='complained' THEN 1 ELSE 0 END,
                failed_count=failed_count+CASE WHEN $1='failed' THEN 1 ELSE 0 END,
                updated_at=NOW()
          WHERE business_date=($2::timestamptz AT TIME ZONE $3)::date`,
        [mapped, payload.created_at || new Date().toISOString(), options.businessTimezone || 'America/New_York'],
      );
    }
    if (['bounced','complained'].includes(mapped) && message.email) {
      const reason = mapped === 'bounced' ? 'hard_bounce' : 'complaint';
      await sql(
        `INSERT INTO outbound_suppressions (
           scope, normalized_value, reason, source, prospect_id, contact_id,
           message_id, evidence, active, updated_at
         ) VALUES ('email',LOWER($1),$2,'webhook',$3,$4,$5,$6::jsonb,TRUE,NOW())
         ON CONFLICT (scope,normalized_value) DO UPDATE
           SET reason=EXCLUDED.reason, source='webhook', prospect_id=EXCLUDED.prospect_id,
               contact_id=EXCLUDED.contact_id, message_id=EXCLUDED.message_id,
               evidence=EXCLUDED.evidence, active=TRUE, updated_at=NOW()`,
        [message.email, reason, message.prospect_id, message.contact_id, message.id,
          JSON.stringify({ providerEventId: options.providerEventId, eventType: mapped })],
      );
      const suppressedProspects = await sql(
        `UPDATE outbound_prospects
            SET status='suppressed',suppression_reason=$2,updated_at=NOW()
          WHERE id=$1 AND status NOT IN ('won','lost','unsubscribed','suppressed')
        RETURNING id`,
        [message.prospect_id, reason],
      );
      if (suppressedProspects.length) {
        await dependencies.appendAudit(sql, {
          actorType: 'webhook', action: 'prospect.pipeline_status_changed',
          entityType: 'prospect', entityId: message.prospect_id,
          newValues: { status: 'suppressed', suppressionReason: reason },
          metadata: { source: 'delivery_event', eventType: mapped, messageId: message.id },
          requestId: options.providerEventId,
        });
      }
    }
    await finishInboundEvent(sql, { id: claim.id, status: 'processed', messageId: message.id, metadata: { eventType: mapped } });
    return { duplicate: false, processed: true, messageId: message.id, eventType: mapped };
  } catch (error) {
    await finishInboundEvent(sql, { id: claim.id, status: 'failed', errorCode: redactSecretText(error?.code || 'DELIVERY_EVENT_FAILED').slice(0, 100) }).catch(() => null);
    throw error;
  }
}

module.exports = {
  RESEND_API_ORIGIN,
  RECEIVED_EMAIL_TIMEOUT_MS,
  MAX_RECEIVED_BODY_CHARS,
  inboundError,
  verifyResendWebhook,
  allowlistedHeaders,
  htmlToPlainText,
  retrieveReceivedEmail,
  eventId,
  replyPipelineStatus,
  claimInboundEvent,
  finishInboundEvent,
  processReceivedReply,
  DELIVERY_EVENT_MAP,
  processDeliveryEvent,
};
