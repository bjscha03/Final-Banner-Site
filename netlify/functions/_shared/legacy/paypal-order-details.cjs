const { getPayPalDescription } = require('./product-display-helpers.cjs');

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

const buildPayPalItems = (cartItems, totalCents) => {
  const sourceItems = Array.isArray(cartItems)
    ? cartItems
      .filter((item) => item && Number(item.line_total_cents || 0) > 0)
      .slice(0, MAX_PAYPAL_ITEMS)
    : [];

  if (!sourceItems.length) {
    return [{
      name: 'Custom Printed Order',
      description: 'Banners On The Fly custom printing order',
      sku: 'CUSTOM-ORDER',
      quantity: '1',
      category: 'PHYSICAL_GOODS',
      unit_amount: { currency_code: 'USD', value: moneyFromCents(totalCents) },
    }];
  }

  const allocations = allocateCents(
    totalCents,
    sourceItems.map((item) => Number(item.line_total_cents || 0)),
  );

  return sourceItems.map((item, index) => ({
    name: getItemName(item),
    description: `${getItemName(item)}; ordered quantity ${Math.max(1, Number(item.quantity || 1))}`.slice(0, 2048),
    sku: getSku(item, index),
    quantity: '1',
    category: 'PHYSICAL_GOODS',
    unit_amount: {
      currency_code: 'USD',
      value: moneyFromCents(allocations[index]),
    },
  }));
};

const applyPayPalOrderDetails = (orderRequest, cartItems) => {
  const purchaseUnit = orderRequest?.purchase_units?.[0];
  const totalCents = centsFromMoney(purchaseUnit?.amount?.value);
  if (!purchaseUnit || totalCents <= 0) return null;

  const items = buildPayPalItems(cartItems, totalCents);
  const itemTotalCents = items.reduce(
    (sum, item) => (
      sum
      + centsFromMoney(item?.unit_amount?.value) * Number(item?.quantity || 1)
    ),
    0,
  );
  if (!items.length || itemTotalCents !== totalCents) return null;

  purchaseUnit.items = items;
  purchaseUnit.amount.breakdown = {
    ...(purchaseUnit.amount.breakdown || {}),
    item_total: {
      currency_code: 'USD',
      value: moneyFromCents(itemTotalCents),
    },
  };
  return orderRequest;
};

const buildDetailedPayPalOrderRequest = (summaryRequest, cartItems) => {
  const clonedRequest = JSON.parse(JSON.stringify(summaryRequest || {}));
  return applyPayPalOrderDetails(clonedRequest, cartItems);
};

const enhancePayPalOrderRequest = (outboundBody, originalEventBody) => {
  const orderRequest = JSON.parse(String(outboundBody || '{}'));
  const eventPayload = JSON.parse(String(originalEventBody || '{}'));
  return applyPayPalOrderDetails(orderRequest, eventPayload.items);
};

module.exports = {
  allocateCents,
  applyPayPalOrderDetails,
  buildDetailedPayPalOrderRequest,
  buildPayPalItems,
  enhancePayPalOrderRequest,
};
