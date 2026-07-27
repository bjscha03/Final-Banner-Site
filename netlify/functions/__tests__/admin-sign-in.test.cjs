const { describe, expect, it } = require('vitest');

describe('password-only admin sign-in', () => {
  it('returns a clear configuration error when ADMIN_EMAIL is missing', async () => {
    const previous = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAIL;
    const { handler } = require('../admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'secret' }) }, {});
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toContain('ADMIN_EMAIL');
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  });

  it('requires a password without accepting an email from the client', async () => {
    const previous = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = 'configured@example.com';
    const { handler } = require('../admin-sign-in.cjs');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: '{}' }, {});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Password is required');
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  });
});
