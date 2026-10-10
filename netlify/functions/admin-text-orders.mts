import 'twilio';
import '@neondatabase/serverless';
import auth from './_shared/server-auth.cjs';
import runtime from './_shared/sms/runtime.cjs';
import store from './_shared/sms/store.cjs';
import http from './_shared/sms/http.cjs';

export default async (request: Request) => {
  const verified = auth.requireAdmin(http.eventFor(request));
  if (!verified.ok || verified.session.preview) return http.json(401, { error: 'ADMIN_REQUIRED' });
  if (request.method !== 'GET') return http.json(405, { error: 'METHOD_NOT_ALLOWED' });
  const config = runtime.settings();
  try {
    const sql = store.database(); await store.ensureSchema(sql);
    const [sessions, issues, budget] = await Promise.all([
      sql`SELECT id, phone, step, config, revision, approved_revision, order_id, created_at, updated_at, error_code
        FROM bof_sms_sessions ORDER BY updated_at DESC LIMIT 100`,
      sql`SELECT id::text, 'outgoing' AS direction, phone, status, error_code, provider_sid, updated_at
        FROM bof_sms_outbox WHERE status IN ('failed', 'unknown', 'undelivered') ORDER BY updated_at DESC LIMIT 100`,
      sql`SELECT day, month, daily_units, monthly_units FROM bof_sms_budget WHERE id = 1`,
    ]);
    const inboundIssues = await sql`SELECT sid, phone, error_code, created_at FROM bof_sms_inbound WHERE status = 'failed' ORDER BY created_at DESC LIMIT 100`;
    return http.json(200, { enabled: config.enabled, mode: config.mode, phoneNumber: config.phoneNumber,
      limits: { daily: config.dailyMessages, monthly: config.monthlyMessages, perConversation: config.sessionMessages },
      budget: budget[0] || null, sessions, issues, inboundIssues,
      setup: { twilioAccount: Boolean(config.accountSid), twilioToken: Boolean(config.authToken),
        artworkStorage: Boolean(runtime.env('CLOUDINARY_CLOUD_NAME') && runtime.env('CLOUDINARY_API_KEY') && runtime.env('CLOUDINARY_API_SECRET')) } });
  } catch { return http.json(503, { error: 'TEXT_ORDER_STATUS_UNAVAILABLE' }); }
};
