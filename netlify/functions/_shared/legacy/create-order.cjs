'use strict';

// Wrapper around the existing order implementation. Netlify does not expose
// build-only CONTEXT/DEPLOY_PRIME_URL reliably inside Functions at runtime, so
// Deploy Preview test checkout must be detected from the actual request host.
const core = require('./create-order-core.cjs');
const { getSession } = require('../server-auth.cjs');

const DEPLOY_PREVIEW_HOST_RE = /^deploy-preview-\d+--.+\.netlify\.app$/i;

function normalizeHost(value) {
  if (!value) return '';
  const first = String(value).split(',')[0].trim();
  if (!first) return '';

  try {
    if (/^https?:\/\//i.test(first)) {
      return new URL(first).hostname.toLowerCase();
    }
  } catch {
    return '';
  }

  return first.replace(/:\d+$/, '').toLowerCase();
}

function requestHostname(event = {}) {
  const headers = event.headers || {};
  const directHost = normalizeHost(headers.host || headers.Host);
  if (directHost) return directHost;

  const rawUrlHost = normalizeHost(event.rawUrl);
  if (rawUrlHost) return rawUrlHost;

  const forwardedHost = normalizeHost(headers['x-forwarded-host'] || headers['X-Forwarded-Host']);
  if (forwardedHost) return forwardedHost;

  return normalizeHost(process.env.URL || process.env.DEPLOY_PRIME_URL);
}

function isDeployPreviewRequest(event) {
  return DEPLOY_PREVIEW_HOST_RE.test(requestHostname(event));
}

function parseCheckoutMode(event) {
  try {
    const payload = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
    return payload.checkout_mode || null;
  } catch {
    return null;
  }
}

function bindPendingPayPalIdentity(event) {
  if (event?.httpMethod !== 'POST' || typeof event.body !== 'string') return event;
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return event;
  }
  if (String(payload.payment_method || '').toLowerCase() !== 'paypal'
      || payload.payment_status !== 'pending') {
    return event;
  }
  // A browser-provided UUID or an email matching a profile is not proof of
  // account ownership. Exactly as on Stripe, only the signed server session
  // can attach a pending payment order to an account; otherwise it is a guest
  // order under the validated checkout email.
  const sessionUserId = getSession(event)?.sub || null;
  return {
    ...event,
    body: JSON.stringify({ ...payload, user_id: sessionUserId, userId: sessionUserId }),
  };
}

function isAuthorizedPublicOrderCreation(event) {
  if (event?.httpMethod !== 'POST' || typeof event.body !== 'string') return true;
  try {
    const payload = JSON.parse(event.body);
    return payload.checkout_mode === 'admin_deploy_preview_test'
      || (
        String(payload.payment_method || '').toLowerCase() === 'paypal'
        && payload.payment_status === 'pending'
      );
  } catch {
    // Let the core return its existing controlled INVALID_JSON response.
    return true;
  }
}

function normalizeResponse(response) {
  if (!response || typeof response.body !== 'string') return response;

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return response;
  }

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const orderId = payload.orderId || payload.id || payload.order?.id;
    if (orderId && !payload.id) payload.id = orderId;
  } else {
    const details = typeof payload.details === 'string'
      ? payload.details
      : payload.details?.message || (payload.details ? JSON.stringify(payload.details) : '');
    if (details) {
      const base = payload.message || payload.error || 'Test order could not be created';
      payload.message = base.includes(details) ? base : `${base}: ${details}`;
    }
  }

  return { ...response, body: JSON.stringify(payload) };
}

exports.handler = async (event, context) => {
  event = bindPendingPayPalIdentity(event);
  const checkoutMode = parseCheckoutMode(event);
  const isPreviewTest = checkoutMode === 'admin_deploy_preview_test';
  const isPreviewHost = isDeployPreviewRequest(event);

  if (!isAuthorizedPublicOrderCreation(event)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        ok: false,
        error: 'PAYMENT_ORDER_CREATION_NOT_AUTHORIZED',
        message: 'Paid orders must be created by an authoritative payment finalizer.',
      }),
    };
  }

  if (isPreviewTest && !isPreviewHost) {
    return {
      statusCode: 403,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'ADMIN_TEST_ORDER_NOT_AUTHORIZED',
        message: 'Deploy Preview environment is required for test checkout.',
        details: { hostname: requestHostname(event), isDeployPreview: false },
      }),
    };
  }

  const previousContext = process.env.CONTEXT;
  const previousPrimeUrl = process.env.DEPLOY_PRIME_URL;

  if (isPreviewTest && isPreviewHost) {
    process.env.CONTEXT = 'deploy-preview';
    process.env.DEPLOY_PRIME_URL = `https://${requestHostname(event)}`;
  }

  try {
    return normalizeResponse(await core.handler(event, context));
  } finally {
    if (previousContext === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = previousContext;

    if (previousPrimeUrl === undefined) delete process.env.DEPLOY_PRIME_URL;
    else process.env.DEPLOY_PRIME_URL = previousPrimeUrl;
  }
};

exports._test = {
  ...(core._test || {}),
  normalizeHost,
  requestHostname,
  isDeployPreviewRequest,
  bindPendingPayPalIdentity,
  isAuthorizedPublicOrderCreation,
  normalizeResponse,
};
