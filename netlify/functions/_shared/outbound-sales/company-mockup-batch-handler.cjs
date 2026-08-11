'use strict';

const { createSql, getDatabaseUrl } = require('./database.cjs');
const repository = require('./company-mockup-repository.cjs');
const { RENDER_VERSION, prepareCompanyMockup } = require('./company-mockup.cjs');
const { appendAudit } = require('./audit.cjs');
const { authorize, parseJsonBody } = require('./security.cjs');

function createCompanyMockupBatchHandler(options = {}) {
  const dependencies = {
    createSql,
    ...repository,
    prepareCompanyMockup,
    appendAudit,
    ...options.dependencies,
  };
  const env = options.env || process.env;
  return async function companyMockupBatchHandler(event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
    const auth = authorize(event, { requireOrigin: true });
    if (auth.response) return auth.response;
    if (!getDatabaseUrl(env)) return { statusCode: 204, body: '' };
    const body = parseJsonBody(event, 4096);
    const limit = Math.max(1, Math.min(70, Number(body.limit) || 70));
    const force = body.force === true;
    const sql = dependencies.createSql(env);
    const store = options.getStore ? options.getStore() : options.store;
    const candidates = await dependencies.listCompanyMockupCandidates(sql, {
      limit, force, renderVersion: RENDER_VERSION,
    });
    let cursor = 0;
    let prepared = 0;
    let failed = 0;
    const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor];
        cursor += 1;
        try {
          await dependencies.prepareCompanyMockup({
            sql,
            candidate,
            force,
            store,
            sharp: options.sharp,
            dependencies: options.mockupDependencies,
          });
          prepared += 1;
        } catch {
          failed += 1;
        }
      }
    });
    await Promise.all(workers);
    await dependencies.appendAudit(sql, {
      actorType: 'admin',
      actorId: auth.session.email || auth.session.sub || null,
      action: 'company_mockups.batch_prepared',
      entityType: 'company_mockup_batch',
      metadata: { requested: candidates.length, prepared, failed, force, externalEmailsSent: 0 },
      requestId: event.headers?.['x-nf-request-id'] || null,
    }).catch(() => null);
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  };
}

module.exports = { createCompanyMockupBatchHandler };
