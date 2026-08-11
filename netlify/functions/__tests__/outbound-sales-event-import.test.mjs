import { describe, expect, it, vi } from 'vitest';
import eventImport from '../_shared/outbound-sales/event-import.cjs';
import eventRepository from '../_shared/outbound-sales/event-import-repository.cjs';
import eventHandler from '../_shared/outbound-sales/event-import-handler.cjs';
import morningPreparation from '../_shared/outbound-sales/morning-preparation.cjs';
import companyMockup from '../_shared/outbound-sales/company-mockup.cjs';
import manualReviewRepository from '../_shared/outbound-sales/manual-review-repository.cjs';
import { withOutboundRuntime } from '../_shared/outbound-sales/netlify-modern.mjs';
import eventSource from '../_shared/outbound-sales/event-import.cjs?raw';
import eventHandlerSource from '../_shared/outbound-sales/event-import-handler.cjs?raw';
import eventRepositorySource from '../_shared/outbound-sales/event-import-repository.cjs?raw';
import foregroundEntrypoint from '../outbound-sales-event-import.mjs?raw';
import backgroundEntrypoint from '../outbound-sales-event-import-background.mjs?raw';
import outboundRuntimeSource from '../_shared/outbound-sales/netlify-modern.mjs?raw';
import netlifyConfig from '../../../netlify.toml?raw';
import salesAdminSource from '../../../src/pages/admin/sales/SalesLeadReview.tsx?raw';

const BATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'event-import-token-at-least-32-characters';
const MORNING_SECRET = 'morning-preparation-secret-at-least-32-characters';
const EVENT_KEY = 'atlanta-shoe-market-2026-08';
const SOURCE_DATA_VERSION = eventImport.eventData.version;
const PREVIEW_ORIGIN = 'https://deploy-preview-458--bannersonthefly.netlify.app';
const DEPLOY_ID = '6a7b67f0c7518b000837062c';
const IMMUTABLE_PREVIEW_ORIGIN = `https://${DEPLOY_ID}--bannersonthefly.netlify.app`;
const SENSITIVE_COOKIE = 'banners_admin_session=must-not-forward; nf_jwt=must-not-forward';
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
    body: JSON.stringify({ sourceDataVersion: SOURCE_DATA_VERSION, ...body }),
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

function backgroundRepository(overrides = {}) {
  return {
    loadEventBatchStatus: vi.fn().mockResolvedValue(batchRow()),
    recordEventProgress: vi.fn().mockResolvedValue(batchRow()),
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
      loadEventBatchStatus: vi.fn().mockResolvedValue(batchRow({
        import_shard_count: 7, completed_import_shard_count: 7,
        running_import_shard_count: 0, failed_import_shard_count: 0,
      })),
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

  it('refuses finalization until every shard in the active source version succeeded', async () => {
    const runMorningFinalizer = vi.fn();
    await expect(eventImport.runEventFinalizer({
      sql: vi.fn(), businessDate: '2026-08-11',
      dependencies: {
        repository: {
          ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: `event:${EVENT_KEY}` }),
          loadEventBatchStatus: vi.fn().mockResolvedValue(batchRow({
            import_shard_count: 14, completed_import_shard_count: 7,
            failed_import_shard_count: 0,
          })),
        },
        runMorningFinalizer,
      },
    })).rejects.toMatchObject({ code: 'EVENT_IMPORT_INCOMPLETE' });
    expect(runMorningFinalizer).not.toHaveBeenCalled();
  });

  it('scopes import progress to the active source version so a retry stays 7 shards and 105 records', async () => {
    const statusSql = vi.fn().mockResolvedValue([]);
    await eventRepository.loadEventBatchStatus(statusSql, {
      businessDate: '2026-08-11', eventKey: EVENT_KEY, sourceDataVersion: SOURCE_DATA_VERSION,
    });
    expect(statusSql.mock.calls[0][0]).toContain('LEFT(shard.shard_key,LENGTH($4))=$4');
    expect(statusSql.mock.calls[0][1][3]).toBe(`event:${EVENT_KEY}:import:${SOURCE_DATA_VERSION}:`);

    const countSql = vi.fn().mockResolvedValue([]);
    await eventRepository.refreshEventImportCounts(countSql, {
      batchId: BATCH_ID, eventKey: EVENT_KEY, sourceDataVersion: SOURCE_DATA_VERSION,
    });
    expect(countSql.mock.calls[0][0]).toContain('LEFT(shard.shard_key,LENGTH($3))=$3');
    expect(countSql.mock.calls[0][1][2]).toBe(`event:${EVENT_KEY}:import:${SOURCE_DATA_VERSION}:`);
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
    expect(listQuery).toContain('morning_batch_id=(SELECT id FROM preferred_today_batch)');
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

  it('fails the shard instead of chaining when every record hits an infrastructure error', async () => {
    const repository = {
      ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      claimMorningShard: vi.fn().mockResolvedValue({ id: 'shard-failed' }),
      findDuplicateProspect: vi.fn().mockResolvedValue(null),
      recordEventProgress: vi.fn().mockResolvedValue(batchRow()),
      failMorningShard: vi.fn().mockResolvedValue({}),
      completeMorningShard: vi.fn(),
    };
    await expect(eventImport.runEventImportShard({
      sql: vi.fn(), businessDate: '2026-08-11', shardIndex: 0,
      dependencies: {
        repository,
        processProspect: vi.fn().mockRejectedValue(Object.assign(new Error('bad query'), { code: '42P10' })),
      },
    })).rejects.toMatchObject({ code: 'EVENT_IMPORT_SHARD_ALL_RECORDS_FAILED' });
    expect(repository.completeMorningShard).not.toHaveBeenCalled();
    expect(repository.failMorningShard).toHaveBeenCalledWith(expect.anything(), {
      shardId: 'shard-failed', errorCode: 'EVENT_IMPORT_SHARD_ALL_RECORDS_FAILED',
    });
    expect(repository.recordEventProgress).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      status: 'failed', lastErrorCode: 'EVENT_IMPORT_SHARD_ALL_RECORDS_FAILED',
      metadata: expect.objectContaining({ failedImportCount: 15 }),
    }));
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
  it('dispatches to the immutable current deploy even when runtime build variables are absent', () => {
    expect(eventHandler.eventDispatchOrigin({
      URL: 'https://bannersonthefly.com', SITE_NAME: 'bannersonthefly',
    }, {
      rawUrl: `${PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import`,
      netlify: {
        deployContext: 'deploy-preview', deployId: DEPLOY_ID, siteName: 'bannersonthefly',
      },
    })).toBe(IMMUTABLE_PREVIEW_ORIGIN);
  });

  it('passes authoritative Netlify Context through the real Lambda adapter', async () => {
    let captured;
    const wrapped = withOutboundRuntime(async (event) => {
      captured = event.netlify;
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' };
    });
    const request = new Request(`${PREVIEW_ORIGIN}/test`, {
      headers: {
        'x-netlify-deploy-id': 'attacker-controlled',
        'x-netlify-site-name': 'attacker-controlled',
      },
    });
    const response = await wrapped(request, {
      deploy: { context: 'deploy-preview', id: DEPLOY_ID },
      site: { name: 'bannersonthefly' },
    });

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      deployContext: 'deploy-preview', deployId: DEPLOY_ID, siteName: 'bannersonthefly',
    });
  });

  it('uses a constant-time scoped token and never accepts a short or wrong token', () => {
    expect(eventHandler.constantTimeTokenMatch(TOKEN, TOKEN)).toBe(true);
    expect(eventHandler.constantTimeTokenMatch('wrong', TOKEN)).toBe(false);
    expect(eventHandler.constantTimeTokenMatch('short', 'short')).toBe(false);
    expect(eventHandler.eventTokenAuthorized(tokenEvent('GET'), ENV)).toBe(true);
  });

  it('marks acknowledged and legacy queued handoffs stalled after 90 seconds without a receiver heartbeat', () => {
    const legacy = eventHandler.mapBatchStatus(batchRow({
      updated_at: '2026-08-11T17:36:29Z',
      run_metadata: { eventKey: EVENT_KEY, phase: 'queued' },
    }));
    expect(legacy.dispatchStalled).toBe(true);

    const acknowledged = eventHandler.mapBatchStatus(batchRow({
      run_metadata: {
        eventKey: EVENT_KEY, phase: 'dispatched', dispatchState: 'acknowledged',
        dispatchAcknowledgedAt: '2026-08-11T17:36:29Z', backgroundReceivedAt: null,
      },
    }));
    expect(acknowledged.dispatchStalled).toBe(true);

    const received = eventHandler.mapBatchStatus(batchRow({
      run_metadata: {
        eventKey: EVENT_KEY, phase: 'background_received', dispatchState: 'acknowledged',
        dispatchAcknowledgedAt: '2026-08-11T17:36:29Z',
        backgroundReceivedAt: '2026-08-11T17:36:30Z', backgroundState: 'running',
      },
    }));
    expect(received.dispatchStalled).toBe(false);
  });

  it('rejects an HTTP 200 gate page instead of mistaking it for a background acknowledgement', async () => {
    const readBody = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, text: readBody, json: readBody });
    await expect(eventHandler.dispatchEventBackground('import', {
      eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }, {
      env: {
        ...ENV, URL: 'https://bannersonthefly.com', SITE_NAME: 'bannersonthefly',
      },
      fetchImpl,
      requestEvent: {
        rawUrl: `${PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import`,
        headers: { Cookie: SENSITIVE_COOKIE },
        netlify: {
          deployContext: 'deploy-preview', deployId: DEPLOY_ID, siteName: 'bannersonthefly',
        },
      },
    })).rejects.toMatchObject({
      code: 'EVENT_IMPORT_DISPATCH_FAILED', dispatchResponseStatus: 200,
    });
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    expect(readBody).not.toHaveBeenCalled();
  });

  it('accepts exactly 202 and rejects redirects or non-background success statuses', async () => {
    for (const status of [204, 301, 302, 307, 308]) {
      const fetchImpl = vi.fn().mockResolvedValue({ status });
      await expect(eventHandler.dispatchEventBackground('import', {
        eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
      }, {
        env: ENV, fetchImpl,
      })).rejects.toMatchObject({
        code: 'EVENT_IMPORT_DISPATCH_FAILED', dispatchResponseStatus: status,
      });
      expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    }
    await expect(eventHandler.dispatchEventBackground('import', {
      eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }, {
      env: ENV, fetchImpl: vi.fn().mockResolvedValue({ status: 202 }),
    })).resolves.toBe(202);
  });

  it('requires a deploy-scoped origin in preview contexts and never falls back to production URL', async () => {
    const fetchImpl = vi.fn();
    await expect(eventHandler.dispatchEventBackground('import', {
      eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }, {
      env: {
        ...ENV, CONTEXT: 'deploy-preview', URL: 'https://bannersonthefly.com',
        DEPLOY_PRIME_URL: '', DEPLOY_URL: '',
      },
      fetchImpl,
    })).rejects.toMatchObject({ code: 'EVENT_IMPORT_NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the immutable deploy origin and never forwards browser cookies to the first shard', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
    const repository = {
      ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      loadEventBatchStatus: vi.fn()
        .mockResolvedValueOnce(batchRow())
        .mockResolvedValueOnce(batchRow({ status: 'discovering' })),
      recordEventProgress: vi.fn().mockResolvedValue(batchRow()),
    };
    const handler = eventHandler.createEventImportHandler({
      env: {
        ...ENV, URL: 'https://bannersonthefly.com', SITE_NAME: 'bannersonthefly',
      },
      dependencies: { createSql: vi.fn(() => vi.fn()), repository, fetch: fetchImpl },
    });
    const request = tokenEvent('POST', { action: 'start', eventKey: EVENT_KEY });
    request.rawUrl = `${PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import`;
    request.headers.Cookie = SENSITIVE_COOKIE;
    request.netlify = {
      deployContext: 'deploy-preview', deployId: DEPLOY_ID, siteName: 'bannersonthefly',
    };

    const result = await handler(request);

    expect(result.statusCode).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${IMMUTABLE_PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import-background`);
    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBeUndefined();
    expect(repository.recordEventProgress.mock.calls[0][1].metadata).toMatchObject({
      dispatchPreviewAccessState: 'not_used', dispatchResponseStatus: null,
    });
    expect(repository.recordEventProgress.mock.calls[1][1].metadata).toMatchObject({
      dispatchPreviewAccessState: 'not_used', dispatchResponseStatus: 202,
    });
  });

  it('keeps chained background work on the same immutable deploy without cookies', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202 });
    const handler = eventHandler.createEventImportBackgroundHandler({
      env: {
        ...ENV, URL: 'https://bannersonthefly.com', SITE_NAME: 'bannersonthefly',
      },
      dependencies: {
        createSql: vi.fn(() => vi.fn()),
        repository: backgroundRepository(),
        runEventImportShard: vi.fn().mockResolvedValue({ shardStatus: 'succeeded', shardCount: 2 }),
        fetch: fetchImpl,
      },
    });
    const request = backgroundEvent({
      action: 'import', eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    });
    request.rawUrl = `${IMMUTABLE_PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import-background`;
    request.headers.Cookie = SENSITIVE_COOKIE;
    request.netlify = {
      deployContext: 'deploy-preview', deployId: DEPLOY_ID, siteName: 'bannersonthefly',
    };

    const result = await handler(request);

    expect(result.statusCode).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${IMMUTABLE_PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import-background`);
    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBeUndefined();
  });

  it('never forwards cookies in production or from a hostile lookalike origin', async () => {
    const productionFetch = vi.fn().mockResolvedValue({ status: 202 });
    const productionOrigin = 'https://production-deploy.netlify.app';
    await eventHandler.dispatchEventBackground('import', {
      eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }, {
      env: {
        ...ENV, CONTEXT: 'production', URL: 'https://bannersonthefly.com',
        DEPLOY_PRIME_URL: productionOrigin,
      },
      fetchImpl: productionFetch,
      requestEvent: {
        rawUrl: `${productionOrigin}/.netlify/functions/outbound-sales-event-import`,
        headers: { Cookie: SENSITIVE_COOKIE },
      },
    });
    expect(productionFetch.mock.calls[0][1].headers.Cookie).toBeUndefined();

    const crossOriginFetch = vi.fn().mockResolvedValue({ status: 202 });
    await eventHandler.dispatchEventBackground('import', {
      eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }, {
      env: {
        ...ENV, CONTEXT: 'deploy-preview', URL: 'https://bannersonthefly.com',
        DEPLOY_PRIME_URL: PREVIEW_ORIGIN,
      },
      fetchImpl: crossOriginFetch,
      requestEvent: {
        rawUrl: 'https://deploy-preview-458--bannersonthefly.netlify.app.attacker.example/function',
        headers: { Cookie: SENSITIVE_COOKIE },
      },
    });
    expect(crossOriginFetch.mock.calls[0][0]).toBe(`${PREVIEW_ORIGIN}/.netlify/functions/outbound-sales-event-import-background`);
    expect(crossOriginFetch.mock.calls[0][1].headers.Cookie).toBeUndefined();
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
    expect(repository.recordEventProgress).toHaveBeenCalledTimes(2);
    expect(repository.recordEventProgress.mock.calls[0][1]).toMatchObject({
      status: 'discovering', lastErrorCode: null,
      metadata: {
        phase: 'dispatching', dispatchState: 'requesting', dispatchAction: 'import',
        dispatchShardIndex: 0, dispatchAckStatus: null, backgroundState: null,
        dispatchResponseStatus: null, dispatchPreviewAccessState: 'not_used',
        externalEmailsSent: 0,
      },
    });
    expect(repository.recordEventProgress.mock.calls[1][1]).toMatchObject({
      status: 'discovering', lastErrorCode: null,
      metadata: {
        phase: 'dispatched', dispatchState: 'acknowledged', dispatchAction: 'import',
        dispatchShardIndex: 0, dispatchAckStatus: 202,
        dispatchResponseStatus: 202, dispatchPreviewAccessState: 'not_used',
        externalEmailsSent: 0,
      },
    });
  });

  it('persists a sanitized failed state when foreground dispatch is not acknowledged', async () => {
    const repository = {
      ensureEventBatch: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      loadEventBatchStatus: vi.fn().mockResolvedValue(batchRow()),
      recordEventProgress: vi.fn().mockResolvedValue(batchRow()),
    };
    const handler = eventHandler.createEventImportHandler({
      env: ENV,
      dependencies: {
        createSql: vi.fn(() => vi.fn()), repository,
        fetch: vi.fn().mockResolvedValue({ status: 200 }),
      },
    });
    const request = tokenEvent('POST', { action: 'start', eventKey: EVENT_KEY });
    request.headers.Cookie = SENSITIVE_COOKIE;

    const response = await handler(request);

    expect(response.statusCode).toBe(502);
    expect(repository.recordEventProgress).toHaveBeenCalledTimes(2);
    expect(repository.recordEventProgress.mock.calls[1][1]).toMatchObject({
      batchId: BATCH_ID, status: 'failed', lastErrorCode: 'EVENT_IMPORT_DISPATCH_FAILED',
      metadata: {
        phase: 'dispatch_failed', dispatchState: 'failed', dispatchAction: 'import',
        dispatchShardIndex: 0, dispatchAckStatus: null, dispatchResponseStatus: 200,
        dispatchPreviewAccessState: 'not_used', externalEmailsSent: 0,
      },
    });
    const durableMetadata = JSON.stringify(repository.recordEventProgress.mock.calls.map((call) => call[1]));
    expect(durableMetadata).not.toContain(TOKEN);
    expect(durableMetadata).not.toContain(MORNING_SECRET);
    expect(durableMetadata).not.toContain(SENSITIVE_COOKIE);
    expect(durableMetadata).not.toContain(JSON.stringify({ action: 'start', eventKey: EVENT_KEY }));
  });

  it('keeps safe dispatch diagnostics through repository sanitization and strips cookie-named metadata', async () => {
    const sql = vi.fn().mockResolvedValue([batchRow()]);
    await eventRepository.recordEventProgress(sql, {
      batchId: BATCH_ID,
      status: 'failed',
      lastErrorCode: 'EVENT_IMPORT_DISPATCH_FAILED',
      metadata: {
        dispatchResponseStatus: 403,
        dispatchPreviewAccessState: 'not_used',
        dispatchPlatformCookieForwarded: true,
        rawCookie: SENSITIVE_COOKIE,
      },
    });

    const serialized = JSON.parse(sql.mock.calls[0][1][3]);
    expect(serialized).toMatchObject({
      dispatchResponseStatus: 403,
      dispatchPreviewAccessState: 'not_used',
    });
    expect(serialized).not.toHaveProperty('dispatchPlatformCookieForwarded');
    expect(serialized).not.toHaveProperty('rawCookie');
    expect(JSON.stringify(serialized)).not.toContain(SENSITIVE_COOKIE);
  });

  it('writes a background receiver heartbeat before shard work and exposes a deferred claim', async () => {
    const order = [];
    const repository = backgroundRepository({
      recordEventProgress: vi.fn(async (_sql, input) => {
        order.push(input.metadata.phase);
        return batchRow();
      }),
    });
    const runEventImportShard = vi.fn(async () => {
      order.push('shard_work');
      return { shardStatus: 'running', shardCount: 7 };
    });
    const handler = eventHandler.createEventImportBackgroundHandler({
      env: ENV,
      dependencies: {
        createSql: vi.fn(() => vi.fn()), repository, runEventImportShard,
      },
    });

    const response = await handler(backgroundEvent({
      action: 'import', eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }));

    expect(response.statusCode).toBe(204);
    expect(order).toEqual(['background_received', 'shard_work', 'import_claim_deferred']);
    expect(repository.recordEventProgress.mock.calls[0][1]).toMatchObject({
      batchId: BATCH_ID, status: 'discovering', lastErrorCode: null,
      metadata: {
        phase: 'background_received', backgroundState: 'running',
        backgroundAction: 'import', backgroundShardIndex: 0, externalEmailsSent: 0,
      },
    });
    expect(repository.recordEventProgress.mock.calls[1][1]).toMatchObject({
      metadata: {
        phase: 'import_claim_deferred', backgroundState: 'claim_deferred',
        backgroundShardStatus: 'running', externalEmailsSent: 0,
      },
    });
  });

  it('defers image and Blob runtime loading until the final mockup stage', async () => {
    const loadSharp = vi.fn().mockResolvedValue({ name: 'sharp-test' });
    const getStore = vi.fn().mockResolvedValue({ name: 'store-test' });
    const importHandler = eventHandler.createEventImportBackgroundHandler({
      env: ENV, loadSharp, getStore,
      dependencies: {
        createSql: vi.fn(() => vi.fn()), repository: backgroundRepository(),
        runEventImportShard: vi.fn().mockResolvedValue({ shardStatus: 'running', shardCount: 7 }),
      },
    });
    await importHandler(backgroundEvent({
      action: 'import', eventKey: EVENT_KEY, businessDate: '2026-08-11', shardIndex: 0,
    }));
    expect(loadSharp).not.toHaveBeenCalled();
    expect(getStore).not.toHaveBeenCalled();

    const runEventFinalizer = vi.fn().mockResolvedValue({
      readyCount: 70, processedCount: 70, candidateCount: 70,
      mockupFailureCount: 0, timeBudgetReached: false,
    });
    const finalizeHandler = eventHandler.createEventImportBackgroundHandler({
      env: ENV, loadSharp, getStore,
      dependencies: {
        createSql: vi.fn(() => vi.fn()), repository: backgroundRepository(), runEventFinalizer,
      },
    });
    await finalizeHandler(backgroundEvent({
      action: 'finalize', eventKey: EVENT_KEY, businessDate: '2026-08-11', finalizerPass: 0,
    }));
    expect(loadSharp).toHaveBeenCalledTimes(1);
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(runEventFinalizer).toHaveBeenCalledWith(expect.objectContaining({
      sharp: { name: 'sharp-test' }, store: { name: 'store-test' },
    }));
  });

  it('chains bounded import shards and resumable finalizer passes without sending', async () => {
    const dispatchImport = vi.fn().mockResolvedValue(202);
    const importBackground = eventHandler.createEventImportBackgroundHandler({
      env: ENV,
      dependencies: {
        createSql: vi.fn(() => vi.fn()),
        repository: backgroundRepository(),
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
        repository: backgroundRepository(),
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
    expect(foregroundEntrypoint).toContain('withOutboundRuntime');
    expect(backgroundEntrypoint).toContain('withOutboundRuntime');
    expect(outboundRuntimeSource).toContain('context?.deploy?.id');
    expect(outboundRuntimeSource).toContain('context?.site?.name');
    expect(backgroundEntrypoint).not.toContain("import sharp from 'sharp'");
    expect(backgroundEntrypoint).toContain("await import('sharp')");
    expect(netlifyConfig).toContain('[functions."outbound-sales-event-import-background"]');
    expect(netlifyConfig).toMatch(/\[functions\."outbound-sales-event-import-background"\][\s\S]*?background = true/);
    expect(salesAdminSource).toContain('Load & prepare Atlanta batch');
    expect(salesAdminSource).toContain('Retry Atlanta preparation');
    expect(salesAdminSource).toContain("['queued', 'dispatching', 'dispatched']");
    expect(salesAdminSource).toContain('The preparation worker did not confirm receipt');
    expect(salesAdminSource).toContain('eventStartInFlight.current');
    expect(salesAdminSource).not.toContain('use Load &amp; prepare Atlanta batch to retry safely');
    expect(salesAdminSource).toContain('This action has no email-send path');
  });
});
