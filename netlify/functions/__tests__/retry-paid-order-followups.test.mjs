import assert from 'node:assert/strict';
import test from 'node:test';
import { _test } from '../retry-paid-order-followups.mjs';
import { _test as processFollowupsTest } from '../process-paid-order-followups-background.mjs';

const MANAGED_ENV = [
  'NETLIFY_DATABASE_URL',
  'DATABASE_URL',
  'INTERNAL_JOB_SECRET',
  'AUTH_SESSION_SECRET',
  'DEPLOY_PRIME_URL',
  'URL',
  'PUBLIC_SITE_URL',
  'NODE_ENV',
  'NETLIFY_DEV',
];

const originalFetch = globalThis.fetch;

async function withEnv(values, fn) {
  const previous = Object.fromEntries(MANAGED_ENV.map((name) => [name, process.env[name]]));
  for (const name of MANAGED_ENV) delete process.env[name];
  Object.assign(process.env, values);
  try {
    return await fn();
  } finally {
    for (const name of MANAGED_ENV) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  _test.resetNeonFactory();
});

test('retry queues branch orders on DEPLOY_PRIME_URL with the internal secret and ignores hostile hosts', async () => {
  await withEnv({
    NETLIFY_DATABASE_URL: 'postgres://retry-test.invalid/database',
    INTERNAL_JOB_SECRET: 'branch-internal-secret',
    DEPLOY_PRIME_URL: 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app/path-is-ignored',
    URL: 'https://www.bannersonthefly.com',
    PUBLIC_SITE_URL: 'https://bannersonthefly.com',
  }, async () => {
    let connectedUrl = null;
    _test.setNeonFactory((url) => {
      connectedUrl = url;
      return async (parts) => {
        const query = Array.isArray(parts) ? parts.join('?') : String(parts || '');
        if (/JOIN\s+order_items/i.test(query)) return [];
        if (/FROM\s+orders/i.test(query)) return [{ id: 'branch-paid-order' }];
        return [];
      };
    });

    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 202 };
    };

    const response = await _test.handler({
      headers: {
        host: 'attacker.example',
        'x-forwarded-host': 'attacker.example',
      },
    });

    assert.equal(connectedUrl, process.env.NETLIFY_DATABASE_URL);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      ok: true,
      candidateCount: 1,
      queued: 1,
      failed: 0,
    });
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app/.netlify/functions/process-paid-order-followups-background',
    );
    assert.deepEqual(requests[0].options.headers, {
      'Content-Type': 'application/json',
      'X-Internal-Job-Secret': 'branch-internal-secret',
    });
    assert.deepEqual(JSON.parse(requests[0].options.body), { orderId: 'branch-paid-order' });
  });
});

test('retry fails closed before database or network access when the internal secret is missing', async () => {
  await withEnv({
    NETLIFY_DATABASE_URL: 'postgres://retry-test.invalid/database',
    DEPLOY_PRIME_URL: 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app',
    URL: 'https://www.bannersonthefly.com',
  }, async () => {
    let databaseTouched = false;
    let networkTouched = false;
    _test.setNeonFactory(() => {
      databaseTouched = true;
      throw new Error('database must not be reached');
    });
    globalThis.fetch = async () => {
      networkTouched = true;
      throw new Error('network must not be reached');
    };

    const response = await _test.handler({ headers: { host: 'attacker.example' } });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), {
      ok: false,
      error: 'CONFIGURATION_MISSING',
    });
    assert.equal(databaseTouched, false);
    assert.equal(networkTouched, false);
  });
});

test('retry fails closed instead of reflecting a hostile request host when no deployment URL exists', async () => {
  await withEnv({
    NETLIFY_DATABASE_URL: 'postgres://retry-test.invalid/database',
    INTERNAL_JOB_SECRET: 'branch-internal-secret',
  }, async () => {
    let databaseTouched = false;
    let networkTouched = false;
    _test.setNeonFactory(() => {
      databaseTouched = true;
      throw new Error('database must not be reached');
    });
    globalThis.fetch = async () => {
      networkTouched = true;
      throw new Error('network must not be reached');
    };

    const response = await _test.handler({
      headers: {
        host: 'attacker.example',
        'x-forwarded-host': 'attacker.example',
      },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), {
      ok: false,
      error: 'CONFIGURATION_MISSING',
    });
    assert.equal(databaseTouched, false);
    assert.equal(networkTouched, false);
  });
});

test('retry does not queue rows already marked sent by timestamp even when delivery status changed', async () => {
  await withEnv({
    NETLIFY_DATABASE_URL: 'postgres://retry-test.invalid/database',
    INTERNAL_JOB_SECRET: 'branch-internal-secret',
    DEPLOY_PRIME_URL: 'https://agent-payment-sandbox-e2e--bannersonthefly.netlify.app',
    URL: 'https://www.bannersonthefly.com',
  }, async () => {
    let emailQuery = '';
    _test.setNeonFactory(() => async (parts) => {
      const query = Array.isArray(parts) ? parts.join('?') : String(parts || '');
      if (/JOIN\s+order_items/i.test(query)) return [];
      if (/FROM\s+orders/i.test(query)) {
        emailQuery = query;
        return [{
          id: 'already-notified-order',
          confirmation_email_status: 'delivered',
          confirmation_emailed_at: '2026-08-08T18:00:00.000Z',
          admin_notification_status: 'sent',
          admin_notification_sent_at: '2026-08-08T18:00:01.000Z',
        }];
      }
      return [];
    });

    let networkTouched = false;
    globalThis.fetch = async () => {
      networkTouched = true;
      return { ok: true, status: 202 };
    };

    const response = await _test.handler({});

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      ok: true,
      candidateCount: 0,
      queued: 0,
      failed: 0,
    });
    assert.equal(networkTouched, false);
    assert.match(
      emailQuery,
      /confirmation_emailed_at IS NULL\s+AND\s+COALESCE\(confirmation_email_status, ''\) <> 'sent'/,
    );
    assert.match(
      emailQuery,
      /admin_notification_sent_at IS NULL\s+AND\s+COALESCE\(admin_notification_status, ''\) <> 'sent'/,
    );
  });
});

test('paid-order background processing rejects absent and mismatched job secrets before database access', async () => {
  await withEnv({}, async () => {
    let response = await processFollowupsTest.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ orderId: 'paid-order' }),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, 'UNAUTHORIZED');

    process.env.INTERNAL_JOB_SECRET = 'expected-secret';
    response = await processFollowupsTest.handler({
      httpMethod: 'POST',
      headers: { 'x-internal-job-secret': 'wrong-secret' },
      body: JSON.stringify({ orderId: 'paid-order' }),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, 'UNAUTHORIZED');
  });
});
