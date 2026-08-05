import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('password-only admin sign-in', () => {
  it('requires a password without accepting an email from the client', async () => {
    process.env.ADMIN_PASSWORD = 'secure-test-password';
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    const { handler } = require('../_shared/legacy/admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: { origin: 'https://example.test', host: 'example.test' }, body: '{}' }, {});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Password is required');
  });

  it('issues a signed admin session only for the server-side admin password', async () => {
    const previousSecret = process.env.AUTH_SESSION_SECRET;
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    process.env.ADMIN_PASSWORD = 'secure-test-password';
    const { handler } = require('../_shared/legacy/admin-sign-in.cjs');
    const headers = { origin: 'https://example.test', host: 'example.test' };
    const rejected = await handler({ httpMethod: 'POST', headers, body: JSON.stringify({ password: 'wrong' }) }, {});
    expect(rejected.statusCode).toBe(401);
    const accepted = await handler({ httpMethod: 'POST', headers, body: JSON.stringify({ password: 'secure-test-password' }) }, {});
    const payload = JSON.parse(accepted.body);
    expect(accepted.statusCode).toBe(200);
    expect(payload.user).toMatchObject({ id: 'server-admin', is_admin: true });
    expect(payload.sessionToken).toBeTruthy();
    expect(accepted.headers['Set-Cookie']).toContain(`banners_admin_session=${encodeURIComponent(payload.sessionToken)}`);
    expect(accepted.headers['Set-Cookie']).toContain('SameSite=Strict');
    if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  });

  it('honors an existing non-empty ADMIN_PASSWORD without exposing it client-side', async () => {
    const previousSecret = process.env.AUTH_SESSION_SECRET;
    const previousPassword = process.env.ADMIN_PASSWORD;
    const previousHash = process.env.ADMIN_PASSWORD_SHA256;
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    process.env.ADMIN_PASSWORD = 'legacy';
    delete process.env.ADMIN_PASSWORD_SHA256;
    const { handler } = require('../_shared/legacy/admin-sign-in.cjs');
    const response = await handler({
      httpMethod: 'POST',
      headers: { origin: 'https://example.test', host: 'example.test' },
      body: JSON.stringify({ password: 'legacy' }),
    }, {});
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('legacy');
    if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousHash === undefined) delete process.env.ADMIN_PASSWORD_SHA256;
    else process.env.ADMIN_PASSWORD_SHA256 = previousHash;
  });

  it('fails closed when the admin credential is not configured', async () => {
    const previousPassword = process.env.ADMIN_PASSWORD;
    const previousHash = process.env.ADMIN_PASSWORD_SHA256;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_SHA256;
    const { handler } = require('../_shared/legacy/admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: { origin: 'https://example.test', host: 'example.test' }, body: JSON.stringify({ password: 'anything' }) }, {});
    expect(response.statusCode).toBe(503);
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousHash === undefined) delete process.env.ADMIN_PASSWORD_SHA256;
    else process.env.ADMIN_PASSWORD_SHA256 = previousHash;
  });

  it('rejects cross-origin sign-in attempts', async () => {
    process.env.ADMIN_PASSWORD = 'secure-test-password';
    process.env.AUTH_SESSION_SECRET = 'test-session-secret';
    const { handler } = require('../_shared/legacy/admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: { origin: 'https://attacker.test', host: 'example.test' }, body: JSON.stringify({ password: 'secure-test-password' }) }, {});
    expect(response.statusCode).toBe(403);
  });
});
