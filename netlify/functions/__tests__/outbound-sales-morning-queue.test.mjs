import { describe, expect, it, vi } from 'vitest';
import apolloModule from '../_shared/outbound-sales/providers/apollo.cjs';
import morningModule from '../_shared/outbound-sales/morning-preparation.cjs';
import morningHandlerModule from '../_shared/outbound-sales/morning-handler.cjs';
import morningRepository from '../_shared/outbound-sales/morning-repository.cjs';
import manualRepository from '../_shared/outbound-sales/manual-review-repository.cjs';
import migration32 from '../../../migrations/032_outbound_morning_sales_queue.sql?raw';
import rollback32 from '../../../migrations/032_outbound_morning_sales_queue.rollback.sql?raw';
import migration33 from '../../../migrations/033_outbound_morning_batch_isolation.sql?raw';
import rollback33 from '../../../migrations/033_outbound_morning_batch_isolation.rollback.sql?raw';
import netlifyConfig from '../../../netlify.toml?raw';
import morningSource from '../_shared/outbound-sales/morning-preparation.cjs?raw';
import salesAdminSource from '../../../src/pages/admin/sales/SalesLeadReview.tsx?raw';

const BATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';

const morningEnv = {
  CONTEXT: 'production',
  OUTBOUND_MORNING_PREP_ENABLED: 'true',
  OUTBOUND_MORNING_PREP_SECRET: 'morning-preparation-secret-at-least-32-characters',
  OUTBOUND_MORNING_APOLLO_DAILY_CREDIT_LIMIT: '1200',
  OUTBOUND_APOLLO_API_KEY: 'apollo-test-key-long-enough',
  OUTBOUND_APOLLO_ENRICH_CONTACTS: 'true',
  OUTBOUND_APOLLO_EMAIL_CREDITS_PER_PERSON: '1',
};

function preparationCandidate(id, businessName, email) {
  return {
    prospect: {
      id, businessName, websiteUrl: `https://${businessName.toLowerCase().replace(/\s+/g, '')}.example`,
      canonicalDomain: `${businessName.toLowerCase().replace(/\s+/g, '')}.example`,
      industry: 'Footwear', businessType: 'Retail brand', leadScore: 88,
      qualificationEvidence: [{ code: 'upcoming_events', evidence: `${businessName} lists an upcoming event on its website.` }],
    },
    contact: { id: `contact-${id}`, email, fullName: 'Jordan Lee', jobTitle: 'Marketing Director' },
    research: {
      contentHash: `research-${id}`, sourceUrls: [`https://${businessName.toLowerCase().replace(/\s+/g, '')}.example`],
      extractedFacts: {}, evidence: [], bannerNeedSignals: [],
    },
  };
}

describe('daily morning queue schema and scheduling', () => {
  it('stores an idempotent manual-only 70-lead batch with durable shard and queue state', () => {
    expect(migration32).toContain('CREATE TABLE IF NOT EXISTS outbound_morning_batches');
    expect(migration32).toContain('CREATE TABLE IF NOT EXISTS outbound_morning_batch_shards');
    expect(migration32).toContain('CHECK (target_count BETWEEN 1 AND 70)');
    expect(migration32).toContain('morning_queue_position');
    expect(migration32).toContain('UNIQUE (batch_id, shard_key)');
    expect(migration32).not.toMatch(/\b(?:orders|customers|payments)\b/i);
    expect(rollback32).toContain('DROP TABLE IF EXISTS outbound_morning_batch_shards');
    expect(rollback32).not.toContain('CASCADE');
    expect(migration33).toContain('ADD COLUMN IF NOT EXISTS batch_key');
    expect(migration33).toContain('UNIQUE (business_date,batch_key)');
    expect(migration33).toContain("THEN 'event:' || inferred.event_key");
    expect(migration33).toContain("THEN 'legacy:event:' || batch.id::text");
    expect(rollback33).toContain('ADD CONSTRAINT outbound_morning_batches_business_date_key UNIQUE (business_date)');
    expect(rollback33).not.toMatch(/DELETE FROM|TRUNCATE/i);
  });

  it('always claims the generic logical batch and cannot conflict with an event batch on the same date', async () => {
    const sql = vi.fn().mockResolvedValue([{ id: BATCH_ID, batch_key: 'generic' }]);
    await morningRepository.ensureMorningBatch(sql, {
      businessDate: '2026-08-11', targetCount: 70, providerId: 'apollo',
    });
    const [query, params] = sql.mock.calls[0];
    expect(query).toContain('ON CONFLICT (business_date,batch_key)');
    expect(query).toContain('outbound_morning_batches.batch_key=$2');
    expect(query).toContain('outbound_morning_batches.source_provider_id=EXCLUDED.source_provider_id');
    expect(params[1]).toBe('generic');
    expect(params).not.toContain('event:atlanta-shoe-market-2026-08');
    expect(() => morningModule.assertMorningBatchIdentity({
      id: BATCH_ID, batch_key: 'event:atlanta-shoe-market-2026-08',
    })).toThrow(expect.objectContaining({ code: 'MORNING_BATCH_IDENTITY_MISMATCH' }));
    expect(morningModule.assertMorningBatchIdentity({ id: BATCH_ID, batch_key: 'generic' }))
      .toMatchObject({ id: BATCH_ID, batch_key: 'generic' });
  });

  it('positions email-ready leads without artwork and separately counts verified manual uploads', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await morningRepository.finalizeMorningBatch(sql, { batchId: BATCH_ID, targetCount: 70 });
    const rankedQuery = sql.mock.calls[1][0];
    const countQuery = sql.mock.calls[2][0];
    expect(rankedQuery).toContain("m.generation_status='generated'");
    expect(rankedQuery).not.toContain('outbound_company_mockups');
    expect(countQuery).toContain("mockup.render_version='company-banner-manual-upload-v1'");
    expect(countQuery).toContain("mockup.quality_level='manual_upload'");
    expect(countQuery).toContain('manual-company-banners/');
    expect(countQuery).toContain('"source":"manual_upload"');
    expect(countQuery).toContain('"administratorUploaded":true');
    expect(countQuery).toContain('"width":1200,"height":675');
    expect(countQuery).toContain('"blobBindingAudit"');
  });

  it('launches preparation early enough for the 8 AM Eastern queue and never installs a mail schedule', () => {
    expect(netlifyConfig).toContain('[functions."outbound-sales-morning-launch"]');
    expect(netlifyConfig).toContain('schedule = "30 9 * * *"');
    expect(netlifyConfig).toContain('[functions."outbound-sales-morning-replenish"]');
    expect(netlifyConfig).toContain('schedule = "30 10 * * *"');
    expect(netlifyConfig).toContain('[functions."outbound-sales-morning-finalize"]');
    expect(netlifyConfig).toContain('schedule = "0 11 * * *"');
    expect(netlifyConfig).toContain('[functions."outbound-sales-morning-finalize-retry"]');
    expect(netlifyConfig).toContain('schedule = "30 11 * * *"');
    expect(morningSource).not.toMatch(/resend|sendPermissionedMarketingMessage|emails\.send/i);
    expect(morningSource).toContain('externalEmailsSent: 0');
    expect(morningModule.MORNING_FINALIZER_BUDGET_MS).toBe(12 * 60 * 1000);
  });

  it('requires the licensed provider, verified-contact enrichment, budget, and a dedicated secret', () => {
    expect(() => morningModule.assertMorningConfiguration({})).toThrow(expect.objectContaining({ code: 'MORNING_PREP_DISABLED' }));
    expect(morningModule.assertMorningConfiguration(morningEnv)).toEqual({ dailyCreditLimit: 1200 });
    expect(morningHandlerModule.authorizedBackground({ headers: { 'x-morning-prep-token': morningEnv.OUTBOUND_MORNING_PREP_SECRET } }, morningEnv)).toBe(true);
    expect(morningHandlerModule.authorizedBackground({ headers: { 'x-morning-prep-token': 'wrong' } }, morningEnv)).toBe(false);
  });

  it('fails closed without dispatch when the generic logical batch cannot be claimed', async () => {
    const dispatchBackground = vi.fn();
    const handler = morningHandlerModule.createMorningScheduledHandler({
      action: 'launch',
      env: { ...morningEnv, DATABASE_URL: 'postgres://test.invalid/database' },
      dependencies: {
        createSql: vi.fn(() => vi.fn()),
        ensureMorningBatch: vi.fn().mockResolvedValue(null),
        dispatchBackground,
      },
    });
    const response = await handler({});
    expect(response.statusCode).toBe(204);
    expect(dispatchBackground).not.toHaveBeenCalled();
  });

  it('rotates two distinct provider pages across each high-value cohort before final selection', () => {
    expect(morningModule.MORNING_SHARD_COUNT).toBe(8);
    const requests = Array.from({ length: morningModule.MORNING_SHARD_COUNT }, (_, shardIndex) => (
      morningModule.morningDiscoveryRequest('2026-08-11', shardIndex)
    ));
    expect(new Set(requests.map((request) => request.requestKey)).size).toBe(8);
    expect(new Set(requests.map((request) => request.page)).size).toBe(8);
    expect(requests.every((request) => request.limit === 30)).toBe(true);
  });
});

describe('licensed company and contact enrichment', () => {
  it('selects one relevant verified work contact per company without revealing phones or personal emails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ organizations: [
        { id: 'org-a', name: 'Company A', primary_domain: 'companya.example', website_url: 'https://companya.example', industry: 'Footwear' },
        { id: 'org-b', name: 'Company B', primary_domain: 'companyb.example', website_url: 'https://companyb.example', industry: 'Construction' },
      ], pagination: { total_entries: 2 } }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [
        { id: 'person-a', organization_id: 'org-a', first_name: 'Avery', last_name: 'Stone', title: 'Marketing Director' },
        { id: 'person-b', organization_id: 'org-b', first_name: 'Morgan', last_name: 'Reed', title: 'Owner' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: [
        { id: 'person-a', organization_id: 'org-a', first_name: 'Avery', last_name: 'Stone', title: 'Marketing Director', email: 'avery@companya.example', email_status: 'verified' },
        { id: 'person-b', organization_id: 'org-b', first_name: 'Morgan', last_name: 'Reed', title: 'Owner', email: 'morgan@companyb.example', email_status: 'verified' },
      ], credits_consumed: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = apolloModule.createApolloAdapter({ env: morningEnv, fetchImpl, allowMorningPreparation: true });
    const result = await adapter.execute({ page: 1, limit: 2, requestKey: 'morning-test' });
    expect(result.records).toHaveLength(2);
    expect(result.records[0].contactCandidates[0]).toMatchObject({
      email: 'avery@companya.example', fullName: 'Avery Stone', jobTitle: 'Marketing Director',
      acquisitionMode: 'licensed_api', providerVerificationStatus: 'valid',
    });
    expect(result.records[1].contactCandidates[0].email).toBe('morgan@companyb.example');
    expect(result.usage).toMatchObject({ credits: 3, requestCount: 3, resultCount: 2 });
    const bulkBody = JSON.parse(fetchImpl.mock.calls[2][1].body);
    expect(bulkBody).toMatchObject({ reveal_personal_emails: false, reveal_phone_number: false });
  });
});

describe('morning preparation workflow', () => {
  it('is idempotent, budget bounded, imports only newly created prospects, and sends zero email', async () => {
    const repository = {
      ensureMorningBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: 'generic', status: 'discovering' }),
      claimMorningShard: vi.fn().mockResolvedValue({ id: 'shard-1' }),
      reserveMorningProviderCredits: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      attachMorningProspects: vi.fn().mockResolvedValue([COMPANY_A]),
      settleMorningProviderCredits: vi.fn().mockResolvedValue({ id: BATCH_ID }),
      completeMorningShard: vi.fn().mockResolvedValue({ id: 'shard-1', status: 'succeeded' }),
      failMorningShard: vi.fn(),
    };
    const provider = {
      estimateCredits: () => 31,
      execute: vi.fn().mockResolvedValue({
        records: [{ providerId: 'apollo', providerRecordId: 'org-a' }, { providerId: 'apollo', providerRecordId: 'org-b' }],
        usage: { credits: 3, requestCount: 3 },
      }),
    };
    const processProspect = vi.fn()
      .mockResolvedValueOnce({ prospectId: COMPANY_A, created: true, status: 'ready_for_outreach' })
      .mockResolvedValueOnce({ prospectId: COMPANY_B, created: false, status: 'ready_for_outreach' });
    const result = await morningModule.runMorningDiscoveryShard({
      sql: vi.fn(), env: morningEnv, businessDate: '2026-08-11', shardIndex: 0,
      dependencies: {
        repository, createApolloAdapter: () => provider, processProspect,
        appendAudit: vi.fn().mockResolvedValue({}), discovery: {},
      },
    });
    expect(result).toMatchObject({ newProspectCount: 1, providerCreditsUsed: 3, externalEmailsSent: 0 });
    expect(repository.attachMorningProspects).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prospectIds: [COMPANY_A] }));
    expect(repository.reserveMorningProviderCredits).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ credits: 31, dailyLimit: 1200 }));
  });

  it('builds grounded company-specific copy and excludes the rejected reply/pricing language', () => {
    const message = morningModule.buildMorningMessage(preparationCandidate(COMPANY_A, 'Company A', 'avery@companya.example'));
    expect(message.subject).toContain('Company A');
    expect(message.subject).toContain('custom banner printing');
    expect(message.bodyText.match(/Company A/g)?.length).toBeGreaterThanOrEqual(1);
    expect(message.bodyText).toContain('Hi Jordan');
    expect(message.bodyText).toContain('wanted to introduce Banners On The Fly');
    expect(message.bodyText).toContain('NEW20');
    expect(message.bodyText).not.toMatch(/quick mockup|complimentary|custom banner concept|public branding|reply with|size and quantity|Would it be useful|booth \d+/i);
  });

  it('prepares company-specific drafts without invoking any artwork generator', async () => {
    const candidates = [
      preparationCandidate(COMPANY_A, 'Company A', 'avery@companya.example'),
      preparationCandidate(COMPANY_B, 'Company B', 'morgan@companyb.example'),
    ];
    const savedMessages = [];
    const repository = {
      ensureMorningBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: 'generic', status: 'preparing' }),
      listMorningPreparationCandidates: vi.fn().mockResolvedValue(candidates),
      saveDeterministicMorningMessage: vi.fn(async (_sql, message) => { savedMessages.push(message); return { id: `message-${message.prospectId}` }; }),
      finalizeMorningBatch: vi.fn().mockResolvedValue({ batch: { status: 'partial', mockup_ready_count: 0 }, readyCount: 2 }),
    };
    const prepareCompanyMockup = vi.fn();
    const result = await morningModule.runMorningFinalizer({
      sql: vi.fn(), env: morningEnv, businessDate: '2026-08-11',
      dependencies: { repository, prepareCompanyMockup, appendAudit: vi.fn().mockResolvedValue({}) },
    });
    expect(savedMessages.map((message) => [message.prospectId, message.subject])).toEqual([
      [COMPANY_A, expect.stringContaining('Company A')],
      [COMPANY_B, expect.stringContaining('Company B')],
    ]);
    expect(result).toMatchObject({ readyCount: 2, messageReady: 2, mockupReady: 0, failed: 0, externalEmailsSent: 0 });
    expect(repository.listMorningPreparationCandidates).toHaveBeenCalledWith(expect.anything(), { batchId: BATCH_ID, limit: 210 });
    expect(prepareCompanyMockup).not.toHaveBeenCalled();
    expect(repository.finalizeMorningBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lastErrorCode: 'MORNING_TARGET_NOT_REACHED' }));
  });

  it('prepares exactly 70 drafts from a larger pool and leaves artwork for manual upload', async () => {
    const candidates = Array.from({ length: 72 }, (_, index) => preparationCandidate(
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      `Company ${index + 1}`,
      `contact${index + 1}@company${index + 1}.example`,
    ));
    const messages = new Map();
    const repository = {
      ensureMorningBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: 'generic', status: 'preparing' }),
      listMorningPreparationCandidates: vi.fn().mockResolvedValue(candidates),
      saveDeterministicMorningMessage: vi.fn(async (_sql, message) => {
        messages.set(message.prospectId, message);
        return { id: `message-${message.prospectId}` };
      }),
      finalizeMorningBatch: vi.fn().mockResolvedValue({ batch: { status: 'ready', mockup_ready_count: 0 }, readyCount: 70 }),
    };
    const prepareCompanyMockup = vi.fn();
    const result = await morningModule.runMorningFinalizer({
      sql: vi.fn(), env: morningEnv, businessDate: '2026-08-11',
      dependencies: { repository, prepareCompanyMockup, appendAudit: vi.fn().mockResolvedValue({}) },
    });
    expect(result).toMatchObject({ readyCount: 70, messageReady: 70, mockupReady: 0, failed: 0, externalEmailsSent: 0 });
    expect(messages.size).toBe(70);
    expect(prepareCompanyMockup).not.toHaveBeenCalled();
    expect(repository.finalizeMorningBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      targetCount: 70, lastErrorCode: null,
    }));
  });

  it('continues past a failed draft and checkpoints partial progress without artwork work', async () => {
    const candidates = [
      preparationCandidate(COMPANY_A, 'Company A', 'avery@companya.example'),
      preparationCandidate(COMPANY_B, 'Company B', 'morgan@companyb.example'),
    ];
    const repository = {
      ensureMorningBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: 'generic', status: 'preparing' }),
      listMorningPreparationCandidates: vi.fn().mockResolvedValue(candidates),
      saveDeterministicMorningMessage: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('draft write failed'), { code: 'DRAFT_SAVE_FAILED' }))
        .mockResolvedValue({ id: 'message-b' }),
      finalizeMorningBatch: vi.fn().mockResolvedValue({ batch: { status: 'partial', mockup_ready_count: 0 }, readyCount: 1 }),
    };
    const prepareCompanyMockup = vi.fn();

    const result = await morningModule.runMorningFinalizer({
      sql: vi.fn(), env: morningEnv, businessDate: '2026-08-11',
      dependencies: {
        repository,
        prepareCompanyMockup,
        appendAudit: vi.fn().mockResolvedValue({}),
      },
    });

    expect(result).toMatchObject({ readyCount: 1, processedCount: 2, messageReady: 1, failed: 1, timeBudgetReached: false });
    expect(prepareCompanyMockup).not.toHaveBeenCalled();
    expect(repository.finalizeMorningBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lastErrorCode: 'DRAFT_SAVE_FAILED',
    }));
  });

  it('always finalizes partial progress before the background execution deadline', async () => {
    const repository = {
      ensureMorningBatch: vi.fn().mockResolvedValue({ id: BATCH_ID, batch_key: 'generic', status: 'preparing' }),
      listMorningPreparationCandidates: vi.fn().mockResolvedValue([
        preparationCandidate(COMPANY_A, 'Company A', 'avery@companya.example'),
        preparationCandidate(COMPANY_B, 'Company B', 'morgan@companyb.example'),
      ]),
      saveDeterministicMorningMessage: vi.fn(),
      finalizeMorningBatch: vi.fn().mockResolvedValue({ batch: { status: 'partial' }, readyCount: 24 }),
    };
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValue(60_000);
    const result = await morningModule.runMorningFinalizer({
      sql: vi.fn(), env: morningEnv, businessDate: '2026-08-11', timeBudgetMs: 30_000,
      dependencies: {
        repository, clock, prepareCompanyMockup: vi.fn(), appendAudit: vi.fn().mockResolvedValue({}),
      },
    });
    expect(result).toMatchObject({ readyCount: 24, timeBudgetReached: true, externalEmailsSent: 0 });
    expect(repository.saveDeterministicMorningMessage).not.toHaveBeenCalled();
    expect(repository.finalizeMorningBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lastErrorCode: 'MORNING_PREPARATION_TIME_BUDGET',
    }));
  });
});

describe('Sales Admin production workflow', () => {
  it('applies compound filters in one parameterized query and persists notes separately from sending', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await manualRepository.listManualReviewLeads(sql, {
      reviewView: 'today', sort: 'company_asc',
      filters: {
        search: 'Company', event: 'Atlanta Shoe Market', source: 'apollo', industry: 'Footwear',
        importedDate: '2026-08-11', qualification: 'qualified', readiness: 'ready',
        contacted: 'no', hasEmail: 'yes', hasPhone: 'yes', mockup: 'ready', emailStatus: 'ready',
      },
    });
    const listQuery = sql.mock.calls[0][0];
    expect(listQuery).toContain('business_name ILIKE');
    expect(listQuery).toContain("COALESCE(provider_metadata->>'eventName',mockup_event_label)=");
    expect(listQuery).toContain("source_provider_id=");
    expect(listQuery).toContain("imported_business_date");
    expect(listQuery).toContain("mockup_status='ready'");
    expect(listQuery).toContain('mockup_generation_metadata @>');
    expect(listQuery).toContain("mockup_quality_level='manual_upload'");
    expect(listQuery).toContain("mockup_render_version='company-banner-manual-upload-v1'");
    expect(listQuery).toContain('"source":"manual_upload"');
    expect(listQuery).toContain('"administratorUploaded":true');
    expect(listQuery).toContain('"width":1200,"height":675');
    expect(listQuery).toContain('"blobBindingAudit"');
    expect(listQuery).toContain('ORDER BY business_name ASC');
    const noteSql = vi.fn().mockResolvedValue([{ prospect_id: COMPANY_A, review_notes: 'Qualified', updated_at: '2026-08-11T12:00:00Z' }]);
    await manualRepository.saveManualReviewNote(noteSql, { prospectId: COMPANY_A, notes: 'Qualified', reviewedBy: 'admin@example.com' });
    expect(noteSql.mock.calls[0][0]).toContain('review_notes=EXCLUDED.review_notes');
    expect(noteSql.mock.calls[0][0]).not.toMatch(/send_state='processing'|outbound_messages/i);
  });

  it('uses the server-computed full production contract for the Ready UI state', () => {
    expect(salesAdminSource).toContain('mockup?.presentationReady === true');
    expect(salesAdminSource).not.toMatch(/function mockupIsPresentationReady[\s\S]{0,320}compositionAudit\.noClipGuaranteed/);
  });

  it('exposes the rapid Today → preview → Send → next workflow and all requested filter groups', () => {
    expect(salesAdminSource).toContain("['today', \"Today's Leads\"]");
    expect(salesAdminSource).toContain('setAdvanceAfterSend(true)');
    expect(salesAdminSource).toContain('saveOutboundLeadNote');
    for (const label of ['Trade show / event', 'Lead source', 'Industry / category', 'Date imported', 'Qualification', 'Send readiness', 'Contacted previously', 'Has email', 'Has phone', 'Banner upload', 'Email status']) {
      expect(salesAdminSource).toContain(label);
    }
    expect(salesAdminSource).toContain('Copy prompt');
    expect(salesAdminSource).toContain('Drop the finished banner image here');
    expect(salesAdminSource).toContain('No automatic image generation');
    expect(salesAdminSource).toContain('Clear filters');
  });
});
