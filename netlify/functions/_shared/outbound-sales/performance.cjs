'use strict';

const { evaluateExperiment, recommendedAllocation } = require('./experiments.cjs');
const { sanitizeForAudit } = require('./security.cjs');

async function aggregatePerformanceDate(sql, metricDate) {
  const dimensions = [
    { type: 'overall', prospectKey: `'all'`, messageKey: `'all'`, replyKey: `'all'`, attributionKey: `'all'`, suppressionKey: `'all'` },
    { type: 'industry', prospectKey: `COALESCE(NULLIF(LOWER(p.industry),''),'unknown')`, messageKey: `COALESCE(NULLIF(LOWER(p.industry),''),'unknown')`, replyKey: `COALESCE(NULLIF(LOWER(p.industry),''),'unknown')`, attributionKey: `COALESCE(NULLIF(LOWER(p.industry),''),'unknown')`, suppressionKey: `COALESCE(NULLIF(LOWER(p.industry),''),'unknown')` },
    { type: 'campaign', prospectKey: `'none'`, messageKey: `COALESCE(m.campaign_id::text,'none')`, replyKey: `COALESCE(m.campaign_id::text,'none')`, attributionKey: `COALESCE(a.campaign_id::text,'none')`, suppressionKey: `COALESCE(m.campaign_id::text,'none')` },
    { type: 'send_hour', prospectKey: `'unsent'`, messageKey: `COALESCE(EXTRACT(HOUR FROM m.sent_at AT TIME ZONE 'America/New_York')::int::text,'unsent')`, replyKey: `COALESCE(EXTRACT(HOUR FROM m.sent_at AT TIME ZONE 'America/New_York')::int::text,'unsent')`, attributionKey: `COALESCE(EXTRACT(HOUR FROM m.sent_at AT TIME ZONE 'America/New_York')::int::text,'unsent')`, suppressionKey: `COALESCE(EXTRACT(HOUR FROM m.sent_at AT TIME ZONE 'America/New_York')::int::text,'unsent')` },
  ];
  for (const dimension of dimensions) {
    const providerEvent = dimension.type === 'overall'
      ? `UNION ALL
         SELECT 'all',0,0,0,0,0,0,0,0,0,0,0,0,
                COALESCE(actual_cost_microusd,estimated_cost_microusd)
           FROM outbound_provider_usage
          WHERE created_at::date=$1::date`
      : '';
    await sql(
      `WITH removed AS (
         DELETE FROM outbound_performance_daily
          WHERE metric_date=$1::date AND dimension_type=$2
         RETURNING 1
       ), events AS (
         SELECT ${dimension.prospectKey} AS dimension_key,
                (p.discovered_at::date=$1::date)::int AS discovered_count,
                (p.last_qualified_at::date=$1::date)::int AS qualified_count,
                0 AS sent_count,0 AS delivered_count,0 AS qualified_reply_count,
                0 AS quote_request_count,0 AS paid_order_count,0::bigint AS revenue_cents,
                0 AS bounced_count,0 AS complained_count,0 AS unsubscribed_count,
                0::bigint AS openai_cost_microusd,0::bigint AS provider_cost_microusd
           FROM outbound_prospects p
          WHERE p.discovered_at::date=$1::date OR p.last_qualified_at::date=$1::date
         UNION ALL
         SELECT ${dimension.messageKey},0,0,
                (m.sent_at::date=$1::date)::int,
                (m.delivered_at::date=$1::date)::int,0,0,0,0,
                (m.status='bounced' AND m.updated_at::date=$1::date)::int,
                (m.status='complained' AND m.updated_at::date=$1::date)::int,0,
                CASE WHEN m.generated_at::date=$1::date THEN COALESCE(m.actual_openai_cost_microusd,0) ELSE 0 END,0
           FROM outbound_messages m
           JOIN outbound_prospects p ON p.id=m.prospect_id
          WHERE m.sent_at::date=$1::date OR m.delivered_at::date=$1::date
             OR m.generated_at::date=$1::date
             OR (m.status IN ('bounced','complained') AND m.updated_at::date=$1::date)
         UNION ALL
         SELECT ${dimension.replyKey},0,0,0,0,
                (r.classification IN ('interested','quote_request','question'))::int,
                (r.classification='quote_request')::int,0,0,0,0,0,0,0
           FROM outbound_replies r
           JOIN outbound_prospects p ON p.id=r.prospect_id
           LEFT JOIN outbound_messages m ON m.id=r.message_id
          WHERE r.received_at::date=$1::date
         UNION ALL
         SELECT ${dimension.attributionKey},0,0,0,0,0,0,1,
                a.attributed_revenue_cents,0,0,0,0,0
           FROM outbound_order_attributions a
           JOIN outbound_prospects p ON p.id=a.prospect_id
           LEFT JOIN outbound_messages m ON m.id=a.message_id
          WHERE a.attributed_at::date=$1::date AND a.is_test_order=FALSE
         UNION ALL
         SELECT ${dimension.suppressionKey},0,0,0,0,0,0,0,0,0,0,1,0,0
           FROM outbound_suppressions s
           LEFT JOIN outbound_prospects p ON p.id=s.prospect_id
           LEFT JOIN outbound_messages m ON m.id=s.message_id
          WHERE s.reason='unsubscribed' AND s.updated_at::date=$1::date
         ${providerEvent}
       )
       INSERT INTO outbound_performance_daily (
         metric_date,dimension_type,dimension_key,discovered_count,qualified_count,
         sent_count,delivered_count,qualified_reply_count,quote_request_count,
         paid_order_count,revenue_cents,bounced_count,complained_count,
         unsubscribed_count,openai_cost_microusd,provider_cost_microusd,computed_at
       )
       SELECT $1::date,$2,dimension_key,
              SUM(discovered_count),SUM(qualified_count),SUM(sent_count),SUM(delivered_count),
              SUM(qualified_reply_count),SUM(quote_request_count),SUM(paid_order_count),
              SUM(revenue_cents),SUM(bounced_count),SUM(complained_count),SUM(unsubscribed_count),
              SUM(openai_cost_microusd),SUM(provider_cost_microusd),NOW()
         FROM events
        GROUP BY dimension_key`,
      [metricDate, dimension.type],
    );
  }
  await sql(
    `WITH removed AS (
       DELETE FROM outbound_performance_daily
        WHERE metric_date=$1::date AND dimension_type='variant'
       RETURNING 1
     ), message_variants AS (
       SELECT m.*,
              CASE assign.key
                WHEN 'subjectLineStyle' THEN 'subject_line_style'
                WHEN 'callToActionStyle' THEN 'call_to_action_style'
                WHEN 'emailLength' THEN 'email_length'
                WHEN 'offerFraming' THEN 'offer_framing'
                WHEN 'industryPositioning' THEN 'industry_positioning'
              END AS dimension,
              assign.value AS variant_key
         FROM outbound_messages m
         CROSS JOIN LATERAL jsonb_each_text(m.variant_assignments) assign
        WHERE assign.key IN ('subjectLineStyle','callToActionStyle','emailLength','offerFraming','industryPositioning')
     ), events AS (
       SELECT dimension||'='||variant_key AS dimension_key,
              (sent_at::date=$1::date)::int AS sent_count,
              (delivered_at::date=$1::date)::int AS delivered_count,
              0 AS qualified_reply_count,0 AS quote_request_count,
              0 AS paid_order_count,0::bigint AS revenue_cents,
              (status='bounced' AND updated_at::date=$1::date)::int AS bounced_count,
              (status='complained' AND updated_at::date=$1::date)::int AS complained_count,
              0 AS unsubscribed_count
         FROM message_variants
        WHERE sent_at::date=$1::date OR delivered_at::date=$1::date
           OR (status IN ('bounced','complained') AND updated_at::date=$1::date)
       UNION ALL
       SELECT mv.dimension||'='||mv.variant_key,0,0,
              (r.classification IN ('interested','quote_request','question'))::int,
              (r.classification='quote_request')::int,0,0,0,0,0
         FROM outbound_replies r
         JOIN message_variants mv ON mv.id=r.message_id
        WHERE r.received_at::date=$1::date
       UNION ALL
       SELECT mv.dimension||'='||mv.variant_key,0,0,0,0,1,
              a.attributed_revenue_cents,0,0,0
         FROM outbound_order_attributions a
         JOIN message_variants mv ON mv.id=a.message_id
        WHERE a.attributed_at::date=$1::date AND a.is_test_order=FALSE
       UNION ALL
       SELECT mv.dimension||'='||mv.variant_key,0,0,0,0,0,0,0,0,1
         FROM outbound_suppressions s
         JOIN message_variants mv ON mv.id=s.message_id
        WHERE s.reason='unsubscribed' AND s.updated_at::date=$1::date
     )
     INSERT INTO outbound_performance_daily (
       metric_date,dimension_type,dimension_key,sent_count,delivered_count,
       qualified_reply_count,quote_request_count,paid_order_count,revenue_cents,
       bounced_count,complained_count,unsubscribed_count,computed_at
     )
     SELECT $1::date,'variant',dimension_key,SUM(sent_count),SUM(delivered_count),
            SUM(qualified_reply_count),SUM(quote_request_count),SUM(paid_order_count),
            SUM(revenue_cents),SUM(bounced_count),SUM(complained_count),
            SUM(unsubscribed_count),NOW()
       FROM events
      GROUP BY dimension_key`,
    [metricDate],
  );
}

async function listPerformance(sql, { days = 90 } = {}) {
  const safeDays = Math.max(7, Math.min(365, Number(days) || 90));
  const rows = await sql(
    `SELECT dimension_type,dimension_key,
            SUM(discovered_count)::int AS discovered_count,
            SUM(qualified_count)::int AS qualified_count,
            SUM(sent_count)::int AS sent_count,SUM(delivered_count)::int AS delivered_count,
            SUM(qualified_reply_count)::int AS qualified_reply_count,
            SUM(quote_request_count)::int AS quote_request_count,
            SUM(paid_order_count)::int AS paid_order_count,SUM(revenue_cents)::bigint AS revenue_cents,
            SUM(bounced_count)::int AS bounced_count,SUM(complained_count)::int AS complained_count,
            SUM(unsubscribed_count)::int AS unsubscribed_count,
            SUM(openai_cost_microusd)::bigint AS openai_cost_microusd,
            SUM(provider_cost_microusd)::bigint AS provider_cost_microusd
       FROM outbound_performance_daily
      WHERE metric_date>=CURRENT_DATE-$1::int
      GROUP BY dimension_type,dimension_key
      ORDER BY dimension_type,revenue_cents DESC,qualified_reply_count DESC`, [safeDays],
  );
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, /_count$|_cents$|microusd$/.test(key) ? Number(value)||0 : value])));
}

function learningRecommendationFromRows(rows, { minimumSample = 60, objective = 'revenue', safetyLimits = {} } = {}) {
  const variantsByDimension = new Map();
  for (const row of (rows || []).filter((item) => item.dimension_type === 'variant')) {
    const [dimension, variantKey] = String(row.dimension_key).split('=');
    const list = variantsByDimension.get(dimension) || [];
    list.push({ variantKey, status:'active', minimumDeliveredSample:30, metrics:{ sent:row.sent_count,delivered:row.delivered_count,qualifiedReplies:row.qualified_reply_count,quoteRequests:row.quote_request_count,paidOrders:row.paid_order_count,revenueCents:row.revenue_cents,bounces:row.bounced_count,complaints:row.complained_count,unsubscribes:row.unsubscribed_count } });
    variantsByDimension.set(dimension,list);
  }
  const recommendations=[];
  for (const [dimension,variants] of variantsByDimension) {
    const result=evaluateExperiment({variants,objective,minimumDecisionSample:minimumSample,safetyLimits});
    const allocations=recommendedAllocation(variants,result.winner);
    for (const variant of variants) recommendations.push({ dimensionType:dimension,dimensionKey:variant.variantKey,recommendation:result.unsafe.includes(variant.variantKey)?'pause':result.winner===variant.variantKey?'increase':result.winner?'decrease':'hold',currentWeight:1,recommendedWeight:allocations[variant.variantKey]??1,sampleSize:variant.metrics.delivered,primaryMetric:objective,evidence:{status:result.status,totalDelivered:result.totalDelivered},safetyMetrics:{unsafe:result.unsafe.includes(variant.variantKey)} });
  }
  const industries = (rows || [])
    .filter((item) => item.dimension_type === 'industry' && item.dimension_key !== 'unknown')
    .map((row) => ({
      variantKey: row.dimension_key,
      status: 'active',
      minimumDeliveredSample: 30,
      metrics: {
        sent: row.sent_count, delivered: row.delivered_count,
        qualifiedReplies: row.qualified_reply_count, quoteRequests: row.quote_request_count,
        paidOrders: row.paid_order_count, revenueCents: row.revenue_cents,
        bounces: row.bounced_count, complaints: row.complained_count,
        unsubscribes: row.unsubscribed_count,
      },
    }));
  if (industries.length >= 2) {
    const result = evaluateExperiment({ variants: industries, objective, minimumDecisionSample: minimumSample, safetyLimits });
    const allocations = recommendedAllocation(industries, result.winner);
    for (const industry of industries) recommendations.push({
      dimensionType: 'industry',
      dimensionKey: industry.variantKey,
      recommendation: result.unsafe.includes(industry.variantKey) ? 'pause'
        : result.winner === industry.variantKey ? 'increase' : result.winner ? 'decrease' : 'hold',
      currentWeight: 1,
      recommendedWeight: allocations[industry.variantKey] ?? 1,
      sampleSize: industry.metrics.delivered,
      primaryMetric: objective,
      evidence: { status: result.status, totalDelivered: result.totalDelivered },
      safetyMetrics: { unsafe: result.unsafe.includes(industry.variantKey) },
    });
  }
  return recommendations;
}

async function saveLearningRecommendations(sql, recommendations) {
  const saved=[];
  for (const item of recommendations) {
    const rows=await sql(`INSERT INTO outbound_learning_recommendations (dimension_type,dimension_key,recommendation,current_weight,recommended_weight,sample_size,primary_metric,evidence,safety_metrics,status)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'proposed'
       WHERE NOT EXISTS (
         SELECT 1 FROM outbound_learning_recommendations
          WHERE dimension_type=$1 AND dimension_key=$2 AND recommendation=$3
            AND recommended_weight=$5 AND sample_size=$6
            AND status IN ('proposed','applied')
       ) RETURNING id`,[item.dimensionType,item.dimensionKey,item.recommendation,item.currentWeight,item.recommendedWeight,item.sampleSize,item.primaryMetric,JSON.stringify(sanitizeForAudit(item.evidence)),JSON.stringify(sanitizeForAudit(item.safetyMetrics))]);
    if(rows[0])saved.push(rows[0]);
  }
  return saved;
}

async function applyLearningRecommendations(sql, { minimumSample = 60, explorationPercent = 15 } = {}) {
  const safeMinimum = Math.max(30, Number(minimumSample) || 60);
  const explorationFloor = Math.max(0.05, Math.min(0.3, (Number(explorationPercent) || 15) / 100));
  const rows = await sql(
    `SELECT DISTINCT ON (dimension_type,dimension_key)
            id,dimension_type,dimension_key,recommendation,recommended_weight,
            sample_size,evidence,safety_metrics
       FROM outbound_learning_recommendations
      WHERE status='proposed'
        AND (sample_size >= $1 OR recommendation='pause')
        AND (evidence->>'status'='leader_identified' OR recommendation='pause')
      ORDER BY dimension_type,dimension_key,created_at DESC`,
    [safeMinimum],
  );
  const applied = [];
  for (const row of rows) {
    if (row.dimension_type !== 'industry') {
      const updated = await sql(
        `UPDATE outbound_campaign_variants
            SET allocation_weight=CASE WHEN $4='pause' THEN 0 ELSE GREATEST($3,$5) END,
                status=CASE WHEN $4='pause' THEN 'paused' ELSE 'active' END,
                updated_at=NOW()
          WHERE dimension=$1 AND variant_key=$2 AND status<>'retired'
          RETURNING id`,
        [row.dimension_type, row.dimension_key, Number(row.recommended_weight), row.recommendation, explorationFloor],
      );
      if (!updated.length) continue;
    }
    await sql(
      `UPDATE outbound_learning_recommendations
          SET status='applied',applied_at=NOW()
        WHERE id=$1 AND status='proposed'`,
      [row.id],
    );
    applied.push({
      id: row.id,
      dimensionType: row.dimension_type,
      dimensionKey: row.dimension_key,
      recommendation: row.recommendation,
      recommendedWeight: Number(row.recommended_weight),
      sampleSize: Number(row.sample_size),
    });
  }
  return applied;
}

module.exports={aggregatePerformanceDate,listPerformance,learningRecommendationFromRows,saveLearningRecommendations,applyLearningRecommendations};
