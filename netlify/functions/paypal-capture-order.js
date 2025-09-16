// netlify/functions/paypal-capture-order.js
const fetch = global.fetch;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return ok('');
    if (event.httpMethod !== 'POST') return send(405, { error:'METHOD_NOT_ALLOWED' });

    const { orderID } = JSON.parse(event.body || '{}');
    if (!orderID) return send(400, { error:'MISSING_ORDER_ID' });

    const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const base = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const client = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!client || !secret) return send(500, { error:'MISSING_PAYPAL_CREDS' });

    // OAuth
    const tRes = await fetch(`${base}/v1/oauth2/token`, {
      method:'POST',
      headers:{
        Authorization:'Basic '+Buffer.from(`${client}:${secret}`).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body:'grant_type=client_credentials',
    });
    const tJson = await tRes.json();
    if (!tRes.ok) return send(tRes.status, { error:'PAYPAL_TOKEN_ERROR', details:tJson });

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

    // IMPORTANT: no DB writes here. We'll wire persistence later.
    return send(200, { ok:true, data:cJson, diag:{ env, orderID } });

  } catch (e) {
    return send(500, { error:'FUNCTION_CRASH', message:e.message || String(e) });
  }
};

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


