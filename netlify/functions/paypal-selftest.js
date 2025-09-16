// netlify/functions/paypal-selftest.js
const fetch = global.fetch;

exports.handler = async () => {
  try {
    const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    const base = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const client = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;

    if (!client || !secret) {
      return resp(500, { ok:false, step:'env', message:'Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET', env });
    }

    const tok = await fetch(`${base}/v1/oauth2/token`, {
      method:'POST',
      headers:{
        Authorization:'Basic '+Buffer.from(`${client}:${secret}`).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body:'grant_type=client_credentials',
    });
    const tokJson = await tok.json();
    if (!tok.ok) return resp(tok.status, { ok:false, step:'oauth', details:tokJson, env });

    return resp(200, { ok:true, step:'done', env, tokenType: tokJson.token_type, scope: tokJson.scope });
  } catch (e) {
    return resp(500, { ok:false, step:'exception', message:e.message });
  }
};
function resp(statusCode, body){ return { statusCode, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} }
