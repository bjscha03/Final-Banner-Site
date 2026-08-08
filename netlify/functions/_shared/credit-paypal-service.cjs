'use strict';

const CREDIT_PACKAGES = Object.freeze({
  starter: Object.freeze({ id: 'starter', credits: 10, amountCents: 500, label: '10 AI Generation Credits' }),
  popular: Object.freeze({ id: 'popular', credits: 50, amountCents: 2000, label: '50 AI Generation Credits' }),
  pro: Object.freeze({ id: 'pro', credits: 100, amountCents: 3500, label: '100 AI Generation Credits' }),
});

const ACTIVE_PAYPAL_ORDER_STATUSES = new Set(['CREATED', 'SAVED', 'APPROVED', 'PAYER_ACTION_REQUIRED']);
const DEFINITIVE_PROVIDER_CODES = new Set([
  'INSTRUMENT_DECLINED',
  'PAYER_CANNOT_PAY',
  'PAYMENT_DENIED',
  'TRANSACTION_REFUSED',
  'PAYMENT_SOURCE_CANNOT_BE_USED',
  'PAYMENT_SOURCE_DECLINED_BY_PROCESSOR',
]);

let creditPaymentSchemaReady = false;

class CreditPaymentError extends Error {
  constructor(code, message, {
    statusCode = 400,
    retryable = false,
    paymentCaptured = false,
    captureId = null,
    details = null,
  } = {}) {
    super(message);
    this.name = 'CreditPaymentError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.paymentCaptured = paymentCaptured;
    this.captureId = captureId;
    this.details = details;
  }
}

function clean(value, max = 500) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeEmail(value) {
  const email = clean(value, 320)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function moneyFromCents(value) {
  return (Number(value) / 100).toFixed(2);
}

function amountToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function resolveCreditPackage(packageId) {
  const key = clean(packageId, 40)?.toLowerCase() || '';
  const selected = CREDIT_PACKAGES[key];
  if (!selected) {
    throw new CreditPaymentError(
      'CREDIT_PACKAGE_INVALID',
      'Choose a currently available credit package.',
      { statusCode: 400 },
    );
  }
  return selected;
}

function validateCheckoutKey(value) {
  const key = clean(value, 128);
  if (!key || !/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
    throw new CreditPaymentError(
      'CHECKOUT_KEY_INVALID',
      'This credit checkout session is invalid. Start a new purchase.',
      { statusCode: 400 },
    );
  }
  return key;
}

function creditCaptureRequestId(purchaseId) {
  return `credit-capture-${purchaseId}`.slice(0, 108);
}

function creditCustomId(purchaseId) {
  return `CREDIT:${purchaseId}`;
}

function creditInvoiceId(purchaseId) {
  return `BOTF-CREDIT-${purchaseId}`;
}

function buildCreditPayPalOrder(purchase, selectedPackage) {
  const amount = moneyFromCents(selectedPackage.amountCents);
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: creditCustomId(purchase.id),
      custom_id: creditCustomId(purchase.id),
      invoice_id: creditInvoiceId(purchase.id),
      description: selectedPackage.label,
      items: [{
        name: selectedPackage.label,
        sku: `AI-CREDITS-${selectedPackage.id.toUpperCase()}`,
        quantity: '1',
        category: 'DIGITAL_GOODS',
        unit_amount: { currency_code: 'USD', value: amount },
      }],
      amount: {
        currency_code: 'USD',
        value: amount,
        breakdown: {
          item_total: { currency_code: 'USD', value: amount },
        },
      },
    }],
    application_context: {
      brand_name: 'Banners On The Fly',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  };
}

function providerOrderIdentity(order) {
  const units = Array.isArray(order?.purchase_units) ? order.purchase_units : [];
  const unit = units[0] || {};
  return {
    orderId: clean(order?.id, 200),
    status: String(order?.status || '').toUpperCase(),
    customId: clean(unit.custom_id, 127),
    invoiceId: clean(unit.invoice_id, 127),
    currency: String(unit.amount?.currency_code || '').toUpperCase(),
    amountCents: amountToCents(unit.amount?.value),
    purchaseUnitCount: units.length,
  };
}

function matchesCreditPurchase(order, purchase) {
  const identity = providerOrderIdentity(order);
  return identity.purchaseUnitCount === 1
    && identity.customId === creditCustomId(purchase.id)
    && identity.invoiceId === creditInvoiceId(purchase.id)
    && identity.currency === 'USD'
    && identity.amountCents === Number(purchase.amount_cents);
}

function completedCaptures(order) {
  const units = Array.isArray(order?.purchase_units) ? order.purchase_units : [];
  return units.flatMap((unit) => (
    Array.isArray(unit?.payments?.captures) ? unit.payments.captures : []
  )).filter((capture) => String(capture?.status || '').toUpperCase() === 'COMPLETED');
}

function validateCompletedCreditCapture(order, purchase, expectedCaptureId = null) {
  if (!matchesCreditPurchase(order, purchase)) {
    return { ok: false, code: 'CREDIT_PAYPAL_IDENTITY_MISMATCH' };
  }
  if (String(order?.status || '').toUpperCase() !== 'COMPLETED') {
    return { ok: false, code: 'CREDIT_PAYPAL_ORDER_NOT_COMPLETED' };
  }
  const captures = completedCaptures(order);
  if (captures.length !== 1) {
    return { ok: false, code: 'CREDIT_PAYPAL_CAPTURE_COUNT_INVALID' };
  }
  const capture = captures[0];
  const captureId = clean(capture?.id, 200);
  const currency = String(capture?.amount?.currency_code || '').toUpperCase();
  const amountCents = amountToCents(capture?.amount?.value);
  if (!captureId) return { ok: false, code: 'CREDIT_PAYPAL_CAPTURE_ID_MISSING' };
  if (expectedCaptureId && captureId !== expectedCaptureId) {
    return { ok: false, code: 'CREDIT_PAYPAL_CAPTURE_ID_MISMATCH', captureId };
  }
  if (currency !== 'USD') {
    return { ok: false, code: 'CREDIT_PAYPAL_CAPTURE_CURRENCY_MISMATCH', captureId, currency };
  }
  if (amountCents !== Number(purchase.amount_cents)) {
    return { ok: false, code: 'CREDIT_PAYPAL_CAPTURE_AMOUNT_MISMATCH', captureId, currency, amountCents };
  }
  return { ok: true, captureId, currency, amountCents, capture };
}

function deploymentKind() {
  const context = clean(process.env.CONTEXT, 40)?.toLowerCase() || '';
  if (context) return context;
  const configuredUrl = clean(process.env.DEPLOY_PRIME_URL || process.env.URL, 500);
  if (!configuredUrl) return '';
  try {
    const host = new URL(configuredUrl).hostname.toLowerCase();
    if (host === 'bannersonthefly.com' || host === 'www.bannersonthefly.com') return 'production';
    if (/^deploy-preview-\d+--.+\.netlify\.app$/.test(host)) return 'deploy-preview';
    if (host.endsWith('.netlify.app')) return 'branch-deploy';
  } catch {
    return '';
  }
  return '';
}

function getCreditPayPalConfig({ requireFeature = true } = {}) {
  if (requireFeature) {
    if (String(process.env.FEATURE_PAYPAL || '').trim() !== '1'
        || String(process.env.FEATURE_PAYPAL_CREDITS || '').trim() !== '1') {
      throw new CreditPaymentError(
        'PAYPAL_CREDITS_DISABLED',
        'Credit purchases are temporarily unavailable.',
        { statusCode: 503 },
      );
    }
  }

  const environment = clean(process.env.PAYPAL_ENV, 20)?.toLowerCase();
  if (!['sandbox', 'live'].includes(environment)) {
    throw new CreditPaymentError(
      'PAYPAL_ENVIRONMENT_INVALID',
      'Credit payments are not configured for this environment.',
      { statusCode: 503 },
    );
  }
  const deploy = deploymentKind();
  if (deploy === 'deploy-preview') {
    throw new CreditPaymentError(
      'PAYPAL_CREDITS_PREVIEW_DISABLED',
      'Provider credit payments are disabled on Deploy Previews.',
      { statusCode: 503 },
    );
  }
  if (deploy === 'production' && environment !== 'live') {
    throw new CreditPaymentError(
      'PAYPAL_ENVIRONMENT_MISMATCH',
      'Production credit payments require live PayPal credentials.',
      { statusCode: 503 },
    );
  }
  if (environment === 'live' && ['deploy-preview', 'branch-deploy', 'dev'].includes(deploy)) {
    throw new CreditPaymentError(
      'PAYPAL_ENVIRONMENT_MISMATCH',
      'Preview credit payments cannot use live PayPal credentials.',
      { statusCode: 503 },
    );
  }

  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
  const clientId = clean(process.env[`PAYPAL_CLIENT_ID_${suffix}`], 500)
    || (deploy === 'production'
      ? clean(process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID, 500)
      : null);
  const secret = clean(process.env[`PAYPAL_SECRET_${suffix}`], 1000)
    || (deploy === 'production'
      ? clean(process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET, 1000)
      : null);
  if (!clientId || !secret) {
    throw new CreditPaymentError(
      'PAYPAL_CREDITS_NOT_CONFIGURED',
      'Credit payments are not configured for this environment.',
      { statusCode: 503 },
    );
  }
  return {
    environment,
    clientId,
    secret,
    baseUrl: environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

async function parseJsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function getPayPalAccessToken(config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok || !payload?.access_token) {
    throw new CreditPaymentError(
      'PAYPAL_AUTH_FAILED',
      'Credit payment verification is temporarily unavailable.',
      { statusCode: 503, retryable: true },
    );
  }
  return payload.access_token;
}

async function retrievePayPalOrder(config, accessToken, orderId, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
  });
  return { ok: response.ok, status: response.status, data: await parseJsonResponse(response) };
}

async function createPayPalCreditOrder(config, accessToken, purchase, selectedPackage, fetchImpl = globalThis.fetch) {
  const requestId = `credit-create-${purchase.id}`.slice(0, 108);
  const body = buildCreditPayPalOrder(purchase, selectedPackage);
  const response = await fetchImpl(`${config.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return {
    ok: response.ok,
    status: response.status,
    data: await parseJsonResponse(response),
    requestId,
    body,
  };
}

async function capturePayPalCreditOrder(config, accessToken, purchase, fetchImpl = globalThis.fetch) {
  const requestId = creditCaptureRequestId(purchase.id);
  const response = await fetchImpl(
    `${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(purchase.paypal_order_id)}/capture`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
        Prefer: 'return=representation',
      },
      body: '{}',
    },
  );
  return { ok: response.ok, status: response.status, data: await parseJsonResponse(response), requestId };
}

function providerErrorCode(payload) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  return String(
    details.find((detail) => detail?.issue)?.issue
    || details.find((detail) => detail?.reason)?.reason
    || payload?.name
    || '',
  ).toUpperCase() || null;
}

function isDefinitiveProviderFailure(payload, statusCode) {
  const code = providerErrorCode(payload);
  // Once a capture request has been sent, an unfamiliar 4xx can mean "already
  // captured" or another conflict whose authoritative GET has not converged.
  // Only codes PayPal defines as a definite no-capture decline may unlock a new
  // payment. Every other response remains in reconciliation.
  return DEFINITIVE_PROVIDER_CODES.has(code);
}

async function loadCreditPurchaseById(sql, purchaseId, userId = null) {
  const rows = await sql`
    SELECT id, user_id, email, credits_purchased, amount_cents, package_key,
           currency, status, payment_method, checkout_idempotency_key,
           paypal_order_id, paypal_capture_id, payment_reconciliation_status,
           paypal_create_request_id, paypal_capture_request_id, last_error_code,
           completed_at, credited_at, created_at, updated_at
      FROM credit_purchases
     WHERE id = ${purchaseId}
       AND (${userId || null}::text IS NULL OR user_id = ${userId || null})
     LIMIT 1
  `;
  return rows[0] || null;
}

async function ensureCreditPaymentSchema(sql) {
  if (creditPaymentSchemaReady) return;
  try {
    await sql`
      ALTER TABLE credit_purchases
        ADD COLUMN IF NOT EXISTS package_key TEXT,
        ADD COLUMN IF NOT EXISTS currency TEXT,
        ADD COLUMN IF NOT EXISTS checkout_idempotency_key TEXT,
        ADD COLUMN IF NOT EXISTS payment_reconciliation_status TEXT,
        ADD COLUMN IF NOT EXISTS paypal_create_request_id TEXT,
        ADD COLUMN IF NOT EXISTS paypal_capture_request_id TEXT,
        ADD COLUMN IF NOT EXISTS last_error_code TEXT,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ
    `;
    const duplicates = await sql`
      SELECT provider_field, provider_id, duplicate_count
        FROM (
          SELECT 'paypal_order_id'::text AS provider_field,
                 paypal_order_id AS provider_id,
                 COUNT(*)::integer AS duplicate_count
            FROM credit_purchases
           WHERE paypal_order_id IS NOT NULL
           GROUP BY paypal_order_id
          HAVING COUNT(*) > 1
          UNION ALL
          SELECT 'paypal_capture_id'::text AS provider_field,
                 paypal_capture_id AS provider_id,
                 COUNT(*)::integer AS duplicate_count
            FROM credit_purchases
           WHERE paypal_capture_id IS NOT NULL
           GROUP BY paypal_capture_id
          HAVING COUNT(*) > 1
        ) duplicates
       LIMIT 10
    `;
    if (duplicates.length) {
      throw new CreditPaymentError(
        'CREDIT_PAYMENT_SCHEMA_RECONCILIATION_REQUIRED',
        'Existing credit payment records require administrator reconciliation before checkout can continue.',
        { statusCode: 503, details: { duplicateFields: [...new Set(duplicates.map((row) => row.provider_field))] } },
      );
    }
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_checkout_key_uidx
        ON credit_purchases (checkout_idempotency_key)
        WHERE checkout_idempotency_key IS NOT NULL
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_paypal_order_uidx
        ON credit_purchases (paypal_order_id)
        WHERE paypal_order_id IS NOT NULL
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_paypal_capture_uidx
        ON credit_purchases (paypal_capture_id)
        WHERE paypal_capture_id IS NOT NULL
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox (
        purchase_id TEXT PRIMARY KEY REFERENCES credit_purchases(id) ON DELETE CASCADE,
        delivery_status TEXT NOT NULL DEFAULT 'pending',
        provider_message_id TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        lease_started_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    creditPaymentSchemaReady = true;
  } catch (error) {
    if (error instanceof CreditPaymentError) throw error;
    console.error('[credit-paypal] schema readiness failed', { error: error?.message });
    throw new CreditPaymentError(
      'CREDIT_PAYMENT_SCHEMA_UNAVAILABLE',
      'Credit checkout is unavailable until its database migration is ready.',
      { statusCode: 503 },
    );
  }
}

async function loadCreditPurchaseByCheckoutKey(sql, checkoutKey) {
  const rows = await sql`
    SELECT id, user_id, email, credits_purchased, amount_cents, package_key,
           currency, status, payment_method, checkout_idempotency_key,
           paypal_order_id, paypal_capture_id, payment_reconciliation_status,
           paypal_create_request_id, paypal_capture_request_id, last_error_code,
           completed_at, credited_at, created_at, updated_at
      FROM credit_purchases
     WHERE checkout_idempotency_key = ${checkoutKey}
     LIMIT 1
  `;
  return rows[0] || null;
}

async function loadCreditPurchasesByPayPalOrder(sql, paypalOrderId) {
  return sql`
    SELECT id, user_id, email, credits_purchased, amount_cents, package_key,
           currency, status, payment_method, checkout_idempotency_key,
           paypal_order_id, paypal_capture_id, payment_reconciliation_status,
           paypal_create_request_id, paypal_capture_request_id, last_error_code,
           completed_at, credited_at, created_at, updated_at
      FROM credit_purchases
     WHERE paypal_order_id = ${paypalOrderId}
     ORDER BY created_at DESC
     LIMIT 2
  `;
}

async function createOrLoadPendingCreditPurchase(sql, {
  purchaseId,
  userId,
  email,
  checkoutKey,
  selectedPackage,
}) {
  // Auth sessions are backed by the application's profile/session system, but
  // the original AI-credit schema references this legacy users table. Seed the
  // FK row without ever replacing an email already stored for that user.
  await sql`
    INSERT INTO users (id, email)
    VALUES (${userId}, ${email})
    ON CONFLICT (id) DO NOTHING
  `;
  const inserted = await sql`
    INSERT INTO credit_purchases (
      id, user_id, email, credits_purchased, amount_cents, package_key,
      currency, payment_method, status, checkout_idempotency_key,
      payment_reconciliation_status, paypal_create_request_id, updated_at
    ) VALUES (
      ${purchaseId}, ${userId}, ${email}, ${selectedPackage.credits},
      ${selectedPackage.amountCents}, ${selectedPackage.id}, 'USD', 'paypal',
      'pending', ${checkoutKey}, 'awaiting_provider',
      ${`credit-create-${purchaseId}`.slice(0, 108)}, NOW()
    )
    ON CONFLICT (checkout_idempotency_key)
      WHERE checkout_idempotency_key IS NOT NULL
      DO NOTHING
    RETURNING id, user_id, email, credits_purchased, amount_cents, package_key,
              currency, status, payment_method, checkout_idempotency_key,
              paypal_order_id, paypal_capture_id, payment_reconciliation_status,
              paypal_create_request_id, paypal_capture_request_id, last_error_code,
              completed_at, credited_at, created_at, updated_at
  `;
  const purchase = inserted[0] || await loadCreditPurchaseByCheckoutKey(sql, checkoutKey);
  if (!purchase) {
    throw new CreditPaymentError(
      'CREDIT_PURCHASE_CREATE_FAILED',
      'The credit purchase could not be saved before payment.',
      { statusCode: 500, retryable: true },
    );
  }
  if (String(purchase.user_id) !== String(userId)
      || purchase.package_key !== selectedPackage.id
      || Number(purchase.credits_purchased) !== selectedPackage.credits
      || Number(purchase.amount_cents) !== selectedPackage.amountCents
      || String(purchase.currency || 'USD').toUpperCase() !== 'USD') {
    throw new CreditPaymentError(
      'CREDIT_CHECKOUT_IDENTITY_CONFLICT',
      'This checkout key is already bound to a different credit purchase.',
      { statusCode: 409 },
    );
  }
  return purchase;
}

async function assertCreditPayPalOrderOwnership(sql, paypalOrderId, purchaseId) {
  const normalizedOrderId = clean(paypalOrderId, 200);
  const normalizedPurchaseId = clean(purchaseId, 200);
  if (!normalizedOrderId || !normalizedPurchaseId) {
    throw new CreditPaymentError(
      'CREDIT_PAYPAL_ORDER_LINK_MISMATCH',
      'The PayPal order cannot be bound to this credit purchase.',
      { statusCode: 409 },
    );
  }
  const bannerRows = await sql`
    SELECT id
      FROM orders
     WHERE paypal_order_id = ${normalizedOrderId}
     LIMIT 1
  `;
  const otherCreditRows = await sql`
    SELECT id
      FROM credit_purchases
     WHERE paypal_order_id = ${normalizedOrderId}
       AND id <> ${normalizedPurchaseId}
     LIMIT 1
  `;
  if (bannerRows.length || otherCreditRows.length) {
    throw new CreditPaymentError(
      'PAYPAL_PAYMENT_DOMAIN_CONFLICT',
      'This PayPal order is already bound to another purchase.',
      { statusCode: 409 },
    );
  }
}

async function assertCreditPayPalCaptureOwnership(sql, paypalCaptureId, purchaseId) {
  const normalizedCaptureId = clean(paypalCaptureId, 200);
  const normalizedPurchaseId = clean(purchaseId, 200);
  if (!normalizedCaptureId || !normalizedPurchaseId) {
    throw new CreditPaymentError(
      'CREDIT_PAYPAL_CAPTURE_ID_MISSING',
      'The PayPal capture cannot be bound to this credit purchase.',
      { statusCode: 409 },
    );
  }
  const bannerRows = await sql`
    SELECT id
      FROM orders
     WHERE paypal_capture_id = ${normalizedCaptureId}
     LIMIT 1
  `;
  const otherCreditRows = await sql`
    SELECT id
      FROM credit_purchases
     WHERE paypal_capture_id = ${normalizedCaptureId}
       AND id <> ${normalizedPurchaseId}
     LIMIT 1
  `;
  if (bannerRows.length || otherCreditRows.length) {
    throw new CreditPaymentError(
      'PAYPAL_PAYMENT_DOMAIN_CONFLICT',
      'This PayPal capture is already bound to another purchase.',
      { statusCode: 409, paymentCaptured: true, captureId: normalizedCaptureId },
    );
  }
}

async function attachPayPalOrder(sql, purchase, paypalOrderId) {
  const rows = await sql`
    UPDATE credit_purchases
       SET paypal_order_id = ${paypalOrderId},
           payment_reconciliation_status = 'awaiting_capture',
           updated_at = NOW()
     WHERE id = ${purchase.id}
       AND user_id = ${purchase.user_id}
       AND status IN ('pending', 'reconciliation')
       AND (paypal_order_id IS NULL OR paypal_order_id = ${paypalOrderId})
    RETURNING id, user_id, email, credits_purchased, amount_cents, package_key,
              currency, status, payment_method, checkout_idempotency_key,
              paypal_order_id, paypal_capture_id, payment_reconciliation_status,
              paypal_create_request_id, paypal_capture_request_id, last_error_code,
              completed_at, credited_at, created_at, updated_at
  `;
  if (rows[0]) return rows[0];
  const current = await loadCreditPurchaseById(sql, purchase.id, purchase.user_id);
  if (current?.paypal_order_id === paypalOrderId) return current;
  throw new CreditPaymentError(
    'CREDIT_PAYPAL_LINK_CONFLICT',
    'This credit purchase is already bound to another payment attempt.',
    { statusCode: 409 },
  );
}

async function markCreditCaptureStarted(sql, purchase) {
  const requestId = creditCaptureRequestId(purchase.id);
  const rows = await sql`
    UPDATE credit_purchases
       SET paypal_capture_request_id = ${requestId},
           payment_reconciliation_status = 'capture_requested',
           updated_at = NOW()
     WHERE id = ${purchase.id}
       AND user_id = ${purchase.user_id}
       AND paypal_order_id = ${purchase.paypal_order_id}
       AND status IN ('pending', 'reconciliation')
       AND (paypal_capture_request_id IS NULL OR paypal_capture_request_id = ${requestId})
    RETURNING id, user_id, email, credits_purchased, amount_cents, package_key,
              currency, status, payment_method, checkout_idempotency_key,
              paypal_order_id, paypal_capture_id, payment_reconciliation_status,
              paypal_create_request_id, paypal_capture_request_id, last_error_code,
              completed_at, credited_at, created_at, updated_at
  `;
  if (rows[0]) return rows[0];
  const current = await loadCreditPurchaseById(sql, purchase.id, purchase.user_id);
  if (current?.status === 'completed'
      || current?.paypal_capture_request_id === requestId) return current;
  throw new CreditPaymentError(
    'CREDIT_CAPTURE_REQUEST_CONFLICT',
    'This credit payment capture requires reconciliation.',
    { statusCode: 409 },
  );
}

async function markCreditReconciliation(sql, purchaseId, code) {
  try {
    await sql`
      UPDATE credit_purchases
         SET status = CASE WHEN status = 'pending' THEN 'reconciliation' ELSE status END,
             payment_reconciliation_status = 'required',
             last_error_code = ${clean(code, 120) || 'PAYPAL_STATUS_UNKNOWN'},
             updated_at = NOW()
       WHERE id = ${purchaseId}
         AND status <> 'completed'
    `;
  } catch (error) {
    console.error('[credit-paypal] could not mark reconciliation', {
      purchaseId,
      code,
      error: error?.message,
    });
  }
}

async function markCreditFailed(sql, purchaseId, code) {
  await sql`
    UPDATE credit_purchases
       SET status = 'failed',
           payment_reconciliation_status = 'not_required',
           last_error_code = ${clean(code, 120) || 'PAYPAL_PAYMENT_FAILED'},
           updated_at = NOW()
     WHERE id = ${purchaseId}
       AND status IN ('pending', 'reconciliation')
       AND paypal_capture_id IS NULL
  `;
}

async function fulfillCreditPurchase(sql, purchase, validation) {
  const usageMetadata = JSON.stringify({
    purchaseId: purchase.id,
    credits: Number(purchase.credits_purchased),
    amountCents: validation.amountCents,
    currency: validation.currency,
    paypalOrderId: purchase.paypal_order_id,
    paypalCaptureId: validation.captureId,
  });
  const rows = await sql`
    WITH transitioned AS (
      UPDATE credit_purchases
         SET status = 'completed',
             paypal_capture_id = ${validation.captureId},
             payment_reconciliation_status = 'complete',
             last_error_code = NULL,
             completed_at = COALESCE(completed_at, NOW()),
             credited_at = COALESCE(credited_at, NOW()),
             updated_at = NOW()
       WHERE id = ${purchase.id}
         AND user_id = ${purchase.user_id}
         AND payment_method = 'paypal'
         AND paypal_order_id = ${purchase.paypal_order_id}
         AND amount_cents = ${validation.amountCents}
         AND currency = 'USD'
         AND status IN ('pending', 'reconciliation')
         AND paypal_capture_id IS NULL
      RETURNING id, user_id, email, credits_purchased, amount_cents, package_key,
                currency, status, payment_method, checkout_idempotency_key,
                paypal_order_id, paypal_capture_id, payment_reconciliation_status,
                paypal_create_request_id, paypal_capture_request_id, last_error_code,
                completed_at, credited_at, created_at, updated_at
    ), credited AS (
      INSERT INTO user_credits (user_id, credits, updated_at)
      SELECT user_id, credits_purchased, NOW()
        FROM transitioned
      ON CONFLICT (user_id) DO UPDATE
        SET credits = user_credits.credits + EXCLUDED.credits,
            updated_at = NOW()
      RETURNING user_id, credits
    ), logged AS (
      INSERT INTO usage_log (user_id, event, meta)
      SELECT user_id, 'CREDITS_PURCHASED', ${usageMetadata}::jsonb
        FROM transitioned
      RETURNING id
    ), outboxed AS (
      INSERT INTO credit_purchase_notification_outbox (purchase_id, updated_at)
      SELECT id, NOW()
        FROM transitioned
      ON CONFLICT (purchase_id) DO NOTHING
      RETURNING purchase_id
    )
    SELECT transitioned.*, credited.credits AS paid_credits_balance,
           logged.id AS usage_log_id,
           (outboxed.purchase_id IS NOT NULL) AS notification_queued
      FROM transitioned
      JOIN credited USING (user_id)
      CROSS JOIN logged
      LEFT JOIN outboxed ON outboxed.purchase_id = transitioned.id
  `;
  if (rows[0]) return { purchase: rows[0], newlyFulfilled: true };

  const current = await loadCreditPurchaseById(sql, purchase.id, purchase.user_id);
  if (current?.status === 'completed'
      && current.paypal_order_id === purchase.paypal_order_id
      && current.paypal_capture_id === validation.captureId
      && Number(current.amount_cents) === validation.amountCents) {
    return { purchase: current, newlyFulfilled: false };
  }
  throw new CreditPaymentError(
    'CREDIT_FULFILLMENT_CONFLICT',
    'The captured credit purchase requires reconciliation.',
    { statusCode: 202, retryable: true, paymentCaptured: true, captureId: validation.captureId },
  );
}

async function settleVerifiedCapture(sql, purchase, validation) {
  try {
    await assertCreditPayPalCaptureOwnership(sql, validation.captureId, purchase.id);
    const fulfillment = await fulfillCreditPurchase(sql, purchase, validation);
    return { ...fulfillment, validation };
  } catch (error) {
    await markCreditReconciliation(sql, purchase.id, error?.code || 'CREDIT_FULFILLMENT_FAILED');
    if (error instanceof CreditPaymentError && error.statusCode === 202) throw error;
    throw new CreditPaymentError(
      'CREDIT_FULFILLMENT_PENDING',
      'Payment was captured and the credit balance is still being reconciled. Do not pay again.',
      {
        statusCode: 202,
        retryable: true,
        paymentCaptured: true,
        captureId: validation.captureId,
      },
    );
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function creditReceiptEmail(purchase) {
  const credits = Number(purchase.credits_purchased);
  const amount = moneyFromCents(purchase.amount_cents);
  const purchaseId = escapeHtml(purchase.id);
  const captureId = escapeHtml(purchase.paypal_capture_id);
  return {
    subject: `Your ${credits} AI credits are ready`,
    html: `<!doctype html>
<html><body style="margin:0;background:#f5f7fb;color:#182033;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 18px rgba(24,32,51,.08)">
    <h1 style="margin:0 0 16px;font-size:26px">Your AI credits are ready</h1>
    <p style="margin:0 0 20px;line-height:1.6">Thanks for your purchase. <strong>${credits} AI generation credits</strong> have been added to your account.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fc;border-radius:10px">
      <tr><td style="padding:12px 16px">Amount paid</td><td style="padding:12px 16px;text-align:right"><strong>$${amount} USD</strong></td></tr>
      <tr><td style="padding:12px 16px">Purchase ID</td><td style="padding:12px 16px;text-align:right">${purchaseId}</td></tr>
      <tr><td style="padding:12px 16px">PayPal transaction</td><td style="padding:12px 16px;text-align:right">${captureId}</td></tr>
    </table>
    <p style="margin:24px 0 0;line-height:1.6">You can use the credits now in the AI Banner Designer. Questions? Email <a href="mailto:support@bannersonthefly.com">support@bannersonthefly.com</a>.</p>
  </div>
</div></body></html>`,
  };
}

async function processCreditPurchaseNotification(sql, purchaseId, { resendClient = null } = {}) {
  const rows = await sql`
    SELECT p.id, p.email, p.credits_purchased, p.amount_cents,
           p.paypal_capture_id, p.status,
           o.delivery_status, o.provider_message_id
      FROM credit_purchases p
      LEFT JOIN credit_purchase_notification_outbox o ON o.purchase_id = p.id
     WHERE p.id = ${purchaseId}
     LIMIT 1
  `;
  const purchase = rows[0] || null;
  if (!purchase || purchase.status !== 'completed' || !purchase.paypal_capture_id) {
    return { complete: false, sent: false, reason: 'not_ready' };
  }
  if (!purchase.delivery_status) {
    // Every completion produced by this implementation creates its outbox row
    // in the same data-modifying CTE. A completed row without one therefore
    // predates the outbox (or was manually reconciled). Tombstone it instead of
    // risking a duplicate historical receipt whose old delivery is unknowable.
    await sql`
      INSERT INTO credit_purchase_notification_outbox (
        purchase_id, delivery_status, last_error, sent_at, updated_at
      ) VALUES (
        ${purchase.id}, 'legacy_skipped',
        'Completed before durable receipt outbox; delivery intentionally not replayed',
        NOW(), NOW()
      )
      ON CONFLICT (purchase_id) DO NOTHING
    `;
    return { complete: true, sent: false, alreadySent: true, legacySkipped: true };
  }
  if (purchase.delivery_status === 'sent' || purchase.delivery_status === 'legacy_skipped') {
    return {
      complete: true,
      sent: false,
      alreadySent: true,
      messageId: purchase.provider_message_id || null,
    };
  }

  const claimed = await sql`
    UPDATE credit_purchase_notification_outbox
       SET delivery_status = 'sending',
           lease_started_at = NOW(),
           attempt_count = attempt_count + 1,
           last_error = NULL,
           updated_at = NOW()
     WHERE purchase_id = ${purchase.id}
       AND (
         delivery_status IN ('pending', 'failed')
         OR (delivery_status = 'sending' AND lease_started_at < NOW() - INTERVAL '10 minutes')
       )
    RETURNING purchase_id
  `;
  if (!claimed[0]) {
    return { complete: false, sent: false, reason: 'in_progress' };
  }

  try {
    let client = resendClient;
    if (!client) {
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured');
      }
      const { Resend } = require('resend');
      client = new Resend(process.env.RESEND_API_KEY);
    }
    const fromRaw = clean(process.env.EMAIL_FROM || process.env.FROM_EMAIL, 320)
      || 'orders@bannersonthefly.com';
    const from = fromRaw.includes('<') ? fromRaw : `Banners on the Fly <${fromRaw}>`;
    const receipt = creditReceiptEmail(purchase);
    const result = await client.emails.send({
      from,
      to: purchase.email,
      replyTo: clean(process.env.EMAIL_REPLY_TO, 320) || 'support@bannersonthefly.com',
      subject: receipt.subject,
      html: receipt.html,
    }, {
      idempotencyKey: `credit-receipt/${purchase.id}`,
    });
    if (result?.error) {
      throw new Error(clean(result.error?.message || result.error, 500) || 'Resend rejected the receipt');
    }
    const messageId = clean(result?.data?.id || result?.id, 300);
    await sql`
      UPDATE credit_purchase_notification_outbox
         SET delivery_status = 'sent',
             provider_message_id = ${messageId},
             sent_at = COALESCE(sent_at, NOW()),
             lease_started_at = NULL,
             last_error = NULL,
             updated_at = NOW()
       WHERE purchase_id = ${purchase.id}
         AND delivery_status = 'sending'
    `;
    return { complete: true, sent: true, alreadySent: false, messageId };
  } catch (error) {
    const errorMessage = clean(error?.message, 500) || 'Credit receipt delivery failed';
    await sql`
      UPDATE credit_purchase_notification_outbox
         SET delivery_status = 'failed',
             lease_started_at = NULL,
             last_error = ${errorMessage},
             updated_at = NOW()
       WHERE purchase_id = ${purchase.id}
         AND delivery_status = 'sending'
    `;
    console.error('[credit-paypal] receipt delivery pending', {
      purchaseId: purchase.id,
      error: errorMessage,
    });
    return { complete: false, sent: false, reason: 'delivery_failed' };
  }
}

async function reconcileCreditPayment({
  sql,
  purchase,
  paypalOrderId,
  expectedCaptureId = null,
  captureIfApproved = false,
  reconcileOnly = false,
  requireFeature = true,
  fetchImpl = globalThis.fetch,
}) {
  if (!purchase || purchase.payment_method !== 'paypal') {
    throw new CreditPaymentError('CREDIT_PURCHASE_INVALID', 'Credit purchase not found.', { statusCode: 404 });
  }
  if (!purchase.paypal_order_id || purchase.paypal_order_id !== paypalOrderId) {
    throw new CreditPaymentError(
      'CREDIT_PAYPAL_ORDER_LINK_MISMATCH',
      'This PayPal order is not bound to the requested credit purchase.',
      { statusCode: 409 },
    );
  }

  const captureRequestStarted = purchase.paypal_capture_request_id === creditCaptureRequestId(purchase.id);

  const config = getCreditPayPalConfig({ requireFeature });
  const accessToken = await getPayPalAccessToken(config, fetchImpl);
  let retrieved;
  try {
    retrieved = await retrievePayPalOrder(config, accessToken, paypalOrderId, fetchImpl);
  } catch (error) {
    await markCreditReconciliation(sql, purchase.id, 'PAYPAL_RETRIEVE_UNKNOWN');
    throw new CreditPaymentError(
      'CREDIT_PAYMENT_STATUS_UNKNOWN',
      'We are confirming this payment. Do not submit another payment.',
      { statusCode: 202, retryable: true, details: { captureRequestStarted } },
    );
  }
  if (!retrieved.ok) {
    if (retrieved.status === 404) {
      throw new CreditPaymentError(
        'CREDIT_PAYPAL_ORDER_NOT_FOUND',
        'The bound PayPal order could not be found.',
        { statusCode: 409 },
      );
    }
    await markCreditReconciliation(sql, purchase.id, `PAYPAL_RETRIEVE_${retrieved.status}`);
    throw new CreditPaymentError(
      'CREDIT_PAYMENT_STATUS_UNKNOWN',
      'We are confirming this payment. Do not submit another payment.',
      { statusCode: 202, retryable: true, details: { captureRequestStarted } },
    );
  }

  let providerOrder = retrieved.data;
  if (!matchesCreditPurchase(providerOrder, purchase)) {
    throw new CreditPaymentError(
      'CREDIT_PAYPAL_IDENTITY_MISMATCH',
      'The PayPal order does not match this credit purchase.',
      { statusCode: 409 },
    );
  }

  let validation = validateCompletedCreditCapture(providerOrder, purchase, expectedCaptureId);
  if (validation.ok) return settleVerifiedCapture(sql, purchase, validation);

  const providerStatus = String(providerOrder?.status || '').toUpperCase();
  if (providerStatus === 'COMPLETED') {
    await markCreditReconciliation(sql, purchase.id, validation.code);
    throw new CreditPaymentError(
      'CREDIT_CAPTURE_RECONCILIATION_REQUIRED',
      'PayPal reports a completed payment that does not match this purchase. Do not pay again.',
      {
        statusCode: 202,
        retryable: true,
        paymentCaptured: true,
        captureId: validation.captureId || null,
        details: { captureRequestStarted },
      },
    );
  }

  if (purchase.status === 'completed' && purchase.paypal_capture_id) {
    throw new CreditPaymentError(
      'CREDIT_PAID_PROVIDER_CONFLICT',
      'The completed credit purchase does not match PayPal.',
      { statusCode: 409 },
    );
  }

  const captureWasPersisted = captureRequestStarted;
  // A status/reconciliation request may repeat only the exact PayPal capture
  // request that this server durably recorded before the first network call.
  // It can never initiate a fresh capture merely because the browser asks.
  const mayIssueCaptureRequest = captureIfApproved || (reconcileOnly && captureWasPersisted);
  if (!mayIssueCaptureRequest) {
    await markCreditReconciliation(sql, purchase.id, validation.code);
    throw new CreditPaymentError(
      'CREDIT_PAYMENT_STATUS_UNKNOWN',
      'We are confirming this payment. Do not submit another payment.',
      { statusCode: 202, retryable: true, details: { captureRequestStarted } },
    );
  }
  if (providerStatus !== 'APPROVED') {
    throw new CreditPaymentError(
      'CREDIT_PAYPAL_ORDER_NOT_APPROVED',
      'Approve the PayPal payment before it can be captured.',
      { statusCode: 409 },
    );
  }


  const capturePurchase = captureWasPersisted
    ? purchase
    : await markCreditCaptureStarted(sql, purchase);

  let captureResult = null;
  try {
    captureResult = await capturePayPalCreditOrder(config, accessToken, capturePurchase, fetchImpl);
  } catch (error) {
    captureResult = { ok: false, status: 0, data: {}, requestId: `credit-capture-${purchase.id}` };
  }
  if (captureResult.ok) {
    providerOrder = captureResult.data;
    validation = validateCompletedCreditCapture(providerOrder, purchase, expectedCaptureId);
    if (validation.ok) return settleVerifiedCapture(sql, purchase, validation);
  }

  // A capture request can reach PayPal even when its response does not reach us.
  // Retrieve before classifying any provider/network failure so a paid buyer is
  // never invited to submit a second charge.
  let recovered = null;
  try {
    recovered = await retrievePayPalOrder(config, accessToken, paypalOrderId, fetchImpl);
  } catch {
    recovered = null;
  }
  if (recovered?.ok && matchesCreditPurchase(recovered.data, purchase)) {
    validation = validateCompletedCreditCapture(recovered.data, purchase, expectedCaptureId);
    if (validation.ok) return settleVerifiedCapture(sql, purchase, validation);
  }

  if (captureResult && isDefinitiveProviderFailure(captureResult.data, captureResult.status)) {
    const code = providerErrorCode(captureResult.data) || 'CREDIT_PAYPAL_PAYMENT_DECLINED';
    await markCreditFailed(sql, purchase.id, code);
    throw new CreditPaymentError(
      code,
      'PayPal declined this payment. Use another payment method and try again.',
      { statusCode: 422 },
    );
  }

  await markCreditReconciliation(sql, purchase.id, providerErrorCode(captureResult?.data) || 'PAYPAL_CAPTURE_UNKNOWN');
  throw new CreditPaymentError(
    'CREDIT_PAYMENT_STATUS_UNKNOWN',
    'We are confirming this payment. Do not submit another payment.',
    { statusCode: 202, retryable: true, details: { captureRequestStarted: true } },
  );
}

module.exports = {
  ACTIVE_PAYPAL_ORDER_STATUSES,
  CREDIT_PACKAGES,
  CreditPaymentError,
  amountToCents,
  assertCreditPayPalCaptureOwnership,
  assertCreditPayPalOrderOwnership,
  attachPayPalOrder,
  buildCreditPayPalOrder,
  capturePayPalCreditOrder,
  completedCaptures,
  createOrLoadPendingCreditPurchase,
  createPayPalCreditOrder,
  creditCaptureRequestId,
  creditCustomId,
  creditInvoiceId,
  deploymentKind,
  ensureCreditPaymentSchema,
  fulfillCreditPurchase,
  getCreditPayPalConfig,
  getPayPalAccessToken,
  isDefinitiveProviderFailure,
  loadCreditPurchaseByCheckoutKey,
  loadCreditPurchaseById,
  loadCreditPurchasesByPayPalOrder,
  markCreditCaptureStarted,
  markCreditFailed,
  markCreditReconciliation,
  matchesCreditPurchase,
  moneyFromCents,
  normalizeEmail,
  providerErrorCode,
  providerOrderIdentity,
  processCreditPurchaseNotification,
  reconcileCreditPayment,
  resolveCreditPackage,
  retrievePayPalOrder,
  settleVerifiedCapture,
  validateCheckoutKey,
  validateCompletedCreditCapture,
  _resetSchemaForTests() {
    creditPaymentSchemaReady = false;
  },
};
