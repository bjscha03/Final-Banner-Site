'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runtime = require('../_shared/stripe-runtime-config.cjs');

const MANAGED = [
  'CONTEXT', 'NODE_ENV', 'NETLIFY_DEV', 'STRIPE_CHECKOUT_ENABLED', 'STRIPE_MODE',
  'STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'NETLIFY_DATABASE_URL', 'DATABASE_URL', 'ORDER_CONFIRMATION_TOKEN_SECRET',
  'AUTH_SESSION_SECRET', 'INTERNAL_JOB_SECRET', 'DEPLOY_PRIME_URL', 'DEPLOY_URL', 'URL', 'PUBLIC_SITE_URL',
];

function withEnv(values, fn) {
  const previous = Object.fromEntries(MANAGED.map((key) => [key, process.env[key]]));
  for (const key of MANAGED) delete process.env[key];
  Object.assign(process.env, values);
  try { return fn(); } finally {
    for (const key of MANAGED) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const complete = {
  STRIPE_CHECKOUT_ENABLED: 'true',
  STRIPE_MODE: 'test',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  DATABASE_URL: 'postgresql://example.invalid/db',
  ORDER_CONFIRMATION_TOKEN_SECRET: 'confirmation-secret',
  INTERNAL_JOB_SECRET: 'job-secret',
};

test('preview configuration accepts only complete test-mode credentials', () => withEnv({
  CONTEXT: 'deploy-preview',
  ...complete,
}, () => {
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true });
  assert.equal(config.enabled, true);
  assert.equal(config.mode, 'test');
  assert.deepEqual(runtime.publicStripeConfig(), {
    enabled: true,
    publishableKey: 'pk_test_example',
    environment: 'test',
  });
}));

test('preview fails closed when live keys cross into nonproduction', () => withEnv({
  CONTEXT: 'deploy-preview',
  ...complete,
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true });
  assert.equal(config.enabled, false);
  assert.ok(config.errors.includes('STRIPE_MODE_CONTEXT_MISMATCH'));
  assert.ok(config.errors.includes('STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH'));
  assert.ok(config.errors.includes('STRIPE_SECRET_KEY_MODE_MISMATCH'));
}));

test('production fails closed when test credentials are configured', () => withEnv({
  CONTEXT: 'production',
  ...complete,
}, () => {
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true });
  assert.equal(config.enabled, false);
  assert.equal(config.mode, 'live');
}));

test('production canonical URL selects live mode when runtime CONTEXT is unavailable', () => withEnv({
  ...complete,
  URL: 'https://bannersonthefly.com',
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  const event = {
    rawUrl: 'https://bannersonthefly.com/.netlify/functions/stripe-config',
    headers: { host: 'bannersonthefly.com' },
  };
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true, event });
  assert.equal(config.enabled, true);
  assert.equal(config.context, 'production');
  assert.equal(config.mode, 'live');
  assert.deepEqual(runtime.publicStripeConfig(event), {
    enabled: true,
    publishableKey: 'pk_live_example',
    environment: 'live',
  });
}));

test('default Netlify production hostname selects live mode with production URL metadata', () => withEnv({
  ...complete,
  URL: 'https://bannersonthefly.netlify.app',
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  const event = {
    rawUrl: 'https://bannersonthefly.netlify.app/.netlify/functions/stripe-config',
    headers: { host: 'bannersonthefly.netlify.app' },
  };
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true, event });
  assert.equal(config.enabled, true);
  assert.equal(config.context, 'production');
  assert.equal(config.mode, 'live');
}));

test('preview request host cannot inherit production mode when CONTEXT is missing or misleading', () => withEnv({
  ...complete,
  CONTEXT: 'production',
  URL: 'https://bannersonthefly.com',
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  const event = {
    rawUrl: 'https://deploy-preview-454--bannersonthefly.netlify.app/.netlify/functions/stripe-config',
    headers: { host: 'deploy-preview-454--bannersonthefly.netlify.app' },
  };
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true, event });
  assert.equal(config.enabled, false);
  assert.equal(config.context, 'deploy-preview');
  assert.equal(config.mode, 'test');
  assert.ok(config.errors.includes('STRIPE_MODE_CONTEXT_MISMATCH'));
  assert.ok(config.errors.includes('STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH'));
  assert.ok(config.errors.includes('STRIPE_SECRET_KEY_MODE_MISMATCH'));
}));

test('branch request host cannot inherit live production configuration', () => withEnv({
  ...complete,
  URL: 'https://bannersonthefly.com',
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  const event = {
    rawUrl: 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app/.netlify/functions/stripe-config',
    headers: { host: 'agent-payment-sandbox-e2e--bannersonthefly.netlify.app' },
  };
  const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true, event });
  assert.equal(config.enabled, false);
  assert.equal(config.context, 'branch-deploy');
  assert.equal(config.mode, 'test');
  assert.equal(config.publishableKey, 'pk_live_example');
  assert.equal(runtime.publicStripeConfig(event).publishableKey, null);
}));

test('unknown or ambiguous request hosts never activate inherited live configuration', () => withEnv({
  ...complete,
  URL: 'https://bannersonthefly.com',
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  STRIPE_SECRET_KEY: 'sk_live_example',
}, () => {
  for (const host of [
    'unexpected.example',
    '6a791d43dd545dcac9ad7602--bannersonthefly.netlify.app',
  ]) {
    const event = {
      rawUrl: `https://${host}/.netlify/functions/stripe-config`,
      headers: { host },
    };
    const config = runtime.resolveStripeRuntime({ requireInternalJobSecret: true, event });
    assert.equal(config.enabled, false, host);
    assert.equal(config.context, 'unknown', host);
    assert.ok(config.errors.includes('STRIPE_DEPLOY_CONTEXT_UNKNOWN'), host);
    assert.equal(runtime.publicStripeConfig(event).publishableKey, null, host);
  }
}));

test('emergency UI kill switch does not disable webhook/finalize recovery', () => withEnv({
  CONTEXT: 'deploy-preview',
  ...complete,
  STRIPE_CHECKOUT_ENABLED: 'false',
}, () => {
  assert.equal(runtime.resolveStripeRuntime({ requireInternalJobSecret: true }).enabled, false);
  const recovery = runtime.resolveStripeRuntime({
    requireInternalJobSecret: true,
    requireEnabledFlag: false,
  });
  assert.equal(recovery.enabled, true);
  assert.equal(recovery.errors.includes('STRIPE_CHECKOUT_DISABLED'), false);
}));

test('same-origin POST guard requires Origin outside local development', () => withEnv({ CONTEXT: 'deploy-preview' }, () => {
  assert.throws(
    () => runtime.assertSameOrigin({ headers: { host: 'deploy-preview-1--bof.netlify.app' } }),
    (error) => error.code === 'ORIGIN_REQUIRED',
  );
  assert.equal(runtime.assertSameOrigin({
    headers: {
      host: 'deploy-preview-1--bof.netlify.app',
      origin: 'https://deploy-preview-1--bof.netlify.app',
    },
  }), true);
  assert.throws(
    () => runtime.assertSameOrigin({
      headers: {
        host: 'deploy-preview-1--bof.netlify.app',
        origin: 'https://evil.example',
      },
    }),
    (error) => error.code === 'ORIGIN_MISMATCH',
  );
}));

test('internal follow-up destination ignores request Host and uses only deployment configuration', () => withEnv({
  CONTEXT: 'deploy-preview',
  DEPLOY_PRIME_URL: 'https://deploy-preview-42--bof.netlify.app/path-that-is-ignored',
}, () => {
  assert.equal(runtime.siteUrlForEvent({
    headers: {
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
    },
  }), 'https://deploy-preview-42--bof.netlify.app');
}));

test('shared Stripe service imports before database configuration is present', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NETLIFY_DATABASE_URL;
  const servicePath = path.resolve(__dirname, '../_shared/stripe-checkout-service.cjs');
  const child = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(servicePath)})`], {
    env,
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
});
