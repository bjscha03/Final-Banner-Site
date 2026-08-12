'use strict';

const dns = require('node:dns').promises;
const { domainToASCII } = require('node:url');

const ROLE_LOCAL_PARTS = new Set([
  'admin', 'billing', 'bookings', 'contact', 'customercare', 'customerservice', 'events', 'hello', 'help', 'info',
  'inquiries', 'jobs', 'mail', 'marketing', 'office', 'orders', 'press', 'retail', 'sales', 'service', 'store',
  'support', 'team', 'webmaster', 'wholesale',
]);
const FREE_MAILBOX_DOMAINS = new Set([
  'aol.com', 'gmail.com', 'googlemail.com', 'hotmail.com', 'icloud.com', 'live.com', 'mail.com',
  'me.com', 'msn.com', 'outlook.com', 'proton.me', 'protonmail.com', 'yahoo.com', 'ymail.com',
]);
const TRANSIENT_DNS_CODES = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL', 'SERVFAIL', 'REFUSED']);

function decodeEmailText(value) {
  return String(value || '')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.')
    .replace(/\s*(?:\[|\()\s*at\s*(?:\]|\))\s*/gi, '@')
    .replace(/\s*(?:\[|\()\s*dot\s*(?:\]|\))\s*/gi, '.');
}

function normalizeEmail(value) {
  const candidate = decodeEmailText(value).trim().replace(/^mailto:/i, '').split('?')[0].toLowerCase();
  if (!candidate || candidate.length > 254 || /[\s<>(),;:\\"\[\]]/.test(candidate)) return null;
  const at = candidate.lastIndexOf('@');
  if (at <= 0 || at !== candidate.indexOf('@')) return null;
  const local = candidate.slice(0, at);
  let domain = candidate.slice(at + 1).replace(/\.$/, '');
  domain = domainToASCII(domain);
  if (!domain || local.length > 64 || domain.length > 253) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  if (labels.at(-1).length < 2) return null;
  return `${local}@${domain.toLowerCase()}`;
}

function extractPublicEmails(value) {
  const text = decodeEmailText(value).slice(0, 2 * 1024 * 1024);
  const matches = text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?/gi) || [];
  return [...new Set(matches.map(normalizeEmail).filter(Boolean))].slice(0, 50);
}

function isRoleAddress(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const local = normalized.split('@')[0].replace(/[._-]+/g, '');
  return ROLE_LOCAL_PARTS.has(local);
}

function isFreeMailbox(email) {
  const normalized = normalizeEmail(email);
  return normalized ? FREE_MAILBOX_DOMAINS.has(normalized.split('@')[1]) : false;
}

async function resolveMxStatus(domain, resolver = dns.resolveMx) {
  try {
    const records = await resolver(domain);
    if (!Array.isArray(records) || records.length === 0) return { status: 'missing', records: [] };
    const normalized = records
      .map((record) => ({ exchange: String(record?.exchange || '').toLowerCase().replace(/\.$/, ''), priority: Number(record?.priority) || 0 }))
      .filter((record) => record.exchange || record.priority === 0);
    if (normalized.some((record) => record.exchange === '')) return { status: 'null_mx', records: [] };
    return normalized.some((record) => record.exchange)
      ? { status: 'present', records: normalized.slice(0, 10) }
      : { status: 'missing', records: [] };
  } catch (error) {
    if (TRANSIENT_DNS_CODES.has(String(error?.code || '').toUpperCase())) return { status: 'temporary_error', records: [] };
    if (['ENODATA', 'ENOTFOUND', 'NOTFOUND'].includes(String(error?.code || '').toUpperCase())) return { status: 'missing', records: [] };
    return { status: 'temporary_error', records: [] };
  }
}

function verificationFor({ syntaxValid, roleAddress, freeMailbox, domainMatches, mxStatus }) {
  if (!syntaxValid || ['missing', 'null_mx'].includes(mxStatus)) {
    return { verificationStatus: 'invalid', reason: !syntaxValid ? 'Email syntax is invalid.' : 'The email domain does not publish a usable MX record.' };
  }
  if (mxStatus === 'temporary_error' || mxStatus === 'not_checked') {
    return { verificationStatus: 'unknown', reason: 'Mailbox DNS could not be confirmed; retry is required.' };
  }
  if (roleAddress) return { verificationStatus: 'risky', reason: 'Role or group addresses are retained as evidence but are not outreach-eligible.' };
  if (freeMailbox) return { verificationStatus: 'risky', reason: 'Free-mailbox addresses cannot establish a business-domain identity.' };
  if (!domainMatches) return { verificationStatus: 'risky', reason: 'The email domain does not match the business website domain.' };
  return { verificationStatus: 'unverified', reason: 'Syntax and MX are valid; mailbox-level verification is not configured.' };
}

async function assessEmail(value, options = {}) {
  const normalized = normalizeEmail(value);
  const syntaxValid = Boolean(normalized);
  const domain = normalized?.split('@')[1] || null;
  const roleAddress = normalized ? isRoleAddress(normalized) : false;
  const freeMailbox = normalized ? isFreeMailbox(normalized) : false;
  const businessDomain = String(options.businessDomain || '').toLowerCase().replace(/^www\./, '');
  const domainMatches = Boolean(domain && businessDomain && (
    domain === businessDomain
    || domain.endsWith(`.${businessDomain}`)
    || businessDomain.endsWith(`.${domain}`)
  ));
  const mx = syntaxValid
    ? await resolveMxStatus(domain, options.resolveMx || dns.resolveMx)
    : { status: 'not_checked', records: [] };
  const verification = verificationFor({ syntaxValid, roleAddress, freeMailbox, domainMatches, mxStatus: mx.status });
  let quality = 0;
  if (syntaxValid) quality += 20;
  if (mx.status === 'present') quality += 25;
  if (domainMatches) quality += 30;
  if (!roleAddress) quality += 15;
  if (!freeMailbox) quality += 10;
  if (verification.verificationStatus === 'invalid') quality = 0;
  return Object.freeze({
    email: normalized || String(value || '').slice(0, 254),
    emailNormalized: normalized,
    syntaxValid,
    isRoleAddress: roleAddress,
    isFreeMailbox: freeMailbox,
    domainMatches,
    mxStatus: mx.status,
    mxCheckedAt: syntaxValid ? new Date().toISOString() : null,
    verificationStatus: verification.verificationStatus,
    verificationReason: verification.reason,
    contactQualityScore: Math.max(0, Math.min(100, quality)),
    // DNS proves only that a domain accepts mail. A later licensed mailbox
    // A licensed verifier must explicitly change this flag; DNS alone never does.
    sendEligible: false,
  });
}

async function assessEmailCandidates(candidates, options = {}) {
  const unique = [...new Map((candidates || [])
    .map((candidate) => typeof candidate === 'string' ? { email: candidate, sourceUrl: null } : candidate)
    .map((candidate) => [normalizeEmail(candidate?.email), candidate])
    .filter(([email]) => email)).values()].slice(0, 20);
  const mxCache = new Map();
  const resolver = async (domain) => {
    if (!mxCache.has(domain)) mxCache.set(domain, resolveMxStatus(domain, options.resolveMx || dns.resolveMx));
    const result = await mxCache.get(domain);
    if (result.status === 'present') return result.records;
    const error = new Error(result.status);
    error.code = result.status === 'temporary_error' ? 'EAI_AGAIN' : 'ENODATA';
    throw error;
  };
  const results = [];
  for (const candidate of unique) {
    const assessed = await assessEmail(candidate.email, { ...options, resolveMx: resolver });
    const licensedVerified = candidate.acquisitionMode === 'licensed_api'
      && candidate.providerVerificationStatus === 'valid'
      && assessed.syntaxValid
      && assessed.mxStatus === 'present';
    results.push({
      ...assessed,
      sourceUrl: candidate.sourceUrl || null,
      fullName: String(candidate.fullName || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null,
      jobTitle: String(candidate.jobTitle || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null,
      verificationProviderId: licensedVerified ? String(candidate.verificationProviderId || '').slice(0, 64) || null : null,
      verificationProviderRecordId: licensedVerified ? String(candidate.verificationProviderRecordId || '').slice(0, 300) || null : null,
      verificationStatus: licensedVerified ? 'valid' : assessed.verificationStatus,
      verificationReason: licensedVerified ? 'Verified work email supplied by a licensed contact-data provider; domain MX was rechecked.' : assessed.verificationReason,
      verifiedAt: licensedVerified ? new Date().toISOString() : null,
    });
  }
  return results.sort((left, right) => right.contactQualityScore - left.contactQualityScore || left.email.localeCompare(right.email));
}

module.exports = {
  ROLE_LOCAL_PARTS,
  FREE_MAILBOX_DOMAINS,
  decodeEmailText,
  normalizeEmail,
  extractPublicEmails,
  isRoleAddress,
  isFreeMailbox,
  resolveMxStatus,
  assessEmail,
  assessEmailCandidates,
};
