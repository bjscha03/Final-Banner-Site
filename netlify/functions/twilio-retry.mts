import 'twilio';
import '@neondatabase/serverless';
import runtime from './_shared/sms/runtime.cjs';
import store from './_shared/sms/store.cjs';

export default async () => {
  const config = runtime.settings();
  if (!config.enabled) return new Response(null, { status: 204 });
  const sql = store.database(); await store.ensureSchema(sql);
  const rows = await sql`SELECT EXISTS (
    SELECT 1 FROM bof_sms_inbound WHERE status = 'pending' OR (status = 'processing' AND lease_until < NOW())
    UNION ALL SELECT 1 FROM bof_sms_outbox WHERE status = 'pending' AND attempts < 3
  ) AS needed`;
  if (rows[0]?.needed) await runtime.kickWorker(config);
  return new Response(null, { status: 204 });
};
export const config = { schedule: '*/5 * * * *' };
