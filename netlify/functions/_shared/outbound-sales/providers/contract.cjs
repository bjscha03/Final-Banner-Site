'use strict';

const { sanitizeForAudit } = require('../security.cjs');

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
    return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch {
    return null;
  }
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
  return adapter;
}

module.exports = {
  canonicalDomain,
  safeWebUrl,
  normalizeAddress,
  dedupeFingerprint,
  normalizeProviderProspect,
  assertProviderAdapter,
};
