import type { Handler } from '@netlify/functions';
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';

// Optional: log to DB so we can see a row in `emails` too
async function logQueued(to: string, subject: string) {
  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return null;
    const db = neon(dbUrl);
    const rows = await db<
      { id: string }[]
    >`INSERT INTO emails (type, to_email, subject, provider, status)
       VALUES ('webhook_test', ${to}, ${subject}, 'resend', 'queued')
       RETURNING id`;
    return rows?.[0]?.id ?? null;
  } catch { return null; }
}

async function updateSent(id: string | null, providerId: string | null, errored: boolean, errText?: string) {
  try {
    if (!id) return;
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;
    const db = neon(dbUrl);
    if (errored) {
      await db`UPDATE emails SET status='failed', error=${errText ?? ''} WHERE id=${id}`;
    } else {
      await db`UPDATE emails SET status='sent', provider_msg_id=${providerId} WHERE id=${id}`;
    }
  } catch {/* ignore */}
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const to =
    (event.queryStringParameters?.to && decodeURIComponent(event.queryStringParameters.to)) ||
    'bjscha02@gmail.com';

  const subject = 'Resend webhook connectivity test';
  const from = process.env.EMAIL_FROM_INFO || 'Banners On The Fly <info@bannersonthefly.com>';

  // Log a queued email (optional, for visibility in `emails`)
  const queuedId = await logQueued(to, subject);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: '<p>This is a test email to trigger the webhook.</p>',
      reply_to: process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com',
    });

    if (error) {
      await updateSent(queuedId, null, true, String(error));
      return { statusCode: 500, body: JSON.stringify({ ok: false, error }) };
    }

    await updateSent(queuedId, data?.id ?? null, false);
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data?.id }) };
  } catch (e: any) {
    await updateSent(queuedId, null, true, e?.message || String(e));
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'send_failed' }) };
  }
};
