'use strict';

const assert = require('assert');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@example.invalid/test';
const { _test } = require('../_shared/legacy/create-order.cjs');

assert.strictEqual(
  _test.requestHostname({ headers: { host: 'deploy-preview-358--bannersonthefly.netlify.app:443' } }),
  'deploy-preview-358--bannersonthefly.netlify.app'
);

assert.strictEqual(
  _test.isDeployPreviewRequest({
    headers: {
      host: 'deploy-preview-358--bannersonthefly.netlify.app',
      'x-forwarded-host': 'deploy-preview-358--bannersonthefly.netlify.app',
    },
  }),
  true
);

assert.strictEqual(
  _test.isDeployPreviewRequest({ headers: { host: 'bannersonthefly.com' } }),
  false
);

assert.strictEqual(
  _test.isDeployPreviewRequest({
    headers: {
      host: 'bannersonthefly.com',
      'x-forwarded-host': 'deploy-preview-358--bannersonthefly.netlify.app',
    },
  }),
  false,
  'The authoritative Host header must prevent spoofed forwarded-host access.'
);

const normalizedSuccess = _test.normalizeResponse({
  statusCode: 200,
  body: JSON.stringify({ orderId: 'order-123', order: { id: 'order-123' } }),
});
assert.strictEqual(JSON.parse(normalizedSuccess.body).id, 'order-123');

const normalizedFailure = _test.normalizeResponse({
  statusCode: 500,
  body: JSON.stringify({ error: 'Failed to create order', details: 'database insert failed' }),
});
assert.match(JSON.parse(normalizedFailure.body).message, /database insert failed/);

console.log('create-order runtime Deploy Preview wrapper tests passed');
