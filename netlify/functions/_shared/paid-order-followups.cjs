'use strict';

const { siteUrlForEvent } = require('./stripe-runtime-config.cjs');

function internalRequestConfig(event, orderId) {
  const siteUrl = siteUrlForEvent(event);
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
  try {
    const response = await fetch(`${config.siteUrl}/.netlify/functions/${functionName}`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(body),
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
  }
}

async function deliverPaidOrderNotifications(event, orderId) {
  const config = internalRequestConfig(event, orderId);
  if (!config) return false;

  const initial = await postInternal(config, 'notify-order', { orderId });
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
    const adminRecovery = await postInternal(config, 'notify-order', {
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

async function queuePaidOrderFollowups(event, orderId) {
  const config = internalRequestConfig(event, orderId);
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

module.exports = {
  deliverPaidOrderNotifications,
  internalRequestConfig,
  postInternal,
  queuePaidOrderFollowups,
};
