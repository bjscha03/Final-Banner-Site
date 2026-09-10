import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import { neon } from '@neondatabase/serverless';
import {
  compliancePage,
  hashUnsubscribeToken,
  isOneClickUnsubscribe,
  requestUnsubscribeToken,
  validUnsubscribeToken,
} from './_shared/trade-show-email-compliance.mjs';

function databaseUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

async function recordUnsubscribe(sql, token, source) {
  const tokenHash = hashUnsubscribeToken(token);
  const rows = await sql`
    WITH matched_activity AS (
      SELECT id, trade_show_slug, recipient_email, resend_message_id
      FROM trade_show_email_activity
      WHERE unsubscribe_token_hash = ${tokenHash}
      LIMIT 1
    ), recorded AS (
      INSERT INTO trade_show_email_unsubscribes (
        normalized_email, reason, source, trade_show_slug, activity_id,
        resend_message_id, updated_at
      )
      SELECT LOWER(recipient_email), 'unsubscribe', ${source}, trade_show_slug,
             id, resend_message_id, NOW()
      FROM matched_activity
      ON CONFLICT (normalized_email) DO UPDATE
        SET reason = 'unsubscribe', source = EXCLUDED.source,
            trade_show_slug = EXCLUDED.trade_show_slug,
            activity_id = EXCLUDED.activity_id,
            resend_message_id = EXCLUDED.resend_message_id,
            updated_at = NOW()
      RETURNING normalized_email
    )
    UPDATE trade_show_email_activity activity
    SET status = CASE WHEN activity.status = 'complained' THEN activity.status ELSE 'unsubscribed' END,
        unsubscribed_at = COALESCE(activity.unsubscribed_at, NOW()),
        updated_at = NOW()
    FROM matched_activity, recorded
    WHERE activity.id = matched_activity.id
    RETURNING activity.id
  `;
  return rows[0] || null;
}

const handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return compliancePage(405, 'Method not allowed', 'Use the unsubscribe link from the email.');
  }
  const token = requestUnsubscribeToken(event);
  if (!validUnsubscribeToken(token)) {
    return compliancePage(400, 'Link unavailable', 'This unsubscribe link is invalid or unavailable.');
  }
  if (event.httpMethod === 'GET') {
    return compliancePage(200, 'Unsubscribe', 'Confirm that you no longer want trade-show promotional emails from Banners On The Fly.', true);
  }
  const dbUrl = databaseUrl();
  if (!dbUrl) return compliancePage(503, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');
  try {
    const sql = neon(dbUrl);
    const source = isOneClickUnsubscribe(event) ? 'list_unsubscribe' : 'footer_link';
    const result = await recordUnsubscribe(sql, token, source);
    if (!result) return compliancePage(400, 'Link unavailable', 'This unsubscribe link is invalid or unavailable.');
    return compliancePage(200, 'Unsubscribed', 'This email address will not receive any more trade-show promotional emails from Banners On The Fly.');
  } catch (error) {
    console.error('[trade-show-unsubscribe] request failed', { code: error?.code, message: error?.message });
    return compliancePage(500, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');
  }
};

export const _test = { recordUnsubscribe };
export default withLambda(handler);
