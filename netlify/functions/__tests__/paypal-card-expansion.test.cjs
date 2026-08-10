const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/checkout/PayPalCheckoutReliable.tsx'),
  'utf8',
);

test('the PayPal card disclosure opens while payment submission remains guarded', () => {
  const disclosureStart = source.indexOf('const renderInlineCardFields');
  const disclosureEnd = source.indexOf('\n\n  return (', disclosureStart);
  const disclosure = source.slice(disclosureStart, disclosureEnd);

  assert.match(source, /const buttonsDisabled = disabled/);
  assert.match(source, /const cardToggleDisabled = providerLocked/);
  assert.match(disclosure, /disabled=\{cardToggleDisabled\}/);
  assert.match(disclosure, /setCardFieldsExpanded\(togglePayPalCardFields\)/);
  assert.match(disclosure, /aria-expanded=\{cardFieldsExpanded\}/);
  assert.match(disclosure, /cardFieldsExpanded \? \(/);
  assert.match(disclosure, /<PayPalCardFieldsProvider/);
  assert.match(disclosure, /<PayPalCardFieldsForm \/>/);
  assert.match(disclosure, /createOrder=\{handleCreateOrder\}/);
  assert.match(disclosure, /onApprove=\{\(data\) => handleApprove\(data, null\)\}/);
  assert.match(disclosure, /disabled=\{buttonsDisabled\}/);
});
