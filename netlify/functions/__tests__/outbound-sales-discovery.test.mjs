import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import serverAuth from '../_shared/server-auth.cjs';
import providerContract from '../_shared/outbound-sales/providers/contract.cjs';
import apolloProvider from '../_shared/outbound-sales/providers/apollo.cjs';
import providerRegistry from '../_shared/outbound-sales/providers/registry.cjs';
import ssrf from '../_shared/outbound-sales/ssrf.cjs';
import researchModule from '../_shared/outbound-sales/research.cjs';
import emailModule from '../_shared/outbound-sales/email.cjs';
import qualificationModule from '../_shared/outbound-sales/qualification.cjs';
import exclusionsModule from '../_shared/outbound-sales/exclusions.cjs';
import discoveryModule from '../_shared/outbound-sales/discovery.cjs';
import discoveryRepository from '../_shared/outbound-sales/discovery-repository.cjs';
import prospectHandlers from '../_shared/outbound-sales/prospects-handler.cjs';
import phase2Migration from '../../../migrations/022_outbound_discovery_qualification.sql?raw';
import phase2Rollback from '../../../migrations/022_outbound_discovery_qualification.rollback.sql?raw';

const { createSessionToken } = serverAuth;
const { normalizeDiscoveryRequest, normalizeProviderProspect, assertProviderAdapter } = providerContract;
const { createApolloAdapter, APOLLO_ORGANIZATION_SEARCH_URL, DEFAULT_COST_PER_CREDIT_MICROUSD } = apolloProvider;
const { createDiscoveryAdapter, enabledDiscoveryProviderConfigs, hasDiscoveryAdapter } = providerRegistry;
const { isPublicIp, normalizeWebsiteUrl, resolvePublicHost, fetchWebsitePage } = ssrf;
const { researchWebsite, EXTRACTION_VERSION } = researchModule;
const { normalizeEmail, extractPublicEmails, assessEmail, assessEmailCandidates } = emailModule;
const { scoreLead, QUALIFICATION_VERSION } = qualificationModule;
const { loadExclusions } = exclusionsModule;
const { runShadowDiscovery, assertShadowControls } = discoveryModule;
const { storeContacts } = discoveryRepository;
const { createProspectHandler, prospectsCsv } = prospectHandlers;

function adminEvent(queryStringParameters = {}) {
  const token = createSessionToken({ id: 'phase2-admin', email: 'admin@example.test', is_admin: true });
  return {
    httpMethod: 'GET',
    headers: { authorization: `Bearer ${token}`, host: 'preview.example.test', 'x-forwarded-proto': 'https' },
    queryStringParameters,
  };
}

function fixtureResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function requestFixture(responses, capture = []) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = vi.fn();
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
    request.end = () => {
      const fixture = responses.shift();
      const response = Readable.from([Buffer.from(fixture.body || '')]);
      response.statusCode = fixture.status || 200;
      response.headers = fixture.headers || { 'content-type': 'text/html' };
      response.socket = { remoteAddress: fixture.remoteAddress || '93.184.216.34' };
      capture.push({ url: url.toString(), options });
      queueMicrotask(() => callback(response));
    };
    return request;
  };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'phase2-contract-session-secret';
  delete process.env.NETLIFY_DATABASE_URL;
  delete process.env.DATABASE_URL;
});

describe('provider-neutral discovery and licensed Apollo adapter', () => {
  it('bounds a provider-neutral request and requires a cost-aware licensed adapter', () => {
    expect(normalizeDiscoveryRequest({
      locations: [' Louisville, KY ', 'Louisville, KY'], keywords: ['events'],
      employeeRanges: ['1,10', 'invalid'], page: -9, limit: 1000, requestKey: 'daily:2026-08-05',
    })).toEqual({
      locations: ['Louisville, KY'], keywords: ['events'], employeeRanges: ['1,10'],
      jobTitles: [], page: 1, limit: 30, requestKey: 'daily:2026-08-05',
    });
    const base = {
      id: 'future_source', kind: 'discovery', acquisitionMode: 'licensed_api',
      getConfigurationStatus() {}, execute() {}, normalize() {},
    };
    expect(() => assertProviderAdapter(base)).toThrow(/estimateCost/);
    expect(assertProviderAdapter({ ...base, estimateCost: () => 0 }).id).toBe('future_source');
  });

  it('keeps provider construction behind a registry so future licensed sources do not change the core engine', () => {
    const futureFactory = () => ({
      id: 'future_source', kind: 'discovery', acquisitionMode: 'licensed_api',
      getConfigurationStatus: () => ({ configured: true }),
      execute: async () => ({ records: [], usage: { requestCount: 1, resultCount: 0, estimatedCostMicrousd: 0 } }),
      normalize: (record) => record, estimateCost: () => 0,
    });
    const factories = { future_source: futureFactory };
    expect(hasDiscoveryAdapter('future_source', factories)).toBe(true);
    expect(createDiscoveryAdapter('future_source', {}, factories).id).toBe('future_source');
    expect(enabledDiscoveryProviderConfigs([
      { id: 'missing_source', enabled: true },
      { id: 'future_source', enabled: true },
      { id: 'disabled_source', enabled: false },
    ], factories)).toStrictEqual([{ id: 'future_source', enabled: true }]);
    expect(() => createDiscoveryAdapter('missing_source', {}, factories)).toThrow(/not installed/i);
  });

  it('uses Apollo Organization Search only in test/staging and normalizes a fixture without leaking the key', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe(APOLLO_ORGANIZATION_SEARCH_URL);
      expect(init.headers['x-api-key']).toBe('dedicated-apollo-test-key');
      expect(JSON.parse(init.body)).toMatchObject({ page: 1, per_page: 30, organization_locations: ['Kentucky'] });
      return fixtureResponse({
        organizations: [{
          id: 'apollo-org-1', name: 'River City Events', primary_domain: 'www.rivercityevents.com',
          industry: 'events services', city: 'Louisville', state: 'Kentucky', estimated_num_employees: 12,
          keywords: ['event planner', 'festival'],
        }],
        pagination: { total_entries: 1 },
      }, 200, { 'x-rate-limit-remaining': '42' });
    });
    const adapter = createApolloAdapter({
      env: { NODE_ENV: 'test', CONTEXT: 'test', OUTBOUND_APOLLO_API_KEY: 'dedicated-apollo-test-key' }, fetchImpl,
    });
    const result = await adapter.execute({ locations: ['Kentucky'], requestKey: 'fixture-one' });
    expect(result.records[0]).toMatchObject({
      providerId: 'apollo', providerRecordId: 'apollo-org-1', businessName: 'River City Events',
      canonicalDomain: 'rivercityevents.com', dedupeFingerprint: 'domain:rivercityevents.com',
    });
    expect(result.usage).toMatchObject({ requestCount: 1, resultCount: 1, credits: 1, estimatedCostMicrousd: DEFAULT_COST_PER_CREDIT_MICROUSD, rateLimitRemaining: 42 });
    expect(JSON.stringify(result)).not.toContain('dedicated-apollo-test-key');

    const production = createApolloAdapter({
      env: { CONTEXT: 'production', OUTBOUND_PHASE2_SHADOW_EXECUTION_ENABLED: 'true', OUTBOUND_APOLLO_API_KEY: 'key' }, fetchImpl,
    });
    await expect(production.execute({ requestKey: 'blocked' })).rejects.toMatchObject({ code: 'PROVIDER_EXECUTION_CONTEXT_BLOCKED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('SSRF-safe website transport', () => {
  it('blocks private, reserved, mixed-DNS, credential, IP-literal, and nonstandard-port targets', async () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '169.254.169.254', '192.168.1.2', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '2001:2::1', '2001:20::1', '2001:db8::1', '2002:0a00:1::1', '3fff::1', '::ffff:127.0.0.1']) {
      expect(isPublicIp(address), address).toBe(false);
    }
    expect(isPublicIp('93.184.216.34')).toBe(true);
    expect(isPublicIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
    expect(() => normalizeWebsiteUrl('http://user:pass@example.com')).toThrow(/credentials/i);
    expect(() => normalizeWebsiteUrl('http://127.0.0.1')).toThrow(/IP-literal/i);
    expect(() => normalizeWebsiteUrl('http://example.com:8080')).toThrow(/ports/i);
    await expect(resolvePublicHost('mixed.example.org', async () => [
      { address: '93.184.216.34', family: 4 }, { address: '10.0.0.9', family: 4 },
    ])).rejects.toMatchObject({ code: 'WEBSITE_PRIVATE_ADDRESS_BLOCKED' });
  });

  it('pins the approved public address, bounds bytes, and revalidates redirects', async () => {
    const captures = [];
    const lookup = vi.fn(async (hostname) => [{ address: hostname === 'www.example.org' ? '93.184.216.35' : '93.184.216.34', family: 4 }]);
    const requestImpl = requestFixture([
      { status: 302, headers: { location: 'https://www.example.org/about', 'content-type': 'text/html' }, remoteAddress: '93.184.216.34' },
      { status: 200, headers: { 'content-type': 'text/html', etag: '"v1"' }, body: '<h1>About</h1>', remoteAddress: '93.184.216.35' },
    ], captures);
    const response = await fetchWebsitePage('https://example.org', { lookup, requestImpl, maxBytes: 1000 });
    expect(response).toMatchObject({ status: 200, finalUrl: 'https://www.example.org/about', body: '<h1>About</h1>', etag: '"v1"' });
    expect(lookup).toHaveBeenCalledTimes(2);
    const pinned = [];
    for (const capture of captures) capture.options.lookup('ignored', {}, (_error, address) => pinned.push(address));
    expect(pinned).toEqual(['93.184.216.34', '93.184.216.35']);
  });

  it('retries another validated public address when the first CDN edge cannot connect', async () => {
    const pinned = [];
    let requestCount = 0;
    const requestImpl = (url, options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = vi.fn();
      request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
      request.end = () => {
        options.lookup(url.hostname, {}, (_error, address) => pinned.push(address));
        requestCount += 1;
        if (requestCount === 1) {
          const error = new Error('stale CDN edge');
          error.code = 'ECONNRESET';
          queueMicrotask(() => request.emit('error', error));
          return;
        }
        const response = Readable.from([Buffer.from('<h1>Recovered</h1>')]);
        response.statusCode = 200;
        response.headers = { 'content-type': 'text/html' };
        response.socket = { remoteAddress: '93.184.216.35' };
        queueMicrotask(() => callback(response));
      };
      return request;
    };
    const response = await fetchWebsitePage('https://example.org', {
      lookup: async () => [
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        { address: '93.184.216.34', family: 4 },
        { address: '93.184.216.35', family: 4 },
      ],
      requestImpl,
      timeoutMs: 6000,
    });
    expect(response.body).toBe('<h1>Recovered</h1>');
    expect(pinned).toEqual(['93.184.216.34', '93.184.216.35']);
  });

  it('blocks HTTPS downgrade redirects', async () => {
    const requestImpl = requestFixture([
      { status: 302, headers: { location: 'http://www.example.org/about', 'content-type': 'text/html' }, remoteAddress: '93.184.216.34' },
    ]);
    await expect(fetchWebsitePage('https://example.org', {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }], requestImpl,
    })).rejects.toMatchObject({ code: 'WEBSITE_REDIRECT_DOWNGRADE_BLOCKED' });
  });
});

describe('deterministic extraction, hashing, and cache invalidation', () => {
  const homeHtml = `<!doctype html><html><head><title>River City Events</title><meta name="description" content="Festivals and community events"></head><body>
    <h1>Grand opening festival</h1><p>Now hiring for our new location. Contact jane@rivercityevents.com.</p>
    <a href="/events">Event calendar</a><script>secret@tracker.invalid</script></body></html>`;
  const eventHtml = '<html><body><h1>Upcoming events</h1><p>Trade show sponsorship banners and displays.</p></body></html>';

  it('extracts deterministic evidence and reuses unchanged conditional responses', async () => {
    const pages = new Map([
      ['https://rivercityevents.com/', { status: 200, finalUrl: 'https://rivercityevents.com/', contentType: 'text/html', body: homeHtml, bytes: homeHtml.length, etag: 'home-v1', lastModified: null, notModified: false }],
      ['https://rivercityevents.com/events', { status: 200, finalUrl: 'https://rivercityevents.com/events', contentType: 'text/html', body: eventHtml, bytes: eventHtml.length, etag: 'events-v1', lastModified: null, notModified: false }],
    ]);
    const first = await researchWebsite({ websiteUrl: 'https://rivercityevents.com/', fetchPage: async (url) => pages.get(url) });
    expect(first.extractionVersion).toBe(EXTRACTION_VERSION);
    expect(first.emailCandidates).toEqual([{ email: 'jane@rivercityevents.com', sourceUrl: 'https://rivercityevents.com/' }]);
    expect(first.bannerNeedSignals.map((signal) => signal.code)).toEqual(expect.arrayContaining([
      'upcoming_events', 'hiring_or_expansion', 'promotions_or_grand_openings', 'visible_print_marketing_need',
    ]));
    expect(JSON.stringify(first.pageManifest)).not.toContain('secret@tracker.invalid');

    const conditional = vi.fn(async (url, options) => {
      expect(options.etag).toBe(url.endsWith('/events') ? 'events-v1' : 'home-v1');
      return { status: 304, finalUrl: url, notModified: true, body: null, bytes: 0, etag: options.etag, lastModified: null };
    });
    const second = await researchWebsite({ websiteUrl: 'https://rivercityevents.com/', previousSnapshot: first, fetchPage: conditional });
    expect(second).toMatchObject({ contentHash: first.contentHash, contentChanged: false, cacheStatus: 'reused' });
    expect(second.extractedFacts.responsesReused).toBe(2);

    const changedHome = homeHtml.replace('new location', 'three new locations and an open house');
    const third = await researchWebsite({
      websiteUrl: 'https://rivercityevents.com/', previousSnapshot: second,
      fetchPage: async (url) => url.endsWith('/events')
        ? { status: 304, finalUrl: url, notModified: true, body: null, bytes: 0, etag: 'events-v1' }
        : { status: 200, finalUrl: url, contentType: 'text/html', body: changedHome, bytes: changedHome.length, etag: 'home-v2', notModified: false },
    });
    expect(third.contentHash).not.toBe(first.contentHash);
    expect(third).toMatchObject({ contentChanged: true, cacheStatus: 'fresh' });

    const normalizedHomepage = vi.fn(async (_url, options) => ({
      status: 304, finalUrl: 'https://rivercityevents.com/', notModified: true,
      body: null, bytes: 0, etag: options.etag, lastModified: null,
    }));
    await researchWebsite({
      websiteUrl: 'https://rivercityevents.com',
      previousSnapshot: { ...first, pageManifest: first.pageManifest.slice(0, 1) },
      fetchPage: normalizedHomepage,
    });
    expect(normalizedHomepage).toHaveBeenCalledWith('https://rivercityevents.com/', expect.objectContaining({ etag: 'home-v1' }));
  });

  it('invalidates the research hash when public contact metadata changes without visible-text changes', async () => {
    const firstMarkup = '<html><head><meta name="description" content="One"></head><body><a href="mailto:first@example.org">Contact us</a></body></html>';
    const secondMarkup = firstMarkup.replace('content="One"', 'content="Two"').replace('first@example.org', 'second@example.org');
    const run = (body) => researchWebsite({
      websiteUrl: 'https://example.org/',
      fetchPage: async () => ({ status: 200, finalUrl: 'https://example.org/', contentType: 'text/html', body, bytes: body.length, notModified: false }),
    });
    expect((await run(secondMarkup)).contentHash).not.toBe((await run(firstMarkup)).contentHash);
  });
});

describe('public email extraction and verification-state handling', () => {
  it('extracts public addresses, validates syntax, caches MX by domain, and never marks DNS-only contacts sendable', async () => {
    expect(normalizeEmail(' Sales @example.com ')).toBeNull();
    expect(normalizeEmail('Jane.Doe@Example.com')).toBe('jane.doe@example.com');
    expect(extractPublicEmails('Email jane [at] example [dot] com or MAILTO:info@example.com')).toEqual(['jane@example.com', 'info@example.com']);
    const resolveMx = vi.fn(async () => [{ exchange: 'mx.example.com', priority: 10 }]);
    const contacts = await assessEmailCandidates([
      { email: 'jane@example.com', sourceUrl: 'https://example.com/contact' },
      { email: 'info@example.com', sourceUrl: 'https://example.com/contact' },
    ], { businessDomain: 'example.com', resolveMx });
    expect(resolveMx).toHaveBeenCalledTimes(1);
    expect(contacts[0]).toMatchObject({ emailNormalized: 'jane@example.com', syntaxValid: true, mxStatus: 'present', verificationStatus: 'unverified', sendEligible: false });
    expect(contacts[0].domainMatches).toBe(true);
    expect(contacts.find((contact) => contact.emailNormalized === 'info@example.com')).toMatchObject({ isRoleAddress: true, verificationStatus: 'risky', sendEligible: false });
    const missing = await assessEmail('jane@missing.example', { businessDomain: 'missing.example', resolveMx: async () => { const error = new Error('none'); error.code = 'ENODATA'; throw error; } });
    expect(missing).toMatchObject({ mxStatus: 'missing', verificationStatus: 'invalid', sendEligible: false });
  });

  it('deactivates stale contacts, refreshes rediscovered evidence, and always persists send-ineligible state', async () => {
    const calls = [];
    const sql = vi.fn(async (query) => {
      calls.push(query);
      if (query.includes('SELECT id, email')) return [];
      return [];
    });
    await storeContacts(sql, 'prospect-1', [{
      email: 'jane@example.com', emailNormalized: 'jane@example.com', sourceUrl: 'https://example.com/contact',
      contactQualityScore: 90, verificationStatus: 'unverified', verificationReason: 'MX present.',
      syntaxValid: true, isRoleAddress: false, isFreeMailbox: false, domainMatches: true,
      mxStatus: 'present', mxCheckedAt: '2026-08-05T00:00:00.000Z', sendEligible: false,
    }]);
    expect(calls[0]).toMatch(/SET active = FALSE, is_primary = FALSE/i);
    const upsert = calls.find((query) => query.includes('INSERT INTO outbound_contacts'));
    expect(upsert).toMatch(/ON CONFLICT \(LOWER\(email_normalized\)\) DO UPDATE/i);
    expect(upsert).toMatch(/active = TRUE/i);
    expect(upsert).toMatch(/send_eligible = FALSE/i);
    expect(calls.find((query) => query.includes('SELECT id, email'))).toMatch(/active = TRUE/i);
  });
});

describe('transparent deterministic qualification and exclusions', () => {
  it('shows every scoring reason and makes hard exclusions authoritative', () => {
    const prospect = { industry: 'Event Services', businessType: 'Festival planner', websiteUrl: 'https://events.example', locationCount: 3 };
    const research = {
      contentHash: 'hash', sourceUrls: ['https://events.example'], websiteFreshnessScore: 90,
      bannerNeedSignals: [
        { code: 'upcoming_events', label: 'Events', evidence: 'Event calendar', sourceUrl: 'https://events.example/events' },
        { code: 'promotions_or_grand_openings', label: 'Opening', evidence: 'Grand opening', sourceUrl: 'https://events.example' },
        { code: 'visible_print_marketing_need', label: 'Banners', evidence: 'Sponsor banners', sourceUrl: 'https://events.example/events' },
      ],
    };
    const contacts = [{ contactQualityScore: 100, mxStatus: 'present', syntaxValid: true, isRoleAddress: false, isFreeMailbox: false, domainMatches: true, sourceUrl: 'https://events.example/contact' }];
    const result = scoreLead({ prospect, research, contacts });
    expect(result).toMatchObject({ qualificationVersion: QUALIFICATION_VERSION, status: 'ready_for_outreach', qualified: true, outreachCandidate: true });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.explanations.map((item) => item.factor)).toEqual(expect.arrayContaining(['industry', 'upcoming_events', 'visible_print_marketing_need', 'contact_quality', 'email_verification']));

    const suppressed = scoreLead({ prospect, research, contacts, exclusions: [{ code: 'EXISTING_CUSTOMER', detail: 'Order exists', hard: true }] });
    expect(suppressed).toMatchObject({ status: 'suppressed', score: 0, exclusionCodes: ['EXISTING_CUSTOMER'] });
  });

  it('checks suppression, previous contact, and existing customers without writing legacy tables', async () => {
    const calls = [];
    const sql = vi.fn(async (query) => {
      calls.push(query);
      if (query.includes('FROM outbound_suppressions')) return [{ scope: 'company_domain', reason: 'manual', source: 'admin' }];
      if (query.includes('FROM outbound_prospects')) return [{ id: 'prior', status: 'contacted' }];
      if (query.includes('FROM orders')) return [{ id: 'customer-order' }];
      return [];
    });
    const exclusions = await loadExclusions(sql, {
      providerId: 'apollo', providerRecordId: 'org-1', canonicalDomain: 'events.example',
    }, ['jane@events.example']);
    expect(exclusions.map((entry) => entry.code)).toEqual(['SUPPRESSED_MANUAL', 'PREVIOUSLY_CONTACTED', 'EXISTING_CUSTOMER']);
    expect(calls.find((query) => query.includes('FROM orders')).trim()).toMatch(/^SELECT/i);
    expect(calls.join('\n')).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?orders/i);
  });
});

describe('Shadow Mode orchestration, accounting, and admin queue', () => {
  it('requires Shadow Mode and durable provider idempotency before any provider call', async () => {
    expect(() => assertShadowControls({ controls: { outboundSalesEnabled: false, shadowModeEnabled: true, liveSendingEnabled: false }, providerEnabled: true })).toThrow(/kill switch/);
    expect(() => assertShadowControls({ controls: { outboundSalesEnabled: true, shadowModeEnabled: false, liveSendingEnabled: false }, providerEnabled: true })).toThrow(/Shadow Mode/);
    expect(() => assertShadowControls({ controls: { outboundSalesEnabled: true, shadowModeEnabled: true, liveSendingEnabled: true }, providerEnabled: true })).toThrow(/Shadow Mode/);
    const provider = {
      id: 'fixture_provider', kind: 'discovery', acquisitionMode: 'licensed_api',
      getConfigurationStatus: () => ({ configured: true }), estimateCost: () => 0,
      execute: vi.fn(), normalize: (value) => value,
    };
    const result = await runShadowDiscovery({
      provider, sql: vi.fn(), providerEnabled: true,
      controls: { outboundSalesEnabled: true, shadowModeEnabled: true, liveSendingEnabled: false, emergencyPaused: false },
      request: { requestKey: 'already-complete' },
      loadProviderUsage: async () => ({ id: 'usage-1', status: 'completed' }),
    });
    expect(result).toMatchObject({ skipped: true, reason: 'REQUEST_ALREADY_ACCOUNTED' });
    expect(provider.execute).not.toHaveBeenCalled();

    const reserved = await runShadowDiscovery({
      provider, sql: vi.fn(), providerEnabled: true,
      controls: { outboundSalesEnabled: true, shadowModeEnabled: true, liveSendingEnabled: false, emergencyPaused: false },
      request: { requestKey: 'concurrent-reservation' },
      loadProviderUsage: async () => null,
      reserveBudget: async () => ({ id: 'ledger-1', status: 'reserved', existing: true }),
    });
    expect(reserved).toMatchObject({ skipped: true, reason: 'REQUEST_ALREADY_RESERVED' });
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it('accounts for one provider request and produces only deterministic Shadow Mode outcomes', async () => {
    const normalized = normalizeProviderProspect('fixture_provider', {
      providerRecordId: 'org-1', businessName: 'River City Events', websiteUrl: 'https://events.example', industry: 'Events',
    });
    const provider = {
      id: 'fixture_provider', kind: 'discovery', acquisitionMode: 'licensed_api',
      getConfigurationStatus: () => ({ configured: true }), estimateCost: () => 2500,
      execute: vi.fn(async () => ({
        records: [normalized],
        usage: { requestCount: 1, resultCount: 1, credits: 1, estimatedCostMicrousd: 2500, actualCostMicrousd: 2400 },
      })),
      normalize: (value) => value,
    };
    const audit = vi.fn(async () => ({}));
    const saveQualification = vi.fn(async () => ({}));
    const result = await runShadowDiscovery({
      provider, sql: vi.fn(), providerEnabled: true,
      controls: { outboundSalesEnabled: true, shadowModeEnabled: true, liveSendingEnabled: false, emergencyPaused: false },
      request: { requestKey: 'phase2-fixture-run', limit: 1 },
      loadProviderUsage: async () => null,
      reserveBudget: async () => ({ id: 'ledger-1' }),
      commitBudget: async () => ({ id: 'ledger-1' }),
      recordProviderUsage: vi.fn(async () => ({})),
      dependencies: {
        storeNormalizedProspect: async () => ({ prospect: { id: 'prospect-1', status: 'discovered' }, created: true, duplicateMatch: null }),
        appendAudit: audit,
        loadExclusions: async () => [],
        loadLatestResearch: async () => null,
        researchWebsite: async () => ({
          contentHash: 'content-1', contentChanged: true, cacheStatus: 'fresh', extractionVersion: EXTRACTION_VERSION,
          websiteUrl: 'https://events.example', finalUrl: 'https://events.example/', httpStatus: 200,
          contentType: 'text/html', contentBytes: 100, sourceUrls: ['https://events.example/'],
          extractedFacts: { pagesAnalyzed: 1 }, evidence: [], bannerNeedSignals: [], websiteFreshnessScore: 20,
          emailCandidates: [], pageManifest: [],
        }),
        saveResearch: async () => ({}),
        assessEmailCandidates: async () => [],
        storeContacts: async () => [],
        scoreLead,
        saveQualification,
      },
    });
    expect(result).toMatchObject({ skipped: false, providerId: 'fixture_provider', usage: { actualCostMicrousd: 2400 } });
    expect(result.prospects[0]).toMatchObject({ prospectId: 'prospect-1', status: 'rejected' });
    expect(saveQualification).toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'prospect.deterministically_qualified' }));
    expect(JSON.stringify(result)).not.toMatch(/subject|bodyHtml|resend|openai/i);
  });

  it('requires admin auth, returns no secrets, and exports spreadsheet-safe CSV', async () => {
    const loader = vi.fn(async () => ({
      prospects: [{
        id: 'p-1', businessName: '=HYPERLINK("bad")', canonicalDomain: 'safe.example', websiteUrl: 'https://safe.example',
        industry: 'Events', businessType: null, status: 'qualified', leadScore: 55, researchState: 'fetched', contactState: 'none',
        primaryContact: null, rejectionReason: null, suppressionReason: null, sourceProviderId: 'apollo', sourceUrls: [],
        scoreExplanation: [], discoveredAt: '2026-08-05T00:00:00Z', lastQualifiedAt: null,
      }],
      total: 1, limit: 50, offset: 0, statusCounts: { qualified: 1 }, providerUsage: [],
    }));
    const handler = createProspectHandler({ createSql: () => vi.fn(), listShadowProspects: loader, appendAudit: vi.fn() });
    const unauthorized = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });
    expect(unauthorized.statusCode).toBe(401);
    process.env.NETLIFY_DATABASE_URL = 'postgres://configured.example/db';
    const response = await handler(adminEvent());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ shadowMode: true, liveSending: false, total: 1 });
    expect(response.body).not.toMatch(/api[_-]?key|authorization|password/i);
    expect(prospectsCsv((await loader()).prospects)).toContain("'=HYPERLINK");
  });
});

describe('Phase 2 migration and isolation contracts', () => {
  it('adds only outbound objects, keeps Apollo disabled, and provides a non-CASCADE outbound-only rollback', () => {
    const executable = phase2Migration.replace(/--.*$/gm, '');
    const rollback = phase2Rollback.replace(/--.*$/gm, '');
    const altered = [...executable.matchAll(/ALTER TABLE\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
    const created = [...executable.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
    expect(altered.length).toBeGreaterThan(0);
    expect([...altered, ...created].every((name) => name.startsWith('outbound_'))).toBe(true);
    expect(created).toEqual(['outbound_prospect_sources']);
    expect(executable).toContain("'apollo'");
    expect(executable).toMatch(/'Apollo Organization Search',\s*FALSE/i);
    expect(executable).not.toMatch(/(?:ALTER|UPDATE|DELETE|INSERT INTO)\s+(?:orders|profiles|users|payments)\b/i);
    expect(rollback).not.toMatch(/\bCASCADE\b/i);
    expect(rollback).not.toMatch(/(?:ALTER|UPDATE|DELETE|DROP)\s+(?:orders|profiles|users|payments)\b/i);
  });
});
