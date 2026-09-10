'use strict';

const { siteUrlForEvent } = require('./stripe-runtime-config.cjs');
const notifyOrderModule = require('./legacy/notify-order.cjs');

let notifyOrderHandler = notifyOrderModule.handler;
const INTERNAL_POST_TIMEOUT_MS = 8000;

function immutableNetlifyOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:') return null;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?--[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.netlify\.app$/i.test(parsed.hostname)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function internalRequestConfig(event, orderId, options = {}) {
  const siteUrl = immutableNetlifyOrigin(options.immutableOrigin) || siteUrlForEvent(event);
  const secret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  if (!siteUrl || !secret || !orderId) return null;
  return {
    siteUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Job-Secret': secret,
    },
  };
}

async function postInternal(config, functionName, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_POST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.siteUrl}/.netlify/functions/${functionName}`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* An empty background 202 is expected. */ }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: {},
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeNotifyOrder(config, body) {
  try {
    const response = await notifyOrderHandler({
      httpMethod: 'POST',
      headers: config.headers,
      body: JSON.stringify(body),
    });
    let payload = {};
    try { payload = JSON.parse(response?.body || '{}'); } catch { /* malformed payload fails below */ }
    const status = Number(response?.statusCode || 500);
    return { ok: status >= 200 && status < 300, status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: {},
      error: error?.message || String(error),
    };
  }
}

async function deliverPaidOrderNotifications(event, orderId) {
  const config = internalRequestConfig(event, orderId);
  if (!config) return false;

  // Invoke the existing idempotent notification handler in-process. This
  // avoids a deploy-host routing mismatch between independently cached
  // Netlify function artifacts while preserving the exact established email
  // templates, database writes, and Resend idempotency keys.
  const initial = await invokeNotifyOrder(config, { orderId });
  if (!initial.ok || initial.payload?.ok === false) {
    console.error('[paid-order-followups] customer notification failed', {
      orderId,
      status: initial.status,
      error: initial.payload?.error || initial.error || null,
    });
    return false;
  }

  const customerSent = initial.payload?.customerEmailSent === true
    || initial.payload?.idempotent === true;
  let adminSent = initial.payload?.adminEmailSent === true;

  if (customerSent && !adminSent) {
    const adminRecovery = await invokeNotifyOrder(config, {
      orderId,
      forceResendAdmin: true,
    });
    adminSent = adminRecovery.ok
      && adminRecovery.payload?.ok !== false
      && adminRecovery.payload?.adminEmailSent === true;
    if (!adminSent) {
      console.error('[paid-order-followups] admin notification failed', {
        orderId,
        status: adminRecovery.status,
        error: adminRecovery.payload?.error || adminRecovery.error || null,
      });
    }
  }

  return customerSent && adminSent;
}

async function queuePaidOrderFollowups(event, orderId, options = {}) {
  const config = internalRequestConfig(event, orderId, options);
  if (!config) return false;

  // A Netlify background invocation returns 202 before its handler runs. Send
  // and verify both lightweight Resend notifications synchronously first so a
  // queue acknowledgement can never be mistaken for delivered order email.
  const notificationsSent = await deliverPaidOrderNotifications(event, orderId);
  if (!notificationsSent) return false;

  const background = await postInternal(
    config,
    'process-paid-order-followups-background',
    { orderId },
  );
  if (!background.ok) {
    console.error('[paid-order-followups] PDF/background queue failed', {
      orderId,
      status: background.status,
      error: background.payload?.error || background.error || null,
    });
  }
  return background.ok;
}

// Browser payment completion must never wait on an email provider or PDF
// renderer after Stripe and the canonical order are already settled. The
// background handler performs the same idempotent customer/admin notification
// checks before PDF work, while the signed Stripe webhook remains the durable
// retry authority if that job later fails.
async function queuePaidOrderFollowupsInBackground(event, orderId, options = {}) {
  const config = internalRequestConfig(event, orderId, options);
  if (!config) return false;
  const background = await postInternal(
    config,
    'process-paid-order-followups-background',
    { orderId },
  );
  if (!background.ok) {
    console.error('[paid-order-followups] background queue failed', {
      orderId,
      status: background.status,
      error: background.payload?.error || background.error || null,
    });
  }
  return background.ok;
}

module.exports = {
  deliverPaidOrderNotifications,
  immutableNetlifyOrigin,
  internalRequestConfig,
  invokeNotifyOrder,
  postInternal,
  queuePaidOrderFollowups,
  queuePaidOrderFollowupsInBackground,
  resetNotifyOrderHandler() { notifyOrderHandler = notifyOrderModule.handler; },
  setNotifyOrderHandler(handler) { notifyOrderHandler = handler; },
};
