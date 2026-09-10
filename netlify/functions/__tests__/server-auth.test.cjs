const { describe, it, expect, beforeEach, afterEach } = require('vitest');

describe('server-side session authorization', () => {
  beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-not-for-production'; });
  afterEach(() => {
    delete process.env.CONTEXT;
    delete process.env.DEPLOY_PRIME_URL;
  });

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

  it('accepts the preview admin cookie only inside a Netlify deploy preview', () => {
    const auth = require('../_shared/server-auth.cjs');
    const event = { headers: { host: 'deploy-preview-490--bannersonthefly.netlify.app', cookie: 'theme=light; botf_preview_admin=1' } };

    expect(auth.requireAdmin(event).ok).toBe(true);

    expect(auth.requireAdmin({ headers: { host: 'bannersonthefly.com', cookie: 'botf_preview_admin=1' } }).ok).toBe(false);
  });
});
