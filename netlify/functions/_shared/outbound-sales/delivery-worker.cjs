'use strict';

const crypto = require('node:crypto');
const { assertLiveDeliveryRuntime, assertLiveSendAllowed, evaluateCircuitBreaker, nextDeliveryRetry } = require('./delivery-safety.cjs');
const { createUnsubscribeToken, sendOutboundMessage } = require('./outbound-delivery.cjs');
const repository = require('./delivery-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { redactSecretText } = require('./security.cjs');
const { renderOutboundDeliveryContent } = require('./personalization-template.cjs');
const { routedReplyToAddress } = require('./reply-routing.cjs');

function businessDate(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function stableSendKey(messageId) {
  return `outbound-send:${crypto.createHash('sha256').update(String(messageId)).digest('hex')}`;
}

function publicOrigin(env = process.env) {
  const origin = new URL(String(env.URL || ''));
  if (origin.protocol !== 'https:' || origin.username || origin.password || !origin.hostname) {
    const error = new Error('The public site origin is not configured for outbound delivery.');
    error.code = 'OUTBOUND_SEND_BLOCKED';
    throw error;
  }
  return origin.origin;
}

function validateDeliveryConfiguration(env = process.env) {
  const origin = publicOrigin(env);
  const from = String(env.OUTBOUND_FROM_EMAIL || '').trim();
  const replyTo = String(env.OUTBOUND_REPLY_TO_EMAIL || '').trim();
  const apiKey = String(env.OUTBOUND_RESEND_API_KEY || '');
  const signingSecret = String(env.OUTBOUND_UNSUBSCRIBE_SIGNING_SECRET || '');
  const physicalAddress = String(env.OUTBOUND_PHYSICAL_ADDRESS || '').replace(/\s+/g, ' ').trim();
  const mailboxPattern = /^(?:[^<>\r\n]{1,100}\s+<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/;
  if (!mailboxPattern.test(from) || !mailboxPattern.test(replyTo)
      || apiKey.length < 16 || signingSecret.length < 32
      || physicalAddress.length < 10 || physicalAddress.length > 300) {
    const error = new Error('Dedicated outbound delivery configuration is incomplete.');
    error.code = 'OUTBOUND_SEND_BLOCKED';
    throw error;
  }
  return { origin, from, replyTo, physicalAddress };
}

async function executeLiveDelivery(options) {
  // This code-level assertion is intentionally the first operation. While the
  // checked-in lock is false, no database, secret, SDK, or network is touched.
  assertLiveDeliveryRuntime({ runtime: options.runtime, controls: options.controls, circuitBreaker: options.circuitBreaker });
  const env = options.env || process.env;
  const deliveryConfig = validateDeliveryConfiguration(env);
  const dependencies = { ...repository, appendAudit, sendOutboundMessage, ...options.dependencies };
  const now = options.now || new Date();
  const timeZone = options.settings?.businessTimezone || 'America/New_York';
  const deliveryDate = businessDate(now, timeZone);
  const counters = await dependencies.loadDailyCounters(options.sql, deliveryDate);
  const breaker = evaluateCircuitBreaker(counters, options.settings || {});
  if (breaker.state === 'open') {
    const paused = await dependencies.pauseForCircuitBreaker(options.sql, {
      reasonCode: breaker.reasons[0], observedMetrics: breaker.metrics,
      openedUntil: new Date(now.getTime() + 3600000).toISOString(),
    });
    if (paused) await dependencies.appendAudit(options.sql, {
      action: 'delivery.automatic_pause_activated', entityType: 'settings', entityId: '1',
      newValues: { emergencyPaused: true }, metadata: { reasonCode: breaker.reasons[0], metrics: breaker.metrics },
      requestId: options.requestId || null,
    });
  }
  assertLiveDeliveryRuntime({ runtime: options.runtime, controls: options.controls, circuitBreaker: breaker });
  const sendKey = stableSendKey(options.messageId);
  const message = await dependencies.claimLiveDelivery(options.sql, {
    messageId: options.messageId,
    businessDate: deliveryDate,
    dailyLimit: Math.min(30, Number(options.controls.dailySendLimit) || 0),
    sendKey,
  });
  if (!message) return { skipped: true, reason: 'DELIVERY_NOT_ELIGIBLE' };
  const started = Date.now();
  try {
    const contact = { email: message.email, sendEligible: message.send_eligible === true };
    assertLiveSendAllowed({
      runtime: options.runtime, controls: options.controls,
      message: {
        generationStatus: message.generation_status,
        evidenceValidationStatus: message.evidence_validation_status,
        deliveryState: 'ready',
      },
      contact, suppressions: [], circuitBreaker: breaker,
    });
    const token = createUnsubscribeToken({ messageId: message.id, contactId: message.contact_id }, env);
    await dependencies.saveUnsubscribeToken(options.sql, {
      tokenHash: token.hash, prospectId: message.prospect_id, contactId: message.contact_id,
      messageId: message.id, expiresAt: new Date(now.getTime() + (180 * 86400000)).toISOString(),
    });
    const origin = deliveryConfig.origin;
    const unsubscribeUrl = `${origin}/.netlify/functions/outbound-sales-unsubscribe?token=${encodeURIComponent(token.token)}`;
    const content = renderOutboundDeliveryContent({
      subject: message.subject, bodyText: message.body_text,
      physicalAddress: deliveryConfig.physicalAddress, unsubscribeUrl,
    });
    const routedReplyTo = routedReplyToAddress(deliveryConfig.replyTo, message.id);
    const result = await dependencies.sendOutboundMessage({
      runtime: options.runtime, controls: options.controls,
      message: {
        id: message.id, campaignId: message.campaign_id,
        generationStatus: message.generation_status,
        evidenceValidationStatus: message.evidence_validation_status,
        deliveryState: 'ready', sendKey: message.send_key,
        subject: message.subject, bodyText: content.text, bodyHtml: content.html,
      },
      contact, suppressions: [], circuitBreaker: breaker,
      from: deliveryConfig.from, replyTo: routedReplyTo,
      unsubscribeUrl, publicOrigin: origin, env,
    });
    const marked = await dependencies.markDeliverySent(options.sql, {
      messageId: message.id, providerMessageId: result.providerMessageId,
      latencyMs: result.latencyMs, businessDate: deliveryDate,
    });
    if (!marked) {
      const error = new Error('The sent message could not be committed atomically.');
      error.code = 'OUTBOUND_SEND_FAILED';
      throw error;
    }
    await dependencies.appendAudit(options.sql, {
      action: 'message.sent', entityType: 'message', entityId: message.id,
      newValues: { status: 'sent', providerMessageId: result.providerMessageId },
      metadata: { provider: 'resend', latencyMs: result.latencyMs, dailyLimit: options.controls.dailySendLimit },
      requestId: options.requestId || null,
    });
    await dependencies.appendAudit(options.sql, {
      action: 'prospect.pipeline_status_changed', entityType: 'prospect', entityId: message.prospect_id,
      previousValues: { status: message.prospect_status }, newValues: { status: 'contacted' },
      metadata: { source: 'outbound_message_sent', messageId: message.id },
      requestId: options.requestId || null,
    });
    return { skipped: false, messageId: message.id, providerMessageId: result.providerMessageId };
  } catch (error) {
    const errorCode = redactSecretText(error?.code || 'OUTBOUND_SEND_FAILED').slice(0, 100);
    const nextAttemptAt = nextDeliveryRetry(Number(message.send_attempt_count) || 1, now);
    await dependencies.markDeliveryFailed(options.sql, {
      messageId: message.id, errorCode, nextAttemptAt,
      latencyMs: Math.max(0, Date.now() - started), businessDate: deliveryDate,
    }).catch(() => null);
    await dependencies.appendAudit(options.sql, {
      action: 'message.delivery_failed', entityType: 'message', entityId: message.id,
      newValues: { deliveryState: 'failed', errorCode },
      metadata: { retryPlanned: true, nextAttemptAt }, requestId: options.requestId || null,
    }).catch(() => null);
    throw error;
  }
}

module.exports = { businessDate, stableSendKey, publicOrigin, validateDeliveryConfiguration, executeLiveDelivery };
