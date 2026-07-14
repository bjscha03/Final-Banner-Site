const assert = require('assert');
const {
  createAdminSession,
  createAdminSessionCookie,
  verifyAdminSession,
  verifyAdminSessionToken,
} = require('../admin-session.cjs');

process.env.ADMIN_SESSION_SECRET = 'unit-test-secret';

const token = createAdminSession({ email: 'admin@example.com' });
assert.strictEqual(verifyAdminSessionToken(token).valid, true);

const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
assert.strictEqual(verifyAdminSessionToken(tampered).valid, false);

const cookie = createAdminSessionCookie(token);
assert.strictEqual(verifyAdminSession({ headers: { cookie } }).valid, true);
assert.strictEqual(verifyAdminSession({ headers: { cookie: 'admin=1' } }).valid, false);

console.log('admin-session tests passed');
