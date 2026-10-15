import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../admin-record-partial-refund.mjs';
import auth from '../_shared/server-auth.cjs';

test('refund records require an admin, reject preview writes, and validate amounts before connecting', async () => {
  const env = { CONTEXT: process.env.CONTEXT, AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET };
  try {
    process.env.CONTEXT = 'production'; process.env.AUTH_SESSION_SECRET = 'partial-refund-test-only';
    const event = { httpMethod: 'POST', headers: {}, body: '{}' };
    assert.equal((await handler(event)).statusCode, 401);
    const customer = auth.createSessionToken({ id: 'customer', email: 'customer@example.test', is_admin: false });
    assert.equal((await handler({ ...event, headers: { authorization: `Bearer ${customer}` } })).statusCode, 401);
    const admin = auth.createSessionToken({ id: 'admin', email: 'admin@example.test', is_admin: true });
    event.headers = { authorization: `Bearer ${admin}` };
    assert.equal((await handler({ ...event, body: 'null' })).statusCode, 400);
    assert.equal((await handler({ ...event, body: '{' })).statusCode, 400);
    process.env.CONTEXT = 'deploy-preview';
    assert.equal((await handler(event)).statusCode, 409);
  } finally { for (const [key,value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
