'use strict';

const { normalizeEmail } = require('./cart-recovery-token.cjs');

const OUTBOUND_REASONS = new Set([
  'unsubscribe',
  'unsubscribed',
  'complaint',
  'spam_complaint',
  'hard_bounce',
  'legal',
  'blocklist',
  'manual',
  'wrong_contact',
  'duplicate',
  'provider_suppressed',
  'consent_false',
  'consent_withdrawn',
]);

const MISSING_RELATION_CODES = new Set(['42P01', '42703']);

function missingSuppressionSchema(error) {
  return MISSING_RELATION_CODES.has(String(error?.code || ''));
}

async function optionalQuery(query, label) {
  try {
    return await query();
  } catch (error) {
    if (missingSuppressionSchema(error)) return [];
    console.error('[email-suppression] lookup failed', {
      source: label,
      code: error?.code || null,
      message: error?.message || String(error),
    });
    throw error;
  }
}

async function findEmailSuppression(sql, emailValue) {
  const email = normalizeEmail(emailValue);
  if (!email) return { suppressed: true, reason: 'invalid_email', source: 'validation' };
  const domain = email.slice(email.lastIndexOf('@') + 1);

  const recoveryRows = await optionalQuery(() => sql`
    SELECT reason
      FROM recovery_email_suppressions
     WHERE normalized_email = ${email}
       AND active = TRUE
     LIMIT 1
  `, 'recovery_email_suppressions');
  if (recoveryRows.length) {
    return {
      suppressed: true,
      reason: String(recoveryRows[0].reason || 'unsubscribed'),
      source: 'recovery_email_suppressions',
    };
  }

  const outboundRows = await optionalQuery(() => sql`
    SELECT reason
      FROM outbound_suppressions
     WHERE active = TRUE
       AND LOWER(reason) IN (
         'unsubscribe', 'unsubscribed', 'complaint', 'spam_complaint',
         'hard_bounce', 'legal', 'blocklist', 'manual', 'wrong_contact', 'duplicate',
         'provider_suppressed',
         'consent_false', 'consent_withdrawn'
       )
       AND (
         (scope = 'email' AND normalized_value = ${email})
         OR (scope IN ('email_domain', 'company_domain') AND normalized_value = ${domain})
       )
     ORDER BY updated_at DESC
     LIMIT 1
  `, 'outbound_suppressions');
  const outboundReason = String(outboundRows[0]?.reason || '').toLowerCase();
  if (outboundRows.length && OUTBOUND_REASONS.has(outboundReason)) {
    return { suppressed: true, reason: outboundReason, source: 'outbound_suppressions' };
  }

  const tradeShowRows = await optionalQuery(() => sql`
    SELECT reason
      FROM trade_show_email_unsubscribes
     WHERE normalized_email = ${email}
     LIMIT 1
  `, 'trade_show_email_unsubscribes');
  if (tradeShowRows.length) {
    return {
      suppressed: true,
      reason: String(tradeShowRows[0].reason || 'unsubscribe'),
      source: 'trade_show_email_unsubscribes',
    };
  }

  const consentRows = await optionalQuery(() => sql`
    SELECT consent
      FROM email_captures
     WHERE LOWER(BTRIM(email)) = ${email}
     ORDER BY captured_at DESC, created_at DESC
     LIMIT 1
  `, 'email_captures');
  if (consentRows.length && consentRows[0].consent === false) {
    return { suppressed: true, reason: 'consent_declined', source: 'email_captures' };
  }

  const newsletterRows = await optionalQuery(() => sql`
    SELECT updated_at
      FROM newsletter
     WHERE LOWER(BTRIM(email)) = ${email}
       AND subscribed = FALSE
     ORDER BY updated_at DESC
     LIMIT 1
  `, 'newsletter');
  if (newsletterRows.length) {
    return {
      suppressed: true,
      reason: 'newsletter_unsubscribed',
      source: 'newsletter',
    };
  }

  return { suppressed: false, reason: null, source: null };
}

module.exports = { findEmailSuppression, missingSuppressionSchema };
