import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtime = require('../_shared/paypal-runtime-config.cjs');
const createCore = require('../_shared/legacy/paypal-create-order-forward.cjs');
const captureCore = require('../_shared/legacy/paypal-capture-final.cjs');
const creditPayments = require('../_shared/credit-paypal-service.cjs');
const creditCreate = require('../_shared/legacy/paypal-create-credits-order.cjs');
const creditCapture = require('../_shared/legacy/paypal-capture-credits-order.cjs');
const serverAuth = require('../_shared/server-auth.cjs');

const paypalConfigModule = await import('../paypal-config.mjs');
const paypalCreateModule = await import('../paypal-create-order.mjs');
const paypalCaptureModule = await import('../paypal-capture-minimal.mjs');
const paypalStatusModule = await import('../paypal-payment-status.mjs');
const paypalWebhookModule = await import('../paypal-webhook.mjs');

const MANAGED_ENV = [
  'CONTEXT', 'DEPLOY_PRIME_URL', 'URL', 'FEATURE_PAYPAL', 'FEATURE_PAYPAL_CREDITS',
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
  FEATURE_PAYPAL_CREDITS: '1',
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

      assert.throws(
        () => creditPayments.getCreditPayPalConfig({ requireFeature: true }),
        (error) => error?.code === 'PAYPAL_CREDITS_PREVIEW_DISABLED' && error?.statusCode === 503,
      );

      const sessionToken = serverAuth.createSessionToken({
        id: 'preview-user',
        email: 'preview-user@example.com',
        is_admin: false,
      });
      const creditConfigResponse = await creditCreate.handler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(creditConfigResponse.statusCode, 503);
      assert.equal(JSON.parse(creditConfigResponse.body).error, 'PAYPAL_CREDITS_PREVIEW_DISABLED');

      let creditDatabaseCalls = 0;
      creditCapture._test.setNeonFactory(() => async () => {
        creditDatabaseCalls += 1;
        throw new Error('preview credit capture must stop before database access');
      });
      const creditCaptureResponse = await creditCapture.handler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          purchaseId: 'credit-purchase-1',
          orderID: 'PAYPAL-CREDIT-1',
          checkoutKey: '12345678901234567890123456789012',
        }),
      });
      assert.equal(creditCaptureResponse.statusCode, 503);
      assert.equal(JSON.parse(creditCaptureResponse.body).error, 'PAYPAL_CREDITS_PREVIEW_DISABLED');
      assert.equal(creditDatabaseCalls, 0);
      assert.equal(providerCalls, 0);
    } finally {
      creditCapture._test.resetNeonFactory();
      global.fetch = originalFetch;
    }
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
    FEATURE_PAYPAL: '1',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID_LIVE: 'production-live-client-id',
    PAYPAL_SECRET_LIVE: 'production-live-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.environment, 'live');
    assert.equal(resolved.clientId, 'production-live-client-id');
    assert.equal(resolved.clientSecret, 'production-live-secret');
    assert.equal(resolved.baseUrl, 'https://api-m.paypal.com');
  });

  await withEnv({
    CONTEXT: 'production',
    FEATURE_PAYPAL: '1',
    FEATURE_PAYPAL_CREDITS: '1',
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID: 'legacy-production-client-id',
    PAYPAL_SECRET: 'legacy-production-secret',
  }, async () => {
    const resolved = runtime.resolvePayPalRuntime();
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.clientId, 'legacy-production-client-id');
    assert.equal(resolved.clientSecret, 'legacy-production-secret');
    const creditConfig = creditPayments.getCreditPayPalConfig({ requireFeature: true });
    assert.equal(creditConfig.environment, 'live');
    assert.equal(creditConfig.clientId, 'legacy-production-client-id');
    assert.equal(creditConfig.secret, 'legacy-production-secret');
  });
});

test('production kill switch blocks new PayPal orders but preserves capture and reconciliation runtime', async () => {
  await withEnv({
    CONTEXT: 'production',
    FEATURE_PAYPAL: '0',
    FEATURE_PAYPAL_CREDITS: '0',
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

    assert.throws(
      () => creditPayments.getCreditPayPalConfig({ requireFeature: true }),
      (error) => error?.code === 'PAYPAL_CREDITS_DISABLED',
    );
    assert.equal(
      creditPayments.getCreditPayPalConfig({ requireFeature: false }).environment,
      'live',
    );
  });
});
