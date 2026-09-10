'use strict';

const { planSendTimes, evaluateCircuitBreaker } = require('./delivery-safety.cjs');
const { ensureDefaultCampaign } = require('./campaign-repository.cjs');
const repository = require('./delivery-repository.cjs');
const { appendAudit } = require('./audit.cjs');

function businessDateFromIso(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

async function planShadowDelivery(options) {
  const dependencies = { ...repository, ensureDefaultCampaign, appendAudit, ...options.dependencies };
  const controls = options.controls;
  if (!controls?.shadowModeEnabled || controls?.liveSendingEnabled || controls?.emergencyPaused) {
    const error = new Error('Shadow delivery planning is blocked by global controls.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  const settings = options.settings || {};
  const dailyLimit = Math.max(0, Math.min(30, Number(controls.dailySendLimit) || 0));
  const campaignId = await dependencies.ensureDefaultCampaign(options.sql);
  const candidates = await dependencies.loadShadowDeliveryCandidates(options.sql, dailyLimit);
  if (!candidates.length) return { shadowMode: true, planned: [], count: 0, campaignId };
  const times = planSendTimes({
    count: candidates.length, now: options.now || new Date(),
    timeZone: settings.businessTimezone || 'America/New_York',
    windowStart: settings.sendingWindowStartLocal || '09:30',
    windowEnd: settings.sendingWindowEndLocal || '16:30',
    minimumSpacingSeconds: settings.minimumSpacingSeconds || 600,
    seed: campaignId,
  });
  const businessDate = businessDateFromIso(times[0], settings.businessTimezone || 'America/New_York');
  const counters = await dependencies.loadDailyCounters(options.sql, businessDate);
  const breaker = evaluateCircuitBreaker(counters, settings);
  if (breaker.state === 'open') {
    await dependencies.recordCircuitBreaker(options.sql, { breakerKey: 'outbound_delivery', previousState: 'closed', newState: 'open', reasonCode: breaker.reasons[0], observedMetrics: breaker.metrics, openedUntil: new Date(Date.now() + 3600000).toISOString() });
    return { shadowMode: true, planned: [], count: 0, campaignId, circuitBreaker: breaker };
  }
  const assignments = candidates.map((candidate, index) => ({ messageId: candidate.message_id, prospectId: candidate.prospect_id, plannedSendAt: times[index] }));
  const saved = await dependencies.saveShadowDeliveryPlan(options.sql, campaignId, assignments);
  await dependencies.recordShadowPlannedCount(options.sql, businessDate, saved.length);
  await dependencies.appendAudit(options.sql, {
    action: 'delivery.shadow_plan_created', entityType: 'campaign', entityId: campaignId,
    newValues: { plannedCount: saved.length, businessDate },
    metadata: { shadowMode: true, externalEmailsSent: 0, dailyLimit }, requestId: options.requestId || null,
  });
  return { shadowMode: true, planned: saved, count: saved.length, campaignId, circuitBreaker: breaker };
}

module.exports = { businessDateFromIso, planShadowDelivery };
