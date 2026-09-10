'use strict';

const crypto = require('node:crypto');

const EXPERIMENT_DIMENSIONS = Object.freeze([
  'subject_line_style', 'call_to_action_style', 'email_length',
  'offer_framing', 'industry_positioning',
]);
const PRIMARY_OBJECTIVES = Object.freeze(['qualified_replies', 'quote_requests', 'paid_orders', 'revenue']);
const MINIMUM_VARIANT_SAMPLE = 30;
const MINIMUM_DECISION_SAMPLE = 60;
const EXPLORATION_FLOOR = 0.1;

function deterministicUnit(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

function assignWeightedVariant({ prospectId, campaignId, dimension, variants }) {
  if (!EXPERIMENT_DIMENSIONS.includes(dimension)) throw new TypeError('Unsupported experiment dimension.');
  const active = (variants || []).filter((variant) => variant.status === 'active' && Number(variant.allocationWeight) > 0);
  if (!active.length) return null;
  const total = active.reduce((sum, variant) => sum + Number(variant.allocationWeight), 0);
  let cursor = deterministicUnit(`${prospectId}|${campaignId}|${dimension}`) * total;
  for (const variant of active) {
    cursor -= Number(variant.allocationWeight);
    if (cursor < 0) return variant.variantKey;
  }
  return active.at(-1).variantKey;
}

function safeRate(numerator, denominator) {
  return Number(denominator) > 0 ? Number(numerator || 0) / Number(denominator) : 0;
}

function variantOutcome(metrics) {
  const delivered = Number(metrics.delivered || 0);
  return {
    delivered,
    qualifiedReplyRate: safeRate(metrics.qualifiedReplies, delivered),
    quoteRequestRate: safeRate(metrics.quoteRequests, delivered),
    paidOrderRate: safeRate(metrics.paidOrders, delivered),
    revenuePerDeliveredCents: delivered ? Number(metrics.revenueCents || 0) / delivered : 0,
    bounceRate: safeRate(metrics.bounces, Number(metrics.sent || delivered)),
    complaintRate: safeRate(metrics.complaints, Number(metrics.sent || delivered)),
    unsubscribeRate: safeRate(metrics.unsubscribes, delivered),
  };
}

function objectiveScore(outcome, objective) {
  if (objective === 'qualified_replies') return outcome.qualifiedReplyRate;
  if (objective === 'quote_requests') return outcome.quoteRequestRate;
  if (objective === 'paid_orders') return outcome.paidOrderRate;
  return outcome.revenuePerDeliveredCents / 10000;
}

function evaluateExperiment({ variants, objective = 'revenue', minimumDecisionSample = MINIMUM_DECISION_SAMPLE, safetyLimits = {} }) {
  if (!PRIMARY_OBJECTIVES.includes(objective)) throw new TypeError('Unsupported campaign objective.');
  const evaluated = (variants || []).map((variant) => ({ ...variant, outcome: variantOutcome(variant.metrics || {}) }));
  const totalDelivered = evaluated.reduce((sum, variant) => sum + variant.outcome.delivered, 0);
  const eligible = evaluated.filter((variant) => variant.outcome.delivered >= Math.max(MINIMUM_VARIANT_SAMPLE, Number(variant.minimumDeliveredSample || 0)));
  const sampleReady = totalDelivered >= Math.max(MINIMUM_DECISION_SAMPLE, Number(minimumDecisionSample || 0)) && eligible.length >= 2;
  const unsafe = evaluated.filter(({ outcome }) =>
    outcome.bounceRate > Number(safetyLimits.maximumBounceRate ?? 0.05)
    || outcome.complaintRate > Number(safetyLimits.maximumComplaintRate ?? 0.001)
    || outcome.unsubscribeRate > Number(safetyLimits.maximumUnsubscribeRate ?? 0.03));
  if (!sampleReady) return { status: 'collecting', winner: null, totalDelivered, evaluated, unsafe: unsafe.map((item) => item.variantKey) };
  const ranked = [...eligible].sort((a, b) => objectiveScore(b.outcome, objective) - objectiveScore(a.outcome, objective));
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const winnerScore = objectiveScore(winner.outcome, objective);
  const runnerUpScore = objectiveScore(runnerUp.outcome, objective);
  // Require at least a 10% relative lift and a nonzero business outcome. This
  // intentionally favors continued exploration over premature optimization.
  const meaningfulLift = winnerScore > 0 && winnerScore >= runnerUpScore * 1.1;
  return {
    status: meaningfulLift ? 'leader_identified' : 'no_clear_winner',
    winner: meaningfulLift && !unsafe.some((item) => item.variantKey === winner.variantKey) ? winner.variantKey : null,
    totalDelivered, evaluated, unsafe: unsafe.map((item) => item.variantKey),
  };
}

function recommendedAllocation(variants, winnerKey, explorationFloor = EXPLORATION_FLOOR) {
  const active = (variants || []).filter((variant) => variant.status === 'active');
  if (!winnerKey || active.length < 2) return Object.fromEntries(active.map((variant) => [variant.variantKey, 1 / Math.max(1, active.length)]));
  const floor = Math.max(0.05, Math.min(0.3, Number(explorationFloor) || EXPLORATION_FLOOR));
  const remaining = floor * (active.length - 1);
  return Object.fromEntries(active.map((variant) => [variant.variantKey, variant.variantKey === winnerKey ? 1 - remaining : floor]));
}

module.exports = {
  EXPERIMENT_DIMENSIONS,
  PRIMARY_OBJECTIVES,
  MINIMUM_VARIANT_SAMPLE,
  MINIMUM_DECISION_SAMPLE,
  EXPLORATION_FLOOR,
  deterministicUnit,
  assignWeightedVariant,
  safeRate,
  variantOutcome,
  objectiveScore,
  evaluateExperiment,
  recommendedAllocation,
};
