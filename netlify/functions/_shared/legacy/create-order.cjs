'use strict';

// Wrapper around the existing order implementation. Netlify does not expose
// build-only CONTEXT/DEPLOY_PRIME_URL reliably inside Functions at runtime, so
// Deploy Preview test checkout must be detected from the actual request host.
const core = require('./create-order-core.cjs');

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
  const checkoutMode = parseCheckoutMode(event);
  const isPreviewTest = checkoutMode === 'admin_deploy_preview_test';
  const isPreviewHost = isDeployPreviewRequest(event);

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
  normalizeResponse,
};

