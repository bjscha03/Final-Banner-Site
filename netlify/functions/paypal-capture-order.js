// netlify/functions/paypal-capture-order.js
const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');
const fetch = global.fetch;

async function dbWritePayPalOrder(orderId, paypalOrderId, details) {
  // Implement for your stack: Prisma / Drizzle / pg. Try columns in priority order.
  // This is a no-throw helper: it logs and returns false on error.
  const candidates = ['paypal_order_id', 'provider_order_id', 'payment_order_id'];
  try {
    const col = await pickAvailableColumn('orders', candidates);
    if (!col) { 
      console.warn('No suitable order id column found. Skipping persist.'); 
      return false; 
    }
    await upsertOrderPayPalId(col, orderId, paypalOrderId, details);
    return true;
  } catch (e) {
    console.warn('Non-fatal DB write error:', e?.message || e);
    return false;
  }
}

async function pickAvailableColumn(table, cols) {
  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table}
        AND column_name = ANY(${cols})
      ORDER BY array_position(${cols}, column_name)
    `;
    return result.length > 0 ? result[0].column_name : null;
  } catch (error) {
    console.warn(`Error checking columns for table ${table}:`, error);
    return null;
  }
}

async function upsertOrderPayPalId(col, orderId, paypalOrderId, details) {
  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    // Build update object
    const updates = {};
    updates[col] = paypalOrderId;
    
    // Add capture ID if column exists
    const captureCol = await pickAvailableColumn('orders', ['paypal_capture_id']);
    if (captureCol && details.purchase_units?.[0]?.payments?.captures?.[0]?.id) {
      updates.paypal_capture_id = details.purchase_units[0].payments.captures[0].id;
    }
    
    // Add customer name if column exists
    const nameCol = await pickAvailableColumn('orders', ['customer_name']);
    if (nameCol && details.payer?.name) {
      const name = `${details.payer.name.given_name || ''} ${details.payer.name.surname || ''}`.trim();
      if (name) updates.customer_name = name;
    }
    
    // Create SET clause dynamically
    const setClause = Object.keys(updates).map(key => `${key} = $${Object.keys(updates).indexOf(key) + 2}`).join(', ');
    const values = [orderId, ...Object.values(updates)];
    
    if (setClause) {
      await sql.unsafe(`UPDATE orders SET ${setClause} WHERE id = $1`, values);
    }
  } catch (error) {
    console.warn('Error updating order with PayPal data:', error);
    throw error;
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
    if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

    const body = JSON.parse(event.body || '{}');
    const orderID = body.orderID || body.paypalOrderId;
    if (!orderID) return json(400, { error: 'MISSING_ORDER_ID' });

    const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const base = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    const client = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID_SANDBOX;
    const secret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET_SANDBOX;
    if (!client || !secret) return json(500, { error: 'MISSING_PAYPAL_CREDS' });

    // OAuth
    const tRes = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${client}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tJson = await tRes.json();
    if (!tRes.ok) {
      console.error('PayPal token error', tRes.status, tJson);
      return json(tRes.status, { error: 'PAYPAL_TOKEN_ERROR', details: safe(tJson) });
    }

    // Capture (idempotent)
    const cRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tJson.access_token}`,
        'PayPal-Request-Id': `cap_${orderID}`,
      },
    });
    const cJson = await cRes.json();

    if (!cRes.ok || cJson?.name === 'INTERNAL_SERVER_ERROR' || cJson?.name === 'INTERNAL_ERROR') {
      console.error('PayPal capture failed', cRes.status, cJson);
      return json(cRes.status || 502, {
        error: 'PAYPAL_CAPTURE_FAILED',
        details: safe(cJson),
        hint: hint(cJson),
      });
    }

    // Find existing order by cart items or create new one
    let orderId = body.orderId;
    if (!orderId) {
      // Create new order if none provided
      orderId = randomUUID();
      const sql = neon(process.env.NETLIFY_DATABASE_URL);
      
      const cartItems = body.cartItems || [];
      const subtotalCents = cartItems.reduce((sum, item) => sum + (item.line_total_cents || 0), 0);
      const taxCents = Math.round(subtotalCents * 0.06);
      const totalCents = subtotalCents + taxCents;
      
      await sql`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status
        )
        VALUES (
          ${orderId}, ${body.userId || null}, ${body.userEmail || cJson.payer?.email_address || 'unknown@example.com'},
          ${subtotalCents}, ${taxCents}, ${totalCents}, 'paid'
        )
      `;
      
      // Insert order items
      for (const item of cartItems) {
        await sql`
          INSERT INTO order_items (
            id, order_id, width_in, height_in, quantity, material,
            grommets, rope_feet, pole_pockets, line_total_cents
          )
          VALUES (
            ${randomUUID()}, ${orderId},
            ${item.width_in || 0}, ${item.height_in || 0}, ${item.quantity || 1},
            ${item.material || '13oz'}, ${item.grommets || 'none'},
            ${item.rope_feet || 0}, ${item.pole_pockets || 'none'},
            ${item.line_total_cents || 0}
          )
        `;
      }
    }

    // Persist PayPal data (non-fatal)
    await dbWritePayPalOrder(orderId, orderID, cJson);

    return json(200, { ok: true, data: cJson, orderId });
  } catch (e) {
    console.error('Function crash:', e);
    return json(500, { error: 'FUNCTION_CRASH', message: e.message || String(e) });
  }
};

function json(statusCode, body) { 
  return { statusCode, headers: cors(), body: JSON.stringify(body) }; 
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

function safe(o) { 
  try { 
    return JSON.parse(JSON.stringify(o)); 
  } catch { 
    return { note: 'unserializable' }; 
  } 
}

function hint(d) {
  const n = d?.name || '';
  if (/INVALID_/i.test(n)) return 'Check orderID and request fields.';
  if (/AUTHORIZATION/i.test(n)) return 'Verify credentials and PAYPAL_ENV vs client ID type.';
  return 'Transient gateway issue. Retry with same PayPal-Request-Id.';
}
