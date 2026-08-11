'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const repository = require('./company-mockup-repository.cjs');
const { RENDER_VERSION, prepareCompanyMockup } = require('./company-mockup.cjs');
const { withAbortableDeadline } = require('./deadline.cjs');
const { json, authorize, parseJsonBody, redactSecretText, safeFailure } = require('./security.cjs');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PREPARATION_TIMEOUT_MS = 50_000;

async function withPreparationDeadline(taskOrPromise, timeoutMs = DEFAULT_PREPARATION_TIMEOUT_MS) {
  const task = typeof taskOrPromise === 'function' ? taskOrPromise : () => taskOrPromise;
  return withAbortableDeadline(task, {
    timeoutMs,
    errorCode: 'COMPANY_MOCKUP_BUILD_TIMEOUT',
    message: 'Company mockup preparation exceeded its safe request deadline.',
  });
}

function createCompanyMockupHandler(options = {}) {
  const dependencies = { createSql, prepareCompanyMockup, ...repository, ...options.dependencies };
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
      const sql = dependencies.createSql(env);
      const candidate = await dependencies.loadCompanyMockupCandidate(sql, prospectId);
      let result;
      try {
        result = await withPreparationDeadline((signal) => dependencies.prepareCompanyMockup({
          sql,
          candidate,
          prospectId,
          force: event.httpMethod === 'POST' && input.force === true,
          preferCachedReady: event.httpMethod === 'GET',
          store: options.getStore ? options.getStore() : options.store,
          sharp: options.sharp,
          dependencies: { ...(options.mockupDependencies || {}), signal },
        }), options.preparationTimeoutMs);
      } catch (error) {
        if (event.httpMethod === 'POST' && candidate?.prospect?.id) {
          await dependencies.saveCompanyMockupFailure(sql, {
            candidate,
            renderVersion: RENDER_VERSION,
            errorCode: dependencies.safeCompanyMockupErrorCode(redactSecretText(error?.code || '')),
          }).catch(() => null);
        }
        throw error;
      }
      if (event.httpMethod === 'GET') {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="company-quick-banner-mockup.jpg"',
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
        compositionAudit: result.compositionAudit || null,
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

module.exports = {
  UUID_PATTERN,
  DEFAULT_PREPARATION_TIMEOUT_MS,
  withPreparationDeadline,
  createCompanyMockupHandler,
};
