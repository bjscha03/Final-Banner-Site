'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { listShadowProspects } = require('./discovery-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { PROSPECT_STATUSES } = require('./schema.cjs');
const { json, authorize, redactSecretText, safeFailure } = require('./security.cjs');

function emptyQueue() {
  return { prospects: [], total: 0, limit: 50, offset: 0, statusCounts: {}, providerUsage: [] };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const escaped = text.replace(/"/g, '""');
  const spreadsheetSafe = /^[\t\r\n ]*[-=+@]/.test(escaped) ? `'${escaped}` : escaped;
  return `"${spreadsheetSafe}"`;
}

function prospectsCsv(prospects) {
  const headers = [
    'prospect_id', 'business_name', 'canonical_domain', 'website_url', 'industry', 'business_type',
    'status', 'lead_score', 'research_state', 'contact_state', 'contact_email', 'email_verification_status',
    'email_syntax_valid', 'mx_status', 'role_address', 'free_mailbox', 'business_domain_matches', 'contact_source_url',
    'rejection_reason', 'suppression_reason', 'source_provider', 'source_urls',
    'score_explanation', 'discovered_at', 'last_qualified_at',
  ];
  const rows = prospects.map((prospect) => [
    prospect.id, prospect.businessName, prospect.canonicalDomain, prospect.websiteUrl, prospect.industry,
    prospect.businessType, prospect.status, prospect.leadScore, prospect.researchState, prospect.contactState,
    prospect.primaryContact?.email, prospect.primaryContact?.verificationStatus, prospect.primaryContact?.syntaxValid,
    prospect.primaryContact?.mxStatus, prospect.primaryContact?.isRoleAddress, prospect.primaryContact?.isFreeMailbox,
    prospect.primaryContact?.domainMatches, prospect.primaryContact?.sourceUrl,
    prospect.rejectionReason, prospect.suppressionReason,
    prospect.sourceProviderId, prospect.sourceUrls, prospect.scoreExplanation, prospect.discoveredAt, prospect.lastQualifiedAt,
  ]);
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
}

function createProspectHandler(dependencies = {}) {
  const sqlFactory = dependencies.createSql || createSql;
  const queueLoader = dependencies.listShadowProspects || listShadowProspects;
  const auditor = dependencies.appendAudit || appendAudit;

  return async function prospectsHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    const auth = authorize(event);
    if (auth.response) return auth.response;
    if (event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, OPTIONS' });
    }
    const query = event.queryStringParameters || {};
    const status = String(query.status || '').trim() || null;
    if (status && !PROSPECT_STATUSES.includes(status)) {
      return json(400, { ok: false, error: 'INVALID_PROSPECT_FILTER', message: 'Prospect status filter is invalid.' });
    }
    const databaseConfigured = Boolean(getDatabaseUrl());
    if (!databaseConfigured) {
      return json(200, { ok: true, schemaReady: false, shadowMode: true, liveSending: false, ...emptyQueue() });
    }
    try {
      const sql = sqlFactory();
      const format = String(query.format || '').toLowerCase();
      const pageLimit = format === 'csv' ? 5000 : Number(query.limit);
      const queue = await queueLoader(sql, {
        status,
        limit: pageLimit,
        offset: Number(query.offset),
        maximumLimit: format === 'csv' ? 5000 : 100,
      });
      if (format === 'csv') {
        await auditor(sql, {
          actorType: 'admin', actorId: auth.session.email || auth.session.sub || null,
          action: 'prospects.exported', entityType: 'prospect_queue',
          metadata: { rowCount: queue.prospects.length, status },
          requestId: event?.headers?.['x-nf-request-id'] || null,
        });
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="outbound-shadow-prospects.csv"',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            Vary: 'Authorization, X-Banners-Admin-Session, Cookie',
          },
          body: prospectsCsv(queue.prospects),
        };
      }
      return json(200, {
        ok: true,
        schemaReady: true,
        shadowMode: true,
        liveSending: false,
        ...queue,
      });
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        return json(200, { ok: true, schemaReady: false, shadowMode: true, liveSending: false, ...emptyQueue() });
      }
      console.error('[outbound-sales] prospect queue unavailable', {
        code: redactSecretText(error?.code || 'DATABASE_UNAVAILABLE').slice(0, 80),
      });
      return safeFailure(error);
    }
  };
}

const prospectsHandler = createProspectHandler();

module.exports = { emptyQueue, csvCell, prospectsCsv, createProspectHandler, prospectsHandler };
