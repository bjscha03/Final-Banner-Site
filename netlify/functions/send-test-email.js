// netlify/functions/send-test-email.js
const { sendEmail } = require('../../src/lib/email');

/**
 * URL forms:
 *  /.netlify/functions/send-test-email?type=order.confirmation&to=me@example.com
 *  /.netlify/functions/send-test-email?type=user.verify&to=me@example.com
 *  /.netlify/functions/send-test-email?mode=plain&to=me@example.com
 *  Add &debug=1 to include provider response/error body.
 */
exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.rawQuery || '');
    const to = params.get('to') || process.env.EMAIL_DEV_OVERRIDE || '';
    const type = params.get('type') || '';
    const mode = params.get('mode') || ''; // "plain" bypasses React templates
    const debug = params.get('debug') === '1';

    if (!to) {
      return json(400, { ok: false, error: 'Missing ?to=' });
    }

    // Plain-text smoke test (proves API key + domain without touching templates)
    if (mode === 'plain') {
      const res = await sendEmail('__plain__', {
        to,
        subject: 'Smoke test ✓',
        text: 'Resend + Netlify are working. If you can read this, creds and domain are good.',
      });
      return json(res.ok ? 200 : 500, { ...res, mode, sentTo: to });
    }

    // Build minimal sample payloads for each template type:
    const SITE_URL = process.env.SITE_URL || 'https://www.bannersonthefly.com';
    const samples = {
      'user.verify': { to, verifyUrl: `${SITE_URL}/verify?token=test-token` },
      'user.reset': { to, resetUrl: `${SITE_URL}/reset?token=test-token` },
      'order.confirmation': {
        to,
        order: {
          id: 'ord_test_123',
          number: 'T1001',
          subtotalCents: 3600,
          taxCents: 216,
          totalCents: 3816,
          items: [
            { name: '13oz Vinyl Banner', qty: 1, unitPriceCents: 3600, size: '48" × 24"' },
          ],
        },
        invoiceUrl: `${SITE_URL}/orders/ord_test_123`,
      },
      'order.shipped': {
        to,
        order: { id: 'ord_test_123', number: 'T1001' },
        carrier: 'FedEx',
        trackingNumber: '123456789012',
        trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=123456789012',
      },
      'order.canceled': {
        to,
        order: { id: 'ord_test_123', number: 'T1001' },
      },
    };

    if (!type || !(type in samples)) {
      return json(400, { ok: false, error: 'Invalid ?type=', allowed: Object.keys(samples) });
    }

    const res = await sendEmail(type, samples[type]);
    return json(res.ok ? 200 : 500, { ...res, testType: type, sentTo: to, debugInfo: debug ? res : undefined });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err?.message || String(err),
      provider: err?.response?.data || err?.data,
      stack: err?.stack,
    });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  };
}
