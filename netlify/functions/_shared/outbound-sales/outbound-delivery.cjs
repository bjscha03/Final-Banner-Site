'use strict';

const crypto = require('node:crypto');
const { assertLiveSendAllowed } = require('./delivery-safety.cjs');

const SEND_TIMEOUT_MS = 15000;
const MAX_SEND_ATTEMPTS = 3;
// Resend's current Acceptable Use Policy prohibits unsolicited cold outreach.
// This independent code lock must remain false unless a reviewed activation
// change includes written provider authorization for this exact use case.
const RESEND_COLD_OUTREACH_ALLOWED = false;

function tokenHash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

function resolveUnsubscribeSigningSecret(env = process.env) {
  const dedicatedSecret = String(env.OUTBOUND_UNSUBSCRIBE_SIGNING_SECRET || '').trim();
  if (dedicatedSecret.length >= 32) return dedicatedSecret;

  // Existing deployments already have a stable, high-entropy admin session
  // secret. Domain-separate it so unsubscribe tokens do not reuse that value
  // directly or expose it to the delivery code.
  const sessionSecret = String(env.AUTH_SESSION_SECRET || '').trim();
  if (sessionSecret.length >= 32) {
    return crypto.createHmac('sha256', sessionSecret)
      .update('banners-on-the-fly:outbound-unsubscribe:v1')
      .digest('hex');
  }

  const error = new Error('Unsubscribe signing is not configured.');
  error.code = 'OUTBOUND_SEND_BLOCKED';
  throw error;
}

function validatedUnsubscribeUrl(value, publicOrigin) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname
      || !url.pathname.endsWith('/.netlify/functions/outbound-sales-unsubscribe')) {
    const error = new Error('The unsubscribe URL is invalid.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  if (publicOrigin) {
    const origin = new URL(String(publicOrigin));
    if (origin.protocol !== 'https:' || url.origin !== origin.origin) {
      const error = new Error('The unsubscribe URL origin is invalid.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
    }
  }
  return url.toString();
}

function createUnsubscribeToken({ messageId, contactId }, env = process.env) {
  const secret = resolveUnsubscribeSigningSecret(env);
  const token = crypto.createHmac('sha256', secret).update(`${messageId}|${contactId}`).digest('base64url');
  return { token, hash: tokenHash(token) };
}

function assertOutboundDeliveryProviderApproved(provider = 'resend') {
  if (provider !== 'resend') {
    const error = new Error('The outbound delivery provider is not installed.');
    error.code = 'OUTBOUND_DELIVERY_PROVIDER_UNSUPPORTED';
    throw error;
  }
  if (!RESEND_COLD_OUTREACH_ALLOWED) {
    const error = new Error('The configured provider is not approved for cold outreach.');
    error.code = 'OUTBOUND_DELIVERY_PROVIDER_POLICY_BLOCKED';
    throw error;
  }
}

async function sendOutboundMessage(options) {
  // This assertion is intentionally first. With the checked-in phase lock set
  // to false, neither the Resend SDK nor any outbound credential is touched.
  assertLiveSendAllowed(options);
  // This is intentionally separate from Shadow Mode/live activation so a
  // future activation cannot bypass the provider-policy review.
  assertOutboundDeliveryProviderApproved('resend');
  const apiKey = String(options.env?.OUTBOUND_RESEND_API_KEY || process.env.OUTBOUND_RESEND_API_KEY || '').trim();
  if (!apiKey) { const error = new Error('Dedicated outbound Resend is not configured.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error; }
  const transport = options.transport || (() => {
    const { Resend } = require('resend');
    return new Resend(apiKey);
  })();
  const started = Date.now();
  const unsubscribeUrl = validatedUnsubscribeUrl(options.unsubscribeUrl, options.publicOrigin || options.env?.URL || process.env.URL);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Outbound delivery timed out.'); error.code = 'OUTBOUND_SEND_TIMEOUT'; reject(error);
    }, Math.max(1000, Math.min(30000, Number(options.timeoutMs) || SEND_TIMEOUT_MS)));
    if (typeof timer.unref === 'function') timer.unref();
  });
  let result;
  try {
    const request = Promise.resolve(transport.emails.send({
      from: options.from,
      to: options.contact.email,
      replyTo: options.replyTo,
      subject: options.message.subject,
      text: options.message.bodyText,
      html: options.message.bodyHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'subsystem', value: 'outbound_sales' },
        { name: 'message_id', value: options.message.id },
        { name: 'campaign_id', value: options.message.campaignId || 'none' },
      ],
    }, { idempotencyKey: options.message.sendKey }));
    result = await Promise.race([request, timeout]);
  }
  finally { clearTimeout(timer); }
  if (result?.error || !result?.data?.id) { const error = new Error('Outbound delivery provider rejected the request.'); error.code = 'OUTBOUND_SEND_FAILED'; throw error; }
  return { providerMessageId: result.data.id, latencyMs: Math.max(0, Date.now() - started) };
}

function assertPermissionedMarketingAllowed(options = {}) {
  const explicitlyPermissioned = options.permissionStatus === 'explicit_opt_in' && options.permissionAttested === true;
  const adminAuthorized = options.permissionStatus === 'admin_authorized' && options.adminAuthorized === true;
  if (!explicitlyPermissioned && !adminAuthorized) {
    const error = new Error('An authenticated administrator must authorize this marketing email.');
    error.code = 'PERMISSIONED_MARKETING_REQUIRED';
    throw error;
  }
}

function safeInlineAttachments(value) {
  if (!Array.isArray(value) || !value.length) return [];
  if (value.length > 2) {
    const error = new Error('Too many inline marketing images.');
    error.code = 'MANUAL_MARKETING_SEND_FAILED';
    throw error;
  }
  return value.map((attachment) => {
    const content = String(attachment?.content || '').replace(/\s+/g, '');
    const filename = String(attachment?.filename || '').trim();
    const contentId = String(attachment?.contentId || '').trim();
    const contentType = String(attachment?.contentType || '').trim().toLowerCase();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)
        || content.length > 8 * 1024 * 1024
        || !/^[a-z0-9][a-z0-9._-]{0,99}\.jpe?g$/i.test(filename)
        || !/^[a-z0-9][a-z0-9._-]{0,126}$/i.test(contentId)
        || contentType !== 'image/jpeg') {
      const error = new Error('Inline marketing image is invalid.');
      error.code = 'MANUAL_MARKETING_SEND_FAILED';
      throw error;
    }
    return { content, filename, contentId, contentType };
  });
}

async function sendPermissionedMarketingMessage(options) {
  // This is deliberately separate from sendOutboundMessage. The automated
  // cold-outreach path remains provider-policy locked; this one-at-a-time path
  // is available only when a named administrator directly clicks Send.
  assertPermissionedMarketingAllowed(options);
  const apiKey = String(
    options.env?.OUTBOUND_PERMISSIONED_RESEND_API_KEY
      || options.env?.RESEND_API_KEY
      || process.env.OUTBOUND_PERMISSIONED_RESEND_API_KEY
      || '',
  ).trim();
  if (!apiKey) {
    const error = new Error('Resend is not configured for permissioned marketing.');
    error.code = 'MANUAL_MARKETING_NOT_CONFIGURED';
    throw error;
  }
  const unsubscribeUrl = validatedUnsubscribeUrl(
    options.unsubscribeUrl,
    options.publicOrigin || options.env?.PUBLIC_SITE_URL || options.env?.URL || process.env.PUBLIC_SITE_URL || process.env.URL,
  );
  const transport = options.transport || (() => {
    const { Resend } = require('resend');
    return new Resend(apiKey);
  })();
  const started = Date.now();
  const attachments = safeInlineAttachments(options.attachments);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Permissioned marketing delivery timed out.');
      error.code = 'MANUAL_MARKETING_SEND_FAILED';
      reject(error);
    }, Math.max(1000, Math.min(30000, Number(options.timeoutMs) || SEND_TIMEOUT_MS)));
    if (typeof timer.unref === 'function') timer.unref();
  });
  let result;
  try {
    const request = Promise.resolve(transport.emails.send({
      from: options.from,
      to: options.contact.email,
      replyTo: options.replyTo,
      subject: options.message.subject,
      text: options.message.bodyText,
      html: options.message.bodyHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'subsystem', value: 'manual_lead_review' },
        { name: 'message_id', value: options.message.id },
        { name: 'authorization', value: options.permissionStatus },
      ],
      ...(attachments.length ? { attachments } : {}),
    }, { idempotencyKey: options.message.sendKey }));
    result = await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
  if (result?.error || !result?.data?.id) {
    const error = new Error('Resend rejected the permissioned marketing email.');
    error.code = 'MANUAL_MARKETING_SEND_FAILED';
    throw error;
  }
  return { providerMessageId: result.data.id, latencyMs: Math.max(0, Date.now() - started) };
}

module.exports = {
  SEND_TIMEOUT_MS,
  MAX_SEND_ATTEMPTS,
  RESEND_COLD_OUTREACH_ALLOWED,
  tokenHash,
  resolveUnsubscribeSigningSecret,
  validatedUnsubscribeUrl,
  createUnsubscribeToken,
  assertOutboundDeliveryProviderApproved,
  assertPermissionedMarketingAllowed,
  safeInlineAttachments,
  sendOutboundMessage,
  sendPermissionedMarketingMessage,
};
