import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { _test as getOrdersTest } from '../get-orders.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../_shared/paypal-runtime-config.cjs');
const createCore = require('../_shared/legacy/paypal-create-order-forward.cjs');
const captureCore = require('../_shared/legacy/paypal-capture-final.cjs');

const paypalConfigModule = await import('../paypal-config.mjs');
const paypalCreateModule = await import('../paypal-create-order.mjs');
const paypalCaptureModule = await import('../paypal-capture-minimal.mjs');
const paypalStatusModule = await import('../paypal-payment-status.mjs');
const paypalWebhookModule = await import('../paypal-webhook.mjs');

const MANAGED_ENV = [
  'CONTEXT', 'DEPLOY_PRIME_URL', 'DEPLOY_URL', 'URL', 'FEATURE_PAYPAL',
  'PAYPAL_ENV', 'PAYPAL_CLIENT_ID_LIVE', 'PAYPAL_SECRET_LIVE',
  'PAYPAL_CLIENT_ID_SANDBOX', 'PAYPAL_SECRET_SANDBOX',
  'PAYPAL_LIVE_CLIENT_ID', 'PAYPAL_LIVE_SECRET',
  'PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_SECRET',
  'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_CLIENT_SECRET',
  'VITE_PAYPAL_CLIENT_ID', 'DATABASE_URL', 'NETLIFY_DATABASE_URL',
  'AUTH_SESSION_SECRET',
];

async function withEnv(values, callback) {
  const previous = Object.fromEntries(MANAGED_ENV.map((name) => [name, process.env[name]]));
  for (const name of MANAGED_ENV) delete process.env[name];
  Object.assign(process.env, values);
  try {
    return await callback();
  } finally {
    for (const name of MANAGED_ENV) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

const inheritedLivePreview = {
  CONTEXT: 'deploy-preview',
  FEATURE_PAYPAL: '1',
  PAYPAL_ENV: 'live',
  PAYPAL_CLIENT_ID_LIVE: 'live-client-id',
  PAYPAL_SECRET_LIVE: 'live-secret',
  DATABASE_URL: 'postgresql://preview.invalid/database',
  AUTH_SESSION_SECRET: 'preview-auth-secret',
};

test('deploy previews reject inherited live PayPal before every provider-facing path', async () => {
  await withEnv(inheritedLivePreview, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.environment, 'sandbox');
    assert.equal(resolved.configuredEnvironment, 'live');
    assert.ok(resolved.errors.includes('PAYPAL_ENV_CONTEXT_MISMATCH'));
    assert.ok(resolved.errors.includes('PAYPAL_DEPLOY_PREVIEW_DISABLED'));

    // A warm invocation must remain fail-closed; preparing one request cannot
    // rewrite the mismatched environment and enable the next request.
    assert.equal(runtime.preparePayPalRuntime().enabled, false);
    assert.equal(process.env.PAYPAL_ENV, 'live');
    assert.equal(runtime.preparePayPalRuntime().enabled, false);

    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      throw new Error('provider access must not occur in a live-configured preview');
    };

    try {
      const configResponse = await paypalConfigModule.default(new Request(
        'https://deploy-preview-453--bannersonthefly.netlify.app/.netlify/functions/paypal-config',
      ), {});
      assert.equal(configResponse.status, 200);
      assert.deepEqual(await configResponse.json(), {
        enabled: false,
        clientId: null,
        environment: 'sandbox',
        components: 'buttons,card-fields',
      });

      const createResponse = await createCore.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ internalOrderId: 'order-1' }),
      });
      assert.equal(createResponse.statusCode, 503);
      assert.equal(JSON.parse(createResponse.body).error, 'PAYPAL_DISABLED');

      const wrappedCreateResponse = await paypalCreateModule.default(new Request(
        'https://deploy-preview-453--bannersonthefly.netlify.app/.netlify/functions/paypal-create-order',
        { method: 'POST', body: '{}' },
      ), {});
      assert.equal(wrappedCreateResponse.status, 503);
      assert.equal((await wrappedCreateResponse.json()).error, 'PAYPAL_DISABLED');

      const captureResponse = await captureCore.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          internalOrderId: 'order-1',
          orderID: 'PAYPAL-ORDER-1',
          checkoutKey: 'checkout-key',
        }),
      });
      const capturePayload = JSON.parse(captureResponse.body);
      assert.equal(captureResponse.statusCode, 503);
      assert.equal(capturePayload.doNotRetry, true);
      assert.equal(capturePayload.paymentStatusUnknown, true);

      const wrappedCaptureResponse = await paypalCaptureModule.default(new Request(
        'https://deploy-preview-453--bannersonthefly.netlify.app/.netlify/functions/paypal-capture-minimal',
        { method: 'POST', body: '{}' },
      ), {});
      assert.equal(wrappedCaptureResponse.status, 503);
      assert.equal((await wrappedCaptureResponse.json()).doNotRetry, true);

      const statusResponse = await paypalStatusModule._test.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ internalOrderId: 'order-1', checkoutKey: 'checkout-key' }),
      });
      assert.equal(statusResponse.statusCode, 503);
      assert.equal(JSON.parse(statusResponse.body).doNotRetry, true);

      const wrappedStatusResponse = await paypalStatusModule.default(new Request(
        'https://deploy-preview-453--bannersonthefly.netlify.app/.netlify/functions/paypal-payment-status',
        { method: 'POST', body: '{}' },
      ), {});
      assert.equal(wrappedStatusResponse.status, 503);
      assert.equal((await wrappedStatusResponse.json()).doNotRetry, true);

      const webhookResponse = await paypalWebhookModule.default(new Request(
        'https://deploy-preview-453--bannersonthefly.netlify.app/.netlify/functions/paypal-webhook',
        { method: 'POST', body: '{}' },
      ), {});
      assert.equal(webhookResponse.status, 503);
      assert.equal((await webhookResponse.json()).error, 'PAYPAL_DISABLED');

      assert.equal(providerCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('preview request host overrides production-looking runtime variables before provider or database access', async () => {
  await withEnv({
    CONTEXT: 'production',
    URL: 'https://bannersonthefly.com',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID_LIVE: 'inherited-production-client-id',
    PAYPAL_SECRET_LIVE: 'inherited-production-secret',
    DATABASE_URL: 'postgresql://preview.invalid/database',
    AUTH_SESSION_SECRET: 'preview-host-auth-secret',
  }, async () => {
    const previewHost = 'deploy-preview-453--bannersonthefly.netlify.app';
    const event = {
      httpMethod: 'POST',
      headers: { host: previewHost },
      body: '{}',
    };
    const resolved = runtime.resolvePayPalRuntime({ event });
    assert.equal(resolved.context, 'deploy-preview');
    assert.equal(resolved.environment, 'sandbox');
    assert.equal(resolved.enabled, false);
    assert.ok(resolved.errors.includes('PAYPAL_DEPLOY_PREVIEW_DISABLED'));
    assert.ok(resolved.errors.includes('PAYPAL_ENV_CONTEXT_MISMATCH'));

    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      throw new Error('provider access must not occur for a preview request host');
    };
    try {
      const configResponse = await paypalConfigModule.default(new Request(
        `https://${previewHost}/.netlify/functions/paypal-config`,
      ), {});
      assert.equal(configResponse.status, 200);
      assert.deepEqual(await configResponse.json(), {
        enabled: false,
        clientId: null,
        environment: 'sandbox',
        components: 'buttons,card-fields',
      });

      const createResponse = await createCore.handler({
        ...event,
        body: JSON.stringify({ internalOrderId: 'preview-order' }),
      });
      assert.equal(createResponse.statusCode, 503);
      assert.equal(JSON.parse(createResponse.body).error, 'PAYPAL_DISABLED');

      const captureResponse = await captureCore.handler({
        ...event,
        body: JSON.stringify({
          internalOrderId: 'preview-order',
          orderID: 'PREVIEW-PAYPAL-ORDER',
          checkoutKey: 'preview-checkout-key',
        }),
      });
      assert.equal(captureResponse.statusCode, 503);
      assert.equal(JSON.parse(captureResponse.body).doNotRetry, true);

      const statusResponse = await paypalStatusModule._test.handler({
        ...event,
        body: JSON.stringify({ internalOrderId: 'preview-order', checkoutKey: 'preview-checkout-key' }),
      });
      assert.equal(statusResponse.statusCode, 503);
      assert.equal(JSON.parse(statusResponse.body).doNotRetry, true);

      const pendingOrder = { id: 'preview-order', status: 'pending' };
      const enriched = await getOrdersTest.enrichOrderPaymentMetadata(
        async (query) => String(query).includes('FROM orders') ? [{
          id: pendingOrder.id,
          payment_method: 'paypal',
          paypal_order_id: 'PREVIEW-PAYPAL-ORDER',
          paypal_capture_id: null,
          stripe_payment_intent_id: null,
          payment_reconciliation_status: 'required',
        }] : [],
        [pendingOrder],
      );
      assert.equal(enriched[0].status, 'pending');
      assert.equal('reconcilePendingPayPalOrders' in getOrdersTest, false);

      const webhookResponse = await paypalWebhookModule.default(new Request(
        `https://${previewHost}/.netlify/functions/paypal-webhook`,
        { method: 'POST', body: '{}' },
      ), {});
      assert.equal(webhookResponse.status, 503);
      assert.equal((await webhookResponse.json()).error, 'PAYPAL_DISABLED');

      assert.equal(providerCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('an immutable production deploy hostname cannot demote the live PayPal runtime', async () => {
  await withEnv({
    CONTEXT: 'production',
    URL: 'https://bannersonthefly.com',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID_LIVE: 'production-live-client-id',
    PAYPAL_SECRET_LIVE: 'production-live-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime({
      event: {
        rawUrl: 'https://6a779c518d3ca80008ce39e5--bannersonthefly.netlify.app/.netlify/functions/paypal-config',
        headers: {},
      },
    });

    assert.equal(resolved.context, 'production');
    assert.equal(resolved.environment, 'live');
    assert.equal(resolved.enabled, true);
  });
});

test('deploy previews deny PayPal even with sandbox keys while branch deploys require scoped sandbox keys', async () => {
  await withEnv({
    CONTEXT: 'deploy-preview',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'sandbox',
    PAYPAL_CLIENT_ID_SANDBOX: 'sandbox-client-id',
    PAYPAL_SECRET_SANDBOX: 'sandbox-secret',
    PAYPAL_CLIENT_ID_LIVE: 'inherited-live-client-id',
    PAYPAL_SECRET_LIVE: 'inherited-live-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.environment, 'sandbox');
    assert.equal(resolved.clientId, 'sandbox-client-id');
    assert.equal(resolved.clientSecret, 'sandbox-secret');
    assert.equal(resolved.baseUrl, 'https://api-m.sandbox.paypal.com');
    assert.ok(resolved.errors.includes('PAYPAL_DEPLOY_PREVIEW_DISABLED'));
  });

  await withEnv({
    CONTEXT: 'branch-deploy',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'sandbox',
    PAYPAL_CLIENT_ID_SANDBOX: 'sandbox-client-id',
    PAYPAL_SECRET_SANDBOX: 'sandbox-secret',
    PAYPAL_CLIENT_ID_LIVE: 'inherited-live-client-id',
    PAYPAL_SECRET_LIVE: 'inherited-live-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.environment, 'sandbox');
    assert.equal(resolved.clientId, 'sandbox-client-id');
    assert.equal(resolved.clientSecret, 'sandbox-secret');
  });

  await withEnv({
    CONTEXT: 'branch-deploy',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'sandbox',
    PAYPAL_CLIENT_ID: 'generic-client-id',
    PAYPAL_SECRET: 'generic-secret',
    VITE_PAYPAL_CLIENT_ID: 'build-time-client-id',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, false);
    assert.ok(resolved.errors.includes('PAYPAL_CLIENT_ID_NOT_CONFIGURED'));
    assert.ok(resolved.errors.includes('PAYPAL_SECRET_NOT_CONFIGURED'));
  });
});

test('production PayPal remains live with explicitly scoped live credentials', async () => {
  await withEnv({
    CONTEXT: 'production',
    DEPLOY_URL: 'https://abc123--bannersonthefly.netlify.app',
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID_LIVE: 'production-live-client-id',
    PAYPAL_SECRET_LIVE: 'production-live-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.context, 'production');
    assert.equal(resolved.environment, 'live');
    assert.equal(resolved.clientId, 'production-live-client-id');
    assert.equal(resolved.clientSecret, 'production-live-secret');
    assert.equal(resolved.baseUrl, 'https://api-m.paypal.com');
  });

});

test('production kill switch blocks new PayPal orders but preserves capture and reconciliation runtime', async () => {
  await withEnv({
    CONTEXT: 'production',
    FEATURE_PAYPAL: '0',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID_LIVE: 'production-live-client-id',
    PAYPAL_SECRET_LIVE: 'production-live-secret',
    DATABASE_URL: 'postgresql://production.invalid/database',
  }, async () => {
    assert.equal(runtime.resolvePayPalRuntime().enabled, false);
    assert.ok(runtime.resolvePayPalRuntime().errors.includes('PAYPAL_DISABLED'));
    assert.equal(runtime.resolvePayPalRuntime({ requireFeature: false }).enabled, true);

    const createResponse = await createCore.handler({
      httpMethod: 'POST',
      headers: {},
      body: '{}',
    });
    assert.equal(createResponse.statusCode, 503);
    assert.equal(JSON.parse(createResponse.body).error, 'PAYPAL_DISABLED');

    const captureResponse = await captureCore.handler({
      httpMethod: 'POST',
      headers: {},
      body: '{}',
    });
    assert.equal(captureResponse.statusCode, 400);
    assert.equal(JSON.parse(captureResponse.body).error, 'ORDER_IDENTIFIERS_REQUIRED');

    const statusResponse = await paypalStatusModule._test.handler({
      httpMethod: 'POST',
      headers: {},
      body: '{}',
    });
    assert.equal(statusResponse.statusCode, 400);
    assert.equal(JSON.parse(statusResponse.body).error, 'INTERNAL_ORDER_REQUIRED');

  });
});
