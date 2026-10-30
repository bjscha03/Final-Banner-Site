import { header } from './gmail.mjs';

// Provider message data is evidence, never instructions. Do not infer recipients
// from the body or from similar-looking domains.
export function mailboxAddress(value = '') {
  const input = String(value).trim();
  if (/[\r\n]/.test(input)) return '';
  const bracket = input.match(/^[^<>]*<([^<>]+)>\s*$/);
  const address = (bracket ? bracket[1] : input).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address) ? address : '';
}
export function messageReferences(message) {
  return [...new Set((header(message, 'In-Reply-To') + ' ' + header(message, 'References')).match(/<[^<>\s]+>/g) || [])].slice(-100);
}
export function automaticMessage(message) {
  const submitted = header(message, 'Auto-Submitted').trim().toLowerCase();
  const address = mailboxAddress(header(message, 'From'));
  return (!!submitted && submitted !== 'no') || /^(?:bulk|list|junk)(?:\s|$)/i.test(header(message, 'Precedence')) || !!header(message, 'List-Id') || /(?:^|[.+_-])(?:no-?reply|do-?not-?reply)(?:[.+_-]|@)/i.test(address) || /^(?:automatic reply|out of office)\s*:/i.test(header(message, 'Subject'));
}
export function replyIntent(text = '') {
  const value = String(text);
  if (/\b(?:forwarded|passed|sent|shared)\b[\s\S]{0,160}\b(?:marketing|purchasing|procurement|department|colleague|team)\b/i.test(value) || /\b(?:department|team)\b[\s\S]{0,80}\b(?:can (?:also )?be reached|contact them|contact directly)\b/i.test(value)) return 'referral';
  if (/\b(?:contact|check back|follow up|reach out)\b[\s\S]{0,50}\b(?:next (?:week|month|quarter|year)|after|in [a-z0-9]+ (?:weeks?|months?))\b/i.test(value)) return 'deferred';
  return 'conversation';
}
export function organizationAuthenticated(message, domain) {
  // Gmail prepends its own Authentication-Results; never trust a quoted body,
  // an ARC failure, or a result from an arbitrary authentication service.
  const results = (message.payload?.headers || []).filter(h => h.name.toLowerCase() === 'authentication-results');
  const first = results.find(h => /^mx\.google\.com\s*;/i.test(h.value));
  if (!first || !domain) return false;
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|;)\\s*dmarc=pass\\b[^;]*\\bheader\\.from=' + escaped + '(?:[;\\s]|$)', 'i').test(first.value) || new RegExp('(?:^|;)\\s*dkim=pass\\b[^;]*\\bheader\\.(?:i=@|d=)' + escaped + '(?:[;\\s]|$)', 'i').test(first.value);
}
export function incomingRoute(message, contact, knownSameAccount = []) {
  const from = mailboxAddress(header(message, 'From'));
  const suppliedReplyTo = header(message, 'Reply-To');
  const replyTo = suppliedReplyTo ? mailboxAddress(suppliedReplyTo) : from;
  const known = new Set([contact?.email, ...knownSameAccount.map(c => c.email)].filter(Boolean).map(v => v.toLowerCase()));
  const domain = String(contact?.email || '').toLowerCase().split('@')[1];
  const sameDomain = !!from && !!domain && from.split('@')[1] === domain;
  const exact = known.has(from);
  const authenticatedColleague = sameDomain && organizationAuthenticated(message, domain);
  const senderAllowed = exact || authenticatedColleague;
  // A Reply-To redirect is not automatically a permission to email a new party.
  const recipientAllowed = !!replyTo && (replyTo === from || known.has(replyTo));
  return { sender_email: from, sender_name: header(message, 'From').slice(0,200), reply_recipient: senderAllowed && recipientAllowed ? replyTo : null, sender_verified: senderAllowed, requires_identity_review: !senderAllowed || !recipientAllowed };
}
export async function resolveConversationContact(sql, message) {
  const email = mailboxAddress(header(message, 'From'));
  if (!email) return null;
  const refs = messageReferences(message);
  // RFC references have priority over provider grouping. Subject text alone is
  // NEVER used to associate two accounts.
  let related = refs.length ? await sql`SELECT DISTINCT c.* FROM daniel_sales.contacts c JOIN daniel_sales.messages m ON m.contact_id=c.id WHERE m.direction='outbound' AND m.status='sent' AND m.rfc_message_id=ANY(${refs}::text[])` : [];
  if (!related.length && message.threadId) related = await sql`SELECT DISTINCT c.* FROM daniel_sales.contacts c JOIN daniel_sales.messages m ON m.contact_id=c.id WHERE m.direction='outbound' AND m.status='sent' AND m.thread_key=${message.threadId}`;
  const exact = await sql`SELECT * FROM daniel_sales.contacts WHERE lower(email)=${email} ORDER BY created_at DESC`;
  const accounts = [...new Set(related.map(c => c.account_id))];
  if (accounts.length > 1) return { ambiguous: true, accountIds: accounts };
  if (accounts.length === 1) {
    const same = exact.find(c => c.account_id === accounts[0]);
    return { contact: same || related[0], match: same ? 'exact_in_thread' : 'outbound_conversation', accountIds: accounts };
  }
  if (!exact.length) return null;
  const exactAccounts = [...new Set(exact.map(c => c.account_id))];
  if (exactAccounts.length > 1) return { ambiguous: true, accountIds: exactAccounts };
  return { contact: exact[0], match: 'exact_sender', accountIds: exactAccounts };
}
export async function holdAccountFollowups(sql, accountId, note) {
  await sql.transaction([
    sql`UPDATE daniel_sales.messages SET status='blocked',error=${note},updated_at=now() WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE account_id=${accountId}) AND kind IN ('intro','followup') AND status IN ('draft','pending_approval','queued')`,
    sql`UPDATE daniel_sales.tasks SET status='cancelled',note=${note} WHERE contact_id IN (SELECT id FROM daniel_sales.contacts WHERE account_id=${accountId}) AND kind='followup' AND status='pending'`
  ]);
}
export function withoutSalesClosing(value = '') {
  // The renderer owns the signature. Remove only a trailing closing block,
  // before the separately approved offer is appended by the caller.
  return String(value).replace(/\n\s*(?:Best(?: regards)?|Kind regards|Kindly|Sincerely|Regards|Thanks(?: again)?|Thank you|Looking forward to hearing from you)[,!\s]*(?:\n\s*(?:Daniel(?:[^\n]*)?|Business Accounts[^\n]*|Sales Assistant[^\n]*|Banners On The Fly|info@bannersonthefly\.com)\s*)*$/i, '').trim();
}
