import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import serverAuth from '../_shared/server-auth.cjs';
import outboundConfig from '../_shared/outbound-sales/config.cjs';
import outboundSchema from '../_shared/outbound-sales/schema.cjs';
import providerContract from '../_shared/outbound-sales/providers/contract.cjs';
import providerManifest from '../_shared/outbound-sales/providers/manifest.cjs';
import outboundSecurity from '../_shared/outbound-sales/security.cjs';
import outboundHandler from '../_shared/outbound-sales/handler.cjs';
import outboundJobs from '../_shared/outbound-sales/jobs.cjs';
import outboundBudget from '../_shared/outbound-sales/budget.cjs';
import migrationSql from '../../../migrations/021_outbound_sales_foundation.sql?raw';
import appSource from '../../../src/App.tsx?raw';
import ordersSource from '../../../src/pages/admin/Orders.tsx?raw';
import netlifyConfigSource from '../../../netlify.toml?raw';

const outboundRuntimeSources = import.meta.glob('../_shared/outbound-sales/**/*.cjs', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const outboundFunctionSources = import.meta.glob('../outbound-*.mjs', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const { createSessionToken } = serverAuth;
const {
  getRuntimeConfig,
  defaultSettings,
  effectiveControlState,
  DEFAULT_DAILY_SEND_LIMIT,
  DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS,
  OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS,
} = outboundConfig;
const {
  PROSPECT_STATUSES,
  REPLY_CLASSIFICATIONS,
  LEAD_SCORE_FACTORS,
  EXPERIMENT_DIMENSIONS,
} = outboundSchema;
const { normalizeProviderProspect, assertProviderAdapter } = providerContract;
const { getProviderConfigurationStatus } = providerManifest;
const { sanitizeForAudit } = outboundSecurity;
const { createHandlers } = outboundHandler;
const { JOB_TYPES, retryDelaySeconds, safeJobErrorMessage, enqueueJob, claimJobs } = outboundJobs;
const { validateCost, reserveBudget, MAX_OPENAI_COST_PER_PROSPECT_MICROUSD } = outboundBudget;

const originalEnvironment = { ...process.env };

function adminEvent(method = 'GET', body = {}, origin = 'https://preview.example.test') {
  const token = createSessionToken({ id: 'test-admin', email: 'admin@example.test', is_admin: true });
  return {
    httpMethod: method,
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      host: 'preview.example.test',
      'x-forwarded-proto': 'https',
      'x-nf-request-id': 'outbound-test-request',
    },
    body: JSON.stringify(body),
  };
}

function readySnapshot(overrides = {}) {
  return {
    schemaReady: true,
    settings: { ...defaultSettings(), settingsVersion: 1 },
    metrics: {
      prospectsTotal: 0,
      readyForOutreach: 0,
      messagesTotal: 0,
      messagesSent: 0,
      repliesTotal: 0,
      activeJobs: 0,
      deadJobs: 0,
    },
    monthlyCostsMicrousd: { openAI: 0, discovery: 0, emailVerification: 0, resend: 0 },
    providerConfigs: [],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'outbound-foundation-test-secret';
  delete process.env.OUTBOUND_SALES_ENABLED;
  delete process.env.OUTBOUND_LIVE_SENDING_AVAILABLE;
  delete process.env.OUTBOUND_OPENAI_API_KEY;
  delete process.env.OUTBOUND_RESEND_API_KEY;
  delete process.env.OUTBOUND_RESEND_WEBHOOK_SECRET;
  delete process.env.OUTBOUND_EMAIL_VERIFICATION_API_KEY;
  delete process.env.NETLIFY_DATABASE_URL;
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('isolated outbound runtime configuration', () => {
  it('fails closed in Shadow Mode defaults with the required budget and daily ceiling', () => {
    const runtime = getRuntimeConfig({});
    expect(runtime).toMatchObject({
      outboundSalesEnabled: false,
      liveSendingAvailable: false,
      defaultShadowModeEnabled: true,
      defaultLiveSendingEnabled: false,
      defaultDailySendLimit: 30,
      defaultMonthlyOpenAIBudgetCents: 800,
      openAIProjectLimitRecommendationCents: 1000,
    });
    expect(DEFAULT_DAILY_SEND_LIMIT).toBe(30);
    expect(DEFAULT_MONTHLY_OPENAI_BUDGET_CENTS).toBe(800);
    expect(OPENAI_PROJECT_LIMIT_RECOMMENDATION_CENTS).toBe(1000);
  });

  it('reports secret presence as booleans without returning secret values', () => {
    const runtime = getRuntimeConfig({
      OUTBOUND_OPENAI_API_KEY: 'outbound-openai-secret-value',
      OUTBOUND_RESEND_API_KEY: 'outbound-resend-secret-value',
      OUTBOUND_RESEND_WEBHOOK_SECRET: 'outbound-webhook-secret-value',
      OUTBOUND_EMAIL_VERIFICATION_API_KEY: 'outbound-verification-secret-value',
    });
    expect(runtime.secretStatus).toEqual({ openAI: true, resend: true, resendWebhook: true, emailVerification: true });
    expect(JSON.stringify(runtime)).not.toContain('secret-value');
  });

  it('requires every independent gate before reporting live sending', () => {
    const settings = { ...defaultSettings(), shadowModeEnabled: false, liveSendingEnabled: true };
    expect(effectiveControlState(settings, getRuntimeConfig({})).mode).toBe('disabled');
    expect(effectiveControlState(settings, getRuntimeConfig({ OUTBOUND_SALES_ENABLED: 'true' })).mode).toBe('shadow');
    expect(effectiveControlState(settings, getRuntimeConfig({ OUTBOUND_SALES_ENABLED: 'true', OUTBOUND_LIVE_SENDING_AVAILABLE: 'true' }))).toMatchObject({ mode: 'live', liveSendingEnabled: true });
    expect(effectiveControlState({ ...settings, emergencyPaused: true }, getRuntimeConfig({ OUTBOUND_SALES_ENABLED: 'true', OUTBOUND_LIVE_SENDING_AVAILABLE: 'true' }))).toMatchObject({ mode: 'emergency_paused', liveSendingEnabled: false });
  });

  it('never reads the AI Designer or transactional Resend credentials', () => {
    const runtime = getRuntimeConfig({
      OPENAI_API_KEY: 'designer-key-must-not-be-reused',
      RESEND_API_KEY: 'transactional-key-must-not-be-reused',
    });
    expect(runtime.secretStatus).toEqual({ openAI: false, resend: false, resendWebhook: false, emailVerification: false });
    const source = Object.values(outboundRuntimeSources).join('\n');
    expect(source).not.toMatch(/process\.env\.OPENAI_API_KEY/);
    expect(source).not.toMatch(/process\.env\.RESEND_API_KEY/);
    expect(source).not.toMatch(/process\.env\.VITE_/);
    expect(source).not.toContain("../ai-designer/");
  });
});

describe('provider-neutral prospect contract', () => {
  it('normalizes every provider into one internal prospect shape', () => {
    const normalized = normalizeProviderProspect('future_provider', {
      providerRecordId: 'biz-123',
      businessName: '  River City Events, LLC  ',
      websiteUrl: 'https://www.RiverCityEvents.example/grand-opening',
      industry: 'Events',
      locationCount: 3,
      address: { city: 'Louisville', region: 'KY' },
      providerMetadata: { providerCategory: 'event planner', apiKey: 'never-persist-this' },
    });
    expect(normalized).toMatchObject({
      providerId: 'future_provider',
      providerRecordId: 'biz-123',
      businessName: 'River City Events, LLC',
      normalizedBusinessName: 'river city events llc',
      canonicalDomain: 'rivercityevents.example',
      dedupeFingerprint: 'domain:rivercityevents.example',
      locationCount: 3,
      providerMetadata: { providerCategory: 'event planner' },
    });
    expect(JSON.stringify(normalized)).not.toContain('never-persist-this');
    const addressOnly = normalizeProviderProspect('another_provider', {
      businessName: 'River City Events, LLC',
      address: { city: 'Louisville', state: 'KY', zip: '40202' },
    });
    expect(addressOnly.dedupeFingerprint).toBe('business_location:river city events llc|louisville|ky|40202');
    expect(normalizeProviderProspect('another_provider', {
      businessName: 'Unsafe URL',
      websiteUrl: 'javascript:alert(1)',
    }).websiteUrl).toBeNull();
  });

  it('validates adapters without coupling the core to a named provider', () => {
    const adapter = {
      id: 'licensed_future_source',
      kind: 'discovery',
      acquisitionMode: 'licensed_api',
      getConfigurationStatus() {},
      execute() {},
      normalize() {},
    };
    expect(assertProviderAdapter(adapter)).toBe(adapter);
    expect(() => assertProviderAdapter({ id: 'bad', kind: 'scraper' })).toThrow(/kind/i);
    expect(() => assertProviderAdapter({ ...adapter, acquisitionMode: 'scrape_prohibited_source' })).toThrow(/licensed API/i);
  });

  it('keeps every Phase 1 provider inactive while returning configuration status only', () => {
    const providers = getProviderConfigurationStatus({ OUTBOUND_APOLLO_API_KEY: 'configured-value' });
    expect(providers.find((provider) => provider.id === 'apollo')).toMatchObject({ configured: true, adapterInstalled: false, enabled: false });
    expect(providers.every((provider) => provider.enabled === false)).toBe(true);
    expect(JSON.stringify(providers)).not.toContain('configured-value');
  });
});

describe('pipeline, scoring, reply, and experiment contracts', () => {
  it('contains every approved pipeline status in order', () => {
    expect(PROSPECT_STATUSES).toEqual([
      'discovered', 'qualified', 'rejected', 'ready_for_outreach', 'contacted',
      'replied', 'interested', 'quote_requested', 'quote_sent', 'won', 'lost',
      'unsubscribed', 'suppressed',
    ]);
  });

  it('contains every approved reply classification', () => {
    expect(REPLY_CLASSIFICATIONS).toEqual([
      'interested', 'quote_request', 'question', 'not_now', 'not_interested',
      'unsubscribe', 'out_of_office', 'wrong_contact', 'automatic_reply', 'unclear',
    ]);
  });

  it('exposes transparent deterministic scoring factors and controlled experiment dimensions', () => {
    expect(LEAD_SCORE_FACTORS).toEqual(expect.arrayContaining([
      'industry', 'location_count', 'upcoming_events', 'hiring_or_expansion',
      'real_estate_activity', 'construction_activity', 'visible_print_marketing_need',
      'contact_quality', 'email_verification', 'website_freshness', 'prior_customer_or_suppression',
    ]));
    expect(EXPERIMENT_DIMENSIONS).toEqual([
      'subject_line_style', 'call_to_action_style', 'email_length', 'offer_framing', 'industry_positioning',
    ]);
  });
});

describe('admin-only fail-closed handlers', () => {
  it('rejects unauthenticated status access before touching the database', async () => {
    const createSql = vi.fn();
    const handlers = createHandlers({ createSql });
    const response = await handlers.statusHandler({ httpMethod: 'GET', headers: {}, body: '' });
    expect(response.statusCode).toBe(401);
    expect(createSql).not.toHaveBeenCalled();
  });

  it('returns safe disabled defaults when the migration is not available', async () => {
    const handlers = createHandlers();
    const response = await handlers.statusHandler(adminEvent());
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      schemaReady: false,
      databaseConfigured: false,
      controls: { mode: 'disabled', shadowModeEnabled: true, liveSendingEnabled: false, dailySendLimit: 30 },
      safeguards: { providerExecutionInstalled: false, openAICallsInstalled: false, emailSendingInstalled: false, scheduledAutomationInstalled: false },
    });
  });

  it('rejects cross-origin settings writes', async () => {
    const updateSettings = vi.fn();
    const handlers = createHandlers({ updateSettings });
    const response = await handlers.settingsHandler(adminEvent('PUT', { settingsVersion: 1 }, 'https://attacker.example.test'));
    expect(response.statusCode).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('phase-locks live sending even for an authenticated administrator', async () => {
    process.env.NETLIFY_DATABASE_URL = 'postgres://example.test/db';
    const updateSettings = vi.fn();
    const handlers = createHandlers({
      createSql: () => ({}),
      loadFoundationSnapshot: async () => readySnapshot(),
      updateSettings,
      getRuntimeConfig: () => getRuntimeConfig({ OUTBOUND_SALES_ENABLED: 'true' }),
    });
    const response = await handlers.settingsHandler(adminEvent('PUT', {
      settingsVersion: 1,
      shadowModeEnabled: false,
      liveSendingEnabled: true,
    }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('LIVE_SENDING_PHASE_LOCKED');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('allows safe Shadow Mode controls and passes only normalized values to the repository', async () => {
    process.env.NETLIFY_DATABASE_URL = 'postgres://example.test/db';
    const updateSettings = vi.fn(async (_sql, next) => ({ ...defaultSettings(), ...next, settingsVersion: 2 }));
    const handlers = createHandlers({
      createSql: () => ({}),
      loadFoundationSnapshot: async () => readySnapshot(),
      updateSettings,
      getRuntimeConfig: () => getRuntimeConfig({}),
    });
    const response = await handlers.settingsHandler(adminEvent('PUT', {
      settingsVersion: 1,
      emergencyPaused: true,
      dailySendLimit: 12,
      monthlyOpenAIBudgetCents: 600,
    }));
    expect(response.statusCode).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({}, expect.objectContaining({
      shadowModeEnabled: true,
      liveSendingEnabled: false,
      emergencyPaused: true,
      dailySendLimit: 12,
      monthlyOpenAIBudgetCents: 600,
    }), expect.objectContaining({ expectedVersion: 1 }));
  });
});

describe('jobs, retries, audit redaction, and budget enforcement', () => {
  it('provides bounded jittered retries and redacts credentials from job errors', () => {
    expect(retryDelaySeconds(1, () => 0.5)).toBe(30);
    expect(retryDelaySeconds(20, () => 1)).toBeLessThanOrEqual(6 * 60 * 60 * 1.2);
    const apiKey = ['sk', 'proj', 'super', 'secret', 'value'].join('-');
    const databaseUrl = ['postgres://user', 'password@db.example/test'].join(':');
    const message = safeJobErrorMessage(new Error(`failed ${apiKey} ${databaseUrl}`));
    expect(message).not.toContain('super-secret-value');
    expect(message).not.toContain('password@');
  });

  it('uses durable dedupe and SKIP LOCKED job claims', async () => {
    const calls = [];
    const sql = async (query, params) => { calls.push({ query, params }); return []; };
    await enqueueJob(sql, { jobType: 'research', dedupeKey: 'research:prospect:1', payload: { prospectId: 'one', apiKey: 'do-not-store' } });
    await claimJobs(sql, { workerId: 'worker-one', jobTypes: ['research'], limit: 5 });
    expect(calls[0].query).toContain('ON CONFLICT DO NOTHING');
    expect(calls[0].params[0]).not.toContain('do-not-store');
    expect(calls[1].query).toContain('FOR UPDATE SKIP LOCKED');
    expect(JOB_TYPES).not.toContain('auto_reply');
  });

  it('enforces the one-cent OpenAI application ceiling before a reservation query', () => {
    expect(validateCost('openai', MAX_OPENAI_COST_PER_PROSPECT_MICROUSD)).toBe(10000);
    expect(() => validateCost('openai', 10001)).toThrow(/ceiling/i);
  });

  it('reserves monthly budget atomically under a row lock', async () => {
    const calls = [];
    const query = async (sqlText, params) => {
      calls.push({ query: sqlText, params });
      return [{ id: 'ledger-1', category: 'openai', reservation_key: 'prospect-generation-1', estimated_cost_microusd: 1200 }];
    };
    const sql = {
      transaction: vi.fn(async (callback) => {
        expect(callback.constructor.name).toBe('Function');
        return Promise.all(callback(query));
      }),
    };
    await reserveBudget(sql, {
      category: 'openai',
      reservationKey: 'prospect-generation-1',
      estimatedCostMicrousd: 1200,
      referenceType: 'prospect',
    });
    expect(sql.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(calls[0].query).toContain('FOR UPDATE');
    expect(calls[0].query).toContain("date_trunc('month', NOW())");
    expect(calls[0].query).toContain('INSERT INTO outbound_cost_ledger');
    expect(calls[0].query).toContain('ON CONFLICT (reservation_key) DO NOTHING');
  });

  it('retries bounded serialization conflicts before reserving budget', async () => {
    let attempts = 0;
    const query = async () => [];
    const sql = {
      transaction: vi.fn(async (callback) => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('serialization conflict');
          error.code = '40001';
          throw error;
        }
        return Promise.all(callback(query));
      }),
    };
    await expect(reserveBudget(sql, {
      category: 'openai',
      reservationKey: 'prospect-generation-retry',
      estimatedCostMicrousd: 1000,
    })).resolves.toBeNull();
    expect(sql.transaction).toHaveBeenCalledTimes(2);
  });

  it('removes secret-bearing fields from nested audit metadata', () => {
    const sanitized = sanitizeForAudit({
      status: 'shadow',
      apiKey: 'never-log-me',
      nested: { authorization: 'Bearer secret', providerRequestId: 'req_safe_123' },
    });
    expect(sanitized).toEqual({ status: 'shadow', nested: { providerRequestId: 'req_safe_123' } });
  });
});

describe('database and existing-site regression contracts', () => {
  it('keeps migration 021 additive and confined to outbound objects', () => {
    const sql = migrationSql;
    const createdTables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
    expect(createdTables.length).toBeGreaterThanOrEqual(10);
    expect(createdTables.every((name) => name.startsWith('outbound_'))).toBe(true);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|SCHEMA)\b/i);
    expect(sql).not.toMatch(/REFERENCES\s+(?:orders|order_items|profiles|email_events)\b/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('enforces Shadow Mode defaults, statuses, one initial email, and append-only audit in SQL', () => {
    const sql = migrationSql;
    expect(sql).toMatch(/shadow_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE/i);
    expect(sql).toMatch(/live_sending_enabled BOOLEAN NOT NULL DEFAULT FALSE/i);
    expect(sql).toMatch(/daily_send_limit SMALLINT NOT NULL DEFAULT 30/i);
    expect(sql).toMatch(/monthly_openai_budget_cents INTEGER NOT NULL DEFAULT 800/i);
    expect(sql).toContain('outbound_messages_one_initial_per_prospect_uidx');
    expect(sql).toContain('outbound_prospects_dedupe_fingerprint_uidx');
    expect(sql).toContain('outbound_prospect_status_audit_trigger');
    expect(sql).toContain('outbound_opportunity_status_audit_trigger');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS outbound_order_attributions');
    expect(sql).toContain('outbound_audit_log_immutable_trigger');
  });

  it('contains no runtime DDL or external execution entrypoint in Phase 1', () => {
    const runtimeSource = Object.values(outboundRuntimeSources).join('\n');
    expect(runtimeSource).not.toMatch(/CREATE\s+TABLE/i);
    expect(runtimeSource).not.toMatch(/ALTER\s+TABLE/i);
    expect(runtimeSource).not.toMatch(/new\s+OpenAI|\.responses\.create|\.chat\.completions\.create/);
    expect(runtimeSource).not.toMatch(/new\s+Resend|\.emails\.send/);
    const entries = Object.keys(outboundFunctionSources).map((entry) => entry.split('/').at(-1));
    expect(entries.sort()).toEqual(['outbound-sales-settings.mjs', 'outbound-sales-status.mjs']);
  });

  it('adds the admin shell without changing checkout, payment, Designer, or transactional webhook routes', () => {
    expect(appSource).toContain('path="/admin/sales"');
    expect(ordersSource).toContain('AI Sales Engine');
    expect(appSource).toContain('path="/checkout" element={<Checkout />}');
    expect(appSource).toContain('path="/admin/ai-designer" element={<AIDesignerPage />}');
    expect(netlifyConfigSource).not.toContain('outbound-sales-worker');
    expect(netlifyConfigSource).not.toContain('outbound-sales-scheduler');
  });
});
