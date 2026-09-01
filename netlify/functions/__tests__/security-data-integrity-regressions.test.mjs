import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import getOrdersHandler, { _test as getOrdersTest } from '../get-orders.mjs';

const require = createRequire(import.meta.url);
const sendModule = require('../_shared/legacy/send-abandoned-cart-email.cjs');

const cartId = '11111111-1111-4111-8111-111111111111';
const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');

test('newsletter opt-out blocks recovery delivery before the provider call', async () => {
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) {
      return [{
        id: cartId,
        user_id: null,
        session_id: 'guest-security-test',
        email: 'Newsletter@Business.com',
        normalized_email: 'newsletter@business.com',
        cart_contents: [{ width_in: 48, height_in: 24, quantity: 1 }],
        total_value: '25.00',
        estimated_total_cents: 2500,
        discount_code: null,
        recovery_status: 'abandoned',
        recovery_emails_sent: 0,
        created_at: '2026-09-01T00:00:00.000Z',
        last_activity_at: '2026-09-01T00:00:00.000Z',
      }];
    }
    if (/FROM orders/i.test(query)) return [];
    if (/FROM newsletter/i.test(query)) return [{ updated_at: '2026-09-01T00:30:00.000Z' }];
    if (/UPDATE abandoned_carts/i.test(query)) return [];
    return [];
  };
  const resend = {
    emails: {
      send: async () => {
        providerCalls += 1;
        return { data: { id: 'must-not-send' }, error: null };
      },
    },
  };

  sendModule._test.setEnsureSchema(async () => {});
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend,
      cartId,
      sequenceNumber: 1,
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'suppressed' });
    assert.equal(providerCalls, 0);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('get-orders strips wildcard CORS and marks every response private and non-cacheable', async () => {
  const normalized = getOrdersTest.secureOrderResponse({
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'X-Existing': 'kept' },
    body: '[]',
  });
  assert.equal(normalized.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(normalized.headers['X-Existing'], 'kept');
  assert.match(normalized.headers['Cache-Control'], /\bprivate\b/);
  assert.match(normalized.headers['Cache-Control'], /\bno-store\b/);
  assert.equal(normalized.headers['Cross-Origin-Resource-Policy'], 'same-origin');
  assert.equal(normalized.headers['X-Content-Type-Options'], 'nosniff');

  const response = await getOrdersHandler(new Request(
    'https://www.bannersonthefly.com/.netlify/functions/get-orders?page=1',
  ), {});
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control') || '', /\bno-store\b/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
});
