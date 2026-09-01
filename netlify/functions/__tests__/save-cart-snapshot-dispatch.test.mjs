import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../save-cart-snapshot.mjs';

const lifecycleRequest = (abandonmentSignal = true) => new Request(
  'https://example.test/.netlify/functions/save-cart-snapshot',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captureKind: 'lifecycle', abandonmentSignal }),
  },
);

test('accepted pagehide snapshots queue the recovery worker immediately', async () => {
  let dispatched = 0;
  const handler = _test.createHandler({
    handleLambda: async () => new Response(JSON.stringify({
      success: true,
      cartId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      abandonmentAccepted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    dispatch: async ({ cartId, context }) => {
      assert.equal(context.deploy.id, 'deploy-id');
      assert.equal(cartId, '11111111-1111-4111-8111-111111111111');
      dispatched += 1;
    },
  });

  const response = await handler(lifecycleRequest(true), { deploy: { id: 'deploy-id' } });
  assert.equal(response.status, 200);
  assert.equal(dispatched, 1);
});

test('ordinary snapshots and rejected saves never dispatch recovery', async () => {
  let dispatched = 0;
  const acceptedHandler = _test.createHandler({
    handleLambda: async () => new Response(JSON.stringify({
      success: true,
      cartId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      abandonmentAccepted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    dispatch: async () => { dispatched += 1; },
  });
  await acceptedHandler(lifecycleRequest(false), {});

  const rejectedHandler = _test.createHandler({
    handleLambda: async () => new Response(JSON.stringify({ error: 'rejected' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }),
    dispatch: async () => { dispatched += 1; },
  });
  await rejectedHandler(lifecycleRequest(true), {});
  assert.equal(dispatched, 0);
});

test('dispatch failures preserve the accepted snapshot and defer to the minute fallback', async () => {
  const warnings = [];
  const handler = _test.createHandler({
    handleLambda: async () => new Response(JSON.stringify({
      success: true,
      cartId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      abandonmentAccepted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    dispatch: async () => { throw new Error('temporary dispatch outage'); },
    logger: { warn: (...args) => warnings.push(args) },
  });

  const response = await handler(lifecycleRequest(true), {});
  assert.equal(response.status, 200);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][1].message, /temporary dispatch outage/);
});

test('internal dispatch uses the immutable deploy and signed background endpoint', async () => {
  let requestUrl = '';
  let requestInit;
  await _test.dispatchImmediateRecovery({
    cartId: '11111111-1111-4111-8111-111111111111',
    context: { deploy: { id: 'abc123' }, site: { name: 'banners-on-the-fly' } },
    env: { INTERNAL_JOB_SECRET: 'internal-test-secret' },
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return new Response('', { status: 202 });
    },
  });
  assert.equal(
    requestUrl,
    'https://abc123--banners-on-the-fly.netlify.app/.netlify/functions/detect-abandoned-carts-background',
  );
  assert.equal(requestInit.method, 'POST');
  assert.equal(requestInit.headers['X-Internal-Job-Secret'], 'internal-test-secret');
  assert.deepEqual(JSON.parse(requestInit.body), {
    trigger: 'pagehide',
    cartId: '11111111-1111-4111-8111-111111111111',
  });
});

test('raw pagehide intent never dispatches unless the save explicitly accepted that signal', async () => {
  let dispatched = 0;
  const handler = _test.createHandler({
    handleLambda: async () => new Response(JSON.stringify({
      success: true,
      cartId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      abandonmentAccepted: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    dispatch: async () => { dispatched += 1; },
  });

  const response = await handler(lifecycleRequest(true), {});
  assert.equal(response.status, 200);
  assert.equal(dispatched, 0);
});
