"use strict";

async function pendingRefunds(sql) {
  // Select unfinished work before limiting the batch. Already reconciled
  // historical refunds must not hide a newer refund whose webhook failed.
  return sql`WITH refunds AS (
    SELECT order_id,sum(amount_cents)::bigint AS cents,min(created_at) AS first_refund_at
    FROM bof_provider_refunds GROUP BY order_id
  ) SELECT r.order_id,r.cents,o.total_cents
    FROM refunds r JOIN orders o ON o.id=r.order_id
    JOIN bof_order_benefits b ON b.order_id=o.id
    WHERE b.state IN ('paid','reversed') AND (
      b.state='paid' OR (
        b.wallet_cents>0 AND o.total_cents>0
        AND floor(b.wallet_cents::numeric*least(r.cents,o.total_cents)/o.total_cents)>
          coalesce((SELECT sum(e.amount_cents) FROM bof_cash_entries e
            WHERE e.order_id=b.order_id AND e.kind='redemption_refund'),0)
      )
    ) ORDER BY r.first_refund_at,r.order_id LIMIT 100`;
}

async function dueInvitations(sql, launchedAt, campaign) {
  // Retry only inside the provider idempotency window. New recipients sort
  // ahead of attempted recipients, so repeated recipient errors cannot occupy
  // the whole batch while unattempted eligible customers wait.
  return sql`SELECT lower(btrim(o.email)) AS email FROM orders o
    LEFT JOIN marketing_email_sends s
      ON s.normalized_email=lower(btrim(o.email)) AND s.campaign_key=${campaign}
    WHERE (o.status='delivered' OR (o.status IN ('shipped','fulfilled') AND EXISTS (
        SELECT 1 FROM bof_order_touchpoints t WHERE t.order_id=o.id
          AND t.first_shipped_at<=now()-interval '3 days'
      ))) AND o.created_at>=${launchedAt}::timestamptz
      AND NOT coalesce(o.is_test_order,false)
      AND length(btrim(o.email))<=254
      AND btrim(o.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      AND NOT EXISTS (SELECT 1 FROM bof_members m JOIN profiles p ON p.id=m.user_id
        WHERE lower(btrim(p.email))=lower(btrim(o.email)))
      AND (s.id IS NULL OR (
        s.status IN ('error','processing')
        AND s.last_attempt_at<now()-interval '5 minutes'
        AND s.created_at>now()-interval '23 hours'
      ))
    GROUP BY lower(btrim(o.email))
    ORDER BY coalesce(min(s.last_attempt_at),'-infinity'::timestamptz),min(o.created_at),lower(btrim(o.email))
    LIMIT 10`;
}

module.exports = { pendingRefunds, dueInvitations };
