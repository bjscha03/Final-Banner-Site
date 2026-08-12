'use strict';

const crypto = require('node:crypto');
const eventData = require('./data/atlanta-shoe-market-2026-08.json');
const { normalizeProviderProspect, canonicalDomain } = require('./providers/contract.cjs');
const { processProspect } = require('./discovery.cjs');
const discoveryRepository = require('./discovery-repository.cjs');
const morningRepository = require('./morning-repository.cjs');
const eventRepository = require('./event-import-repository.cjs');
const { appendAudit } = require('./audit.cjs');
const { loadExclusions } = require('./exclusions.cjs');
const { researchWebsite } = require('./research.cjs');
const { assessEmailCandidates, normalizeEmail } = require('./email.cjs');
const { scoreLead, clampScore, QUALIFIED_SCORE } = require('./qualification.cjs');
const { runMorningFinalizer, MORNING_TARGET } = require('./morning-preparation.cjs');
const { redactSecretText } = require('./security.cjs');

const EVENT_PROVIDER_ID = 'manual_event_research';
const EVENT_SCORE_POINTS = 25;
const EVENT_IMPORT_SHARD_SIZE = 15;
const EVENT_FINALIZER_BUDGET_MS = 4 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeErrorCode(error) {
  return redactSecretText(error?.code || 'EVENT_IMPORT_FAILED')
    .toUpperCase().replace(/[^A-Z0-9_.-]/g, '_').slice(0, 100) || 'EVENT_IMPORT_FAILED';
}

function clean(value, maxLength = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function websiteOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return null;
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

function eventEvidence(event, record) {
  const company = clean(record.company, 300);
  const booths = clean(record.booths, 120);
  return Object.freeze({
    code: 'confirmed_trade_show_exhibitor',
    label: `${event.name} exhibitor`,
    evidence: `${company} is listed for ${event.dateLabel} in ${booths.toLowerCase().startsWith('booth') ? '' : 'booth '}${booths}.`,
    sourceUrl: event.officialListingUrl,
    eventName: event.name,
    eventStartDate: event.startDate,
    eventEndDate: event.endDate,
    eventDateLabel: event.dateLabel,
    booth: booths,
  });
}

function validateEventDefinition(event = eventData) {
  if (!event || typeof event !== 'object' || !Array.isArray(event.records)) {
    throw Object.assign(new Error('Event import data is unavailable.'), { code: 'EVENT_IMPORT_DATA_INVALID' });
  }
  if (!/^[a-z0-9][a-z0-9-]{4,79}$/.test(String(event.key || ''))
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(event.startDate || ''))
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(event.endDate || ''))
      || !websiteOrigin(event.officialListingUrl) || !websiteOrigin(event.officialDatesUrl)
      || event.sourceDataset !== 'recovered-leads/unique-outreach.json'
      || !/^[a-f0-9]{64}$/.test(String(event.sourceDatasetSha256 || ''))
      || Number(event.targetCount) !== MORNING_TARGET
      || Number(event.primaryRecordCount) !== MORNING_TARGET
      || event.records.length < MORNING_TARGET || event.records.length > 210) {
    throw Object.assign(new Error('Event import metadata is invalid.'), { code: 'EVENT_IMPORT_DATA_INVALID' });
  }
  const companies = new Set();
  const emails = new Set();
  const domains = new Set();
  const ranks = new Set();
  const records = event.records.map((record) => {
    const company = clean(record.company, 300);
    const email = normalizeEmail(record.email);
    const sourceUrl = clean(record.contactSourceUrl, 2048);
    const websiteUrl = websiteOrigin(sourceUrl);
    const pageDomain = canonicalDomain(websiteUrl);
    const emailDomain = email?.split('@')[1] || null;
    const domainMatches = Boolean(pageDomain && emailDomain && (
      pageDomain === emailDomain || pageDomain.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${pageDomain}`)
    ));
    const domain = domainMatches ? emailDomain : null;
    const booths = clean(record.booths, 120);
    const rank = Math.max(1, Math.min(9999, Number(record.rank) || 9999));
    if (!company || !email || !websiteUrl || !domainMatches || !booths
        || companies.has(company.toLowerCase()) || emails.has(email) || domains.has(domain)
        || ranks.has(rank)) {
      throw Object.assign(new Error('An event lead failed source validation.'), { code: 'EVENT_IMPORT_RECORD_INVALID' });
    }
    companies.add(company.toLowerCase());
    emails.add(email);
    domains.add(domain);
    ranks.add(rank);
    return Object.freeze({
      rank,
      company,
      email,
      websiteUrl,
      contactSourceUrl: sourceUrl,
      canonicalDomain: domain,
      booths,
      relatedCompanies: clean(record.relatedCompanies, 600) || company,
    });
  });
  if (records.some((record, index) => record.rank !== index + 1)) {
    throw Object.assign(new Error('Event records must remain in stable rank order.'), { code: 'EVENT_IMPORT_RECORD_INVALID' });
  }
  return Object.freeze({ ...event, records: Object.freeze(records) });
}

function normalizedEventProspect(event, record) {
  return normalizeProviderProspect(EVENT_PROVIDER_ID, {
    providerRecordId: `${event.key}:${record.canonicalDomain}`,
    sourceUrl: event.officialListingUrl,
    businessName: record.company,
    websiteUrl: record.websiteUrl,
    canonicalDomain: record.canonicalDomain,
    phone: null,
    industry: event.industry || 'Footwear',
    businessType: `${event.industry || 'Footwear'} brand and ${event.name} exhibitor`,
    contactCandidates: [{ email: record.email, sourceUrl: record.contactSourceUrl }],
    providerMetadata: {
      sourceType: 'curated_official_event_listing',
      sourceDataVersion: event.version,
      sourceDatasetSha256: event.sourceDatasetSha256,
      eventKey: event.key,
      eventRank: record.rank,
      eventName: event.name,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      eventDateLabel: event.dateLabel,
      booths: record.booths,
      relatedCompanies: record.relatedCompanies,
      officialListingUrl: event.officialListingUrl,
      officialDatesUrl: event.officialDatesUrl,
      phoneVerified: false,
      namedContactVerified: false,
    },
  });
}

function withTrustedEventResearch(research, event, record) {
  const evidence = eventEvidence(event, record);
  const sourceUrls = [...new Set([
    ...(research.sourceUrls || []),
    record.contactSourceUrl,
    event.officialListingUrl,
    event.officialDatesUrl,
  ].filter(Boolean))].slice(0, 20);
  const bannerNeedSignals = [
    ...(research.bannerNeedSignals || []).filter((signal) => signal?.code !== 'upcoming_events'),
    {
      code: 'upcoming_events',
      label: 'Confirmed upcoming trade-show appearance',
      evidence: evidence.evidence,
      sourceUrl: event.officialListingUrl,
    },
  ];
  return {
    ...research,
    contentHash: sha256(JSON.stringify({
      websiteContentHash: research.contentHash,
      eventKey: event.key,
      eventVersion: event.version,
      company: record.company,
      booths: record.booths,
    })),
    sourceUrls,
    evidence: [...(research.evidence || []), evidence],
    bannerNeedSignals,
  };
}

function scoreEventLead(input, event, record, baseScoreLead = scoreLead) {
  const scored = baseScoreLead(input);
  if (scored.status === 'suppressed' || (scored.exclusionCodes || []).length) return scored;
  const evidence = eventEvidence(event, record);
  const score = clampScore(scored.score + EVENT_SCORE_POINTS);
  const rejectionReasons = (scored.rejectionReasons || []).filter((reason) => (
    reason !== 'LEAD_SCORE_BELOW_THRESHOLD' || score < QUALIFIED_SCORE
  ));
  const qualified = score >= QUALIFIED_SCORE && Boolean(input.research?.contentHash);
  const ready = qualified && rejectionReasons.length === 0;
  return Object.freeze({
    ...scored,
    score,
    status: ready ? 'ready_for_outreach' : qualified ? 'qualified' : 'rejected',
    qualified,
    outreachCandidate: ready,
    breakdown: { ...scored.breakdown, confirmed_trade_show_exhibitor: EVENT_SCORE_POINTS },
    explanations: [
      ...(scored.explanations || []),
      {
        factor: 'confirmed_trade_show_exhibitor',
        points: EVENT_SCORE_POINTS,
        label: `${event.name} exhibitor`,
        detail: evidence.evidence,
        sourceUrls: [event.officialListingUrl],
      },
    ],
    evidence: [...(scored.evidence || []), evidence],
    rejectionReasons,
  });
}

async function ensureExistingResearch(sql, prospect, event, record, dependencies) {
  const previous = await dependencies.loadLatestResearch(sql, prospect.id);
  if (previous?.contentHash && previous.evidence?.some((item) => (
    item?.eventName === event.name && item?.booth === record.booths
      && item?.eventStartDate === event.startDate && item?.eventEndDate === event.endDate
  ))) return previous;
  const researched = await dependencies.researchWebsite({
    websiteUrl: prospect.website_url,
    previousSnapshot: previous,
    fetchPage: dependencies.fetchPage,
  });
  const enriched = withTrustedEventResearch(researched, event, record);
  await dependencies.saveResearch(sql, prospect.id, enriched);
  return enriched;
}

function eventDependencies(options = {}) {
  return {
    repository: {
      ...discoveryRepository,
      ...morningRepository,
      ...eventRepository,
      ...(options.dependencies?.repository || {}),
    },
    discovery: {
      ...discoveryRepository,
      appendAudit,
      loadExclusions,
      researchWebsite,
      assessEmailCandidates,
      scoreLead,
      ...(options.dependencies?.discovery || {}),
    },
  };
}

function assertBusinessDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw Object.assign(new Error('A business date is required.'), { code: 'EVENT_IMPORT_DATE_INVALID' });
  }
  return String(value);
}

async function refreshExistingEventProspect({
  sql, existing, normalized, event, record, repository, dependencies, requestId,
}) {
  await repository.attachProspectSource(sql, existing.id, normalized);
  await repository.mergeEventProspectMetadata(sql, {
    prospectId: existing.id, providerMetadata: normalized.providerMetadata,
  });
  if (existing.first_contacted_at || existing.prior_customer_match || existing.suppression_reason
      || (existing.exclusion_codes || []).length) {
    return { prospectId: existing.id, status: 'excluded', created: false };
  }
  const research = await ensureExistingResearch(sql, existing, event, record, dependencies);
  const assessed = await dependencies.assessEmailCandidates(normalized.contactCandidates, {
    businessDomain: existing.canonical_domain || normalized.canonicalDomain,
    resolveMx: dependencies.resolveMx,
  });
  if (!assessed[0]) {
    throw Object.assign(new Error('The sourced event contact could not be assessed.'), { code: 'EVENT_CONTACT_INVALID' });
  }
  const savedContact = await repository.upsertEventContact(sql, {
    prospectId: existing.id,
    contact: assessed[0],
  });
  if (!savedContact) {
    throw Object.assign(new Error('The sourced contact conflicts with another company.'), { code: 'EVENT_CONTACT_DEDUPE_CONFLICT' });
  }
  const contacts = await repository.listActiveProspectContacts(sql, existing.id);
  const exclusions = await dependencies.loadExclusions(sql, normalized, assessed, { prospectId: existing.id });
  const qualification = scoreEventLead({
    prospect: {
      ...normalized,
      websiteUrl: existing.website_url || normalized.websiteUrl,
      canonicalDomain: existing.canonical_domain || normalized.canonicalDomain,
      industry: existing.industry || normalized.industry,
      businessType: existing.business_type || normalized.businessType,
      locationCount: existing.location_count || normalized.locationCount,
    },
    research,
    contacts,
    exclusions,
  }, event, record, dependencies.scoreLead);
  await dependencies.saveQualification(sql, existing.id, qualification);
  await dependencies.appendAudit(sql, {
    actorType: 'system', actorId: 'event-import',
    action: 'prospect.event_source_revalidated', entityType: 'prospect', entityId: existing.id,
    newValues: { status: qualification.status, leadScore: qualification.score },
    metadata: {
      eventKey: event.key, sourceDataVersion: event.version, eventRank: record.rank,
      mxStatus: assessed[0].mxStatus, phoneVerified: false, namedContactVerified: false,
      externalEmailsSent: 0,
    },
    requestId,
  }).catch(() => null);
  return { prospectId: existing.id, status: qualification.status, created: false };
}

async function runEventImportShard(options = {}) {
  const sql = options.sql;
  if (typeof sql !== 'function') throw new TypeError('A database query function is required.');
  const event = validateEventDefinition(options.eventData || eventData);
  const businessDate = assertBusinessDate(options.businessDate);
  const shardCount = Math.ceil(event.records.length / EVENT_IMPORT_SHARD_SIZE);
  const shardIndex = Number(options.shardIndex);
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw Object.assign(new Error('The event import shard is invalid.'), { code: 'EVENT_IMPORT_SHARD_INVALID' });
  }
  const { repository, discovery: dependencies } = eventDependencies(options);
  const batch = await repository.ensureEventBatch(sql, {
    businessDate, eventKey: event.key, targetCount: MORNING_TARGET, providerId: EVENT_PROVIDER_ID,
  });
  if (!batch) throw Object.assign(new Error('Morning batch could not be created.'), { code: 'MORNING_BATCH_NOT_CREATED' });
  const shardKey = `event:${event.key}:import:${event.version}:${shardIndex}`.slice(0, 80);
  const requestKey = `event-import:${event.key}:${event.version}:${businessDate}:${shardIndex}`;
  const shard = await repository.claimMorningShard(sql, { batchId: batch.id, shardKey, requestKey });
  if (!shard) {
    const existingShard = await repository.loadMorningShard(sql, { batchId: batch.id, shardKey });
    return {
      skipped: true, eventKey: event.key, batchId: batch.id, shardIndex, shardCount,
      shardStatus: existingShard?.status || 'unknown', externalEmailsSent: 0,
    };
  }
  const records = event.records.slice(
    shardIndex * EVENT_IMPORT_SHARD_SIZE,
    (shardIndex + 1) * EVENT_IMPORT_SHARD_SIZE,
  );
  await repository.recordEventProgress(sql, {
    batchId: batch.id, status: 'discovering',
    metadata: {
      phase: 'importing', eventKey: event.key, sourceDataVersion: event.version,
      sourceDatasetSha256: event.sourceDatasetSha256,
      sourceRecordCount: event.records.length, primaryRecordCount: event.primaryRecordCount,
      reserveRecordCount: event.records.length - event.primaryRecordCount,
      importShardCount: shardCount, activeImportShard: shardIndex,
      manualSendingOnly: true, externalEmailsSent: 0,
    },
  });
  const candidateIds = new Set();
  const failures = [];
  let created = 0;
  let reused = 0;
  let excluded = 0;
  let cursor = 0;
  try {
    const workers = Array.from({ length: Math.min(4, records.length) }, async () => {
      while (cursor < records.length) {
        const record = records[cursor];
        cursor += 1;
        try {
          const normalized = normalizedEventProspect(event, record);
          const existing = await repository.findDuplicateProspect(sql, normalized);
          let result;
          if (existing) {
            result = await refreshExistingEventProspect({
              sql, existing, normalized, event, record, repository, dependencies, requestId: requestKey,
            });
          } else {
            const perRecordDependencies = {
              ...dependencies,
              researchWebsite: async (input) => withTrustedEventResearch(
                await dependencies.researchWebsite(input), event, record,
              ),
              scoreLead: (input) => scoreEventLead(input, event, record, dependencies.scoreLead),
            };
            result = await (options.dependencies?.processProspect || processProspect)({
              sql, normalized, dependencies: perRecordDependencies, requestId: requestKey,
            });
          }
          if (result?.prospectId && ['qualified', 'ready_for_outreach'].includes(result.status)) {
            candidateIds.add(result.prospectId);
            if (result.created) created += 1;
            else reused += 1;
          } else if (result?.status === 'excluded' || result?.prospectId) {
            excluded += 1;
          }
        } catch (error) {
          failures.push({ rank: record.rank, code: safeErrorCode(error) });
        }
      }
    });
    await Promise.all(workers);
    if (failures.length === records.length) {
      throw Object.assign(new Error('Every record in the event import shard failed.'), {
        code: 'EVENT_IMPORT_SHARD_ALL_RECORDS_FAILED',
      });
    }
    const attachedIds = await repository.attachEventProspects(sql, {
      batchId: batch.id, businessDate, eventKey: event.key, prospectIds: [...candidateIds],
    });
    await repository.completeMorningShard(sql, {
      shardId: shard.id, discoveredCount: records.length,
      newProspectCount: attachedIds.length, providerCreditsUsed: 0,
    });
    const counts = await repository.refreshEventImportCounts(sql, {
      batchId: batch.id, eventKey: event.key, sourceDataVersion: event.version,
    });
    const result = {
      skipped: false, eventKey: event.key, sourceDataVersion: event.version,
      batchId: batch.id, shardIndex, shardCount, discoveredCount: records.length,
      candidateCount: candidateIds.size, attachedCount: attachedIds.length,
      createdCount: created, reusedCount: reused, excludedCount: excluded,
      failedImportCount: failures.length, failedImportCodes: failures.slice(0, 20),
      totalDiscoveredCount: Number(counts?.discovered_count) || 0,
      totalAttachedCount: Number(counts?.new_prospect_count) || 0,
      shardStatus: 'succeeded', externalEmailsSent: 0, manualSendingOnly: true,
    };
    await (options.dependencies?.appendAudit || appendAudit)(sql, {
      actorType: 'system', actorId: 'event-import',
      action: 'morning_queue.event_import_shard_completed',
      entityType: 'morning_batch', entityId: batch.id,
      metadata: result, requestId: options.requestId || requestKey,
    }).catch(() => null);
    return result;
  } catch (error) {
    const code = safeErrorCode(error);
    await repository.failMorningShard(sql, { shardId: shard.id, errorCode: code }).catch(() => null);
    await repository.recordEventProgress(sql, {
      batchId: batch.id, status: 'failed', lastErrorCode: code,
      metadata: {
        phase: 'import_failed', failedShard: shardIndex,
        failedImportCount: failures.length, failedImportCodes: failures.slice(0, 20),
        externalEmailsSent: 0,
      },
    }).catch(() => null);
    throw error;
  }
}

async function runEventFinalizer(options = {}) {
  const sql = options.sql;
  if (typeof sql !== 'function') throw new TypeError('A database query function is required.');
  const event = validateEventDefinition(options.eventData || eventData);
  const businessDate = assertBusinessDate(options.businessDate);
  const { repository } = eventDependencies(options);
  const batch = await repository.ensureEventBatch(sql, {
    businessDate, eventKey: event.key, targetCount: MORNING_TARGET, providerId: EVENT_PROVIDER_ID,
  });
  if (!batch) throw Object.assign(new Error('Morning batch could not be created.'), { code: 'MORNING_BATCH_NOT_CREATED' });
  const shardCount = Math.ceil(event.records.length / EVENT_IMPORT_SHARD_SIZE);
  const importStatus = await repository.loadEventBatchStatus(sql, {
    businessDate, eventKey: event.key, sourceDataVersion: event.version,
  });
  if (Number(importStatus?.import_shard_count) !== shardCount
      || Number(importStatus?.completed_import_shard_count) !== shardCount
      || Number(importStatus?.failed_import_shard_count) !== 0) {
    throw Object.assign(new Error('The active event import has not completed safely.'), {
      code: 'EVENT_IMPORT_INCOMPLETE',
    });
  }
  await repository.recordEventProgress(sql, {
    batchId: batch.id, status: 'preparing', lastErrorCode: null,
    metadata: {
      phase: 'preparing', eventKey: event.key, sourceDataVersion: event.version,
      finalizerPass: Math.max(0, Number(options.finalizerPass) || 0),
      manualSendingOnly: true, externalEmailsSent: 0,
    },
  });
  const finalizer = await (options.dependencies?.runMorningFinalizer || runMorningFinalizer)({
    sql, env: options.env || process.env, businessDate, batch,
    requireProviderConfiguration: false, expectedBatchKey: repository.eventBatchKey(event.key),
    timeBudgetMs: options.timeBudgetMs || EVENT_FINALIZER_BUDGET_MS,
    dependencies: {
      repository: {
        ...repository,
        listMorningPreparationCandidates: (query, input) => repository.listEventPreparationCandidates(
          query, { ...input, eventKey: event.key },
        ),
        finalizeMorningBatch: (query, input) => repository.finalizeEventBatch(
          query, { ...input, eventKey: event.key },
        ),
      },
      appendAudit: options.dependencies?.appendAudit || appendAudit,
      clock: options.dependencies?.clock,
    },
  });
  const result = {
    eventKey: event.key, sourceDataVersion: event.version, batchId: batch.id,
    status: finalizer.status, readyCount: finalizer.readyCount,
    candidateCount: finalizer.candidateCount, processedCount: finalizer.processedCount,
    messageReadyCount: finalizer.messageReady, mockupReadyCount: finalizer.mockupReady,
    draftFailureCount: finalizer.failed, timeBudgetReached: finalizer.timeBudgetReached,
    finalizerPass: Math.max(0, Number(options.finalizerPass) || 0),
    externalEmailsSent: 0, manualSendingOnly: true,
  };
  await repository.recordEventProgress(sql, {
    batchId: batch.id, status: result.status || 'partial',
    lastErrorCode: result.readyCount >= MORNING_TARGET
      ? null
      : result.timeBudgetReached ? 'EVENT_PREPARATION_CHECKPOINT' : 'EVENT_TARGET_NOT_REACHED',
    metadata: {
      phase: result.readyCount >= MORNING_TARGET ? 'ready' : 'partial',
      finalizerPass: result.finalizerPass, readyCount: result.readyCount,
      candidateCount: result.candidateCount, processedCount: result.processedCount,
      failedCount: result.draftFailureCount, externalEmailsSent: 0,
    },
  });
  await (options.dependencies?.appendAudit || appendAudit)(sql, {
    actorType: 'system', actorId: 'event-import',
    action: 'morning_queue.event_preparation_checkpoint',
    entityType: 'morning_batch', entityId: batch.id,
    newValues: { status: result.status, readyCount: result.readyCount },
    metadata: result, requestId: options.requestId || null,
  }).catch(() => null);
  return result;
}

async function runEventImport(options = {}) {
  const event = validateEventDefinition(options.eventData || eventData);
  const shardCount = Math.ceil(event.records.length / EVENT_IMPORT_SHARD_SIZE);
  const shards = [];
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    shards.push(await runEventImportShard({ ...options, eventData: event, shardIndex }));
  }
  const finalizer = await runEventFinalizer({ ...options, eventData: event, finalizerPass: 0 });
  return {
    eventKey: event.key, sourceDataVersion: event.version,
    batchId: finalizer.batchId, importShardCount: shardCount,
    completedImportShardCount: shards.filter((item) => item.shardStatus === 'succeeded').length,
    discoveredCount: event.records.length,
    readyCount: finalizer.readyCount, status: finalizer.status,
    externalEmailsSent: 0, manualSendingOnly: true,
  };
}

module.exports = {
  EVENT_PROVIDER_ID,
  EVENT_SCORE_POINTS,
  EVENT_IMPORT_SHARD_SIZE,
  EVENT_FINALIZER_BUDGET_MS,
  eventData,
  eventEvidence,
  validateEventDefinition,
  normalizedEventProspect,
  withTrustedEventResearch,
  scoreEventLead,
  refreshExistingEventProspect,
  runEventImportShard,
  runEventFinalizer,
  runEventImport,
};
