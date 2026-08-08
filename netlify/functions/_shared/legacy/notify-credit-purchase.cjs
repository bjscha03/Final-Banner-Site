'use strict';

// Credit receipts are now enqueued atomically with fulfillment and delivered
// only by the authenticated capture/webhook lifecycle. The former public
// browser-triggered sender trusted recipient fields and could resend receipts,
// so it is deliberately retired instead of preserving unsafe compatibility.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  return {
    statusCode: 410,
    headers,
    body: JSON.stringify({
      ok: false,
      error: 'CREDIT_NOTIFICATION_ROUTE_RETIRED',
      message: 'Credit receipts are sent automatically after verified payment.',
    }),
  };
};
