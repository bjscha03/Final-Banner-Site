import 'twilio';
import '@neondatabase/serverless';
import 'sharp';
import 'cloudinary';
import 'stripe';
import 'resend';
import 'node-fetch';
import runtime from './_shared/sms/runtime.cjs';
import store from './_shared/sms/store.cjs';
import http from './_shared/sms/http.cjs';
import conversation from './_shared/sms/conversation.cjs';
import artwork from './_shared/sms/artwork.cjs';
import payments from './_shared/sms/payments.cjs';

export default async (request: Request) => {
  const config = runtime.settings();
  if (!config.enabled) return http.json(503, { error: 'TEXT_ORDERING_UNAVAILABLE', message: 'Text ordering is not available yet. Please order through our website.' });
  if (!['GET', 'POST'].includes(request.method)) return http.json(405, { error: 'METHOD_NOT_ALLOWED' });
  if (request.method === 'POST' && !http.sameOrigin(request, config)) return http.json(403, { error: 'ORIGIN_NOT_ALLOWED' });
  try {
    const current = await http.sessionFor(request, config);
    if (!current) return http.json(401, { error: 'LINK_EXPIRED', message: 'This order link has expired. Text us to start a new order.' });
    const { sql, session } = current;
    if (request.method === 'GET') {
      const busy = await sql`SELECT EXISTS (SELECT 1 FROM bof_sms_inbound WHERE phone = ${session.phone} AND status IN ('pending', 'processing')) AS busy`;
      let quote = null; try { quote = conversation.quoteFor(session); } catch { /* still choosing options */ }
      let reference = null;
      if (session.step === 'PAID' && session.order_id) {
        const orders = await sql`SELECT order_number FROM orders WHERE id = ${session.order_id}`;
        const number = String(orders[0]?.order_number || '');
        reference = number.startsWith('BOF-') ? number : `BOF-${number.padStart(6, '0')}`;
      }
      return http.json(200, { step: session.step, revision: session.revision, approved: session.approved_revision === session.revision,
        config: session.config, previewUrl: session.artwork?.previewUrl || null, quote,
        processing: Boolean(busy[0]?.busy), reference, errorCode: session.error_code,
        test: config.mode !== 'live', optedOut: await store.optedOut(sql, session.phone) });
    }
    if (await store.optedOut(sql, session.phone)) return http.json(409, { error: 'SMS_OPTED_OUT', message: 'Text START to resume your order.' });
    const text = await request.text();
    if (text.length > 8192) return http.json(413, { error: 'REQUEST_TOO_LARGE' });
    let input; try { input = JSON.parse(text); } catch { return http.json(400, { error: 'INVALID_JSON' }); }
    if (Number(input.revision) !== session.revision) return http.json(409, { error: 'SMS_SESSION_CHANGED', message: 'The preview changed. Refresh before continuing.' });
    if (input.action === 'checkout') {
      const result = await payments.createCheckout({ sql, session, input, event: http.eventFor(request), config });
      return http.json(200, result);
    }
    if (!['ARTWORK', 'PREVIEW'].includes(session.step)) return http.json(409, { error: 'SMS_STEP_CHANGED', message: 'Reply RESTART in your text conversation to change this order before payment.' });
    if (input.action === 'upload-signature') {
      const reserved = await sql`UPDATE bof_sms_sessions SET upload_requests = upload_requests + 1 WHERE id = ${session.id}
        AND upload_requests < 10 AND step IN ('ARTWORK', 'PREVIEW') RETURNING id`;
      if (!reserved[0]) return http.json(429, { error: 'UPLOAD_LIMIT', message: 'This order reached its upload limit. Reply RESTART or contact us for help.' });
      return http.json(200, artwork.uploadSignature(session));
    }
    const payload: Record<string, unknown> = { expectedRevision: session.revision };
    if (input.action === 'approve' && session.step === 'PREVIEW') payload.Body = 'APPROVE';
    else if (input.action === 'fit' && session.step === 'PREVIEW') payload.Body = 'FIT';
    else if (input.action === 'fill' && session.step === 'PREVIEW') payload.Body = 'FILL';
    else if (input.action === 'upload-commit' && typeof input.publicId === 'string') {
      if (!new RegExp(`^bof/text-orders/${session.id}/incoming-[a-f0-9]{32}$`).test(input.publicId)) return http.json(400, { error: 'INVALID_UPLOAD' });
      payload.uploadedPublicId = input.publicId;
    } else return http.json(400, { error: 'INVALID_ACTION' });
    // The browser and SMS both use the same serialized conversation queue.
    const idempotencyKey = String(input.requestId || '');
    if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey)) return http.json(400, { error: 'REQUEST_ID_REQUIRED' });
    await store.receive(sql, { sid: `web:${session.id}:${idempotencyKey}`, phone: session.phone, payload, sessionId: session.id });
    await runtime.kickWorker(config).catch(() => {});
    return http.json(202, { processing: true });
  } catch (failure) {
    const status = Number(failure.statusCode) || 503;
    return http.json(status, { error: failure.code || 'TEXT_ORDER_RETRY',
      message: status >= 500 ? 'We could not finish this step. Please try again shortly.' : failure.message });
  }
};
export const config = { path: '/api/text-order' };
