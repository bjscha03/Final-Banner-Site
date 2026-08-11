'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { prepareCompanyMockup } = require('./company-mockup.cjs');
const { json, authorize, parseJsonBody, safeFailure } = require('./security.cjs');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createCompanyMockupHandler(options = {}) {
  const dependencies = { createSql, prepareCompanyMockup, ...options.dependencies };
  const env = options.env || process.env;
  return async function companyMockupHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    const mutating = event.httpMethod === 'POST';
    const auth = authorize(event, { requireOrigin: mutating });
    if (auth.response) return auth.response;
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
    }
    if (!getDatabaseUrl(env)) return safeFailure(Object.assign(new Error('Database is not configured.'), { code: 'DATABASE_NOT_CONFIGURED' }));
    try {
      const input = event.httpMethod === 'POST' ? parseJsonBody(event, 4096) : (event.queryStringParameters || {});
      const prospectId = String(input.prospectId || '').trim();
      if (!UUID_PATTERN.test(prospectId)) {
        const error = new Error('Prospect ID is invalid.');
        error.code = 'INVALID_COMPANY_MOCKUP';
        throw error;
      }
      const result = await dependencies.prepareCompanyMockup({
        sql: dependencies.createSql(env),
        prospectId,
        force: event.httpMethod === 'POST' && input.force === true,
        store: options.getStore ? options.getStore() : options.store,
        sharp: options.sharp,
        dependencies: options.mockupDependencies,
      });
      if (event.httpMethod === 'GET') {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="company-banner-concept.jpg"',
            'Cache-Control': 'private, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            Vary: 'Authorization, X-Banners-Admin-Session, Cookie',
          },
          body: result.buffer.toString('base64'),
          isBase64Encoded: true,
        };
      }
      return json(200, {
        ok: true,
        prospectId,
        cached: result.cached,
        status: result.row?.status || (result.sendReady ? 'ready' : 'fallback'),
        qualityLevel: result.qualityLevel,
        sendReady: result.sendReady === true,
        sceneId: result.plan.sceneId,
        sourceUrls: result.plan.sourceUrls,
        diagnostics: result.diagnostics || [],
      });
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        return safeFailure(Object.assign(new Error('Company mockup migration is not ready.'), { code: 'OUTBOUND_SCHEMA_NOT_READY' }));
      }
      return safeFailure(error);
    }
  };
}

module.exports = { UUID_PATTERN, createCompanyMockupHandler };
