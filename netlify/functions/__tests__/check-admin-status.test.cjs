const assert = require('assert');
const { handler } = require('../check-admin-status.cjs');

(async () => {
  process.env.CONTEXT = 'deploy-preview';
  delete process.env.DEPLOY_PRIME_URL;

  const accepted = await handler({
    httpMethod: 'POST',
    headers: { cookie: 'botf_preview_admin=1' },
  });
  assert.strictEqual(accepted.statusCode, 200);
  assert.strictEqual(JSON.parse(accepted.body).isAdmin, true);

  const missingCookie = await handler({ httpMethod: 'POST', headers: {} });
  assert.strictEqual(JSON.parse(missingCookie.body).isAdmin, false);

  process.env.CONTEXT = 'production';
  process.env.DEPLOY_PRIME_URL = 'https://www.bannersonthefly.com';
  const rejectedProduction = await handler({
    httpMethod: 'POST',
    headers: { cookie: 'botf_preview_admin=1' },
  });
  assert.strictEqual(JSON.parse(rejectedProduction.body).isAdmin, false);

  console.log('check-admin-status preview cookie tests passed');
})();
