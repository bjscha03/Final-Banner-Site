import { describe, expect, it, vi } from 'vitest';
import eventImport from '../_shared/outbound-sales/event-import.cjs';
import eventRepository from '../_shared/outbound-sales/event-import-repository.cjs';
import eventHandler from '../_shared/outbound-sales/event-import-handler.cjs';
import morningHandler from '../_shared/outbound-sales/morning-handler.cjs';
import morningPreparation from '../_shared/outbound-sales/morning-preparation.cjs';
import companyMockup from '../_shared/outbound-sales/company-mockup.cjs';
import manualReviewRepository from '../_shared/outbound-sales/manual-review-repository.cjs';
import eventSource from '../_shared/outbound-sales/event-import.cjs?raw';
import eventHandlerSource from '../_shared/outbound-sales/event-import-handler.cjs?raw';
import eventRepositorySource from '../_shared/outbound-sales/event-import-repository.cjs?raw';
import foregroundEntrypoint from '../outbound-sales-event-import.mjs?raw';
import backgroundEntrypoint from '../outbound-sales-event-import-background.mjs?raw';
import netlifyConfig from '../../../netlify.toml?raw';
import salesAdminSource from '../../../src/pages/admin/sales/SalesLeadReview.tsx?raw';

const BATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'event-import-token-at-least-32-characters';
const MORNING_SECRET = 'morning-preparation-secret-at-least-32-characters';
const EVENT_KEY = 'atlanta-shoe-market-2026-08';
const ENV = {
  DATABASE_URL: 'postgres://test.invalid/database',
  URL: 'https://preview.example',
  OUTBOUND_EVENT_IMPORT_TOKEN: TOKEN,
  OUTBOUND_MORNING_PREP_SECRET: MORNING_SECRET,
};

function tokenEvent(method, body = {}) {
  return {
    httpMethod: method,
    headers: { 'x-outbound-event-import-token': TOKEN, 'x-nf-request-id': 'event-import-test' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

function backgroundEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { 'x-morning-prep-token': MORNING_SECRET, 'x-nf-request-id': 'event-background-test' },
    body: JSON.stringify(body),
  };
}

function batchRow(overrides = {}) {
  return {
    id: BATCH_ID, business_date: '2026-08-11', target_count: 70,
    status: 'discovering', discovered_count: 0, new_prospect_count: 0,
    qualified_count: 0, message_ready_count: 0, mockup_ready_count: 0,
    import_shard_count: 0, completed_import_shard_count: 0,
    running_import_shard_count: 0, failed_import_shard_count: 0,
    run_metadata: { eventKey: EVENT_KEY, phase: 'queued', sourceRecordCount: 105,
      primaryRecordCount: 70, reserveRecordCount: 35 },
    last_error_code: null, started_at: '2026-08-11T08:00:00Z', ready_at: null,
    updated_at: '2026-08-11T08:00:00Z',
    ...overrides,
  };
}

describe('curated Atlanta event source', () => {
  it('keeps the ranked 70 shortlist plus exact-source reserves for strict-quality backfill', () => {
    const event = eventImport.validateEventDefinition();
    expect(event).toMatchObject({ key: EVENT_KEY, targetCount: 70, primaryRecordCount: 70 });
    expect(event.records).toHaveLength(105);
    expect(event.records.slice(0, 70).map((record) => record.rank)).toEqual(Array.from({ length: 70 }, (_, index) => index + 1));
    expect(new Set(event.records.map((record) => record.email)).size).toBe(105);
    expect(new Set(event.records.map((record) => record.canonicalDomain)).size).toBe(105);
    expect(event.records.every((record) => record.contactSourceUrl.startsWith('https://'))).toBe(true);
    expect(JSON.stringify(event.records)).not.toMatch(/"(?:phone|fullName|contactName)"/i);
  });

  it('builds stable provider identities and exact official event/booth evidence without invented contacts', () => {
    const event = eventImport.validateEventDefinition();
    const record = event.records[0];
    const first = eventImport.normalizedEventProspect(event, record);
    const second = eventImport.normalizedEventProspect(event, record);
    expect(first.providerRecordId).toBe(`${EVENT_KEY}:ariat.com`);
    expect(second.providerRecordId).toBe(first.providerRecordId);
    expect(first).toMatchObject({ phone: null, businessName: 'Ariat Accessories' });
    expect(first.providerMetadata).toMatchObject({
      eventName: 'Atlanta Shoe Market', booths: record.booths,
      phoneVerified: false, namedContactVerified: false,
    });
    expect(first.contactCandidates[0]).toMatchObject({ email: 'sales@ariat.com', sourceUrl: record.contactSourceUrl });
    expect(eventImport.eventEvidence(event, record)).toMatchObject({
      eventName: 'Atlanta Shoe Market', booth: record.booths,
      sourceUrl: 'https://atlantashoemarket.com/brand-listings/',
    });
  });

  it('grounds the email and mockup in the exact event and complete multi-booth listing', () => {
    const event = eventImport.validateEventDefinition();
    const record = event.records[0];
    const candidate = {
      prospect: {
        id: '11111111-1111-4111-8111-111111111111', businessName: record.company,
        industry: 'Footwear', businessType: 'Footwear brand',
        qualificationEvidence: [eventImport.eventEvidence(event, record)],
      },
      contact: { id: 'contact-1', email: record.email, fullName: null },
      research: { contentHash: 'research-1', sourceUrls: [record.contactSourceUrl], evidence: [], extractedFacts: {}, bannerNeedSignals: [] },
    };
    const message = morningPreparation.buildMorningMessage(candidate);
    expect(message.bodyText).toContain(`is exhibiting at ${event.name} during ${event.dateLabel} in booth ${record.booths}.`);
    expect(message.bodyText).toContain('This is just a quick mockup');
    expect(message.bodyText).not.toMatch(/complimentary|reply with|size and quantity|Would it be useful/i);
    expect(companyMockup.boothLabel({ message })).toBe(record.booths);
  });
});

describe('event import isolation and quality gates', () => {
  it('uses a dedicated same-date logical batch and can never reuse the generic queue', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await eventRepository.ensureEventBatch(sql, {
      businessDate: '2026-08-11', eventKey: EVENT_KEY, targetCount: 70,
    });
    const [query, params] = sql.mock.calls[0];
    expect(query).toContain('ON CONFLICT (business_date,batch_key)');
    expect(query).toContain("run_metadata->>'eventKey'=$6");
    expect(query).not.toContain('NOT EXISTS (SELECT 1 FROM outbound_prospects');
    expect(query).not.toContain("status='discovering'");
    expect(params[1]).toBe(`event:${EVENT_KEY}`);
    expect(params[5]).toBe(EVENT_KEY);
  });

  it('preserves the event flow by requiring the exact event logical key in the shared finalizer', async () => {
    const runMorningFinalizer = vi.fn().mockResolvedValue({
      status: 'partial', readyCount: 12, candidateCount: 80, processedCount: 20,
      messageReady: 20, mockupReady: 12, failed: 8, timeBudgetReached: true,
    });
    const repository = {
      ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: `event:${EVENT_KEY}` }),
      recordEventProgress: vi.fn().mockResolvedValue({ id: BATCH_ID }),
    };
    await eventImport.runEventFinalizer({
      sql: vi.fn(), businessDate: '2026-08-11',
      dependencies: { repository, runMorningFinalizer, appendAudit: vi.fn().mockResolvedValue({}) },
    });
    expect(runMorningFinalizer).toHaveBeenCalledWith(expect.objectContaining({
      batch: expect.objectContaining({ batch_key: `event:${EVENT_KEY}` }),
      expectedBatchKey: `event:${EVENT_KEY}`,
      requireProviderConfiguration: false,
    }));
  });

  it('requires confirmed MX and event scope for both preparation and final queue positions', async () => {
    const listSql = vi.fn().mockResolvedValue([]);
    await eventRepository.listEventPreparationCandidates(listSql, {
      batchId: BATCH_ID, eventKey: EVENT_KEY, limit: 210,
    });
    expect(listSql.mock.calls[0][0]).toContain("c.mx_status='present'");
    expect(listSql.mock.calls[0][0]).not.toContain('not_checked');
    expect(listSql.mock.calls[0][0]).toContain("p.provider_metadata->>'eventKey'=$3");

    const finalizeSql = vi.fn().mockResolvedValue([]);
    await eventRepository.finalizeEventBatch(finalizeSql, {
      batchId: BATCH_ID, eventKey: EVENT_KEY, targetCount: 70,
    });
    expect(finalizeSql.mock.calls[0][0]).toContain("provider_metadata->>'eventKey'=$2");
    expect(finalizeSql.mock.calls[1][0]).toContain("c.mx_status='present'");
    expect(finalizeSql.mock.calls[1][0]).toContain("p.provider_metadata->>'eventKey'=$3");
    expect(finalizeSql.mock.calls[1][0]).toContain("quality_level='logo_and_product'");
    expect(finalizeSql.mock.calls[1][0]).toContain('"noClipGuaranteed":true');
    expect(finalizeSql.mock.calls[1][0]).toContain('"blobBindingAudit":{"passed":true,"strongReadBackVerified":true}');
    expect(finalizeSql.mock.calls[1][0]).toContain("mockup.blob_key IS NOT NULL");
    for (const query of [finalizeSql.mock.calls[1][0], finalizeSql.mock.calls[2][0]]) {
      expect(query).toContain(`mockup.render_version='${companyMockup.RENDER_VERSION}'`);
      expect(query).toContain('"noUpscaleGuaranteed":true');
      expect(query).toContain('"logoCompositionAudit"');
      expect(query).toContain('"productSelectionAudit"');
      expect(query).toContain('"layoutAudit"');
      expect(query).toContain('"paletteAudit"');
    }
  });

  it('keeps unfinalized reserve prospects out of Today until a strict queue position exists', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await manualReviewRepository.listManualReviewLeads(sql, { reviewView: 'today' });
    const listQuery = sql.mock.calls[0][0];
    expect(listQuery).toContain('morning_batch_id IS NOT NULL');
    expect(listQuery).toContain('morning_queue_position IS NOT NULL');
    expect(listQuery).not.toContain('morning_batch_id IS NULL');
  });

  it('skips a completed durable shard idempotently without processing a lead', async () => {
    const processProspect = vi.fn();
    const result = await eventImport.runEventImportShard({
      sql: vi.fn(), businessDate: '2026-08-11', shardIndex: 0,
      dependencies: {
        repository: {
          ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID }),
          claimMorningShard: vi.fn().mockResolvedValue(null),
          loadMorningShard: vi.fn().mockResolvedValue({ id: 'shard-1', status: 'succeeded' }),
        },
        processProspect,
      },
    });
    expect(result).toMatchObject({ skipped: true, shardStatus: 'succeeded', externalEmailsSent: 0 });
    expect(processProspect).not.toHaveBeenCalled();
  });

  it('merges trusted event scope onto an existing duplicate before it can enter the event batch', async () => {
    const event = eventImport.validateEventDefinition();
    const record = event.records[0];
    const normalized = eventImport.normalizedEventProspect(event, record);
    const mergeEventProspectMetadata = vi.fn().mockResolvedValue({ id: 'existing-1' });
    const repository = {
      attachProspectSource: vi.fn().mockResolvedValue({ prospect_id: 'existing-1' }),
      mergeEventProspectMetadata,
      upsertEventContact: vi.fn().mockResolvedValue({ id: 'contact-1' }),
      listActiveProspectContacts: vi.fn().mockResolvedValue([{ email: record.email, mxStatus: 'present' }]),
    };
    const existingResearch = {
      contentHash: 'research-existing', sourceUrls: [record.contactSourceUrl],
      evidence: [eventImport.eventEvidence(event, record)], bannerNeedSignals: [], extractedFacts: {},
    };
    const dependencies = {
      loadLatestResearch: vi.fn().mockResolvedValue(existingResearch),
      assessEmailCandidates: vi.fn().mockResolvedValue([{
        email: record.email, emailNormalized: record.email, sourceUrl: record.contactSourceUrl,
        syntaxValid: true, isRoleAddress: true, isFreeMailbox: false, domainMatches: true,
        mxStatus: 'present', mxCheckedAt: '2026-08-11T08:00:00Z',
        verificationStatus: 'risky', verificationReason: 'Role address', contactQualityScore: 85,
      }]),
      loadExclusions: vi.fn().mockResolvedValue([]),
      scoreLead: vi.fn().mockReturnValue({
        score: 60, status: 'qualified', qualified: true, outreachCandidate: false,
        breakdown: {}, explanations: [], evidence: [], exclusionCodes: [],
        rejectionReasons: ['ROLE_ADDRESS_ONLY'],
      }),
      saveQualification: vi.fn().mockResolvedValue({}),
      appendAudit: vi.fn().mockResolvedValue({}),
    };
    const result = await eventImport.refreshExistingEventProspect({
      sql: vi.fn(),
      existing: {
        id: 'existing-1', business_name: record.company, website_url: record.websiteUrl,
        canonical_domain: record.canonicalDomain, industry: 'Footwear', business_type: 'Brand',
        exclusion_codes: [], first_contacted_at: null, prior_customer_match: false, suppression_reason: null,
      },
      normalized, event, record, repository, dependencies, requestId: 'existing-test',
    });
    expect(result).toMatchObject({ prospectId: 'existing-1', status: 'qualified', created: false });
    expect(mergeEventProspectMetadata).toHaveBeenCalledWith(expect.anything(), {
      prospectId: 'existing-1', providerMetadata: expect.objectContaining({ eventKey: EVENT_KEY, booths: record.booths }),
    });
  });

  it('contains no delivery provider path in import, preparation, repository, or handler code', () => {
    const combined = `${eventSource}\n${eventHandlerSource}\n${eventRepositorySource}`;
    expect(combined).not.toMatch(/sendPermissionedMarketingMessage|emails\.send|resend/i);
    expect(combined).toContain('externalEmailsSent: 0');
  });
});

describe('protected admin/token trigger and resumable background chain', () => {
  it('dispatches background work to the current preview rather than the production URL', () => {
    expect(morningHandler.deploymentOrigin({
      CONTEXT: 'deploy-preview',
      URL: 'https://bannersonthefly.com',
      DEPLOY_PRIME_URL: 'https://deploy-preview-458--bannersonthefly.netlify.app/path-is-ignored',
      DEPLOY_URL: 'https://preview-commit--bannersonthefly.netlify.app',
    })).toBe('https://deploy-preview-458--bannersonthefly.netlify.app');
  });

  it('uses a constant-time scoped token and never accepts a short or wrong token', () => {
    expect(eventHandler.constantTimeTokenMatch(TOKEN, TOKEN)).toBe(true);
    expect(eventHandler.constantTimeTokenMatch('wrong', TOKEN)).toBe(false);
    expect(eventHandler.constantTimeTokenMatch('short', 'short')).toBe(false);
    expect(eventHandler.eventTokenAuthorized(tokenEvent('GET'), ENV)).toBe(true);
  });

  it('queues the first import shard and returns sanitized preparation-only progress', async () => {
    const dispatch = vi.fn().mockResolvedValue(202);
    const repository = {
      ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      loadEventBatchStatus: vi.fn()
        .mockResolvedValueOnce(batchRow())
        .mockResolvedValueOnce(batchRow({ status: 'discovering' })),
      recordEventProgress: vi.fn().mockResolvedValue(batchRow()),
    };
    const handler = eventHandler.createEventImportHandler({
      env: ENV,
      dependencies: { createSql: vi.fn(() => vi.fn()), repository, dispatchEventBackground: dispatch },
    });
    const response = await handler(tokenEvent('POST', { action: 'start', eventKey: EVENT_KEY }));
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true, queued: true, eventKey: EVENT_KEY,
      externalEmailsSent: 0, manualSendingOnly: true,
    });
    expect(dispatch).toHaveBeenCalledWith('import', expect.objectContaining({ shardIndex: 0 }), expect.anything());
  });

  it('chains bounded import shards and resumable finalizer passes without sending', async () => {
    const dispatchImport = vi.fn().mockResolvedValue(202);
    const importBackground = eventHandler.createEventImportBackgroundHandler({
      env: ENV,
      dependencies: {
        createSql: vi.fn(() => vi.fn()),
        runEventImportShard: vi.fn().mockResolvedValue({ shardStatus: 'succeeded', shardCount: 7 }),
        dispatchEventBackground: dispatchImport,
      },
    });
    const importResponse = await importBackground(backgroundEvent({
      action: 'import', eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }));
    expect(importResponse.statusCode).toBe(204);
    expect(dispatchImport).toHaveBeenCalledWith('import', expect.objectContaining({ shardIndex: 1 }), expect.anything());

    const dispatchFinalize = vi.fn().mockResolvedValue(202);
    const finalizeBackground = eventHandler.createEventImportBackgroundHandler({
      env: ENV,
      dependencies: {
        createSql: vi.fn(() => vi.fn()),
        runEventFinalizer: vi.fn().mockResolvedValue({
          readyCount: 42, processedCount: 55, candidateCount: 90,
          mockupFailureCount: 3, timeBudgetReached: true,
        }),
        dispatchEventBackground: dispatchFinalize,
      },
    });
    await finalizeBackground(backgroundEvent({
      action: 'finalize', eventKey: EVENT_KEY, businessDate: '2026-08-11', finalizerPass: 2,
    }));
    expect(dispatchFinalize).toHaveBeenCalledWith('finalize', expect.objectContaining({ finalizerPass: 3 }), expect.anything());
  });

  it('ships both function entrypoints, background configuration, and visible admin progress action', () => {
    expect(foregroundEntrypoint).toContain('createEventImportHandler');
    expect(backgroundEntrypoint).toContain('createEventImportBackgroundHandler');
    expect(netlifyConfig).toContain('[functions."outbound-sales-event-import-background"]');
    expect(netlifyConfig).toMatch(/\[functions\."outbound-sales-event-import-background"\][\s\S]*?background = true/);
    expect(salesAdminSource).toContain('Load & prepare Atlanta batch');
    expect(salesAdminSource).toContain('This action has no email-send path');
  });
});
