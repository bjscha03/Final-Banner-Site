'use strict';

const {
  assertProviderAdapter,
  assertDiscoveryResult,
  normalizeDiscoveryRequest,
  normalizeProviderProspect,
} = require('./contract.cjs');

const APOLLO_ORGANIZATION_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search';
const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
const APOLLO_BULK_PEOPLE_MATCH_URL = 'https://api.apollo.io/api/v1/people/bulk_match';
const DEFAULT_COST_PER_CREDIT_MICROUSD = 19600;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXECUTION_CONTEXTS = new Set(['dev', 'deploy-preview', 'branch-deploy', 'test']);

function boundedInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function assertShadowExecutionAllowed(env = process.env, { allowMorningPreparation = false } = {}) {
  const context = String(env.CONTEXT || (env.NODE_ENV === 'test' ? 'test' : '')).trim().toLowerCase();
  const morningPreparation = allowMorningPreparation === true
    && env.OUTBOUND_MORNING_PREP_ENABLED === 'true'
    && ['production', 'deploy-preview', 'branch-deploy', 'dev', 'test'].includes(context);
  if (morningPreparation) return context;
  const explicitTest = context === 'test' && env.NODE_ENV === 'test';
  const explicitlyEnabled = env.OUTBOUND_PHASE2_SHADOW_EXECUTION_ENABLED === 'true';
  if (!ALLOWED_EXECUTION_CONTEXTS.has(context) || (!explicitTest && !explicitlyEnabled)) {
    const error = new Error('Licensed discovery execution is available only in explicitly enabled test or staging contexts.');
    error.code = 'PROVIDER_EXECUTION_CONTEXT_BLOCKED';
    throw error;
  }
  if (context === 'production') {
    const error = new Error('Licensed discovery execution is blocked outside an approved non-production validation context.');
    error.code = 'PROVIDER_EXECUTION_CONTEXT_BLOCKED';
    throw error;
  }
  return context;
}

function readHeader(headers, names) {
  for (const name of names) {
    const value = headers?.get?.(name);
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function rateLimitMetadata(headers) {
  const remaining = boundedInteger(readHeader(headers, [
    'x-rate-limit-remaining',
    'x-ratelimit-remaining',
    'x-minute-requests-left',
  ]));
  const resetRaw = readHeader(headers, ['x-rate-limit-reset', 'x-ratelimit-reset']);
  const resetSeconds = boundedInteger(resetRaw);
  return {
    remaining,
    resetAt: resetSeconds === null ? null : new Date(resetSeconds * 1000).toISOString(),
    retryAfterSeconds: boundedInteger(readHeader(headers, ['retry-after'])),
  };
}

function primaryPhone(record) {
  if (typeof record?.phone === 'string') return record.phone;
  if (typeof record?.primary_phone?.number === 'string') return record.primary_phone.number;
  if (typeof record?.primary_phone?.sanitized_number === 'string') return record.primary_phone.sanitized_number;
  return null;
}

function normalizeApolloOrganization(record) {
  const providerRecordId = record?.id || record?.organization_id;
  const websiteUrl = record?.website_url || (record?.primary_domain ? `https://${record.primary_domain}` : null);
  const keywords = Array.isArray(record?.keywords)
    ? record.keywords.filter((value) => typeof value === 'string').slice(0, 25)
    : [];
  const locationCount = boundedInteger(record?.retail_location_count);
  return normalizeProviderProspect('apollo', {
    providerRecordId,
    businessName: record?.name,
    websiteUrl,
    canonicalDomain: record?.primary_domain || record?.domain,
    phone: primaryPhone(record),
    industry: record?.industry || record?.industries?.[0],
    businessType: keywords[0] || record?.industry || null,
    locationCount: locationCount && locationCount > 0 ? locationCount : null,
    address: {
      line1: record?.street_address,
      city: record?.city,
      region: record?.state,
      postalCode: record?.postal_code,
      country: record?.country,
    },
    contactCandidates: Array.isArray(record?.__contactCandidates) ? record.__contactCandidates.slice(0, 3) : [],
    providerMetadata: {
      apolloOrganizationId: providerRecordId,
      estimatedEmployees: boundedInteger(record?.estimated_num_employees),
      revenue: boundedInteger(record?.organization_revenue),
      retailLocationCount: locationCount,
      foundedYear: boundedInteger(record?.founded_year),
      sixMonthHeadcountGrowth: Number.isFinite(Number(record?.organization_headcount_six_month_growth))
        ? Number(record.organization_headcount_six_month_growth)
        : null,
      twelveMonthHeadcountGrowth: Number.isFinite(Number(record?.organization_headcount_twelve_month_growth))
        ? Number(record.organization_headcount_twelve_month_growth)
        : null,
      keywords,
    },
  });
}

function requestPayload(request) {
  const payload = { page: request.page, per_page: request.limit };
  if (request.locations.length) payload.organization_locations = request.locations;
  if (request.keywords.length) payload.q_organization_keyword_tags = request.keywords;
  if (request.employeeRanges.length) payload.organization_num_employees_ranges = request.employeeRanges;
  if (request.jobTitles.length) payload.q_organization_job_titles = request.jobTitles;
  return payload;
}

async function readBoundedBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    const error = new Error('Apollo response exceeded the safety limit.');
    error.code = 'PROVIDER_RESPONSE_TOO_LARGE';
    throw error;
  }
  if (!response.body?.getReader) {
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
      const error = new Error('Apollo response exceeded the safety limit.');
      error.code = 'PROVIDER_RESPONSE_TOO_LARGE';
      throw error;
    }
    return raw;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        const error = new Error('Apollo response exceeded the safety limit.');
        error.code = 'PROVIDER_RESPONSE_TOO_LARGE';
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function requestApolloJson(url, payload, { apiKey, fetchImpl, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'User-Agent': 'BannersOnTheFly-Morning-Prospecting/1.0',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const wrapped = new Error(error?.name === 'AbortError' ? 'Apollo request timed out.' : 'Apollo request failed.');
    wrapped.code = error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
  const rateLimit = rateLimitMetadata(response.headers);
  if (response.status === 429) {
    const error = new Error('Apollo rate limit reached.');
    error.code = 'PROVIDER_RATE_LIMITED';
    error.retryAfterSeconds = rateLimit.retryAfterSeconds;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Apollo request was rejected with status ${response.status}.`);
    error.code = response.status === 401 || response.status === 403
      ? 'PROVIDER_AUTHORIZATION_FAILED'
      : 'PROVIDER_REQUEST_REJECTED';
    throw error;
  }
  const raw = await readBoundedBody(response);
  try {
    return { payload: raw ? JSON.parse(raw) : {}, rateLimit };
  } catch {
    const error = new Error('Apollo returned invalid JSON.');
    error.code = 'PROVIDER_INVALID_RESPONSE';
    throw error;
  }
}

function titlePriority(person) {
  const title = String(person?.title || '').toLowerCase();
  if (/owner|founder|president|chief executive|ceo/.test(title)) return 100;
  if (/event|trade show|exhibit/.test(title)) return 95;
  if (/marketing|brand|communications/.test(title)) return 90;
  if (/operations|general manager|office manager/.test(title)) return 80;
  if (/sales|business development/.test(title)) return 70;
  return 20;
}

function personOrganizationId(person) {
  return String(person?.organization_id || person?.organization?.id || person?.account_id || '').trim();
}

async function enrichApolloOrganizationContacts(organizations, {
  apiKey, fetchImpl = globalThis.fetch, emailCreditsPerPerson = 9,
} = {}) {
  const organizationIds = [...new Set((organizations || []).map((record) => String(record?.id || record?.organization_id || '').trim()).filter(Boolean))].slice(0, 30);
  if (!organizationIds.length) return { contactsByOrganization: new Map(), credits: 0, requestCount: 0 };
  const peopleResponse = await requestApolloJson(APOLLO_PEOPLE_SEARCH_URL, {
    organization_ids: organizationIds,
    person_titles: ['owner', 'founder', 'events', 'trade show', 'marketing', 'brand', 'communications', 'operations', 'general manager'],
    contact_email_status: ['verified'],
    page: 1,
    per_page: Math.min(100, organizationIds.length * 4),
  }, { apiKey, fetchImpl });
  const people = (Array.isArray(peopleResponse.payload?.people) ? peopleResponse.payload.people : [])
    .filter((person) => person?.id && organizationIds.includes(personOrganizationId(person)))
    .sort((left, right) => titlePriority(right) - titlePriority(left));
  const selected = [];
  const selectedOrganizations = new Set();
  for (const person of people) {
    const organizationId = personOrganizationId(person);
    if (!organizationId || selectedOrganizations.has(organizationId)) continue;
    selectedOrganizations.add(organizationId);
    selected.push(person);
  }
  const contactsByOrganization = new Map();
  let credits = 0;
  let requestCount = 1;
  for (let index = 0; index < selected.length; index += 10) {
    const chunk = selected.slice(index, index + 10);
    const matched = await requestApolloJson(APOLLO_BULK_PEOPLE_MATCH_URL, {
      details: chunk.map((person) => ({ id: person.id })),
      reveal_personal_emails: false,
      reveal_phone_number: false,
    }, { apiKey, fetchImpl, timeoutMs: 20000 });
    requestCount += 1;
    const matches = Array.isArray(matched.payload?.matches) ? matched.payload.matches : [];
    const reportedCredits = boundedInteger(matched.payload?.credits_consumed);
    credits += reportedCredits ?? (matches.filter((person) => person?.email).length * Math.max(1, emailCreditsPerPerson));
    matches.forEach((person, matchIndex) => {
      const sourcePerson = chunk[matchIndex];
      const organizationId = personOrganizationId(person) || personOrganizationId(sourcePerson);
      const email = typeof person?.email === 'string' ? person.email.trim() : '';
      const status = String(person?.email_status || '').toLowerCase();
      if (!organizationId || !email || status !== 'verified') return;
      contactsByOrganization.set(organizationId, [{
        email,
        fullName: [person?.first_name || sourcePerson?.first_name, person?.last_name || sourcePerson?.last_name].filter(Boolean).join(' ').trim() || null,
        jobTitle: person?.title || sourcePerson?.title || null,
        acquisitionMode: 'licensed_api',
        providerVerificationStatus: 'valid',
        verificationProviderId: 'apollo',
        verificationProviderRecordId: String(person?.id || sourcePerson?.id || ''),
        sourceUrl: null,
      }]);
    });
  }
  return { contactsByOrganization, credits, requestCount };
}

function createApolloAdapter({ env = process.env, fetchImpl = globalThis.fetch, allowMorningPreparation = false } = {}) {
  const adapter = {
    id: 'apollo',
    kind: 'discovery',
    acquisitionMode: 'licensed_api',
    displayName: 'Apollo Organization Search',

    getConfigurationStatus() {
      return {
        configured: typeof env.OUTBOUND_APOLLO_API_KEY === 'string' && env.OUTBOUND_APOLLO_API_KEY.trim().length > 0,
        executionContextAllowed: (() => {
          try { assertShadowExecutionAllowed(env, { allowMorningPreparation }); return true; } catch { return false; }
        })(),
      };
    },

    estimateCredits(input = {}) {
      const request = normalizeDiscoveryRequest(input);
      const emailCredits = Math.max(1, Math.min(9, boundedInteger(env.OUTBOUND_APOLLO_EMAIL_CREDITS_PER_PERSON, 9)));
      return 1 + (env.OUTBOUND_APOLLO_ENRICH_CONTACTS === 'true' ? request.limit * emailCredits : 0);
    },

    estimateCost(input = {}) {
      const configuredCost = boundedInteger(env.OUTBOUND_APOLLO_CREDIT_COST_MICROUSD);
      return (configuredCost ?? DEFAULT_COST_PER_CREDIT_MICROUSD) * adapter.estimateCredits(input);
    },

    normalize: normalizeApolloOrganization,

    async execute(input = {}) {
      assertShadowExecutionAllowed(env, { allowMorningPreparation });
      const apiKey = String(env.OUTBOUND_APOLLO_API_KEY || '').trim();
      if (!apiKey) {
        const error = new Error('Apollo is not configured for morning lead preparation.');
        error.code = 'PROVIDER_NOT_CONFIGURED';
        throw error;
      }
      if (typeof fetchImpl !== 'function') throw new TypeError('Apollo transport is unavailable.');
      const request = normalizeDiscoveryRequest(input);
      const organizationResponse = await requestApolloJson(
        APOLLO_ORGANIZATION_SEARCH_URL, requestPayload(request), { apiKey, fetchImpl },
      );
      const { payload, rateLimit } = organizationResponse;
      const sourceRecords = Array.isArray(payload.organizations)
        ? payload.organizations
        : Array.isArray(payload.accounts) ? payload.accounts : [];
      const eligibleSourceRecords = sourceRecords.slice(0, request.limit).filter((record) => record?.id && record?.name);
      let enrichment = { contactsByOrganization: new Map(), credits: 0, requestCount: 0 };
      if (env.OUTBOUND_APOLLO_ENRICH_CONTACTS === 'true' && eligibleSourceRecords.length) {
        enrichment = await enrichApolloOrganizationContacts(eligibleSourceRecords, {
          apiKey,
          fetchImpl,
          emailCreditsPerPerson: Math.max(1, Math.min(9, boundedInteger(env.OUTBOUND_APOLLO_EMAIL_CREDITS_PER_PERSON, 9))),
        });
      }
      const records = eligibleSourceRecords
        .map((record) => ({ ...record, __contactCandidates: enrichment.contactsByOrganization.get(String(record.id || record.organization_id)) || [] }))
        .map(adapter.normalize);
      const credits = 1 + enrichment.credits;
      const unitCost = boundedInteger(env.OUTBOUND_APOLLO_CREDIT_COST_MICROUSD) ?? DEFAULT_COST_PER_CREDIT_MICROUSD;
      return assertDiscoveryResult({
        records,
        usage: {
          requestCount: 1 + enrichment.requestCount,
          resultCount: records.length,
          credits,
          estimatedCostMicrousd: adapter.estimateCost(request),
          actualCostMicrousd: credits * unitCost,
          rateLimitRemaining: rateLimit.remaining,
          rateLimitResetAt: rateLimit.resetAt,
        },
        pagination: {
          page: request.page,
          perPage: request.limit,
          totalEntries: boundedInteger(payload?.pagination?.total_entries ?? payload?.total_entries),
        },
      });
    },
  };
  return assertProviderAdapter(adapter);
}

module.exports = {
  APOLLO_ORGANIZATION_SEARCH_URL,
  APOLLO_PEOPLE_SEARCH_URL,
  APOLLO_BULK_PEOPLE_MATCH_URL,
  DEFAULT_COST_PER_CREDIT_MICROUSD,
  ALLOWED_EXECUTION_CONTEXTS,
  assertShadowExecutionAllowed,
  normalizeApolloOrganization,
  readBoundedBody,
  requestApolloJson,
  enrichApolloOrganizationContacts,
  createApolloAdapter,
};
