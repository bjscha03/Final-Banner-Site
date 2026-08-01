// The backend handler remains authoritative for pricing, identity, and PayPal
// order linkage. This modern entrypoint adds buyer-visible line items without
// changing the charged amount.
import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-create-order-forward.cjs';
import displayHelpers from './_shared/legacy/product-display-helpers.cjs';

const PAYPAL_CREATE_ORDER_RE = /\/v2\/checkout\/orders(?:\?|$)/i;
const MAX_PAYPAL_ITEMS = 100;

const centsFromMoney = (value) => Math.max(0, Math.round(Number.parseFloat(String(value || '0')) * 100));
const moneyFromCents = (value) => (Math.max(0, Math.round(Number(value) || 0)) / 100).toFixed(2);

const allocateCents = (totalCents, weights) => {
  const safeTotal = Math.max(0, Math.round(Number(totalCents) || 0));
  const safeWeights = weights.map((value) => Math.max(0, Number(value) || 0));
  const weightTotal = safeWeights.reduce((sum, value) => sum + value, 0);
  if (!safeWeights.length) return [];
  if (weightTotal <= 0) {
    return safeWeights.map((_, index) => index === safeWeights.length - 1 ? safeTotal : 0);
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
  const type = String(item?.product_type || 'banner').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const width = Number(item?.width_in || 0);
  const height = Number(item?.height_in || 0);
  return `${type}-${width || 'CUSTOM'}X${height || 'CUSTOM'}-${index + 1}`.slice(0, 127);
};

const getItemName = (item) => {
  const description = displayHelpers.getPayPalDescription([item]);
  return String(description || 'Custom printed product').slice(0, 127);
};

const buildPayPalItems = (cartItems, totalCents) => {
  const sourceItems = Array.isArray(cartItems)
    ? cartItems.filter((item) => item && Number(item.line_total_cents || 0) > 0).slice(0, MAX_PAYPAL_ITEMS)
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

const enhancePayPalOrderRequest = (outboundBody, originalEventBody) => {
  const orderRequest = JSON.parse(String(outboundBody || '{}'));
  const eventPayload = JSON.parse(String(originalEventBody || '{}'));
  const purchaseUnit = orderRequest?.purchase_units?.[0];
  const totalCents = centsFromMoney(purchaseUnit?.amount?.value);
  if (!purchaseUnit || totalCents <= 0) return null;

  const items = buildPayPalItems(eventPayload.items, totalCents);
  const itemTotalCents = items.reduce(
    (sum, item) => sum + centsFromMoney(item?.unit_amount?.value) * Number(item?.quantity || 1),
    0,
  );
  if (!items.length || itemTotalCents !== totalCents) return null;

  purchaseUnit.items = items;
  purchaseUnit.amount.breakdown = {
    item_total: {
      currency_code: 'USD',
      value: moneyFromCents(itemTotalCents),
    },
  };
  return orderRequest;
};

const handler = async (event, context) => {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return legacyModule.handler(event, context);

  const patchedFetch = async (input, init = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST' || !PAYPAL_CREATE_ORDER_RE.test(url) || typeof init?.body !== 'string') {
      return originalFetch(input, init);
    }

    let enhanced;
    try {
      enhanced = enhancePayPalOrderRequest(init.body, event.body);
    } catch (error) {
      console.warn('[paypal-create-order] could not build line-item details; using summary-only request', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (!enhanced) return originalFetch(input, init);

    const enhancedResponse = await originalFetch(input, {
      ...init,
      body: JSON.stringify(enhanced),
    });

    if (!enhancedResponse.ok && [400, 422].includes(enhancedResponse.status)) {
      let diagnostic = '';
      try { diagnostic = (await enhancedResponse.clone().text()).slice(0, 500); } catch { /* no-op */ }
      console.error('[paypal-create-order] PayPal rejected detailed line items; retrying summary-only request', {
        status: enhancedResponse.status,
        diagnostic,
      });
      return originalFetch(input, init);
    }

    return enhancedResponse;
  };

  globalThis.fetch = patchedFetch;
  try {
    return await legacyModule.handler(event, context);
  } finally {
    if (globalThis.fetch === patchedFetch) globalThis.fetch = originalFetch;
  }
};

export const _test = {
  allocateCents,
  buildPayPalItems,
  enhancePayPalOrderRequest,
};

export default withLambda(handler);
