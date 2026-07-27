const { describe, expect, it } = require('vitest');

describe('password-only admin sign-in', () => {
  it('returns a clear configuration error when ADMIN_PASSWORD is missing', async () => {
    const previous = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    const { handler } = require('../admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'secret' }) }, {});
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toContain('ADMIN_PASSWORD');
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  });

  it('requires a password without accepting an email from the client', async () => {
    const previous = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = 'admin';
    const { handler } = require('../admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: '{}' }, {});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Password is required');
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  });

  it('issues a signed admin session only for ADMIN_PASSWORD', async () => {
    const previousPassword = process.env.ADMIN_PASSWORD;
    const previousSecret = process.env.AUTH_SESSION_SECRET;
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    const { handler } = require('../admin-sign-in.cjs');
    const rejected = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'wrong' }) }, {});
    expect(rejected.statusCode).toBe(401);
    const accepted = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'admin' }) }, {});
    const payload = JSON.parse(accepted.body);
    expect(accepted.statusCode).toBe(200);
    expect(payload.user).toMatchObject({ id: 'server-admin', is_admin: true });
    expect(payload.sessionToken).toBeTruthy();
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previousSecret;
  });
});
