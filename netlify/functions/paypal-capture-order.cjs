// netlify/functions/paypal-capture-order.js
const fetch = require('node-fetch'); // Ensure node-fetch is used
const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Helper to detect bad URLs (blob:, data:, or huge strings)
function isBadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
}

// Clean item of any bad URLs before database insert
function cleanItemForDb(item) {
  const cleaned = { ...item };
  
  // Clean direct URL fields
  if (isBadUrl(cleaned.file_url)) cleaned.file_url = null;
  if (isBadUrl(cleaned.thumbnail_url)) cleaned.thumbnail_url = null;
  if (isBadUrl(cleaned.web_preview_url)) cleaned.web_preview_url = null;
  if (isBadUrl(cleaned.print_ready_url)) cleaned.print_ready_url = null;
  
  // Clean overlay_image
  if (cleaned.overlay_image && typeof cleaned.overlay_image === 'object') {
    const oi = { ...cleaned.overlay_image };
    if (isBadUrl(oi.url)) oi.url = null;
    if (isBadUrl(oi.originalUrl)) oi.originalUrl = null;
    if (isBadUrl(oi.thumbnailUrl)) oi.thumbnailUrl = null;
    cleaned.overlay_image = oi;
  }
  
  // Clean overlay_images array
  if (Array.isArray(cleaned.overlay_images)) {
    cleaned.overlay_images = cleaned.overlay_images.map(img => {
      if (!img || typeof img !== 'object') return img;
      const ci = { ...img };
      if (isBadUrl(ci.url)) ci.url = null;
      if (isBadUrl(ci.originalUrl)) ci.originalUrl = null;
      if (isBadUrl(ci.thumbnailUrl)) ci.thumbnailUrl = null;
      return ci;
    });
  }
  
  return cleaned;
}




// Helper to trigger the notify-order function
// Helper to trigger AI artwork processing for orders with AI-generated items
async function processAIArtworkForOrder(orderId, cartItems) {
  try {
    // Check if any items have AI design metadata
    const aiItems = cartItems.filter(item => item.aiDesign);
    
    if (aiItems.length === 0) {
      console.log(`No AI items found in order ${orderId}, skipping AI processing`);
      return;
    }
    
    console.log(`Found ${aiItems.length} AI items in order ${orderId}, triggering processing`);
    
    const siteURL = process.env.URL || "https://bannersonthefly.com";
    const processingURL = `${siteURL}/.netlify/functions/ai-artwork-processor`;
    
    // Fire-and-forget request to AI artwork processor
    fetch(processingURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: orderId,
        orderItems: cartItems,
        triggerSource: "order_creation"
      }),
    });
    
    console.log(`AI artwork processing triggered for order: ${orderId}`);
  } catch (error) {
    // Log and ignore, as failing to process AI artwork should not block the order
    console.error(`Failed to trigger AI artwork processing for order: ${orderId}`, error);
  }
}

async function sendOrderNotificationEmail(orderId) {
  try {
    console.log('Triggering notification for PayPal order:', orderId);
    // CRITICAL: Use non-www URL to avoid redirect issues with POST requests
    // Netlify redirects www to non-www, and POST requests don't follow redirects
    const notifyURL = 'https://bannersonthefly.com/.netlify/functions/notify-order';

    // Fire-and-forget request with proper error logging
    fetch(notifyURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).then(response => {
      if (response.ok) {
        console.log('✅ Notification email triggered successfully for order:', orderId);
      } else {
        console.error('❌ Notification email failed:', response.status, response.statusText);
      }
    }).catch(err => {
      console.error('❌ Notification email fetch error:', err.message);
    });

    console.log('Notification request sent for order:', orderId);
  } catch (error) {
    // Log and ignore, as failing to send email should not block the user flow.
    console.error('Failed to trigger notification for order:', orderId, error);
  }
}

function ok(body){ return { statusCode:200, headers:cors(), body }; }
function send(statusCode, body){ return { statusCode, headers:cors(), body:JSON.stringify(body) }; }
function cors(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
  };
}
function hint(d){
  const n = d?.name || '';
  if (/INVALID_/i.test(n)) return 'Invalid orderID or payload.';
  if (/AUTHORIZATION/i.test(n)) return 'Check client/secret and PAYPAL_ENV vs client type.';
  return 'Transient gateway error. Safe to retry.';
}

const getPayPalCredentials = () => {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

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

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return ok('');
    if (event.httpMethod !== 'POST') return send(405, { error: 'METHOD_NOT_ALLOWED' });

    // CRITICAL FIX: The entire payload from the client is needed, not just the orderID.
    const payload = JSON.parse(event.body || '{}');
    const { orderID, cartItems, userEmail, userId, shippingAddress, customerName } = payload;

    if (!orderID) return send(400, { error: 'MISSING_ORDER_ID' });
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      console.error('PayPal capture error: Missing or invalid cartItems in payload.');
      return send(400, { error: 'MISSING_CART_ITEMS' });
    }

    const { clientId, secret, baseUrl: base } = getPayPalCredentials();

    // Database connection
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return send(500, { error: 'DATABASE_NOT_CONFIGURED' });
    const sql = neon(dbUrl);

    // OAuth
    const tRes = await fetch(`${base}/v1/oauth2/token`, {
      method:'POST',
      headers:{
        Authorization:'Basic '+Buffer.from(`${clientId}:${secret}`).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body:'grant_type=client_credentials',
    });
    const tJson = await tRes.json();
    if (!tRes.ok) return send(tRes.status, { error: 'PAYPAL_TOKEN_ERROR', details:tJson });

    // Capture (idempotent)
    const cRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${tJson.access_token}`,
        'PayPal-Request-Id': `cap_${orderID}`,
      },
    });
    const cJson = await cRes.json();

    if (!cRes.ok || /INTERNAL/.test(cJson?.name || '')) {
      return send(cRes.status || 502, {
        error:'PAYPAL_CAPTURE_FAILED',
        details:cJson,
        hint: hint(cJson),
      });
    }

    // --- Database Persistence ---
    const capture = cJson.purchase_units[0].payments.captures[0];
    const capturedAmount = parseFloat(capture.amount.value);
    const payerEmail = cJson.payer.email_address;
    const finalEmail = userEmail || payerEmail;

    // Server-side calculation to verify amount
    const subtotalCents = (cartItems || []).reduce((sum, i) => sum + i.line_total_cents, 0);
    const taxCents = Math.round(subtotalCents * 0.06); // 6% tax rate
    const totalCents = subtotalCents + taxCents;

    if (Math.round(capturedAmount * 100) !== totalCents) {
      console.error('PayPal amount mismatch:', { expected: totalCents, captured: Math.round(capturedAmount * 100) });
      // TODO: Consider refunding the payment here if amounts mismatch
      return send(400, { error: 'AMOUNT_MISMATCH' });
    }

    const orderId = randomUUID();
    const finalCustomerName = customerName || `${cJson.payer.name.given_name} ${cJson.payer.name.surname}`;

    await sql.transaction(async (tx) => {
      await tx`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status,
          paypal_order_id, paypal_capture_id, customer_name, shipping_address
        ) VALUES (
          ${orderId}, ${userId || null}, ${finalEmail}, ${subtotalCents}, ${taxCents}, ${totalCents}, 'paid',
          ${orderID}, ${capture.id}, ${finalCustomerName}, ${shippingAddress || null}
        )
      `;

      console.log("[PayPal Capture] Inserting", cartItems.length, "items into order_items table");
      console.log("[PayPal Capture] First item overlay_image:", cartItems[0]?.overlay_image ? "EXISTS" : "NULL");
      console.log("[PayPal Capture] First item text_elements:", cartItems[0]?.text_elements ? "EXISTS" : "NULL");
      for (const rawItem of cartItems) {
        const item = cleanItemForDb(rawItem);
        console.log("[PayPal Capture] Cleaned item file_key:", item.file_key, "file_url:", item.file_url ? item.file_url.substring(0, 80) : null);
        // Convert pole_pockets to boolean for database
        const polePocketsValue = item.pole_pockets &&
          item.pole_pockets !== 'none' &&
          item.pole_pockets !== 'false' &&
          item.pole_pockets !== false;

        await tx`
          INSERT INTO order_items (
            id, order_id, width_in, height_in, quantity, material,
            grommets, rope_feet, pole_pockets, pole_pocket_position, pole_pocket_size, pole_pocket_cost_cents,
            line_total_cents, file_key, file_url, print_ready_url, web_preview_url,
            text_elements, overlay_image, thumbnail_url,
            design_service_enabled, design_request_text, design_draft_preference, design_draft_contact, design_uploaded_assets
          ) VALUES (
            ${randomUUID()},
            ${orderId},
            ${item.width_in || 0},
            ${item.height_in || 0},
            ${item.quantity || 1},
            ${item.material || '13oz'},
            ${item.grommets || 'none'},
            ${item.rope_feet || 0},
            ${polePocketsValue},
            ${item.pole_pocket_position || null},
            ${item.pole_pocket_size || null},
            ${item.pole_pocket_cost_cents || 0},
            ${item.line_total_cents || 0},
            ${item.file_key || null},
            ${item.file_url || null},
            ${item.print_ready_url || null},
            ${item.web_preview_url || null},
            ${item.text_elements ? JSON.stringify(item.text_elements) : '[]'},
            ${item.overlay_image ? JSON.stringify(item.overlay_image) : null},
            ${item.thumbnail_url || null},
            ${item.design_service_enabled || false},
            ${item.design_request_text || null},
            ${item.design_draft_preference || null},
            ${item.design_draft_contact || null},
            ${item.design_uploaded_assets ? JSON.stringify(item.design_uploaded_assets) : '[]'}
          )
        `;
      }
    });

    console.log('✅ PayPal order created in DB successfully:', orderId);

    // Fire-and-forget the notification email.
    // This ensures the user gets a fast response and email issues don't block the order.
    sendOrderNotificationEmail(orderId);

    // Process AI artwork if any items have AI design metadata
    processAIArtworkForOrder(orderId, cartItems);
    return send(200, {
      ok: true,
      orderId: orderId,
      data: cJson
    });

  } catch (e) {
    return send(500, { error:'FUNCTION_CRASH', message:e.message || String(e) });
  }
};
