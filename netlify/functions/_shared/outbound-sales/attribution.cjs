'use strict';

const { sanitizeForAudit } = require('./security.cjs');
const { appendAudit } = require('./audit.cjs');

async function scanAttributionCandidates(sql, { sinceDays = 90 } = {}) {
  const days = Math.max(1, Math.min(365, Number(sinceDays) || 90));
  // This is the only legacy-table read in attribution. It selects paid,
  // non-test orders and never updates, locks, references, or triggers orders.
  const rows = await sql(
    `WITH paid_orders AS (
       SELECT o.id, LOWER(TRIM(COALESCE(to_jsonb(o)->>'email',''))) AS email,
              o.total_cents, o.status, o.created_at,
              LOWER(COALESCE(to_jsonb(o)->>'is_test_order','false')) IN ('true','t','1') AS is_test
         FROM orders o
        WHERE o.created_at >= NOW() - make_interval(days => $1)
          AND o.status='paid'
     ), matches AS (
       SELECT DISTINCT ON (o.id, p.id)
              o.id AS source_order_id, p.id AS prospect_id,
              opp.id AS opportunity_id, m.id AS message_id, m.campaign_id,
              CASE WHEN o.email=LOWER(c.email_normalized) THEN 'email_match' ELSE 'domain_match' END AS candidate_method,
              CASE WHEN o.email=LOWER(c.email_normalized) THEN 1.0000 ELSE 0.7000 END AS confidence,
              o.total_cents, o.status, o.is_test, o.created_at,
              c.email_normalized
         FROM paid_orders o
         JOIN outbound_contacts c ON o.email=LOWER(c.email_normalized)
           OR (SPLIT_PART(o.email,'@',2)<>'' AND SPLIT_PART(o.email,'@',2)=LOWER((SELECT canonical_domain FROM outbound_prospects WHERE id=c.prospect_id)))
         JOIN outbound_prospects p ON p.id=c.prospect_id
         JOIN LATERAL (
           SELECT m.* FROM outbound_messages m
            WHERE m.prospect_id=p.id AND m.sent_at IS NOT NULL AND m.sent_at<=o.created_at
            ORDER BY m.sent_at DESC LIMIT 1
         ) m ON TRUE
         LEFT JOIN LATERAL (
           SELECT op.id FROM outbound_opportunities op WHERE op.prospect_id=p.id ORDER BY op.created_at DESC LIMIT 1
         ) opp ON TRUE
        WHERE o.is_test=FALSE
        ORDER BY o.id,p.id,m.sent_at DESC
     )
     INSERT INTO outbound_attribution_candidates (
       source_order_id, prospect_id, opportunity_id, message_id, campaign_id,
       candidate_method, confidence, gross_revenue_cents, source_order_status,
       is_test_order, evidence, observed_at
     ) SELECT source_order_id,prospect_id,opportunity_id,message_id,campaign_id,
              candidate_method,confidence,total_cents,status,is_test,
              jsonb_build_object('matchedField',candidate_method,'orderCreatedAt',created_at),created_at
         FROM matches
     ON CONFLICT (source_order_id,prospect_id,candidate_method) DO UPDATE
       SET confidence=EXCLUDED.confidence,gross_revenue_cents=EXCLUDED.gross_revenue_cents,
           source_order_status=EXCLUDED.source_order_status,evidence=EXCLUDED.evidence,
           observed_at=EXCLUDED.observed_at,updated_at=NOW()
     RETURNING *`,
    [days],
  );
  return rows;
}

async function promoteExactAttributions(sql, { actorId = 'system' } = {}) {
  const rows = await sql(
    `WITH eligible AS (
       SELECT c.* FROM outbound_attribution_candidates c
        WHERE c.review_status='pending' AND c.candidate_method='email_match'
          AND c.confidence=1 AND c.is_test_order=FALSE
        FOR UPDATE SKIP LOCKED
     ), attribution AS (
       INSERT INTO outbound_order_attributions (
         source_order_id,prospect_id,opportunity_id,message_id,campaign_id,
         attribution_method,attribution_confidence,gross_revenue_cents,
         attributed_revenue_cents,currency,source_order_status,is_test_order,
         attribution_evidence,ordered_at
       ) SELECT source_order_id,prospect_id,opportunity_id,message_id,campaign_id,
                candidate_method,confidence,gross_revenue_cents,gross_revenue_cents,
                currency,source_order_status,FALSE,evidence,observed_at
           FROM eligible
       ON CONFLICT (source_order_id) DO NOTHING
       RETURNING *
     ), reviewed AS (
       UPDATE outbound_attribution_candidates c
          SET review_status=CASE WHEN EXISTS (SELECT 1 FROM attribution a WHERE a.source_order_id=c.source_order_id) THEN 'auto_approved' ELSE 'superseded' END,
              reviewed_by=$1,reviewed_at=NOW(),updated_at=NOW()
         FROM eligible e WHERE c.id=e.id RETURNING c.*
     ), opportunity_update AS (
       UPDATE outbound_opportunities o
          SET status='won',won_revenue_cents=a.attributed_revenue_cents,
              closed_at=COALESCE(closed_at,NOW()),updated_at=NOW()
         FROM attribution a WHERE o.id=a.opportunity_id RETURNING o.id
     ), prospect_update AS (
       UPDATE outbound_prospects p SET status='won',updated_at=NOW()
         FROM attribution a WHERE p.id=a.prospect_id RETURNING p.id
     ) SELECT * FROM attribution`,
    [actorId],
  );
  for (const row of rows) {
    await appendAudit(sql, { action: 'order.attributed', entityType: 'order_attribution', entityId: row.id, newValues: { sourceOrderId: row.source_order_id, attributedRevenueCents: row.attributed_revenue_cents }, metadata: { method: row.attribution_method, confidence: Number(row.attribution_confidence), legacyOrderMutated: false } });
    await appendAudit(sql, {
      action: 'prospect.pipeline_status_changed', entityType: 'prospect', entityId: row.prospect_id,
      newValues: { status: 'won' },
      metadata: { source: 'paid_order_attribution', attributionId: row.id, sourceOrderId: row.source_order_id },
    });
  }
  return rows;
}

async function listAttributedOrders(sql, { limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 100));
  const safeOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const [rows, summaryRows, candidateRows] = await Promise.all([
    sql(
      `SELECT a.id,a.source_order_id,a.prospect_id,p.business_name,a.opportunity_id,
              a.message_id,a.campaign_id,c.name AS campaign_name,a.attribution_method,
              a.attribution_confidence,a.gross_revenue_cents,a.attributed_revenue_cents,
              a.currency,a.source_order_status,a.ordered_at,a.attributed_at
         FROM outbound_order_attributions a
         JOIN outbound_prospects p ON p.id=a.prospect_id
         LEFT JOIN outbound_campaigns c ON c.id=a.campaign_id
        WHERE a.is_test_order=FALSE
        ORDER BY a.attributed_at DESC LIMIT $1 OFFSET $2`, [safeLimit,safeOffset],
    ),
    sql(`SELECT COUNT(*)::int AS orders,COALESCE(SUM(attributed_revenue_cents),0)::bigint AS revenue_cents FROM outbound_order_attributions WHERE is_test_order=FALSE`),
    sql(`SELECT COUNT(*)::int AS pending FROM outbound_attribution_candidates WHERE review_status='pending'`),
  ]);
  return {
    orders: rows.map((row) => ({ id:row.id,sourceOrderId:row.source_order_id,prospectId:row.prospect_id,businessName:row.business_name,opportunityId:row.opportunity_id,messageId:row.message_id,campaignId:row.campaign_id,campaignName:row.campaign_name,attributionMethod:row.attribution_method,attributionConfidence:Number(row.attribution_confidence),grossRevenueCents:Number(row.gross_revenue_cents),attributedRevenueCents:Number(row.attributed_revenue_cents),currency:row.currency,sourceOrderStatus:row.source_order_status,orderedAt:row.ordered_at,attributedAt:row.attributed_at })),
    summary: { orderCount:Number(summaryRows[0]?.orders)||0,revenueCents:Number(summaryRows[0]?.revenue_cents)||0,pendingCandidates:Number(candidateRows[0]?.pending)||0 },
    limit:safeLimit,offset:safeOffset,
  };
}

module.exports = { scanAttributionCandidates, promoteExactAttributions, listAttributedOrders };
