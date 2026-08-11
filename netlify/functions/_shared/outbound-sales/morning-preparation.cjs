'use strict';

const crypto = require('node:crypto');
const { createApolloAdapter } = require('./providers/apollo.cjs');
const { processProspect } = require('./discovery.cjs');
const discoveryRepository = require('./discovery-repository.cjs');
const morningRepository = require('./morning-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { loadExclusions } = require('./exclusions.cjs');
const { researchWebsite } = require('./research.cjs');
const { assessEmailCandidates } = require('./email.cjs');
const { scoreLead } = require('./qualification.cjs');
const { renderOutboundEmailPreview, SIGNATURE } = require('./personalization-template.cjs');
const { prepareCompanyMockup } = require('./company-mockup.cjs');
const { redactSecretText } = require('./security.cjs');

const MORNING_TARGET = 70;
const MORNING_PREPARATION_POOL = 210;
const MORNING_FINALIZER_BUDGET_MS = 12 * 60 * 1000;
const MORNING_SHARD_COUNT = 8;
const MORNING_COHORTS = Object.freeze([
  Object.freeze({ keywords: ['trade show', 'exhibitor', 'conference', 'expo'], jobTitles: ['events', 'trade show', 'marketing'] }),
  Object.freeze({ keywords: ['festival', 'grand opening', 'event venue', 'promotion'], jobTitles: ['events', 'marketing', 'operations'] }),
  Object.freeze({ keywords: ['construction', 'real estate', 'retail', 'hospitality'], jobTitles: ['owner', 'marketing', 'operations'] }),
  Object.freeze({ keywords: ['school', 'nonprofit', 'sports', 'restaurant'], jobTitles: ['owner', 'events', 'marketing'] }),
]);

function businessDate(now = new Date(), timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function safeErrorCode(error) {
  return redactSecretText(error?.code || 'MORNING_PREPARATION_FAILED').replace(/[^A-Z0-9_.-]/gi, '').slice(0, 100) || 'MORNING_PREPARATION_FAILED';
}

function assertMorningConfiguration(env = process.env) {
  const issues = [];
  if (env.OUTBOUND_MORNING_PREP_ENABLED !== 'true') issues.push('MORNING_PREP_DISABLED');
  if (String(env.OUTBOUND_APOLLO_API_KEY || '').trim().length < 12) issues.push('APOLLO_NOT_CONFIGURED');
  if (env.OUTBOUND_APOLLO_ENRICH_CONTACTS !== 'true') issues.push('APOLLO_CONTACT_ENRICHMENT_DISABLED');
  if (Math.max(0, Number(env.OUTBOUND_MORNING_APOLLO_DAILY_CREDIT_LIMIT) || 0) < 1) issues.push('MORNING_PROVIDER_BUDGET_NOT_CONFIGURED');
  if (String(env.OUTBOUND_MORNING_PREP_SECRET || '').trim().length < 32) issues.push('MORNING_PREP_SECRET_NOT_CONFIGURED');
  if (issues.length) {
    const error = new Error('Morning lead preparation is not fully configured.');
    error.code = issues[0];
    error.issues = issues;
    throw error;
  }
  return {
    dailyCreditLimit: Math.max(1, Math.floor(Number(env.OUTBOUND_MORNING_APOLLO_DAILY_CREDIT_LIMIT))),
  };
}

function discoveryPageForDate(date, shardIndex) {
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / 86400000);
  return 1 + ((Math.max(0, day) + (Math.max(0, Number(shardIndex) || 0) * 127)) % 500);
}

function morningDiscoveryRequest(date, shardIndex) {
  const safeShardIndex = Math.max(0, Math.min(MORNING_SHARD_COUNT - 1, Number(shardIndex) || 0));
  const cohortIndex = safeShardIndex % MORNING_COHORTS.length;
  const cohort = MORNING_COHORTS[cohortIndex];
  return {
    locations: ['United States'],
    keywords: cohort.keywords,
    employeeRanges: ['5,500'],
    jobTitles: cohort.jobTitles,
    page: discoveryPageForDate(date, safeShardIndex),
    limit: 30,
    requestKey: `morning:${date}:apollo:${safeShardIndex}`,
  };
}

function discoveryDependencies(overrides = {}) {
  return {
    ...discoveryRepository,
    appendAudit,
    loadExclusions,
    researchWebsite,
    assessEmailCandidates,
    scoreLead,
    ...overrides,
  };
}

async function runMorningDiscoveryShard(options) {
  const env = options.env || process.env;
  const config = assertMorningConfiguration(env);
  const sql = options.sql;
  const repository = { ...morningRepository, ...(options.dependencies?.repository || {}) };
  const date = options.businessDate || businessDate(options.now);
  const batch = options.batch || await repository.ensureMorningBatch(sql, {
    businessDate: date, targetCount: MORNING_TARGET, providerId: 'apollo',
  });
  if (!batch) throw Object.assign(new Error('Morning batch could not be created.'), { code: 'MORNING_BATCH_NOT_CREATED' });
  if (batch.status === 'ready') return { skipped: true, reason: 'BATCH_ALREADY_READY', batchId: batch.id, externalEmailsSent: 0 };
  const request = morningDiscoveryRequest(date, options.shardIndex);
  const shard = await repository.claimMorningShard(sql, {
    batchId: batch.id, shardKey: `apollo-${Math.max(0, Number(options.shardIndex) || 0)}`, requestKey: request.requestKey,
  });
  if (!shard) return { skipped: true, reason: 'SHARD_ALREADY_CLAIMED', batchId: batch.id, externalEmailsSent: 0 };
  const provider = (options.dependencies?.createApolloAdapter || createApolloAdapter)({
    env, fetchImpl: options.dependencies?.fetch || globalThis.fetch, allowMorningPreparation: true,
  });
  const reservedCredits = provider.estimateCredits(request);
  const reservation = await repository.reserveMorningProviderCredits(sql, {
    batchId: batch.id, credits: reservedCredits, dailyLimit: config.dailyCreditLimit,
  });
  if (!reservation) {
    await repository.failMorningShard(sql, { shardId: shard.id, errorCode: 'MORNING_PROVIDER_DAILY_LIMIT' });
    throw Object.assign(new Error('The configured morning Apollo credit limit would be exceeded.'), { code: 'MORNING_PROVIDER_DAILY_LIMIT' });
  }
  let usedCredits = 0;
  let requestCount = 0;
  try {
    const providerResult = await provider.execute(request);
    usedCredits = Math.max(0, Number(providerResult.usage?.credits) || 0);
    requestCount = Math.max(1, Number(providerResult.usage?.requestCount) || 1);
    const dependencies = discoveryDependencies(options.dependencies?.discovery || {});
    const results = new Array(providerResult.records.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, providerResult.records.length) }, async () => {
      while (cursor < providerResult.records.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await (options.dependencies?.processProspect || processProspect)({
            sql, normalized: providerResult.records[index], dependencies, requestId: request.requestKey,
          });
        } catch (error) {
          results[index] = { errorCode: safeErrorCode(error), created: false };
        }
      }
    });
    await Promise.all(workers);
    const createdIds = results.filter((result) => result?.created === true && result.prospectId).map((result) => result.prospectId);
    const attachedIds = await repository.attachMorningProspects(sql, {
      batchId: batch.id, businessDate: date, prospectIds: createdIds, discoveredCount: providerResult.records.length,
    });
    await repository.settleMorningProviderCredits(sql, {
      batchId: batch.id, reservedCredits, usedCredits, requestCount,
    });
    await repository.completeMorningShard(sql, {
      shardId: shard.id, discoveredCount: providerResult.records.length,
      newProspectCount: attachedIds.length, providerCreditsUsed: usedCredits,
    });
    await (options.dependencies?.appendAudit || appendAudit)(sql, {
      actorType: 'system', actorId: 'morning-preparation',
      action: 'morning_queue.discovery_shard_completed', entityType: 'morning_batch', entityId: batch.id,
      metadata: { requestKey: request.requestKey, discovered: providerResult.records.length, fresh: attachedIds.length, providerCreditsUsed: usedCredits, externalEmailsSent: 0 },
      requestId: options.requestId || null,
    }).catch(() => null);
    return {
      skipped: false, batchId: batch.id, discoveredCount: providerResult.records.length,
      newProspectCount: attachedIds.length, providerCreditsUsed: usedCredits, externalEmailsSent: 0,
    };
  } catch (error) {
    await repository.settleMorningProviderCredits(sql, {
      batchId: batch.id, reservedCredits, usedCredits, requestCount,
    }).catch(() => null);
    await repository.failMorningShard(sql, { shardId: shard.id, errorCode: safeErrorCode(error) }).catch(() => null);
    throw error;
  }
}

function firstName(fullName) {
  const value = String(fullName || '').replace(/[^\p{L}\p{M}'’ -]/gu, ' ').replace(/\s+/g, ' ').trim();
  return value.split(' ')[0]?.slice(0, 60) || 'there';
}

function buildMorningMessage(candidate) {
  const company = String(candidate.prospect.businessName || '').replace(/\s+/g, ' ').trim();
  if (!company || company.length > 150) throw Object.assign(new Error('Company name is unsuitable for personalization.'), { code: 'MORNING_COMPANY_NAME_INVALID' });
  const industry = String(candidate.prospect.industry || candidate.prospect.businessType || 'business').replace(/\s+/g, ' ').trim().slice(0, 100);
  const hasEventSignal = /trade[ _-]?show|conference|expo|exhibit|event|festival|tournament|gala|opening/i.test(
    JSON.stringify(candidate.prospect.qualificationEvidence || []),
  );
  const context = hasEventSignal
    ? 'while researching businesses with upcoming event and promotional needs'
    : `while researching growing ${industry.toLowerCase()} organizations`;
  const subject = `${company} — a quick banner mockup using your brand`;
  const bodyText = [
    `Hi ${firstName(candidate.contact.fullName)},`,
    `I came across ${company} ${context}. This is just a quick mockup using ${company}’s public branding to show one way the brand could look on a printed banner.`,
    'Banners On The Fly produces premium banners, signs, and magnets with fast turnaround and free Next-Day Air shipping after production.',
    'Use code NEW20 to save 20% on your first order whenever you’re ready.',
    SIGNATURE,
  ].join('\n\n');
  const sourceUrls = [...new Set(candidate.research.sourceUrls.filter(Boolean))].slice(0, 10);
  const evidence = (candidate.prospect.qualificationEvidence || []).slice(0, 5);
  const contentHash = crypto.createHash('sha256').update(JSON.stringify({ company, subject, bodyText, research: candidate.research.contentHash })).digest('hex');
  return {
    prospectId: candidate.prospect.id,
    contactId: candidate.contact.id,
    subject,
    bodyText,
    bodyHtml: renderOutboundEmailPreview({ subject, bodyText, businessName: company }),
    researchSummary: `Personalized from verified public branding and ${hasEventSignal ? 'grounded event/promotional evidence' : `the disclosed ${industry} business context`}.`,
    personalizationEvidence: evidence,
    sourceUrls,
    generationKey: `morning:${candidate.prospect.id}:${candidate.research.contentHash}:${contentHash}`,
    researchContentHash: candidate.research.contentHash,
    contentHash,
  };
}

async function runMorningFinalizer(options) {
  const env = options.env || process.env;
  assertMorningConfiguration(env);
  const sql = options.sql;
  const repository = { ...morningRepository, ...(options.dependencies?.repository || {}) };
  const date = options.businessDate || businessDate(options.now);
  const batch = options.batch || await repository.ensureMorningBatch(sql, {
    businessDate: date, targetCount: MORNING_TARGET, providerId: 'apollo',
  });
  if (!batch) throw Object.assign(new Error('Morning batch could not be loaded.'), { code: 'MORNING_BATCH_NOT_CREATED' });
  const candidates = await repository.listMorningPreparationCandidates(sql, {
    batchId: batch.id, limit: MORNING_PREPARATION_POOL,
  });
  const clock = options.dependencies?.clock || Date.now;
  const startedAt = clock();
  const timeBudgetMs = Math.max(30_000, Math.min(
    MORNING_FINALIZER_BUDGET_MS,
    Number(options.timeBudgetMs) || MORNING_FINALIZER_BUDGET_MS,
  ));
  let cursor = 0;
  let messageReady = 0;
  let mockupReady = 0;
  const failures = [];
  const workers = Array.from({ length: Math.min(4, candidates.length) }, async () => {
    while (cursor < candidates.length && mockupReady < MORNING_TARGET
        && clock() - startedAt < timeBudgetMs) {
      const candidate = candidates[cursor];
      cursor += 1;
      try {
        const message = buildMorningMessage(candidate);
        const saved = await repository.saveDeterministicMorningMessage(sql, message);
        if (!saved) throw Object.assign(new Error('Message was not persisted.'), { code: 'MORNING_MESSAGE_SAVE_CONFLICT' });
        messageReady += 1;
        const mockup = await (options.dependencies?.prepareCompanyMockup || prepareCompanyMockup)({
          sql, prospectId: candidate.prospect.id, force: false, preferCachedReady: true,
          store: options.store, sharp: options.sharp || options.dependencies?.sharp, dependencies: options.dependencies?.mockup,
        });
        const mockupStatus = mockup?.status || mockup?.row?.status || (mockup?.sendReady ? 'ready' : 'fallback');
        if (!mockup || mockup.prospectId !== candidate.prospect.id || mockupStatus !== 'ready'
            || mockup.qualityLevel !== 'logo_and_product' || mockup.sendReady !== true
            || mockup.compositionAudit?.passed !== true
            || mockup.compositionAudit?.noClipGuaranteed !== true
            || mockup.plan?.messageContentHash !== message.contentHash) {
          throw Object.assign(new Error('Mockup identity or status did not pass.'), { code: 'MORNING_MOCKUP_NOT_READY' });
        }
        mockupReady += 1;
      } catch (error) {
        failures.push({ prospectId: candidate.prospect.id, errorCode: safeErrorCode(error) });
      }
    }
  });
  await Promise.all(workers);
  const timeBudgetReached = mockupReady < MORNING_TARGET
    && cursor < candidates.length
    && clock() - startedAt >= timeBudgetMs;
  const finalized = await repository.finalizeMorningBatch(sql, {
    batchId: batch.id, targetCount: MORNING_TARGET,
    lastErrorCode: mockupReady >= MORNING_TARGET
      ? null
      : timeBudgetReached ? 'MORNING_PREPARATION_TIME_BUDGET'
      : failures.length ? failures[0].errorCode : candidates.length < MORNING_TARGET ? 'MORNING_TARGET_NOT_REACHED' : null,
  });
  await (options.dependencies?.appendAudit || appendAudit)(sql, {
    actorType: 'system', actorId: 'morning-preparation',
    action: 'morning_queue.preparation_completed', entityType: 'morning_batch', entityId: batch.id,
    newValues: { status: finalized.batch?.status, readyCount: finalized.readyCount },
    metadata: { candidates: candidates.length, processed: cursor, messageReady, mockupReady, failed: failures.length, timeBudgetReached, externalEmailsSent: 0, manualSendingOnly: true },
    requestId: options.requestId || null,
  }).catch(() => null);
  return {
    batchId: batch.id, status: finalized.batch?.status, readyCount: finalized.readyCount,
    messageReady, mockupReady, failed: failures.length, timeBudgetReached, externalEmailsSent: 0,
  };
}

module.exports = {
  MORNING_TARGET,
  MORNING_PREPARATION_POOL,
  MORNING_FINALIZER_BUDGET_MS,
  MORNING_SHARD_COUNT,
  MORNING_COHORTS,
  businessDate,
  assertMorningConfiguration,
  discoveryPageForDate,
  morningDiscoveryRequest,
  buildMorningMessage,
  runMorningDiscoveryShard,
  runMorningFinalizer,
};
