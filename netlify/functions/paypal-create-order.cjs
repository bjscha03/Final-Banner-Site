const { randomUUID } = require('crypto');

// Feature flag support for pricing logic (copied from create-order.js)
const getFeatureFlags = () => {
  return {
    freeShipping: process.env.FEATURE_FREE_SHIPPING === '1',
    minOrderFloor: process.env.FEATURE_MIN_ORDER_FLOOR === '1',
    minOrderCents: parseInt(process.env.MIN_ORDER_CENTS || '2000', 10),
    shippingMethodLabel: process.env.SHIPPING_METHOD_LABEL || 'Free Next-Day Air'
  };
};

// Quantity discount tiers - "Buy More, Save More"
// Must match src/lib/quantity-discount.ts exactly
const QUANTITY_DISCOUNT_TIERS = [
  { minQuantity: 1, discountRate: 0.00 },
  { minQuantity: 2, discountRate: 0.05 },
  { minQuantity: 3, discountRate: 0.07 },
  { minQuantity: 4, discountRate: 0.10 },
  { minQuantity: 5, discountRate: 0.13 },
];

const getQuantityDiscountRate = (quantity) => {
  // Find the highest tier that the quantity qualifies for
  let discountRate = 0;
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) {
      discountRate = tier.discountRate;
    }
  }
  return discountRate;
};

const calculateQuantityDiscount = (subtotalCents, quantity) => {
  const discountRate = getQuantityDiscountRate(quantity);
  const discountCents = Math.round(subtotalCents * discountRate);
  return { discountRate, discountCents };
};

/**
 * "Best Discount Wins" - server-side discount resolver
 * Only one discount is applied: whichever is higher (quantity or promo)
 */
const resolveBestDiscount = (subtotalCents, quantity, promoDiscount = null) => {
  // Calculate quantity discount
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(subtotalCents * quantityDiscountRate);

  // Calculate promo discount
  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(subtotalCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, subtotalCents);
      promoDiscountRate = subtotalCents > 0 ? promoDiscountAmountCents / subtotalCents : 0;
    }
  }

  // Pick the better one (higher amount wins)
  if (quantityDiscountAmountCents >= promoDiscountAmountCents && quantityDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'quantity',
      appliedDiscountAmountCents: quantityDiscountAmountCents,
      appliedDiscountRate: quantityDiscountRate,
      quantityDiscountCents: quantityDiscountAmountCents,
      promoDiscountCents: 0, // Not applied
    };
  } else if (promoDiscountAmountCents > 0) {
    return {
      appliedDiscountType: 'promo',
      appliedDiscountAmountCents: promoDiscountAmountCents,
      appliedDiscountRate: promoDiscountRate,
      quantityDiscountCents: 0, // Not applied
      promoDiscountCents: promoDiscountAmountCents,
    };
  }

  return {
    appliedDiscountType: 'none',
    appliedDiscountAmountCents: 0,
    appliedDiscountRate: 0,
    quantityDiscountCents: 0,
    promoDiscountCents: 0,
  };
};

const computeTotals = (items, taxRate, opts, promoDiscount = null) => {
  const raw = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  const adjusted = Math.max(raw, opts.minFloorCents || 0);
  const minAdj = Math.max(0, adjusted - raw);

  // Calculate total quantity across all items
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  // "Best Discount Wins" - only ONE discount applied
  const bestDiscount = resolveBestDiscount(adjusted, totalQuantity, promoDiscount);
  const subtotalAfterDiscount = adjusted - bestDiscount.appliedDiscountAmountCents;

  const shipping_cents = opts.freeShipping ? 0 : 0; // Always free for US
  const tax_cents = Math.round(subtotalAfterDiscount * taxRate);
  const total_cents = subtotalAfterDiscount + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    total_quantity: totalQuantity,
    applied_discount_type: bestDiscount.appliedDiscountType,
    applied_discount_cents: bestDiscount.appliedDiscountAmountCents,
    applied_discount_rate: bestDiscount.appliedDiscountRate,
    quantity_discount_rate: getQuantityDiscountRate(totalQuantity),
    quantity_discount_cents: bestDiscount.quantityDiscountCents,
    promo_discount_cents: bestDiscount.promoDiscountCents,
    subtotal_after_discount_cents: subtotalAfterDiscount,
    shipping_cents,
    tax_cents,
    total_cents,
  };
};





// PayPal API helpers
const getPayPalCredentials = () => {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

  console.log('PayPal credentials check:', {
    env,
    clientIdExists: !!clientId,
    secretExists: !!secret,
    clientIdLength: clientId?.length,
    secretLength: secret?.length
  });

  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }
  
  return {
    clientId,
    secret,
    baseUrl: env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com'
  };
};

const getPayPalAccessToken = async () => {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event, context) => {
  const cid = randomUUID();
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED', cid }),
    };
  }

  try {
    // Comprehensive environment check
    console.log('=== PayPal Create Order Debug Info ===', { cid });
    console.log('Environment variables check:', {
      FEATURE_PAYPAL: process.env.FEATURE_PAYPAL,
      PAYPAL_ENV: process.env.PAYPAL_ENV,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      hasSecret: !!process.env.PAYPAL_SECRET_SANDBOX,
      hasDatabase: !!process.env.NETLIFY_DATABASE_URL,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    });

    // Check if PayPal is enabled (temporarily disabled for debugging)
    // if (process.env.FEATURE_PAYPAL !== '1') {
    //   console.error('PayPal is disabled:', { FEATURE_PAYPAL: process.env.FEATURE_PAYPAL, cid });
    //   return {
    //     statusCode: 400,
    //     headers,
    //     body: JSON.stringify({ ok: false, error: 'PAYPAL_DISABLED', cid }),
    //   };
    // }
    console.log('PayPal feature flag check bypassed for debugging');

    // Parse and validate request body
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('PayPal create order - Invalid JSON:', parseError, 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'INVALID_JSON', cid }),
      };
    }

    const { items, shippingAddress, email, discountCode } = payload;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('PayPal create order - Missing or empty items:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_ITEMS', cid }),
      };
    }

    if (!email) {
      console.error('PayPal create order - Missing email:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_EMAIL', cid }),
      };
    }

    // Server-side total calculation using existing logic
    const flags = getFeatureFlags();
    const taxRate = 0.06; // 6% tax rate
    const pricingOptions = {
      freeShipping: flags.freeShipping,
      minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
      shippingMethodLabel: flags.shippingMethodLabel
    };

    // Pass discount code to computeTotals for server-side price calculation
    // This ensures frontend discount matches backend PayPal order amount
    const totals = computeTotals(items, taxRate, pricingOptions, discountCode);
    const totalAmount = (totals.total_cents / 100).toFixed(2);

    console.log('PayPal create order - Calculated totals:', {
      cid,
      raw_subtotal_cents: totals.raw_subtotal_cents,
      adjusted_subtotal_cents: totals.adjusted_subtotal_cents,
      promo_discount_cents: totals.promo_discount_cents,
      total_cents: totals.total_cents,
      totalAmount,
      discountCode: discountCode ? discountCode.code : null
    });

    // Create PayPal order
    const accessToken = await getPayPalAccessToken();
    const { baseUrl } = getPayPalCredentials();

    const orderRequest = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: totalAmount
        },
        description: 'Custom Banner Order - Banners On The Fly'
      }],
      application_context: {
        brand_name: 'Banners On The Fly',
        user_action: 'PAY_NOW',
        shipping_preference: 'GET_FROM_FILE'
      }
    };

    // Add shipping if provided
    if (shippingAddress) {
      orderRequest.purchase_units[0].shipping = {
        name: { full_name: shippingAddress.name || 'Customer' },
        address: shippingAddress
      };
    }

    console.log('PayPal create - Making order request...', { cid, baseUrl, orderAmount: orderRequest.purchase_units[0].amount.value });
    const paypalResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderRequest)
    });
    console.log('PayPal create - Order response status:', { cid, status: paypalResponse.status });

    if (!paypalResponse.ok) {
      const errorText = await paypalResponse.text();
      console.error('PayPal create order failed:', {
        cid,
        status: paypalResponse.status,
        error: errorText
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'PAYPAL_CREATE_FAILED', cid }),
      };
    }

    const paypalOrder = await paypalResponse.json();
    
    console.log('PayPal order created successfully:', {
      cid,
      paypalOrderId: paypalOrder.id,
      status: paypalOrder.status
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        paypalOrderId: paypalOrder.id,
        cid
      }),
    };

  } catch (error) {
    console.error('PayPal create order error:', error, 'cid:', cid);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);

    // Return more detailed error information for debugging
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'INTERNAL_ERROR',
        debug: {
          message: error.message,
          type: error.constructor.name,
          cid,
          timestamp: new Date().toISOString()
        },
        cid
      }),
    };
  }
};
