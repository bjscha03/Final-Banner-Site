// netlify/functions/resend-webhook.js
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function verify(sig, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const raw = event.body || '';
  const sig = event.headers['x-resend-signature'] || event.headers['X-Resend-Signature'];

  if (!verify(sig, raw)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'BAD_SIGNATURE' }) };
  }

  const evt = JSON.parse(raw);
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const db = neon(dbUrl);

  const providerMsgId = evt?.data?.email?.id || null;
  const toEmail = Array.isArray(evt?.data?.email?.to)
    ? evt.data.email.to[0]
    : (evt?.data?.email?.to || null);

  // 1) store raw event
  await db`
    INSERT INTO email_events (event_type, provider, provider_msg_id, to_email, raw)
    VALUES (${evt.type}, 'resend', ${providerMsgId}, ${toEmail}, ${evt})
  `;

  // 2) update email status if we can map it
  const map = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };
  const newStatus = map[evt.type];
  if (providerMsgId && newStatus) {
    await db`UPDATE emails SET status=${newStatus} WHERE provider_msg_id=${providerMsgId}`;
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
