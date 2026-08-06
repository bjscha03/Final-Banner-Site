'use strict';

const { createSql, getDatabaseUrl } = require('./database.cjs');
const { getRuntimeConfig, effectiveControlState } = require('./config.cjs');
const { loadFoundationSnapshot } = require('./repository.cjs');
const { verifyResendWebhook, eventId, processReceivedReply, processDeliveryEvent, DELIVERY_EVENT_MAP } = require('./inbound-events.cjs');
const { json, safeFailure } = require('./security.cjs');

function createInboundHandler(dependencies = {}) {
  return async function handler(event) {
    if (event.httpMethod !== 'POST') return json(404, { ok: false, error: 'NOT_FOUND', message: 'Not found.' });
    try {
      const runtime = (dependencies.getRuntimeConfig || getRuntimeConfig)();
      if (!runtime.inboundProcessingAvailable || !getDatabaseUrl()) {
        const error = new Error('Inbound processing is disabled.'); error.code = 'INBOUND_CONTEXT_LOCKED'; throw error;
      }
      const rawBody = event.isBase64Encoded
        ? Buffer.from(String(event.body || ''), 'base64').toString('utf8')
        : String(event.body || '');
      if (Buffer.byteLength(rawBody, 'utf8') > 256 * 1024) { const error = new Error('Webhook body is too large.'); error.code = 'REQUEST_TOO_LARGE'; throw error; }
      const verified = (dependencies.verifyResendWebhook || verifyResendWebhook)(rawBody, event, process.env, dependencies.verifierDependencies || {});
      const payload = verified && typeof verified === 'object' ? verified : JSON.parse(rawBody);
      const providerEventId = eventId(event, payload);
      if (!providerEventId) { const error = new Error('Webhook event identifier is missing.'); error.code = 'OUTBOUND_WEBHOOK_INVALID'; throw error; }
      const sql = (dependencies.createSql || createSql)();
      const snapshot = await (dependencies.loadFoundationSnapshot || loadFoundationSnapshot)(sql);
      const controls = effectiveControlState(snapshot.settings, runtime);
      const isReply = payload.type === 'email.received';
      const isDelivery = Object.hasOwn(DELIVERY_EVENT_MAP, payload.type);
      if ((isReply && !controls.replyIngestionEnabled) || (isDelivery && snapshot.settings.deliveryWebhookEnabled !== true)) {
        const error = new Error('Inbound processing is disabled.'); error.code = 'INBOUND_PROCESSING_DISABLED'; throw error;
      }
      if (!isReply && !isDelivery) return json(202, { ok: true, accepted: false, ignored: true });
      const processor = isReply
        ? (dependencies.processReceivedReply || processReceivedReply)
        : (dependencies.processDeliveryEvent || processDeliveryEvent);
      const result = await processor({
        sql, payload, rawBody, providerEventId, env: process.env,
        allowAIFallback: isReply && controls.replyAIFallbackEnabled === true,
        businessTimezone: snapshot.settings.businessTimezone || 'America/New_York',
        dependencies: dependencies.processorDependencies,
      });
      return json(202, { ok: true, accepted: true, duplicate: result.duplicate, processed: result.processed });
    } catch (error) {
      return safeFailure(error);
    }
  };
}

module.exports = { createInboundHandler, handler: createInboundHandler() };
