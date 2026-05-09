const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');
const { handler: notifyOrderHandler } = require('./notify-order.cjs');
const { checkAdminAccess } = require('./lib/graduation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const toCents = (value) => Math.round((Number(value) || 0) * 100);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { adminEmail, recoveryReason, notes, originalPaymentDate, payment = {}, customer = {}, shippingAddress = {}, billingAddress = {}, item = {} } = body;

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database not configured' }) };
    const sql = neon(dbUrl);

    const authorized = await checkAdminAccess(event, sql, adminEmail);
    if (!authorized) {
      console.warn('[recover-missing-order] admin authorization denied', {
        reason: 'checkAdminAccess returned false',
        hasAuthorizationHeader: !!(event.headers?.authorization || event.headers?.Authorization),
        hasCookieHeader: !!(event.headers?.cookie || event.headers?.Cookie),
        adminEmailProvided: typeof adminEmail === 'string' && adminEmail.length > 0,
        normalizedAdminEmail: typeof adminEmail === 'string' ? adminEmail.toLowerCase().trim() : null,
      });
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admin authorization failed' }) };
    }

    if (!customer.email || !customer.name || !item.productType || !payment.transactionId || !payment.amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Missing required fields' }) };
    }

    const duplicateTx = await sql`SELECT id FROM orders WHERE paypal_capture_id = ${payment.transactionId} OR stripe_charge_id = ${payment.transactionId} OR stripe_payment_intent_id = ${payment.transactionId} LIMIT 1`;
    if (duplicateTx.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Duplicate transaction ID', existingOrderId: duplicateTx[0].id }) };
    }

    const totalCents = toCents(payment.amount);
    const taxCents = toCents(payment.tax);
    const shippingCents = toCents(payment.shipping);
    const discountCents = toCents(payment.discount);
    const subtotalCents = Math.max(0, totalCents - taxCents - shippingCents + discountCents);

    const nearDup = await sql`
      SELECT id FROM orders
      WHERE LOWER(email)=LOWER(${customer.email})
        AND total_cents=${totalCents}
        AND created_at >= NOW() - INTERVAL '30 days'
      LIMIT 1`;
    if (nearDup.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Potential duplicate order by email/amount', existingOrderId: nearDup[0].id }) };
    }

    const orderId = randomUUID();
    const method = (payment.provider || '').toLowerCase() === 'stripe' ? 'stripe' : 'paypal';

    await sql`
      INSERT INTO orders (
        id, email, customer_name, customer_first_name, subtotal_cents, tax_cents, total_cents, status,
        payment_method, paypal_capture_id, stripe_charge_id,
        shipping_name, shipping_street, shipping_street2, shipping_city, shipping_state, shipping_zip, shipping_country,
        applied_discount_cents, applied_discount_label, applied_discount_type,
        confirmation_email_status, production_email_status
      ) VALUES (
        ${orderId}, ${customer.email}, ${customer.name}, ${String(customer.name).split(' ')[0] || null}, ${subtotalCents}, ${taxCents}, ${totalCents}, ${'paid'},
        ${method}, ${method === 'paypal' ? payment.transactionId : null}, ${method === 'stripe' ? payment.transactionId : null},
        ${shippingAddress.name || customer.name}, ${shippingAddress.street || null}, ${shippingAddress.street2 || null}, ${shippingAddress.city || null}, ${shippingAddress.state || null}, ${shippingAddress.zip || null}, ${shippingAddress.country || 'US'},
        ${discountCents}, ${'Manual recovery'}, ${'manual_recovered'},
        ${'pending'}, ${'pending'}
      )`;

    await sql`
      INSERT INTO order_items (
        id, order_id, product_type, width_in, height_in, quantity, material, grommets,
        line_total_cents, file_url, web_preview_url, print_ready_url, thumbnail_url, text_elements
      ) VALUES (
        ${randomUUID()}, ${orderId}, ${item.productType || 'banner'}, ${Number(item.widthIn || 0)}, ${Number(item.heightIn || 0)}, ${Number(item.quantity || 1)}, ${item.material || '13oz'}, ${item.finishing || 'none'},
        ${subtotalCents}, ${item.designUrl || null}, ${item.previewUrl || null}, ${item.printFileUrl || null}, ${item.previewUrl || null}, '[]'
      )`;

    await sql`
      INSERT INTO order_notes (id, order_id, note, created_by)
      VALUES (${randomUUID()}, ${orderId}, ${JSON.stringify({ recovered: true, recoveredBy: adminEmail, recoveredAt: new Date().toISOString(), recoveryReason: recoveryReason || null, paymentTransactionId: payment.transactionId, originalPaymentDate: originalPaymentDate || null, notes: notes || null, phone: customer.phone || null, billingAddress })}, ${adminEmail})
    `.catch(() => {});

    const notifyResponse = await notifyOrderHandler({ httpMethod: 'POST', headers: event.headers || {}, body: JSON.stringify({ orderId, forceResendBoth: true }) });
    const notify = JSON.parse(notifyResponse.body || '{}');

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, orderId, customerEmailSent: !!notify.customerEmailSent, adminEmailSent: !!notify.adminEmailSent, emailErrors: notify.errors || [] }) };
  } catch (error) {
    console.error('[recover-missing-order] failed', error);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Internal server error', details: error.message }) };
  }
};
