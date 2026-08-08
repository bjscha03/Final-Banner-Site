const {
  getEmailItemOptions,
  getItemDisplayName,
  getPayPalDescription,
} = require('./product-display-helpers.cjs');

const MAX_PAYPAL_ITEMS = 100;

const centsFromMoney = (value) => Math.max(
  0,
  Math.round(Number.parseFloat(String(value || '0')) * 100),
);

const moneyFromCents = (value) => (
  Math.max(0, Math.round(Number(value) || 0)) / 100
).toFixed(2);

const allocateCents = (totalCents, weights) => {
  const safeTotal = Math.max(0, Math.round(Number(totalCents) || 0));
  const safeWeights = weights.map((value) => Math.max(0, Number(value) || 0));
  const weightTotal = safeWeights.reduce((sum, value) => sum + value, 0);
  if (!safeWeights.length) return [];
  if (weightTotal <= 0) {
    return safeWeights.map((_, index) => (
      index === safeWeights.length - 1 ? safeTotal : 0
    ));
  }

  let allocated = 0;
  return safeWeights.map((weight, index) => {
    if (index === safeWeights.length - 1) return safeTotal - allocated;
    const share = Math.floor((safeTotal * weight) / weightTotal);
    allocated += share;
    return share;
  });
};

const getSku = (item, index) => {
  const type = String(item?.product_type || 'banner')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');
  const width = Number(item?.width_in || 0);
  const height = Number(item?.height_in || 0);
  return `${type}-${width || 'CUSTOM'}X${height || 'CUSTOM'}-${index + 1}`.slice(0, 127);
};

const getItemName = (item) => {
  const description = getPayPalDescription([item]);
  return String(description || 'Custom printed product').slice(0, 127);
};

const getItemDescription = (item) => {
  const displayName = getItemDisplayName(item);
  const specifications = getEmailItemOptions(item);
  return [displayName, specifications].filter(Boolean).join(' | ').slice(0, 2048);
};

const itemShape = (item, index, {
  quantity,
  unitAmountCents,
  priceTier = null,
}) => ({
  name: getItemName(item),
  description: priceTier
    ? `Per-unit rounding allocation: ${quantity} of ${Number(item.quantity)} units | ${getItemDescription(item)}`.slice(0, 2048)
    : getItemDescription(item),
  sku: `${getSku(item, index)}${priceTier ? `-${priceTier}` : ''}`.slice(0, 127),
  quantity: String(quantity),
  category: 'PHYSICAL_GOODS',
  unit_amount: {
    currency_code: 'USD',
    value: moneyFromCents(unitAmountCents),
  },
});

const buildPayPalItems = (cartItems, merchandiseSubtotalCents) => {
  if (!Array.isArray(cartItems) || !cartItems.length || cartItems.length > MAX_PAYPAL_ITEMS) return [];

  // PayPal requires every item amount to be positive. Do not silently drop an
  // invalid item because doing so would create a customer receipt with missing
  // product metadata.
  const sourceItems = cartItems.filter((item) => (
    item
    && Number.isInteger(Number(item.quantity))
    && Number(item.quantity) > 0
    && Number.isInteger(Number(item.line_total_cents))
    && Number(item.line_total_cents) > 0
  ));
  if (sourceItems.length !== cartItems.length) return [];

  const items = [];
  let rawSubtotalCents = 0;
  let invalidAllocation = false;
  sourceItems.forEach((item, index) => {
    const quantity = Number(item.quantity);
    const lineTotalCents = Number(item.line_total_cents);
    const perUnitCents = Math.floor(lineTotalCents / quantity);
    const remainderCents = lineTotalCents - (perUnitCents * quantity);
    if (perUnitCents <= 0) {
      invalidAllocation = true;
      return;
    }
    const lowerPriceQuantity = quantity - remainderCents;
    if (lowerPriceQuantity > 0) {
      items.push(itemShape(item, index, {
        quantity: lowerPriceQuantity,
        unitAmountCents: perUnitCents,
        priceTier: remainderCents > 0 ? 'A' : null,
      }));
    }
    if (remainderCents > 0) {
      // Distribute indivisible pennies over real merchandise units. The two
      // rows still sum to exactly the physical cart quantity; no fake product
      // or extra unit is introduced for a one-time setup amount.
      items.push(itemShape(item, index, {
        quantity: remainderCents,
        unitAmountCents: perUnitCents + 1,
        priceTier: 'B',
      }));
    }
    rawSubtotalCents += lineTotalCents;
  });
  if (invalidAllocation) return [];

  const targetSubtotalCents = Math.max(0, Math.round(Number(merchandiseSubtotalCents) || 0));
  if (targetSubtotalCents !== rawSubtotalCents) return [];
  if (items.length > MAX_PAYPAL_ITEMS) return [];
  const structuredSubtotalCents = items.reduce(
    (sum, item) => sum + centsFromMoney(item.unit_amount.value) * Number(item.quantity),
    0,
  );
  return structuredSubtotalCents === targetSubtotalCents ? items : [];
};

const applyPayPalOrderDetails = (orderRequest, cartItems, ledger = null) => {
  const purchaseUnit = orderRequest?.purchase_units?.[0];
  const totalCents = centsFromMoney(purchaseUnit?.amount?.value);
  if (!purchaseUnit || totalCents <= 0) return null;

  const merchandiseSubtotalCents = ledger == null
    ? totalCents
    : Math.max(0, Math.round(Number(ledger.subtotalCents) || 0));
  const taxCents = Math.max(0, Math.round(Number(ledger?.taxCents) || 0));
  const shippingCents = Math.max(0, Math.round(Number(ledger?.shippingCents) || 0));
  const discountCents = Math.max(0, Math.round(Number(ledger?.discountCents) || 0));
  const handlingCents = Math.max(0, Math.round(Number(
    ledger?.handlingCents
      ?? (Number(ledger?.sameDayFeeCents || 0) + Number(ledger?.saturdayFeeCents || 0)),
  ) || 0));
  if (merchandiseSubtotalCents + taxCents + shippingCents + handlingCents - discountCents !== totalCents) {
    return null;
  }

  const items = buildPayPalItems(cartItems, merchandiseSubtotalCents);
  const itemTotalCents = items.reduce(
    (sum, item) => (
      sum
      + centsFromMoney(item?.unit_amount?.value) * Number(item?.quantity || 1)
    ),
    0,
  );
  if (!items.length || itemTotalCents !== merchandiseSubtotalCents) return null;

  purchaseUnit.items = items;
  purchaseUnit.amount.breakdown = {
    item_total: {
      currency_code: 'USD',
      value: moneyFromCents(itemTotalCents),
    },
    shipping: {
      currency_code: 'USD',
      value: moneyFromCents(shippingCents),
    },
    ...(taxCents > 0 ? {
      tax_total: { currency_code: 'USD', value: moneyFromCents(taxCents) },
    } : {}),
    ...(handlingCents > 0 ? {
      handling: { currency_code: 'USD', value: moneyFromCents(handlingCents) },
    } : {}),
    ...(discountCents > 0 ? {
      discount: { currency_code: 'USD', value: moneyFromCents(discountCents) },
    } : {}),
  };
  return orderRequest;
};

const buildDetailedPayPalOrderRequest = (summaryRequest, cartItems, ledger = null) => {
  const clonedRequest = JSON.parse(JSON.stringify(summaryRequest || {}));
  return applyPayPalOrderDetails(clonedRequest, cartItems, ledger);
};

const enhancePayPalOrderRequest = (outboundBody, originalEventBody) => {
  const orderRequest = JSON.parse(String(outboundBody || '{}'));
  const eventPayload = JSON.parse(String(originalEventBody || '{}'));
  return applyPayPalOrderDetails(orderRequest, eventPayload.items, eventPayload.ledger || null);
};

module.exports = {
  allocateCents,
  applyPayPalOrderDetails,
  buildDetailedPayPalOrderRequest,
  buildPayPalItems,
  enhancePayPalOrderRequest,
};
