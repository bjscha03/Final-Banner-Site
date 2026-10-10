import 'twilio';
import '@neondatabase/serverless';
import runtime from './_shared/sms/runtime.cjs';
import store from './_shared/sms/store.cjs';
import http from './_shared/sms/http.cjs';

export default async (request: Request) => {
  const config = runtime.settings();
  const result = await http.twilioRequest(request, config);
  if (result.error) return result.error;
  const p = result.params;
  const id = new URL(request.url).searchParams.get('id');
  const statuses = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'];
  if (!/^[a-f0-9-]{36}$/i.test(id || '') || !/^(SM|MM)[a-f0-9]{32}$/i.test(p.MessageSid || '') || p.From !== config.phoneNumber || !statuses.includes(p.MessageStatus)) {
    return http.json(400, { error: 'INVALID_STATUS' });
  }
  try {
    const sql = store.database(); await store.ensureSchema(sql);
    await sql`UPDATE bof_sms_outbox SET provider_sid = ${p.MessageSid},
      status = CASE WHEN status IN ('delivered', 'failed', 'undelivered') THEN status
        WHEN status = 'sent' AND ${p.MessageStatus} IN ('queued', 'sending') THEN status ELSE ${p.MessageStatus} END,
      error_code = ${p.ErrorCode || null}, updated_at = NOW()
      WHERE id = ${id} AND phone = ${p.To} AND (provider_sid IS NULL OR provider_sid = ${p.MessageSid})`;
    if (p.ErrorCode === '21610') await store.setOptOut(sql, p.To, true);
    return http.json(200, { received: true });
  } catch { return http.json(503, { error: 'STATUS_SAVE_RETRY' }); }
};
export const config = { path: '/api/twilio/status' };
