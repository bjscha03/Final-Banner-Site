'use strict';

const { domainToASCII } = require('node:url');
const { sanitizeForAudit } = require('../security.cjs');

const DISCOVERY_ADAPTER_VERSION = '1.0';
const MAX_DISCOVERY_RESULTS = 30;

function cleanText(value, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}

function canonicalDomain(value) {
  const raw = cleanText(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const hostname = domainToASCII(url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''));
    return hostname || null;
  } catch {
    return null;
  }
}

function normalizeStringArray(value, { maxItems = 20, maxLength = 120 } = {}) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => cleanText(entry, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeDiscoveryRequest(input = {}) {
  const limit = Number.isInteger(input.limit) ? input.limit : MAX_DISCOVERY_RESULTS;
  return Object.freeze({
    locations: normalizeStringArray(input.locations, { maxItems: 10, maxLength: 120 }),
    keywords: normalizeStringArray(input.keywords, { maxItems: 20, maxLength: 100 }),
    employeeRanges: normalizeStringArray(input.employeeRanges, { maxItems: 10, maxLength: 40 })
      .filter((value) => /^\d+,\d+$/.test(value)),
    jobTitles: normalizeStringArray(input.jobTitles, { maxItems: 10, maxLength: 120 }),
    page: Math.max(1, Math.min(500, Number.isInteger(input.page) ? input.page : 1)),
    limit: Math.max(1, Math.min(MAX_DISCOVERY_RESULTS, limit)),
    requestKey: cleanText(input.requestKey, 300),
  });
}

function safeWebUrl(value) {
  const raw = cleanText(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAddress(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    line1: cleanText(input.line1 || input.address1 || input.street, 300),
    line2: cleanText(input.line2 || input.address2, 300),
    city: cleanText(input.city, 200),
    region: cleanText(input.region || input.state, 100),
    postalCode: cleanText(input.postalCode || input.postal_code || input.zip, 40),
    country: cleanText(input.country, 100),
  });
}

function normalizeContactCandidates(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((contact) => ({
    email: cleanText(contact?.email, 254),
    fullName: cleanText(contact?.fullName, 200),
    jobTitle: cleanText(contact?.jobTitle, 200),
    acquisitionMode: contact?.acquisitionMode === 'licensed_api' ? 'licensed_api' : null,
    providerVerificationStatus: contact?.providerVerificationStatus === 'valid' ? 'valid' : null,
    verificationProviderId: cleanText(contact?.verificationProviderId, 64),
    verificationProviderRecordId: cleanText(contact?.verificationProviderRecordId, 300),
    sourceUrl: safeWebUrl(contact?.sourceUrl),
  })).filter((contact) => contact.email);
}

function dedupeFingerprint({ canonicalDomain: domain, normalizedBusinessName, phone, address }) {
  if (domain) return `domain:${domain}`;
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (normalizedPhone.length >= 7) return `phone:${normalizedPhone}`;
  const location = [address.line1, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean)
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .join('|');
  return normalizedBusinessName && location ? `business_location:${normalizedBusinessName}|${location}` : null;
}

function normalizeProviderProspect(providerId, input = {}) {
  const businessName = cleanText(input.businessName, 300);
  const providerRecordId = cleanText(input.providerRecordId, 500);
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(String(providerId || ''))) {
    throw new TypeError('A normalized provider id is required.');
  }
  if (!businessName) throw new TypeError('A business name is required.');

  const websiteUrl = safeWebUrl(input.websiteUrl);
  const domain = canonicalDomain(input.canonicalDomain || websiteUrl);
  const sourceUrl = safeWebUrl(input.sourceUrl);
  const normalizedBusinessName = businessName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const phone = cleanText(input.phone, 100);
  const address = normalizeAddress(input.address);
  return Object.freeze({
    providerId,
    providerRecordId,
    sourceUrl,
    businessName,
    normalizedBusinessName,
    dedupeFingerprint: dedupeFingerprint({ canonicalDomain: domain, normalizedBusinessName, phone, address }),
    websiteUrl,
    canonicalDomain: domain,
    phone,
    industry: cleanText(input.industry, 200),
    businessType: cleanText(input.businessType, 200),
    locationCount: Number.isInteger(input.locationCount) && input.locationCount >= 0 ? input.locationCount : null,
    address,
    contactCandidates: normalizeContactCandidates(input.contactCandidates),
    providerMetadata: input.providerMetadata && typeof input.providerMetadata === 'object' && !Array.isArray(input.providerMetadata)
      ? sanitizeForAudit(input.providerMetadata)
      : {},
  });
}

function assertProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Provider adapter is required.');
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(String(adapter.id || ''))) throw new TypeError('Provider adapter id is invalid.');
  if (!['discovery', 'email_verification'].includes(adapter.kind)) throw new TypeError('Provider adapter kind is invalid.');
  if (!['licensed_api', 'first_party'].includes(adapter.acquisitionMode)) {
    throw new TypeError('Provider adapters must declare a licensed API or first-party acquisition mode.');
  }
  if (typeof adapter.getConfigurationStatus !== 'function') throw new TypeError('Provider adapter must expose configuration status.');
  if (typeof adapter.execute !== 'function') throw new TypeError('Provider adapter must expose execute().');
  if (typeof adapter.normalize !== 'function') throw new TypeError('Provider adapter must expose normalize().');
  if (adapter.kind === 'discovery' && typeof adapter.estimateCost !== 'function') {
    throw new TypeError('Discovery adapters must expose estimateCost().');
  }
  return adapter;
}

function assertDiscoveryResult(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.records)) {
    throw new TypeError('A discovery result must contain a records array.');
  }
  const usage = result.usage || {};
  for (const field of ['requestCount', 'resultCount', 'estimatedCostMicrousd']) {
    const value = Number(usage[field]);
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Discovery usage ${field} is invalid.`);
  }
  if (result.records.length > MAX_DISCOVERY_RESULTS) throw new TypeError('Discovery results exceed the engine limit.');
  if (usage.resultCount !== result.records.length) throw new TypeError('Discovery result count does not match the normalized records.');
  const records = result.records.map((record) => normalizeProviderProspect(record?.providerId, record));
  if (usage.actualCostMicrousd !== null && usage.actualCostMicrousd !== undefined) {
    const actual = Number(usage.actualCostMicrousd);
    if (!Number.isSafeInteger(actual) || actual < 0) throw new TypeError('Discovery usage actualCostMicrousd is invalid.');
  }
  return { ...result, records };
}

module.exports = {
  DISCOVERY_ADAPTER_VERSION,
  MAX_DISCOVERY_RESULTS,
  canonicalDomain,
  safeWebUrl,
  normalizeAddress,
  normalizeContactCandidates,
  normalizeDiscoveryRequest,
  dedupeFingerprint,
  normalizeProviderProspect,
  assertProviderAdapter,
  assertDiscoveryResult,
};
