'use strict';

const { assertProviderAdapter, assertDiscoveryResult, normalizeDiscoveryRequest } = require('./providers/contract.cjs');
const { researchWebsite } = require('./research.cjs');
const { assessEmailCandidates } = require('./email.cjs');
const { loadExclusions, CONTACTED_STATUSES } = require('./exclusions.cjs');
const { scoreLead } = require('./qualification.cjs');
const repository = require('./discovery-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { reserveBudget, commitBudget, releaseBudget } = require('./budget.cjs');
const { redactSecretText } = require('./security.cjs');

function discoveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertShadowControls({ controls, providerEnabled }) {
  if (controls?.outboundSalesEnabled !== true) {
    throw discoveryError('OUTBOUND_SALES_DISABLED', 'The global outbound-sales kill switch is disabled.');
  }
  if (!controls?.shadowModeEnabled || controls?.liveSendingEnabled) {
    throw discoveryError('SHADOW_MODE_REQUIRED', 'Deterministic discovery requires Shadow Mode with Live Sending disabled.');
  }
  if (controls.emergencyPaused) throw discoveryError('OUTBOUND_EMERGENCY_PAUSED', 'Outbound discovery is paused.');
  if (providerEnabled !== true) throw discoveryError('PROVIDER_DISABLED', 'The discovery provider is not enabled for this staging run.');
}

function localHistoryExclusions(prospect) {
  const exclusions = [];
  if (prospect?.prior_customer_match) {
    exclusions.push({ code: 'EXISTING_CUSTOMER', detail: 'This canonical prospect is already marked as a prior customer.', hard: true, source: 'outbound_history' });
  }
  if (prospect?.first_contacted_at || CONTACTED_STATUSES.includes(prospect?.status)) {
    exclusions.push({ code: 'PREVIOUSLY_CONTACTED', detail: 'This canonical prospect already has outbound contact history.', hard: true, source: 'outbound_history' });
  }
  return exclusions;
}

function prospectForScoring(normalized, stored) {
  return {
    ...normalized,
    websiteUrl: stored?.website_url || normalized.websiteUrl,
    canonicalDomain: stored?.canonical_domain || normalized.canonicalDomain,
    industry: stored?.industry || normalized.industry,
    businessType: stored?.business_type || normalized.businessType,
    locationCount: Math.max(Number(stored?.location_count) || 0, Number(normalized.locationCount) || 0) || null,
  };
}

async function processProspect({ sql, normalized, dependencies, requestId }) {
  const stored = await dependencies.storeNormalizedProspect(sql, normalized);
  const prospectId = stored.prospect.id;
  await dependencies.appendAudit(sql, {
    actorType: 'provider',
    actorId: normalized.providerId,
    action: stored.created ? 'prospect.discovered' : 'prospect.deduplicated',
    entityType: 'prospect',
    entityId: prospectId,
    newValues: stored.created ? { status: 'discovered', canonicalDomain: normalized.canonicalDomain } : null,
    metadata: { duplicateMatch: stored.duplicateMatch, providerId: normalized.providerId, providerRecordId: normalized.providerRecordId },
    requestId,
  });

  const scoreProspect = prospectForScoring(normalized, stored.prospect);
  const preExclusions = [
    ...localHistoryExclusions(stored.prospect),
    ...(await dependencies.loadExclusions(sql, normalized, [], { prospectId })),
  ];
  if (preExclusions.length) {
    const qualification = dependencies.scoreLead({ prospect: scoreProspect, exclusions: preExclusions });
    await dependencies.saveQualification(sql, prospectId, qualification);
    await dependencies.appendAudit(sql, {
      action: 'prospect.suppressed_before_research', entityType: 'prospect', entityId: prospectId,
      metadata: { exclusionCodes: qualification.exclusionCodes }, requestId,
    });
    return { prospectId, created: stored.created, status: qualification.status, score: qualification.score, exclusions: qualification.exclusionCodes };
  }

  if (!scoreProspect.websiteUrl) {
    const qualification = dependencies.scoreLead({ prospect: scoreProspect, research: {}, contacts: [] });
    await dependencies.saveQualification(sql, prospectId, qualification);
    return { prospectId, created: stored.created, status: qualification.status, score: qualification.score, rejectionReasons: qualification.rejectionReasons };
  }

  let research;
  try {
    const previous = await dependencies.loadLatestResearch(sql, prospectId);
    research = await dependencies.researchWebsite({
      websiteUrl: scoreProspect.websiteUrl,
      previousSnapshot: previous,
      fetchPage: dependencies.fetchPage,
    });
    await dependencies.saveResearch(sql, prospectId, research);
    await dependencies.appendAudit(sql, {
      action: research.contentChanged ? 'prospect.research_updated' : 'prospect.research_cache_reused',
      entityType: 'prospect', entityId: prospectId,
      metadata: {
        contentHash: research.contentHash,
        cacheStatus: research.cacheStatus,
        extractionVersion: research.extractionVersion,
        pagesAnalyzed: research.extractedFacts.pagesAnalyzed,
      },
      requestId,
    });
  } catch (error) {
    const code = redactSecretText(error?.code || 'WEBSITE_RESEARCH_FAILED').slice(0, 100);
    await dependencies.markResearchFailure(sql, prospectId, code);
    const qualification = dependencies.scoreLead({ prospect: scoreProspect, research: {}, contacts: [] });
    await dependencies.saveQualification(sql, prospectId, qualification);
    await dependencies.appendAudit(sql, {
      action: 'prospect.research_failed', entityType: 'prospect', entityId: prospectId,
      metadata: { errorCode: code }, requestId,
    });
    return { prospectId, created: stored.created, status: qualification.status, score: qualification.score, rejectionReasons: qualification.rejectionReasons, researchError: code };
  }

  const assessed = await dependencies.assessEmailCandidates(research.emailCandidates, {
    businessDomain: scoreProspect.canonicalDomain,
    resolveMx: dependencies.resolveMx,
  });
  const contacts = await dependencies.storeContacts(sql, prospectId, assessed);
  const postExclusions = await dependencies.loadExclusions(sql, normalized, assessed, { prospectId });
  const qualification = dependencies.scoreLead({ prospect: scoreProspect, research, contacts, exclusions: postExclusions });
  await dependencies.saveQualification(sql, prospectId, qualification);
  await dependencies.appendAudit(sql, {
    action: 'prospect.deterministically_qualified', entityType: 'prospect', entityId: prospectId,
    newValues: { status: qualification.status, leadScore: qualification.score },
    metadata: {
      qualificationVersion: qualification.qualificationVersion,
      rejectionReasons: qualification.rejectionReasons,
      exclusionCodes: qualification.exclusionCodes,
      publicContactCount: contacts.length,
    },
    requestId,
  });
  return {
    prospectId,
    created: stored.created,
    status: qualification.status,
    score: qualification.score,
    researchCacheStatus: research.cacheStatus,
    contactCount: contacts.length,
    rejectionReasons: qualification.rejectionReasons,
    exclusions: qualification.exclusionCodes,
  };
}

async function runShadowDiscovery(options) {
  const provider = assertProviderAdapter(options.provider);
  if (provider.kind !== 'discovery') throw new TypeError('A discovery provider adapter is required.');
  assertShadowControls(options);
  const request = normalizeDiscoveryRequest(options.request || {});
  if (!request.requestKey) throw discoveryError('DISCOVERY_REQUEST_KEY_REQUIRED', 'Every provider request needs a durable idempotency key.');
  const sql = options.sql;
  if (typeof sql !== 'function') throw new TypeError('A database query function is required.');
  const existingUsage = await (options.loadProviderUsage || repository.loadProviderUsage)(sql, request.requestKey);
  if (existingUsage) {
    return { skipped: true, reason: 'REQUEST_ALREADY_ACCOUNTED', requestKey: request.requestKey, usage: existingUsage, prospects: [] };
  }

  const estimatedCostMicrousd = provider.estimateCost(request);
  const reserve = options.reserveBudget || reserveBudget;
  const commit = options.commitBudget || commitBudget;
  const release = options.releaseBudget || releaseBudget;
  const reservation = await reserve(sql, {
    category: 'discovery',
    providerId: provider.id,
    reservationKey: `discovery:${provider.id}:${request.requestKey}`,
    estimatedCostMicrousd,
    referenceType: 'provider_request',
    usageMetadata: { operation: 'organization_search', requestKey: request.requestKey },
  });
  if (!reservation) throw discoveryError('PROVIDER_BUDGET_EXHAUSTED', 'The local discovery-provider budget is exhausted or disabled.');
  if (reservation.existing === true) {
    return {
      skipped: true,
      reason: 'REQUEST_ALREADY_RESERVED',
      requestKey: request.requestKey,
      usage: { status: reservation.status },
      prospects: [],
    };
  }

  let result;
  try {
    result = assertDiscoveryResult(await provider.execute(request));
    if (result.records.some((record) => record.providerId !== provider.id)) {
      throw discoveryError('PROVIDER_RESULT_ID_MISMATCH', 'The provider returned a record under a different provider identity.');
    }
  } catch (error) {
    await (options.recordProviderUsage || repository.recordProviderUsage)(sql, {
      providerId: provider.id,
      operation: 'organization_search',
      costLedgerId: reservation.id,
      requestCount: 1,
      resultCount: 0,
      estimatedCostMicrousd,
      actualCostMicrousd: null,
      status: 'failed',
      requestKey: request.requestKey,
      metadata: { errorCode: redactSecretText(error?.code || 'PROVIDER_FAILED').slice(0, 100) },
    });
    await release(sql, `discovery:${provider.id}:${request.requestKey}`);
    throw error;
  }

  const actualCostMicrousd = Number.isSafeInteger(result.usage.actualCostMicrousd)
    ? result.usage.actualCostMicrousd
    : result.usage.estimatedCostMicrousd;
  const ledger = await commit(sql, {
    reservationKey: `discovery:${provider.id}:${request.requestKey}`,
    actualCostMicrousd,
    usageMetadata: { resultCount: result.records.length, providerCredits: result.usage.credits || 0 },
  });
  await (options.recordProviderUsage || repository.recordProviderUsage)(sql, {
    providerId: provider.id,
    operation: 'organization_search',
    costLedgerId: ledger?.id || reservation.id,
    requestCount: result.usage.requestCount,
    resultCount: result.usage.resultCount,
    estimatedCostMicrousd: result.usage.estimatedCostMicrousd,
    actualCostMicrousd,
    status: 'completed',
    requestKey: request.requestKey,
    providerCredits: result.usage.credits || 0,
    rateLimitRemaining: result.usage.rateLimitRemaining,
    rateLimitResetAt: result.usage.rateLimitResetAt,
    metadata: { page: request.page, limit: request.limit },
  });

  const dependencies = {
    ...repository,
    appendAudit,
    loadExclusions,
    researchWebsite,
    assessEmailCandidates,
    scoreLead,
    ...options.dependencies,
  };
  const prospects = [];
  const seen = new Set();
  for (const normalized of result.records.slice(0, request.limit)) {
    const key = normalized.providerRecordId
      ? `${normalized.providerId}:${normalized.providerRecordId}`
      : normalized.dedupeFingerprint;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    prospects.push(await processProspect({ sql, normalized, dependencies, requestId: request.requestKey }));
  }
  return {
    skipped: false,
    requestKey: request.requestKey,
    providerId: provider.id,
    usage: { ...result.usage, actualCostMicrousd },
    prospects,
  };
}

module.exports = {
  assertShadowControls,
  localHistoryExclusions,
  prospectForScoring,
  processProspect,
  runShadowDiscovery,
};
