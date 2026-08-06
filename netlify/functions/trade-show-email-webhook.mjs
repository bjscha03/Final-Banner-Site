import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { normalizeComplianceEmail } from './_shared/trade-show-email-compliance.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const EVENT_DETAILS = Object.freeze({
  'email.complained': {
    activityStatus: 'complained',
    reason: 'spam_complaint',
    message: 'Recipient reported this email as spam.',
  },
  'email.bounced': {
    activityStatus: 'bounced',
    reason: 'hard_bounce',
    message: 'Recipient address permanently bounced.',
  },
  'email.suppressed': {
    activityStatus: 'suppressed',
    reason: 'provider_suppressed',
    message: 'Resend suppressed delivery to this recipient.',
  },
});

const reply = (statusCode, body) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

function databaseUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

function header(event, name) {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function rawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(String(event.body || ''), 'base64').toString('utf8')
    : String(event.body || '');
}

function verifyWebhook(event, body, dependencies = {}) {
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) throw Object.assign(new Error('Webhook signing is not configured.'), { code: 'WEBHOOK_NOT_CONFIGURED' });
  const headers = {
    id: String(header(event, 'svix-id')),
    timestamp: String(header(event, 'svix-timestamp')),
    signature: String(header(event, 'svix-signature')),
  };
  if (Object.values(headers).some((value) => !value)) {
    throw Object.assign(new Error('Webhook signature headers are incomplete.'), { code: 'INVALID_WEBHOOK' });
  }
  try {
    const verify = dependencies.verify || ((options) => new Resend().webhooks.verify(options));
    return verify({ payload: body, headers, webhookSecret });
  } catch {
    throw Object.assign(new Error('Webhook signature is invalid.'), { code: 'INVALID_WEBHOOK' });
  }
}

function recipientFromPayload(payload) {
  const recipients = Array.isArray(payload?.data?.to) ? payload.data.to : [payload?.data?.to];
  return recipients.map(normalizeComplianceEmail).find(Boolean) || null;
}

function safeError(error) {
  return String(error?.message || error || 'Unknown provider error')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, 1000);
}

async function sendComplaintAlert(activity, payload, providerEventId, dependencies = {}) {
  const alertTo = normalizeComplianceEmail(
    process.env.TRADE_SHOW_SPAM_ALERT_EMAIL
      || process.env.ADMIN_EMAIL
      || process.env.EMAIL_REPLY_TO
      || 'info@bannersonthefly.com',
  );
  if (!process.env.RESEND_API_KEY || !alertTo) return { status: 'not_configured', messageId: null, error: null };
  const emailFromRaw = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
  const from = emailFromRaw.includes('<') ? emailFromRaw : `Banners On The Fly <${emailFromRaw}>`;
  try {
    const resend = dependencies.resend || new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from,
      to: alertTo,
      subject: `Spam complaint received — ${activity.trade_show_name}`,
      text: [
        'A recipient reported a Banners On The Fly trade-show promotional email as spam.',
        '',
        `Trade show: ${activity.trade_show_name}`,
        `Recipient: ${activity.recipient_email}`,
        `Exhibitor/customer: ${activity.exhibitor_name}`,
        `Resend message ID: ${payload?.data?.email_id || activity.resend_message_id || 'Unavailable'}`,
        `Provider event ID: ${providerEventId}`,
        '',
        'The address was automatically added to the trade-show email unsubscribe list and cannot be emailed again from Admin Email Templates.',
      ].join('\n'),
      tags: [
        { name: 'type', value: 'trade_show_spam_alert' },
        { name: 'event_slug', value: activity.trade_show_slug.slice(0, 256) },
      ],
    }, { idempotencyKey: `trade-show-complaint/${providerEventId}`.slice(0, 256) });
    if (result?.error || !result?.data?.id) throw result?.error || new Error('Resend did not return an alert message ID.');
    return { status: 'sent', messageId: result.data.id, error: null };
  } catch (error) {
    return { status: 'error', messageId: null, error: safeError(error) };
  }
}

export function createHandler(dependencies = {}) {
  return async (event) => {
    if (event.httpMethod !== 'POST') return reply(404, { ok: false, error: 'Not found.' });
    const body = rawBody(event);
    if (Buffer.byteLength(body, 'utf8') > 256 * 1024) return reply(413, { ok: false, error: 'Webhook body is too large.' });
    let payload;
    try {
      payload = verifyWebhook(event, body, dependencies);
    } catch (error) {
      const status = error?.code === 'WEBHOOK_NOT_CONFIGURED' ? 503 : 400;
      return reply(status, { ok: false, error: error.message });
    }
    const details = EVENT_DETAILS[payload?.type];
    if (!details) return reply(202, { ok: true, accepted: false, ignored: true });
    const providerEventId = String(header(event, 'svix-id') || '').trim().slice(0, 300);
    const resendMessageId = String(payload?.data?.email_id || '').trim().slice(0, 300);
    if (!providerEventId || !resendMessageId) return reply(400, { ok: false, error: 'Webhook event identifiers are missing.' });
    const dbUrl = databaseUrl();
    if (!dbUrl) return reply(503, { ok: false, error: 'Database is not configured.' });
    const sql = dependencies.sql || neon(dbUrl);
    try {
      const activityRows = await sql`
        SELECT id, trade_show_slug, trade_show_name, exhibitor_name,
               recipient_email, resend_message_id
        FROM trade_show_email_activity
        WHERE resend_message_id = ${resendMessageId}
        LIMIT 1
      `;
      const activity = activityRows[0];
      if (!activity) return reply(202, { ok: true, accepted: false, ignored: true });
      const recipientEmail = recipientFromPayload(payload) || normalizeComplianceEmail(activity.recipient_email);
      const claimed = await sql`
        INSERT INTO trade_show_email_provider_events (
          provider_event_id, event_type, resend_message_id, recipient_email,
          activity_id, processing_status, event_at
        ) VALUES (
          ${providerEventId}, ${payload.type}, ${resendMessageId}, ${recipientEmail},
          ${activity.id}, 'received', ${payload.created_at || new Date().toISOString()}
        )
        ON CONFLICT (provider_event_id) DO UPDATE
          SET processing_status = 'received', error_message = NULL
          WHERE trade_show_email_provider_events.processing_status = 'error'
        RETURNING provider_event_id
      `;
      if (!claimed.length) return reply(202, { ok: true, accepted: true, duplicate: true });

      await sql`
        WITH updated_activity AS (
          UPDATE trade_show_email_activity
          SET status = ${details.activityStatus},
              error_message = ${details.message},
              complained_at = CASE WHEN ${payload.type} = 'email.complained' THEN COALESCE(complained_at, NOW()) ELSE complained_at END,
              updated_at = NOW()
          WHERE id = ${activity.id}
          RETURNING id, trade_show_slug, recipient_email, resend_message_id
        )
        INSERT INTO trade_show_email_unsubscribes (
          normalized_email, reason, source, trade_show_slug, activity_id,
          resend_message_id, provider_event_id, updated_at
        )
        SELECT LOWER(recipient_email), ${details.reason}, 'resend_webhook',
               trade_show_slug, id, resend_message_id, ${providerEventId}, NOW()
        FROM updated_activity
        ON CONFLICT (normalized_email) DO UPDATE
          SET reason = EXCLUDED.reason, source = 'resend_webhook',
              trade_show_slug = EXCLUDED.trade_show_slug,
              activity_id = EXCLUDED.activity_id,
              resend_message_id = EXCLUDED.resend_message_id,
              provider_event_id = EXCLUDED.provider_event_id,
              updated_at = NOW()
      `;

      const alert = payload.type === 'email.complained'
        ? await sendComplaintAlert(activity, payload, providerEventId, dependencies)
        : { status: 'not_required', messageId: null, error: null };
      await sql`
        UPDATE trade_show_email_provider_events
        SET processing_status = 'processed', alert_status = ${alert.status},
            alert_resend_message_id = ${alert.messageId}, error_message = ${alert.error},
            processed_at = NOW()
        WHERE provider_event_id = ${providerEventId}
      `;
      return reply(202, {
        ok: true,
        accepted: true,
        processed: true,
        complaintAlert: payload.type === 'email.complained' ? alert.status : undefined,
      });
    } catch (error) {
      const errorMessage = safeError(error);
      await sql`
        UPDATE trade_show_email_provider_events
        SET processing_status = 'error', error_message = ${errorMessage}, processed_at = NOW()
        WHERE provider_event_id = ${providerEventId}
      `.catch(() => null);
      console.error('[trade-show-email-webhook] processing failed', { providerEventId, code: error?.code, message: errorMessage });
      return reply(500, { ok: false, error: 'Unable to process the provider event.' });
    }
  };
}

export const _test = {
  EVENT_DETAILS,
  createHandler,
  header,
  rawBody,
  recipientFromPayload,
  sendComplaintAlert,
  verifyWebhook,
};

export default withLambda(createHandler());
