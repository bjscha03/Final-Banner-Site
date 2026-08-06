'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTED_LOCAL_PATTERN = /^outbound-([0-9a-f]{32})$/i;

function mailboxAddress(value) {
  const text = String(value || '').trim();
  const bracketed = /<([^<>\s]+@[^<>\s]+)>$/.exec(text);
  const address = String(bracketed?.[1] || text).trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) || address.length > 320) return null;
  return address;
}

function routedReplyToAddress(baseReplyTo, messageId) {
  const base = mailboxAddress(baseReplyTo);
  const id = String(messageId || '').trim().toLowerCase();
  if (!base || !UUID_PATTERN.test(id)) {
    const error = new Error('The outbound reply route is invalid.');
    error.code = 'OUTBOUND_SEND_BLOCKED';
    throw error;
  }
  const domain = base.slice(base.lastIndexOf('@') + 1);
  return `outbound-${id.replace(/-/g, '')}@${domain}`;
}

function compactIdToUuid(value) {
  const compact = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  const id = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return UUID_PATTERN.test(id) ? id : null;
}

function extractRoutedMessageId(addresses, configuredReplyTo) {
  const base = mailboxAddress(configuredReplyTo);
  if (!base) return null;
  const expectedDomain = base.slice(base.lastIndexOf('@') + 1);
  for (const candidate of Array.isArray(addresses) ? addresses : [addresses]) {
    const address = mailboxAddress(candidate);
    if (!address) continue;
    const separator = address.lastIndexOf('@');
    if (address.slice(separator + 1) !== expectedDomain) continue;
    const match = ROUTED_LOCAL_PATTERN.exec(address.slice(0, separator));
    const id = compactIdToUuid(match?.[1]);
    if (id) return id;
  }
  return null;
}

module.exports = {
  UUID_PATTERN,
  ROUTED_LOCAL_PATTERN,
  mailboxAddress,
  routedReplyToAddress,
  compactIdToUuid,
  extractRoutedMessageId,
};
