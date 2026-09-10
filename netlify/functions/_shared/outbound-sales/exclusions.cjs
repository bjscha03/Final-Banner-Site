'use strict';

const { FREE_MAILBOX_DOMAINS, normalizeEmail } = require('./email.cjs');

const CONTACTED_STATUSES = Object.freeze([
  'contacted', 'replied', 'interested', 'quote_requested', 'quote_sent', 'won', 'lost', 'unsubscribed', 'suppressed',
]);

function providerSuppressionValue(providerId, providerRecordId) {
  if (!providerId || !providerRecordId) return null;
  return `${String(providerId).toLowerCase()}:${String(providerRecordId).trim()}`.slice(0, 600);
}

function candidateEmails(values) {
  return [...new Set((values || []).map((value) => normalizeEmail(value?.email || value)).filter(Boolean))].slice(0, 50);
}

async function loadExclusions(sql, prospect, emails = [], { prospectId = null } = {}) {
  const normalizedEmails = candidateEmails(emails);
  const domain = String(prospect.canonicalDomain || '').toLowerCase() || null;
  const providerValue = providerSuppressionValue(prospect.providerId, prospect.providerRecordId);
  const emailDomains = [...new Set(normalizedEmails.map((email) => email.split('@')[1]))];
  const companyOrderDomain = domain && !FREE_MAILBOX_DOMAINS.has(domain) ? domain : null;

  const [suppressionRows, priorContactRows, customerRows] = await Promise.all([
    sql(
      `SELECT scope, normalized_value, reason, source
         FROM outbound_suppressions
        WHERE active = TRUE
          AND (
            (scope = 'company_domain' AND normalized_value = $1)
            OR (scope = 'provider_record' AND normalized_value = $2)
            OR (scope = 'email' AND normalized_value = ANY($3::text[]))
            OR (scope = 'email_domain' AND normalized_value = ANY($4::text[]))
          )
        ORDER BY scope, normalized_value`,
      [domain, providerValue, normalizedEmails, emailDomains],
    ),
    sql(
      `SELECT p.id, p.status, p.first_contacted_at
         FROM outbound_prospects p
        WHERE ($1::uuid IS NULL OR p.id <> $1::uuid)
          AND (
            ($2::text IS NOT NULL AND LOWER(p.canonical_domain) = $2)
            OR EXISTS (
              SELECT 1 FROM outbound_contacts c
               WHERE c.prospect_id = p.id AND c.email_normalized = ANY($3::text[])
            )
          )
          AND (
            p.first_contacted_at IS NOT NULL
            OR p.status = ANY($4::text[])
            OR EXISTS (
              SELECT 1 FROM outbound_messages m
               WHERE m.prospect_id = p.id
                 AND m.status IN ('scheduled', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed')
            )
          )
        LIMIT 5`,
      [prospectId, domain, normalizedEmails, CONTACTED_STATUSES],
    ),
    sql(
      `SELECT o.id
         FROM orders o
        WHERE LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) NOT IN ('true', 't', '1')
          AND TRIM(COALESCE(o.email, '')) <> ''
          AND (
            LOWER(TRIM(o.email)) = ANY($1::text[])
            OR ($2::text IS NOT NULL AND LOWER(SPLIT_PART(TRIM(o.email), '@', 2)) = $2)
          )
        LIMIT 5`,
      [normalizedEmails, companyOrderDomain],
    ),
  ]);

  const exclusions = [];
  for (const row of suppressionRows || []) {
    exclusions.push({
      code: `SUPPRESSED_${String(row.reason || 'UNKNOWN').toUpperCase()}`,
      detail: `Active ${row.scope} suppression: ${row.reason}.`,
      hard: true,
      source: row.source || 'system',
    });
  }
  if (priorContactRows?.length) {
    exclusions.push({ code: 'PREVIOUSLY_CONTACTED', detail: 'This business or email was already contacted by the outbound subsystem.', hard: true, source: 'outbound_history' });
  }
  if (customerRows?.length) {
    exclusions.push({ code: 'EXISTING_CUSTOMER', detail: 'A non-test order already exists for this business email or company domain.', hard: true, source: 'orders_read_only' });
  }
  return exclusions;
}

module.exports = {
  CONTACTED_STATUSES,
  providerSuppressionValue,
  candidateEmails,
  loadExclusions,
};
