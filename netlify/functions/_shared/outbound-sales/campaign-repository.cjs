'use strict';

const { assignWeightedVariant, EXPERIMENT_DIMENSIONS } = require('./experiments.cjs');

const DEFAULT_CAMPAIGN_KEY = 'autonomous-qualified-businesses-v1';
const DEFAULT_VARIANTS = Object.freeze([
  ['subject_line_style','specific_observation','Specific observation'],
  ['subject_line_style','direct_business_benefit','Direct business benefit'],
  ['call_to_action_style','simple_question','Simple question'],
  ['call_to_action_style','quick_quote_offer','Quick quote offer'],
  ['email_length','concise','Concise'],
  ['email_length','standard','Standard'],
  ['offer_framing','production_and_shipping','Production and shipping'],
  ['offer_framing','quality_and_convenience','Quality and convenience'],
  ['industry_positioning','evidence_specific','Evidence-specific positioning'],
  ['industry_positioning','industry_application','Industry application positioning'],
]);

async function ensureDefaultCampaign(sql) {
  const rows = await sql(
    `WITH campaign AS (
       INSERT INTO outbound_campaigns (
         campaign_key, name, status, objective, targeting_config,
         experiment_config, safety_state
       ) VALUES ($1, 'Autonomous Qualified Businesses', 'shadow', 'revenue',
         '{"qualifiedOnly":true,"maxDaily":30}'::jsonb,
         '{"optimization":"revenue_and_safety","openRatePrimary":false}'::jsonb,
         'shadow')
       ON CONFLICT (campaign_key) DO UPDATE SET updated_at=outbound_campaigns.updated_at
       RETURNING id
     ) SELECT id FROM campaign`,
    [DEFAULT_CAMPAIGN_KEY],
  );
  const campaignId = rows[0]?.id;
  if (!campaignId) {
    const existing = await sql(`SELECT id FROM outbound_campaigns WHERE campaign_key=$1 LIMIT 1`, [DEFAULT_CAMPAIGN_KEY]);
    if (!existing[0]) throw new Error('Default outbound campaign could not be resolved.');
    await seedVariants(sql, existing[0].id);
    return existing[0].id;
  }
  await seedVariants(sql, campaignId);
  return campaignId;
}

async function seedVariants(sql, campaignId) {
  for (const [dimension, key, displayName] of DEFAULT_VARIANTS) {
    await sql(
      `INSERT INTO outbound_campaign_variants (
         campaign_id, dimension, variant_key, display_name, status,
         allocation_weight, minimum_delivered_sample, variant_config
       ) VALUES ($1,$2,$3,$4,'active',1,30,'{}'::jsonb)
       ON CONFLICT (campaign_id, dimension, variant_key) DO NOTHING`,
      [campaignId, dimension, key, displayName],
    );
  }
}

const COPY_PROFILE_KEYS = Object.freeze({
  subject_line_style: 'subjectLineStyle',
  call_to_action_style: 'callToActionStyle',
  email_length: 'emailLength',
  offer_framing: 'offerFraming',
  industry_positioning: 'industryPositioning',
});

async function loadCampaignExperiment(sql) {
  const campaignId = await ensureDefaultCampaign(sql);
  const rows = await sql(
    `SELECT dimension,variant_key,allocation_weight,status,minimum_delivered_sample
       FROM outbound_campaign_variants
      WHERE campaign_id=$1 AND status='active'
      ORDER BY dimension,variant_key`,
    [campaignId],
  );
  return {
    campaignId,
    variants: rows.map((row) => ({
      dimension: row.dimension,
      variantKey: row.variant_key,
      allocationWeight: Number(row.allocation_weight),
      status: row.status,
      minimumDeliveredSample: Number(row.minimum_delivered_sample),
    })),
  };
}

function assignCampaignVariants(prospectId, experiment) {
  const assignments = {};
  for (const dimension of EXPERIMENT_DIMENSIONS) {
    const selected = assignWeightedVariant({
      prospectId,
      campaignId: experiment.campaignId,
      dimension,
      variants: experiment.variants.filter((variant) => variant.dimension === dimension),
    });
    if (selected) assignments[COPY_PROFILE_KEYS[dimension]] = selected;
  }
  return Object.freeze({ ...assignments, experimentState: 'weighted_shadow' });
}

async function listCampaigns(sql) {
  const [campaigns, variants] = await Promise.all([
    sql(
      `WITH message_metrics AS (
         SELECT campaign_id,
                COUNT(*)::int AS message_count,
                COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::int AS sent_count
           FROM outbound_messages
          WHERE campaign_id IS NOT NULL
          GROUP BY campaign_id
       ), reply_metrics AS (
         SELECT m.campaign_id,
                COUNT(*) FILTER (WHERE r.classification IN ('interested','quote_request','question'))::int AS qualified_reply_count
           FROM outbound_replies r
           JOIN outbound_messages m ON m.id=r.message_id
          WHERE m.campaign_id IS NOT NULL
          GROUP BY m.campaign_id
       ), revenue_metrics AS (
         SELECT campaign_id,
                COALESCE(SUM(attributed_revenue_cents),0)::bigint AS revenue_cents
           FROM outbound_order_attributions
          WHERE campaign_id IS NOT NULL AND is_test_order=FALSE
          GROUP BY campaign_id
       )
       SELECT c.id, c.campaign_key, c.name, c.status, c.objective,
              c.minimum_decision_sample, c.safety_state, c.targeting_config,
              c.experiment_config, c.performance_summary,
              c.started_at, c.ended_at, c.last_evaluated_at,
              COALESCE(mm.message_count,0)::int AS message_count,
              COALESCE(mm.sent_count,0)::int AS sent_count,
              COALESCE(rm.qualified_reply_count,0)::int AS qualified_reply_count,
              COALESCE(am.revenue_cents,0)::bigint AS revenue_cents
         FROM outbound_campaigns c
         LEFT JOIN message_metrics mm ON mm.campaign_id=c.id
         LEFT JOIN reply_metrics rm ON rm.campaign_id=c.id
         LEFT JOIN revenue_metrics am ON am.campaign_id=c.id
        ORDER BY c.created_at DESC`,
    ),
    sql(`SELECT id, campaign_id, dimension, variant_key, display_name, allocation_weight, status, minimum_delivered_sample, variant_config FROM outbound_campaign_variants ORDER BY campaign_id, dimension, variant_key`),
  ]);
  const byCampaign = new Map();
  for (const variant of variants) {
    const list = byCampaign.get(variant.campaign_id) || [];
    list.push({ id: variant.id, dimension: variant.dimension, variantKey: variant.variant_key, displayName: variant.display_name, allocationWeight: Number(variant.allocation_weight), status: variant.status, minimumDeliveredSample: Number(variant.minimum_delivered_sample), config: variant.variant_config || {} });
    byCampaign.set(variant.campaign_id, list);
  }
  return campaigns.map((row) => ({
    id: row.id, campaignKey: row.campaign_key, name: row.name, status: row.status,
    objective: row.objective, minimumDecisionSample: Number(row.minimum_decision_sample),
    safetyState: row.safety_state, targetingConfig: row.targeting_config || {},
    experimentConfig: row.experiment_config || {}, performanceSummary: row.performance_summary || {},
    startedAt: row.started_at, endedAt: row.ended_at, lastEvaluatedAt: row.last_evaluated_at,
    messageCount: Number(row.message_count), sentCount: Number(row.sent_count),
    qualifiedReplyCount: Number(row.qualified_reply_count), revenueCents: Number(row.revenue_cents),
    variants: byCampaign.get(row.id) || [],
  }));
}

module.exports = {
  DEFAULT_CAMPAIGN_KEY,
  DEFAULT_VARIANTS,
  COPY_PROFILE_KEYS,
  ensureDefaultCampaign,
  seedVariants,
  loadCampaignExperiment,
  assignCampaignVariants,
  listCampaigns,
};
