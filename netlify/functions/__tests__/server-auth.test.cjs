const { describe, it, expect, beforeEach } = require('vitest');

describe('server-side session authorization', () => {
  beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-not-for-production'; });

  it('accepts an unexpired signed admin bearer token', () => {
    const auth = require('../_shared/server-auth.cjs');
    const token = auth.createSessionToken({ id: 'u1', email: 'admin@example.com', is_admin: true });
    expect(auth.requireAdmin({ headers: { authorization: `Bearer ${token}` } }).ok).toBe(true);
  });

  it('rejects tampered and non-admin tokens', () => {
    const auth = require('../_shared/server-auth.cjs');
    const token = auth.createSessionToken({ id: 'u1', email: 'user@example.com', is_admin: false });
    expect(auth.requireAdmin({ headers: { authorization: `Bearer ${token}` } }).ok).toBe(false);
    expect(auth.verifySessionToken(`${token}x`)).toBeNull();
  });
});
