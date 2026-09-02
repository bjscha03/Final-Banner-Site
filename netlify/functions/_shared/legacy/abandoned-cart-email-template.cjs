'use strict';

const {
  escapeHtml,
  getFinalizedThumbnailUrl,
  normalizeName,
  renderEmailLayout,
  renderItems,
  renderTotals,
} = require('./email-template.cjs');
const {
  normalizeOrderItemDisplay,
} = require('./product-display-helpers.cjs');

const BRAND_NAVY = '#18448D';
const BRAND_ORANGE = '#ff6b35';
const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_PHYSICAL_ADDRESS = 'PO Box 369, Crestwood, KY 40014';
const RECOVERY_DISCOUNT_PERCENT = 25;

const COPY_BY_SEQUENCE = Object.freeze({
  1: Object.freeze({
    subject: 'Your banner design is saved',
    offerSubject: 'Your banner is saved — 25% off for the next hour',
    title: 'Your design is saved',
    offerSubtitle: 'Finish checkout while your private one-hour offer is active.',
    subtitle: 'Pick up exactly where you left off.',
    preheader: 'Your saved design, selections, and checkout are ready when you are.',
    offerPreheader: 'Finish your qualifying banner order with 25% off before your private code expires.',
    introduction: 'Your design and selections are saved. Return to your cart to review everything and finish checkout in just a few steps.',
  }),
  2: Object.freeze({
    subject: 'Your saved banner is ready when you are',
    title: 'Your design is still saved',
    subtitle: 'Everything is ready when you are.',
    preheader: 'Your saved banner design and selections are waiting for you.',
    introduction: 'Your saved design is still ready. Review your selections, enter payment, and we’ll take it from there.',
  }),
  3: Object.freeze({
    subject: 'Still need this banner? Your design is saved',
    title: 'Still need this banner?',
    subtitle: 'Your saved design is ready for one more look.',
    preheader: 'Your banner design is still saved if you’re ready to finish your order.',
    introduction: 'If this banner is still on your list, your saved design and selections are ready for you. No need to start over.',
  }),
});

function optionalCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function centsFromDollars(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function normalizeProductType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function itemProductType(item = {}) {
  return normalizeProductType(item.product_type ?? item.productType);
}

function itemDimension(item, snakeKey, camelKey, fallbackKey) {
  const parsed = Number(item?.[snakeKey] ?? item?.[camelKey] ?? item?.[fallbackKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function itemLineTotalCents(item = {}) {
  return optionalCents(
    item.line_total_cents
      ?? item.lineTotalCents
      ?? item.line_total,
  ) || 0;
}

function isQualifyingLargeBannerItem(item = {}) {
  if (itemProductType(item) !== 'banner') return false;
  const width = itemDimension(item, 'width_in', 'widthIn', 'width');
  const height = itemDimension(item, 'height_in', 'heightIn', 'height');
  return Math.max(width, height) >= 72 && Math.min(width, height) >= 36;
}

function qualifyingBannerSubtotalCents(items = []) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => {
    if (!isQualifyingLargeBannerItem(item)) return total;
    return Math.min(Number.MAX_SAFE_INTEGER, total + itemLineTotalCents(item));
  }, 0);
}

function allItemsSubtotalCents(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => Math.min(Number.MAX_SAFE_INTEGER, total + itemLineTotalCents(item)),
    0,
  );
}

function parseItems(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function safeHttpsUrl(value, label) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe');
    return url.toString();
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
}

function formatMoneyFromCents(value) {
  return `$${((optionalCents(value) || 0) / 100).toFixed(2)}`;
}

function formatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return Number.isInteger(parsed) ? String(parsed) : String(Number(parsed.toFixed(2)));
}

function formatOrientation(item = {}) {
  const explicit = String(item.orientation || item.design_orientation || '').trim();
  if (explicit) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase();
  }
  const width = itemDimension(item, 'width_in', 'widthIn', 'width');
  const height = itemDimension(item, 'height_in', 'heightIn', 'height');
  if (!width || !height) return '';
  if (width === height) return 'Square';
  return width > height ? 'Landscape' : 'Portrait';
}

function formatRopeDisplay(item, normalizedDisplay) {
  const ropeFeet = Number(item.rope_feet ?? item.ropeFeet ?? 0);
  const normalized = String(normalizedDisplay || '').trim();
  if (!Number.isFinite(ropeFeet) || ropeFeet <= 0) return normalized || 'None';
  const feet = `${formatNumber(ropeFeet)} ft`;
  if (!normalized || normalized.toLowerCase() === 'none' || normalized === feet) return feet;
  return `${feet} • ${normalized}`;
}

function toEmailItem(item, index) {
  const productType = itemProductType(item) || 'banner';
  const canonicalItem = { ...item, product_type: productType };
  const normalized = normalizeOrderItemDisplay(canonicalItem);
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
  const lineTotalCents = itemLineTotalCents(item);
  const explicitUnitCents = optionalCents(item.unit_price_cents ?? item.unitPriceCents);
  const unitPriceCents = explicitUnitCents ?? Math.round(lineTotalCents / quantity);
  const orientation = formatOrientation(item);

  return {
    ...normalized,
    sourceIndex: index,
    sourceItem: canonicalItem,
    product_type: productType,
    productType: normalized.productType,
    name: `${normalized.displayName}${orientation ? ` — ${orientation}` : ''}`,
    quantity,
    lineTotal: lineTotalCents / 100,
    unitPrice: unitPriceCents / 100,
    thumbnailUrl: getFinalizedThumbnailUrl(canonicalItem, 220),
    ropeDisplay: formatRopeDisplay(canonicalItem, normalized.ropeDisplay),
  };
}

function findFeaturedPreview(items) {
  for (const item of items) {
    const previewUrl = getFinalizedThumbnailUrl(item.sourceItem, 520);
    if (previewUrl) return { item, previewUrl };
  }
  return null;
}

function renderFeaturedPreview(featured) {
  if (!featured) {
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;">
        <tr><td style="padding:18px;text-align:center;">
          <p style="margin:0 0 5px;color:#0f172a;font-size:16px;font-weight:700;">Your design and selections are saved</p>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">A preview image isn’t available in this email, but your saved cart is ready from the secure recovery link below.</p>
        </td></tr>
      </table>
    `;
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:14px 14px 10px;text-align:center;">
        <p style="margin:0 0 10px;color:${BRAND_NAVY};font-size:17px;font-weight:700;">You left this behind</p>
        <img src="${escapeHtml(featured.previewUrl)}" alt="${escapeHtml(`${featured.item.productLabel || 'Saved design'} preview`)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:1px solid #d1d5db;border-radius:8px;" />
      </td></tr>
    </table>
  `;
}

function renderOfferCard({
  code,
  recoverySavingsCents,
  appliedDiscountCents,
  offerTotalCents,
  retainedBetterDiscount,
  existingDiscountLabel,
}) {
  const savingsLine = retainedBetterDiscount
    ? `This offer saves ${formatMoneyFromCents(recoverySavingsCents)} on qualifying banners. Your ${String(existingDiscountLabel || 'current discount').toLowerCase()} saves ${formatMoneyFromCents(appliedDiscountCents)}, so checkout keeps the better price.`
    : `You save ${formatMoneyFromCents(recoverySavingsCents)} · Offer total ${formatMoneyFromCents(offerTotalCents)}`;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="${BRAND_NAVY}" style="margin:18px 0;background:${BRAND_NAVY};border:2px solid ${BRAND_ORANGE};border-radius:12px;">
      <tr><td style="padding:22px 18px;text-align:center;">
        <p style="margin:0 0 6px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Private one-hour recovery offer</p>
        <p style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;">25% OFF THIS ORDER</p>
        <p style="margin:14px 0 5px;color:#cbd5e1;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Your one-time code</p>
        <p style="margin:0;display:inline-block;background:#ffffff;border-radius:8px;padding:10px 16px;color:${BRAND_NAVY};font-family:Courier New,monospace;font-size:22px;font-weight:800;letter-spacing:1.5px;word-break:break-all;">${escapeHtml(code)}</p>
        <p style="margin:14px 0 0;color:#ffffff;font-size:14px;font-weight:700;">Expires exactly one hour after this email was sent</p>
        <p style="margin:7px 0 0;color:#e2e8f0;font-size:13px;">${escapeHtml(savingsLine)}</p>
        ${retainedBetterDiscount ? `<p style="margin:7px 0 0;color:#ffffff;font-size:12px;font-weight:700;">Checkout total ${escapeHtml(formatMoneyFromCents(offerTotalCents))}</p>` : ''}
        <p style="margin:8px 0 0;color:#cbd5e1;font-size:11px;line-height:1.5;">The 25% recovery discount applies only to qualifying 6′ × 3′ or larger banner line items in this saved cart. Your cart automatically keeps the better of this offer or an existing discount; discounts are never stacked.</p>
      </td></tr>
    </table>
  `;
}

function renderBenefits() {
  const benefits = [
    ['Your exact work is saved', 'Open the secure link on any device and continue from your saved cart.'],
    ['Fast production', 'We make it simple to approve your selections and get your banner moving.'],
    ['Free Next-Day Air where eligible', 'Eligible orders receive our shipping benefit automatically at checkout.'],
  ];
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:18px 0;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
      <tr><td style="padding:15px 16px;">
        ${benefits.map(([title, description]) => `
          <p style="margin:0 0 3px;color:#9a3412;font-size:13px;font-weight:700;">${escapeHtml(title)}</p>
          <p style="margin:0 0 10px;color:#7c2d12;font-size:12px;line-height:1.5;">${escapeHtml(description)}</p>
        `).join('')}
      </td></tr>
    </table>
  `;
}

function renderRecoveryButton(recoveryUrl) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:22px 0 12px;">
      <tr><td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr><td bgcolor="${BRAND_ORANGE}" style="background:${BRAND_ORANGE};border-radius:8px;text-align:center;">
            <a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;padding:15px 30px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;line-height:1.2;">Finish My Order</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0;text-align:center;color:#64748b;font-size:11px;line-height:1.5;word-break:break-all;">Button not working? Copy this secure link into your browser:<br><a href="${escapeHtml(recoveryUrl)}" style="color:${BRAND_NAVY};text-decoration:underline;">${escapeHtml(recoveryUrl)}</a></p>
  `;
}

function formatExpiry(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('discount expiry must be a valid date');
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    throw new Error('discount expiry time zone is invalid');
  }
}

function isFutureDate(value, now) {
  const expiry = new Date(value).getTime();
  const current = new Date(now ?? Date.now()).getTime();
  return Number.isFinite(expiry) && Number.isFinite(current) && expiry > current;
}

function itemTextLines(item) {
  const lines = [
    item.name,
    `  Size: ${item.sizeDisplay || 'Not specified'}`,
    `  Quantity: ${item.quantity}`,
    `  Material: ${item.materialDisplay || 'Not specified'}`,
  ];
  if (item.product_type === 'banner') {
    lines.push(
      `  Grommets: ${item.grommetsDisplay || 'None'}`,
      `  Pole pockets: ${item.polePocketsDisplay || 'None'}`,
      `  Rope: ${item.ropeDisplay || 'None'}`,
      '  Hemming: Always included',
    );
  }
  if (item.roundedCornersDisplay) lines.push(`  Rounded corners: ${item.roundedCornersDisplay}`);
  if (item.uploadedDesignsCount) lines.push(`  Uploaded designs: ${item.uploadedDesignsCount}`);
  if (item.stepStakesQty) lines.push(`  Step stakes: ${item.stepStakesQty}`);
  lines.push(`  Line total: ${formatMoneyFromCents(Math.round(item.lineTotal * 100))}`);
  return lines;
}

function buildText({
  sequenceNumber,
  copy,
  firstName,
  items,
  recoveryUrl,
  unsubscribeUrl,
  subtotalCents,
  taxCents,
  existingDiscountCents,
  currentTotalCents,
  existingDiscountLabel,
  sameDayFeeCents,
  saturdayFeeCents,
  offer,
  previewAvailable,
  physicalAddress,
}) {
  const lines = [
    'BANNERS ON THE FLY',
    '',
    copy.title,
    '',
    `Hi ${firstName},`,
    '',
    copy.introduction,
    '',
    previewAvailable
      ? 'You left this behind — your actual saved design preview is included in the HTML email.'
      : 'Your design and selections are saved. A preview image is not available in this text email.',
    '',
    'SAVED CART',
  ];

  if (items.length) {
    items.forEach((item, index) => {
      if (index) lines.push('');
      lines.push(...itemTextLines(item));
    });
  } else {
    lines.push('Your saved cart details will load from the secure recovery link.');
  }

  lines.push('', `Subtotal: ${formatMoneyFromCents(subtotalCents)}`);
  if (existingDiscountCents > 0) lines.push(`${existingDiscountLabel || 'Current discount'}: -${formatMoneyFromCents(existingDiscountCents)}`);
  if (taxCents > 0) lines.push(`Tax: ${formatMoneyFromCents(taxCents)}`);
  if (sameDayFeeCents > 0) lines.push(`Same-Day Hit Service: ${formatMoneyFromCents(sameDayFeeCents)}`);
  if (saturdayFeeCents > 0) lines.push(`Saturday Delivery: ${formatMoneyFromCents(saturdayFeeCents)}`);

  if (offer) {
    lines.push(
      '',
      'PRIVATE ONE-HOUR RECOVERY OFFER',
      '25% OFF THIS ORDER',
      `Code: ${offer.code}`,
      'Expires: Exactly one hour after this email was sent',
      `25% offer savings: ${formatMoneyFromCents(offer.recoverySavingsCents)}`,
      ...(offer.retainedBetterDiscount ? [
        `${existingDiscountLabel || 'Your current discount'} saves more: ${formatMoneyFromCents(offer.appliedDiscountCents)}`,
      ] : []),
      `Offer total: ${formatMoneyFromCents(offer.totalCents)}`,
      'The 25% recovery discount applies only to qualifying 6 ft × 3 ft or larger banner line items in this saved cart. Your cart keeps the better of this offer or another valid discount; discounts are never stacked.',
    );
  } else {
    lines.push(`Total: ${formatMoneyFromCents(currentTotalCents)}`);
  }

  lines.push(
    '',
    'Your exact work is saved so you can continue on any device.',
    'Fast production.',
    'Free Next-Day Air where eligible.',
    '',
    'FINISH MY ORDER',
    recoveryUrl,
  );
  if (sequenceNumber === 3) lines.push('', 'This is our final scheduled recovery reminder for this saved cart.');
  lines.push(
    '',
    'Banners On The Fly',
    physicalAddress,
    '',
    'Unsubscribe from cart-recovery emails:',
    unsubscribeUrl,
  );
  return lines.join('\n');
}

function buildAbandonedCartEmail(sequenceNumber, data = {}) {
  const copy = COPY_BY_SEQUENCE[sequenceNumber];
  if (!copy) throw new Error('Unsupported recovery email sequence');

  const recoveryUrl = safeHttpsUrl(data.recoveryUrl ?? data.recovery_url, 'recoveryUrl');
  const unsubscribeUrl = safeHttpsUrl(data.unsubscribeUrl ?? data.unsubscribe_url, 'unsubscribeUrl');
  const sourceItems = parseItems(data.cartItems ?? data.items ?? data.cart_contents);
  const items = sourceItems.map(toEmailItem);
  const names = normalizeName(data.customerName ?? data.customer_name ?? data.name ?? '');
  const featured = findFeaturedPreview(items);
  const qualifyingSubtotalCents = qualifyingBannerSubtotalCents(sourceItems);
  const existingDiscountCents = optionalCents(
    data.discountCents ?? data.existingDiscountCents ?? data.discount_cents,
  ) || 0;
  const existingDiscountLabel = String(data.discountLabel || data.existingDiscountLabel || 'Discount').trim() || 'Discount';
  const sameDayFeeCents = optionalCents(data.sameDayFeeCents ?? data.same_day_fee_cents) || 0;
  const saturdayFeeCents = optionalCents(data.saturdayFeeCents ?? data.saturday_fee_cents) || 0;
  const physicalAddress = String(data.physicalAddress || DEFAULT_PHYSICAL_ADDRESS)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || DEFAULT_PHYSICAL_ADDRESS;
  const configuredExpiry = data.discountExpiresAt ?? data.offerExpiresAt ?? data.discount_expires_at;
  const discountCode = String(data.discountCode ?? data.discount_code ?? '').trim();
  const hasActiveOffer = sequenceNumber === 1
    && qualifyingSubtotalCents > 0
    && discountCode
    && isFutureDate(configuredExpiry, data.now);

  const calculatedSubtotalCents = allItemsSubtotalCents(sourceItems);
  const subtotalCents = optionalCents(data.subtotalCents ?? data.subtotal_cents) ?? calculatedSubtotalCents;
  const taxCents = optionalCents(data.taxCents ?? data.tax_cents) || 0;
  const currentTotalCents = optionalCents(
    data.estimatedTotalCents
      ?? data.totalCents
      ?? data.estimated_total_cents
      ?? data.total_cents,
  )
    ?? centsFromDollars(data.totalValue ?? data.total_value)
    ?? Math.max(0, subtotalCents - existingDiscountCents + taxCents);

  let offer = null;
  if (hasActiveOffer) {
    const calculatedOfferDiscountCents = Math.round(
      qualifyingSubtotalCents * (RECOVERY_DISCOUNT_PERCENT / 100),
    );
    const recoverySavingsCents = optionalCents(data.offerSavingsCents ?? data.offer_savings_cents)
      ?? calculatedOfferDiscountCents;
    const trustedAppliedDiscountCents = optionalCents(data.offerDiscountCents ?? data.offer_discount_cents);
    const appliedDiscountCents = Math.max(
      existingDiscountCents,
      trustedAppliedDiscountCents ?? recoverySavingsCents,
    );
    const incrementalDiscountCents = Math.max(0, appliedDiscountCents - existingDiscountCents);
    const totalCents = optionalCents(data.offerTotalCents ?? data.offer_total_cents)
      ?? Math.max(0, currentTotalCents - incrementalDiscountCents);
    offer = {
      code: discountCode,
      expiresAtLabel: formatExpiry(configuredExpiry, data.timeZone || DEFAULT_TIME_ZONE),
      recoverySavingsCents,
      appliedDiscountCents,
      totalCents,
      retainedBetterDiscount: existingDiscountCents > recoverySavingsCents,
    };
  }

  const renderedItems = items.map((item) => ({
    ...item,
    thumbnailUrl: featured?.item?.sourceIndex === item.sourceIndex ? null : item.thumbnailUrl,
  }));
  const itemHtml = renderItems(renderedItems);
  const totalsHtml = renderTotals({
    subtotal: subtotalCents / 100,
    tax: (offer ? (optionalCents(data.offerTaxCents) ?? taxCents) : taxCents) / 100,
    total: (offer?.totalCents ?? currentTotalCents) / 100,
    discountCents: offer ? offer.appliedDiscountCents : existingDiscountCents,
    discountLabel: offer
      ? (offer.retainedBetterDiscount ? 'Best available discount' : '25% off qualifying banner items')
      : existingDiscountLabel,
    sameDayFeeCents,
    saturdayFeeCents,
  });

  const title = copy.title;
  const subject = offer ? copy.offerSubject : copy.subject;
  const preheader = offer ? copy.offerPreheader : copy.preheader;
  const subtitle = offer ? copy.offerSubtitle : copy.subtitle;
  const footerHtml = `
    <p style="margin:10px 0 0;color:#64748b;font-size:11px;line-height:1.5;">You’re receiving this because an email address was entered for a saved cart at Banners On The Fly.</p>
    <p style="margin:7px 0 0;color:#64748b;font-size:11px;line-height:1.5;">Banners On The Fly · ${escapeHtml(physicalAddress)}</p>
    <p style="margin:7px 0 0;color:#64748b;font-size:11px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND_NAVY};text-decoration:underline;">Unsubscribe from cart-recovery emails</a></p>
  `;

  const html = renderEmailLayout({
    title,
    subtitle,
    eyebrow: 'Your saved cart',
    preheader,
    footerHtml,
    bodyHtml: `
      <p style="margin:0 0 10px;color:#334155;font-size:15px;">Hi ${escapeHtml(names.firstName)},</p>
      <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(copy.introduction)}</p>
      ${renderFeaturedPreview(featured)}
      ${offer ? renderOfferCard({
        code: offer.code,
        recoverySavingsCents: offer.recoverySavingsCents,
        appliedDiscountCents: offer.appliedDiscountCents,
        offerTotalCents: offer.totalCents,
        retainedBetterDiscount: offer.retainedBetterDiscount,
        existingDiscountLabel,
      }) : ''}
      ${itemHtml || '<p style="margin:0;color:#64748b;font-size:13px;">Your saved cart details will load from the secure recovery link.</p>'}
      ${totalsHtml}
      ${renderBenefits()}
      ${renderRecoveryButton(recoveryUrl)}
      ${sequenceNumber === 3 ? '<p style="margin:16px 0 0;color:#64748b;font-size:12px;text-align:center;">This is our final scheduled recovery reminder for this saved cart.</p>' : ''}
    `,
  });

  const text = buildText({
    sequenceNumber,
    copy,
    firstName: names.firstName,
    items,
    recoveryUrl,
    unsubscribeUrl,
    subtotalCents,
    taxCents: offer ? (optionalCents(data.offerTaxCents) ?? taxCents) : taxCents,
    existingDiscountCents,
    currentTotalCents,
    existingDiscountLabel,
    sameDayFeeCents,
    saturdayFeeCents,
    offer,
    previewAvailable: Boolean(featured),
    physicalAddress,
  });

  return { subject, html, text };
}

module.exports = {
  buildAbandonedCartEmail,
  formatExpiry,
  isQualifyingLargeBannerItem,
  qualifyingBannerSubtotalCents,
  toEmailItem,
};
