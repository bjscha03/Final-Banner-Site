const assert = require('assert');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@example.invalid/test';
const { _test } = require('../create-order.cjs');

function withEnv(nextEnv, fn) {
  const previous = {
    CONTEXT: process.env.CONTEXT,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
  };
  process.env.CONTEXT = nextEnv.CONTEXT || '';
  process.env.DEPLOY_PRIME_URL = nextEnv.DEPLOY_PRIME_URL || '';
  try {
    fn();
  } finally {
    process.env.CONTEXT = previous.CONTEXT;
    process.env.DEPLOY_PRIME_URL = previous.DEPLOY_PRIME_URL;
  }
}

withEnv({ CONTEXT: 'deploy-preview' }, () => {
  const orderData = {
    checkout_mode: 'admin_deploy_preview_test',
    payment_method: 'paypal',
    paypal_order_id: 'SHOULD_BE_CLEARED',
    paypal_capture_id: 'SHOULD_BE_CLEARED',
    stripe_payment_intent_id: 'SHOULD_BE_CLEARED',
  };
  _test.applyAdminDeployPreviewTestOrder(orderData);
  assert.strictEqual(orderData.payment_method, 'admin_deploy_preview_test');
  assert.strictEqual(orderData.payment_status, 'paid');
  assert.strictEqual(orderData.is_test_order, true);
  assert.ok(orderData.test_order_reason);
  assert.strictEqual(orderData.paypal_order_id, null);
  assert.strictEqual(orderData.paypal_capture_id, null);
  assert.strictEqual(orderData.stripe_payment_intent_id, null);
});

withEnv({ CONTEXT: 'production', DEPLOY_PRIME_URL: 'https://www.bannersonthefly.com' }, () => {
  assert.throws(
    () => _test.applyAdminDeployPreviewTestOrder({
      checkout_mode: 'admin_deploy_preview_test',
      cookie: 'botf_preview_admin=1',
    }),
    (error) => error.code === 'ADMIN_TEST_ORDER_NOT_AUTHORIZED'
  );
});

withEnv({ CONTEXT: 'production', DEPLOY_PRIME_URL: 'https://deploy-preview-357--bannersonthefly.netlify.app' }, () => {
  assert.strictEqual(_test.isDeployPreviewEnvironment(), true);
});

console.log('create-order deploy-preview test checkout assertions passed');
