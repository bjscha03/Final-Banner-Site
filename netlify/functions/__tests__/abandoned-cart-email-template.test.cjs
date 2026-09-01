'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAbandonedCartEmail,
  isQualifyingLargeBannerItem,
  qualifyingBannerSubtotalCents,
} = require('../_shared/legacy/abandoned-cart-email-template.cjs');

const recoveryUrl = 'https://bannersonthefly.com/checkout?recovery=signed-cart-token';
const unsubscribeUrl = 'https://bannersonthefly.com/.netlify/functions/recovery-email-unsubscribe?token=signed-unsubscribe-token';

function qualifyingBanner(overrides = {}) {
  return {
    id: 'qualifying-banner',
    product_type: 'banner',
    width_in: 72,
    height_in: 36,
    quantity: 1,
    material: '13oz',
    grommets: 'every-2-3ft',
    pole_pockets: 'top-bottom',
    pole_pocket_position: 'top-bottom',
    pole_pocket_size: '3',
    rope_feet: 12,
    rope_placement: 'top',
    unit_price_cents: 10000,
    line_total_cents: 10000,
    thumbnail_url: 'https://res.cloudinary.com/dtrxl120u/image/upload/v123/customer/saved-banner.png',
    ...overrides,
  };
}

function baseData(overrides = {}) {
  return {
    customerName: 'Brandon Schaefer',
    recoveryUrl,
    unsubscribeUrl,
    cartItems: [qualifyingBanner()],
    subtotalCents: 10000,
    estimatedTotalCents: 10000,
    discountCode: 'CART25-PRIVATE',
    discountExpiresAt: '2030-01-15T22:00:00.000Z',
    now: '2030-01-15T21:00:00.000Z',
    timeZone: 'America/New_York',
    ...overrides,
  };
}

test('large-banner qualification is orientation-safe and excludes nonqualifying shapes and products', () => {
  assert.equal(isQualifyingLargeBannerItem({ product_type: 'banner', width_in: 72, height_in: 36 }), true);
  assert.equal(isQualifyingLargeBannerItem({ product_type: 'banner', width_in: 36, height_in: 72 }), true);
  assert.equal(isQualifyingLargeBannerItem({ productType: 'banner', widthIn: 96, heightIn: 48 }), true);

  assert.equal(isQualifyingLargeBannerItem({ product_type: 'banner', width_in: 108, height_in: 24 }), false);
  assert.equal(isQualifyingLargeBannerItem({ product_type: 'banner', width_in: 60, height_in: 48 }), false);
  assert.equal(isQualifyingLargeBannerItem({ product_type: 'yard_sign', width_in: 72, height_in: 36 }), false);
  assert.equal(isQualifyingLargeBannerItem({ width_in: 72, height_in: 36 }), false);
});

test('qualifying subtotal includes only qualifying banner line totals in a mixed cart', () => {
  const items = [
    qualifyingBanner({ line_total_cents: 10000 }),
    qualifyingBanner({ id: 'portrait', width_in: 36, height_in: 72, line_total_cents: 8000 }),
    qualifyingBanner({ id: 'too-narrow', width_in: 108, height_in: 24, line_total_cents: 9000 }),
    qualifyingBanner({ id: 'too-short', width_in: 60, height_in: 48, line_total_cents: 7000 }),
    { id: 'sign', product_type: 'yard_sign', width_in: 72, height_in: 36, line_total_cents: 6000 },
  ];

  assert.equal(qualifyingBannerSubtotalCents(items), 18000);
});

test('qualifying Email 1 shows actual artwork, full options, exact expiry, and a line-scoped 25% offer', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    cartItems: [
      qualifyingBanner({ material: '<13oz & vinyl>' }),
      qualifyingBanner({
        id: 'narrow-banner',
        width_in: 108,
        height_in: 24,
        line_total_cents: 5000,
        unit_price_cents: 5000,
        thumbnail_url: 'https://cdn.example.com/narrow-banner.png',
      }),
      {
        id: 'yard-sign',
        product_type: 'yard_sign',
        width_in: 72,
        height_in: 36,
        quantity: 1,
        line_total_cents: 3000,
        unit_price_cents: 3000,
        yard_sign_sidedness: 'double',
      },
    ],
    subtotalCents: 18000,
    estimatedTotalCents: 18000,
    discountCode: '<SAVE&25>',
  }));

  assert.equal(email.subject, 'Your banner is saved — 25% off for the next hour');
  assert.match(email.html, /Banners On The Fly/);
  assert.match(email.html, /logo-compact\.svg/);
  assert.match(email.html, /display:none!important;visibility:hidden/);
  assert.match(email.html, /You left this behind/);
  assert.match(email.html, /email-banner-thumbnail\?/);
  assert.match(email.html, /saved-banner\.png/);
  assert.match(email.html, /Custom Banner 72&quot; × 36&quot; — Landscape/);
  assert.match(email.html, /Material: &lt;13oz &amp; Vinyl&gt;/);
  assert.match(email.html, /Grommets: Every 2–3 Feet/);
  assert.match(email.html, /Pole Pockets: Top &amp; Bottom \(3 inch\)/);
  assert.match(email.html, /Rope: 12 ft • Top Only/);
  assert.match(email.html, /Hemming: Always included/);
  assert.match(email.html, /Line Total: \$100\.00/);
  assert.match(email.html, /25% OFF THIS ORDER/);
  assert.match(email.html, /&lt;SAVE&amp;25&gt;/);
  assert.match(email.html, /Expires January 15, 2030 at 5:00 PM EST/);
  assert.match(email.html, /You save \$25\.00 · Offer total \$155\.00/);
  assert.match(email.html, /25% off qualifying banner items/);
  assert.match(email.html, /-\$25\.00/);
  assert.match(email.html, />\$155\.00</);
  assert.match(email.html, />Finish My Order</);
  assert.match(email.html, /Free Next-Day Air where eligible/);
  assert.match(email.html, /Unsubscribe from cart-recovery emails/);
  assert.match(email.html, /@media only screen and \(max-width:640px\)/);
  assert.match(email.html, /bof-item-image, \.bof-item-details/);
  assert.match(email.html, /role="presentation"/);
  assert.match(email.html, /\[if mso\][\s\S]*width="620"/);
  assert.match(email.html, /PO Box 369, Crestwood, KY 40014/);

  assert.match(email.text, /Hi Brandon,/);
  assert.match(email.text, /Code: <SAVE&25>/);
  assert.match(email.text, /Expires: January 15, 2030 at 5:00 PM EST/);
  assert.match(email.text, /25% offer savings: \$25\.00/);
  assert.match(email.text, /Offer total: \$155\.00/);
  assert.match(email.text, /Grommets: Every 2–3 Feet/);
  assert.match(email.text, /FINISH MY ORDER\nhttps:\/\/bannersonthefly\.com\/checkout\?recovery=signed-cart-token/);
  assert.match(email.text, /Unsubscribe from cart-recovery emails:/);
});

test('small and non-banner Email 1 never advertise a coupon, even when code data is present', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    cartItems: [
      qualifyingBanner({ width_in: 60, height_in: 48, line_total_cents: 7000 }),
      qualifyingBanner({ width_in: 108, height_in: 24, line_total_cents: 9000 }),
      { product_type: 'yard_sign', width_in: 72, height_in: 36, line_total_cents: 6000, quantity: 1 },
    ],
    subtotalCents: 22000,
    estimatedTotalCents: 22000,
  }));

  assert.equal(email.subject, 'Your banner design is saved');
  assert.doesNotMatch(email.html, /25%|CART25-PRIVATE|PRIVATE ONE-HOUR/i);
  assert.doesNotMatch(email.text, /25%|CART25-PRIVATE|PRIVATE ONE-HOUR/i);
  assert.match(email.html, /Your design and selections are saved/);
  assert.match(email.html, />Finish My Order</);
  assert.match(email.html, />\$220\.00</);
});

test('later emails keep the saved design and CTA but never resurrect or extend Email 1 offer copy', () => {
  const second = buildAbandonedCartEmail(2, baseData());
  const third = buildAbandonedCartEmail(3, baseData());

  assert.equal(second.subject, 'Your saved banner is ready when you are');
  assert.equal(third.subject, 'Still need this banner? Your design is saved');
  for (const email of [second, third]) {
    assert.match(email.html, /You left this behind/);
    assert.match(email.html, />Finish My Order</);
    assert.match(email.html, />\$100\.00</);
    assert.doesNotMatch(email.html, /25%|CART25-PRIVATE|one-hour recovery offer/i);
    assert.doesNotMatch(email.text, /25%|CART25-PRIVATE|one-hour recovery offer/i);
  }
  assert.match(third.html, /final scheduled recovery reminder/);
  assert.match(third.text, /final scheduled recovery reminder/);
});

test('an expired offer fails closed to the polished non-offer Email 1', () => {
  const expired = buildAbandonedCartEmail(1, baseData({
    now: '2030-01-15T23:00:00.000Z',
  }));

  assert.equal(expired.subject, 'Your banner design is saved');
  assert.doesNotMatch(expired.html, /25%|CART25-PRIVATE|PRIVATE ONE-HOUR/i);
});

test('best-discount-wins replaces a weaker quantity discount and never stacks discounts', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    discountCents: 1000,
    estimatedTotalCents: 9000,
    offerDiscountCents: 2500,
    offerTotalCents: 7500,
  }));

  assert.equal(email.subject, 'Your banner is saved — 25% off for the next hour');
  assert.match(email.html, /25% OFF THIS ORDER/);
  assert.match(email.html, /25% off qualifying banner items/);
  assert.match(email.html, /-\$25\.00/);
  assert.match(email.html, />\$75\.00</);
  assert.doesNotMatch(email.html, /-\$35\.00/);
  assert.doesNotMatch(email.html, /already have a better discount/);
});

test('best-discount-wins retains a stronger existing discount while keeping the offer available', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    discountCents: 3000,
    estimatedTotalCents: 7000,
    offerDiscountCents: 2500,
    offerTotalCents: 7000,
  }));

  assert.match(email.html, /25% OFF THIS ORDER/);
  assert.match(email.html, /Best available discount/);
  assert.match(email.html, /-\$30\.00/);
  assert.match(email.html, />\$70\.00</);
  assert.match(email.html, /This offer saves \$25\.00 on qualifying banners/);
  assert.match(email.html, /discount saves \$30\.00, so checkout keeps the better price/);
  assert.doesNotMatch(email.html, /-\$55\.00/);
});

test('trusted offer savings and offer total inputs drive exact displayed prices', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    offerSavingsCents: 2400,
    offerTotalCents: 7600,
  }));

  assert.match(email.html, /You save \$24\.00 · Offer total \$76\.00/);
  assert.match(email.html, /-\$24\.00/);
  assert.match(email.html, />\$76\.00</);
});

test('post-tax checkout services are itemized so the displayed total reconciles', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    discountCode: '',
    subtotalCents: 10000,
    taxCents: 600,
    sameDayFeeCents: 6000,
    saturdayFeeCents: 4500,
    estimatedTotalCents: 21100,
    physicalAddress: 'PO Box 369, Crestwood, KY 40014',
  }));

  assert.match(email.html, /Same-Day Hit Service[\s\S]*\$60\.00/);
  assert.match(email.html, /Saturday Delivery[\s\S]*\$45\.00/);
  assert.match(email.html, /Total[\s\S]*\$211\.00/);
  assert.match(email.text, /Same-Day Hit Service: \$60\.00/);
  assert.match(email.text, /Saturday Delivery: \$45\.00/);
});

test('missing artwork renders a truthful fallback without a generic preview image', () => {
  const email = buildAbandonedCartEmail(1, baseData({
    cartItems: [qualifyingBanner({ thumbnail_url: null, grommets: 'none' })],
    discountCode: '',
  }));

  assert.match(email.html, /A preview image isn’t available in this email/);
  assert.doesNotMatch(email.html, /You left this behind/);
  assert.doesNotMatch(email.html, /alt="Banner preview"/);
  assert.match(email.html, /Custom Banner 72&quot; × 36&quot;/);
  assert.match(email.text, /A preview image is not available in this text email/);
});

test('recovery and unsubscribe links must be absolute HTTPS URLs', () => {
  assert.throws(
    () => buildAbandonedCartEmail(1, baseData({ recoveryUrl: 'javascript:alert(1)' })),
    /recoveryUrl must be an absolute HTTPS URL/,
  );
  assert.throws(
    () => buildAbandonedCartEmail(1, baseData({ unsubscribeUrl: 'http://bannersonthefly.com/unsubscribe' })),
    /unsubscribeUrl must be an absolute HTTPS URL/,
  );
});
