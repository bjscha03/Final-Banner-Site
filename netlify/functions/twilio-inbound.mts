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
  if (p.To !== config.phoneNumber || !runtime.allowedRecipient(p.From, config) || !/^(SM|MM)[a-f0-9]{32}$/i.test(p.MessageSid || '')) {
    return http.json(403, { error: 'MESSAGE_NOT_ALLOWED' });
  }
  try {
    const sql = store.database();
    await store.ensureSchema(sql);
    await store.receive(sql, { sid: p.MessageSid, phone: p.From, payload: p });
    // The durable queue remains available to the scheduled retry if starting a
    // background function fails. Acknowledge only after the message is saved.
    await runtime.kickWorker(config).catch(() => {});
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { ...runtime.privateHeaders, 'Content-Type': 'text/xml' },
    });
  } catch { return http.json(503, { error: 'MESSAGE_SAVE_RETRY' }); }
};
export const config = { path: '/api/twilio/inbound' };
