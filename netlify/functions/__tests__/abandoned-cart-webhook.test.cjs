const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  RECOVERY_EVENT_TYPES,
  RECOVERY_SUPPRESSION_REASONS,
  normalizeEmail,
  tagValue,
  tagsFromPayload,
} = require('../_shared/legacy/resend-webhook.cjs')._test;

test('recovery webhook maps provider delivery and compliance events', () => {
  assert.equal(RECOVERY_EVENT_TYPES['email.delivered'], 'email_delivered');
  assert.equal(RECOVERY_EVENT_TYPES['email.clicked'], 'email_clicked');
  assert.equal(RECOVERY_EVENT_TYPES['email.complained'], 'email_complained');
  assert.equal(RECOVERY_SUPPRESSION_REASONS['email.bounced'], 'hard_bounce');
  assert.equal(RECOVERY_SUPPRESSION_REASONS['email.complained'], 'complaint');
  assert.equal(RECOVERY_SUPPRESSION_REASONS['email.suppressed'], 'provider_suppressed');
});

test('recovery webhook normalizes recipient identity and supports both tag shapes', () => {
  assert.equal(normalizeEmail(' Buyer@Example.COM '), 'buyer@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);

  const arrayTags = tagsFromPayload({ data: { tags: [{ name: 'cart_id', value: 'cart-1' }] } });
  assert.equal(tagValue(arrayTags, 'cart_id'), 'cart-1');

  const objectTags = tagsFromPayload({ data: { tags: { type: 'abandoned_cart', sequence: '2' } } });
  assert.equal(tagValue(objectTags, 'type'), 'abandoned_cart');
  assert.equal(tagValue(objectTags, 'sequence'), '2');
});

test('legacy recovery webhook endpoint delegates to the signed canonical handler', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../_shared/legacy/email-webhook.cjs'),
    'utf8',
  );
  const canonical = fs.readFileSync(
    path.resolve(__dirname, '../_shared/legacy/resend-webhook.cjs'),
    'utf8',
  );

  assert.match(source, /require\('\.\/resend-webhook\.cjs'\)/);
  assert.doesNotMatch(source, /recovery_status\s*=\s*'engaged'/);
  assert.match(canonical, /svix-signature/);
  assert.match(canonical, /webhooks\.verify/);
  assert.match(canonical, /recovery_email_suppressions/);
  assert.match(canonical, /ON CONFLICT DO NOTHING/);
});
