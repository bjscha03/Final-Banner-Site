const { describe, expect, it } = require('vitest');

describe('password-only admin sign-in', () => {
  it('requires a password without accepting an email from the client', async () => {
    const { handler } = require('../admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: '{}' }, {});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Password is required');
  });

  it('issues a signed admin session only for the server-side admin password', async () => {
    const previousSecret = process.env.AUTH_SESSION_SECRET;
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    const { handler } = require('../admin-sign-in.cjs');
    const rejected = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'wrong' }) }, {});
    expect(rejected.statusCode).toBe(401);
    const accepted = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'admin' }) }, {});
    const payload = JSON.parse(accepted.body);
    expect(accepted.statusCode).toBe(200);
    expect(payload.user).toMatchObject({ id: 'server-admin', is_admin: true });
    expect(payload.sessionToken).toBeTruthy();
    if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previousSecret;
  });
});
