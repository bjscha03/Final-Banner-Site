import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';

const handler = async () => {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const siteUrl = String(process.env.URL || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (!dbUrl || !siteUrl) {
    console.error('[retry-paid-order-followups] missing database URL or site URL');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'CONFIGURATION_MISSING' }) };
  }

  const sql = neon(dbUrl);
  const candidates = new Set();

  const emailRows = await sql`
    SELECT id
      FROM orders
     WHERE status IN ('paid', 'in_production', 'shipped')
       AND created_at >= NOW() - INTERVAL '7 days'
       AND (
         confirmation_emailed_at IS NULL
         OR COALESCE(confirmation_email_status, '') <> 'sent'
         OR admin_notification_sent_at IS NULL
         OR COALESCE(admin_notification_status, '') <> 'sent'
       )
     ORDER BY created_at ASC
     LIMIT 25
  `;
  for (const row of emailRows) candidates.add(String(row.id));

  try {
    const pdfRows = await sql`
      SELECT DISTINCT o.id
        FROM orders o
        JOIN order_items i ON i.order_id = o.id
       WHERE o.status IN ('paid', 'in_production', 'shipped')
         AND o.created_at >= NOW() - INTERVAL '7 days'
         AND COALESCE(i.production_pdf_status, 'pending') <> 'generated'
       ORDER BY o.id
       LIMIT 25
    `;
    for (const row of pdfRows) candidates.add(String(row.id));
  } catch (error) {
    console.warn('[retry-paid-order-followups] PDF status scan skipped', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const headers = { 'Content-Type': 'application/json' };
  if (internalSecret) headers['X-Internal-Job-Secret'] = internalSecret;

  let queued = 0;
  let failed = 0;
  for (const orderId of candidates) {
    try {
      const response = await fetch(`${siteUrl}/.netlify/functions/process-paid-order-followups-background`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId }),
      });
      if (!response.ok) throw new Error(`Queue returned ${response.status}`);
      queued += 1;
    } catch (error) {
      failed += 1;
      console.error('[retry-paid-order-followups] queue failed', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[retry-paid-order-followups] completed', {
    candidateCount: candidates.size,
    queued,
    failed,
  });

  return {
    statusCode: failed ? 500 : 200,
    body: JSON.stringify({ ok: failed === 0, candidateCount: candidates.size, queued, failed }),
  };
};

export default withLambda(handler);

export const config = {
  schedule: '*/5 * * * *',
};
