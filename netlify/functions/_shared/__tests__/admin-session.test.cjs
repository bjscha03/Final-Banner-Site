const assert = require('assert');
const {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  verifyAdminSession,
  clearAdminSessionCookie,
} = require('../admin-session.cjs');

process.env.ADMIN_SESSION_SECRET = 'unit-test-secret-at-least-long-enough';

const { token, cookie } = createAdminSession({ profileId: '11111111-1111-1111-1111-111111111111', email: 'Admin@Example.COM' });
assert.equal(verifyAdminSession(`${ADMIN_SESSION_COOKIE}=${token}`).valid, true, 'valid cookie header token should verify');
assert.equal(verifyAdminSession({ headers: { cookie } }).valid, true, 'valid Set-Cookie-style header should verify');
assert.equal(verifyAdminSession(`${token}x`).valid, false, 'forged cookie should fail');

const [payload, sig] = token.split('.');
const modifiedPayload = Buffer.from(JSON.stringify({ role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
assert.equal(verifyAdminSession(`${modifiedPayload}.${sig}`).valid, false, 'modified payload should fail signature validation');

const expired = createAdminSession({ maxAgeSeconds: -1 }).token;
const expiredResult = verifyAdminSession(expired);
assert.equal(expiredResult.valid, false, 'expired cookie should fail');
assert.equal(expiredResult.expired, true, 'expired cookie should report expired');

assert.equal(verifyAdminSession('admin=1').valid, false, 'legacy admin=1 cookie alone should fail');
assert.match(clearAdminSessionCookie(), /Max-Age=0/, 'logout cookie should expire session');
console.log('admin-session tests passed');
