'use strict';

const crypto = require('node:crypto');
const { PHASE_ALLOWS_LIVE_SENDING } = require('./config.cjs');
const { retryDelaySeconds } = require('./jobs.cjs');

const MAX_DAILY_SENDS = 30;

function rate(numerator, denominator) { return Number(denominator) > 0 ? Number(numerator || 0) / Number(denominator) : 0; }

function evaluateCircuitBreaker(counters, settings) {
  const attempted = Number(counters?.attemptedCount || counters?.attempted_count || 0);
  const sent = Number(counters?.sentCount || counters?.sent_count || 0);
  const bounced = Number(counters?.bouncedCount || counters?.bounced_count || 0);
  const complained = Number(counters?.complainedCount || counters?.complained_count || 0);
  const failed = Number(counters?.failedCount || counters?.failed_count || 0);
  const metrics = {
    attempted, sent,
    bounceRate: rate(bounced, Math.max(1, sent)),
    complaintRate: rate(complained, Math.max(1, sent)),
    errorRate: rate(failed, Math.max(1, attempted)),
  };
  const reasons = [];
  if (bounced >= 3 && metrics.bounceRate > Number(settings?.maximumBounceRate ?? 0.05)) reasons.push('BOUNCE_RATE_HIGH');
  if (complained >= 1 && metrics.complaintRate > Number(settings?.maximumComplaintRate ?? 0.001)) reasons.push('COMPLAINT_RATE_HIGH');
  if (attempted >= 5 && metrics.errorRate > Number(settings?.maximumErrorRate ?? 0.1)) reasons.push('SEND_ERROR_RATE_HIGH');
  return { state: reasons.length ? 'open' : 'closed', reasons, metrics };
}

function datePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const hour = value.hour === '24' ? 0 : Number(value.hour);
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), hour, Number(value.minute), Number(value.second)) - date.getTime();
}

function zonedLocalToUtc({ year, month, day, hour, minute }, timeZone) {
  const guessed = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = guessed - timeZoneOffsetMs(new Date(guessed), timeZone);
  result = guessed - timeZoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

function parseTime(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || fallback));
  return { hour: Math.min(23, Number(match?.[1] || 0)), minute: Math.min(59, Number(match?.[2] || 0)) };
}

function nextBusinessWindow(now, timeZone, windowStart, windowEnd) {
  const start = parseTime(windowStart, '09:30');
  const end = parseTime(windowEnd, '16:30');
  let cursor = new Date(now);
  for (let offset = 0; offset < 8; offset += 1) {
    const parts = datePartsInZone(cursor, timeZone);
    if (!['Sat','Sun'].includes(parts.weekday)) {
      const date = { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: parts.weekday };
      const configuredStart = zonedLocalToUtc({ ...date, ...start }, timeZone);
      const endAt = zonedLocalToUtc({ ...date, ...end }, timeZone);
      // Never create a dry-run or future live plan in the past. A one-minute
      // lead also prevents a just-created plan from being immediately late.
      const earliest = new Date(now.getTime() + 60000);
      const startAt = configuredStart > earliest ? configuredStart : earliest;
      if (startAt <= endAt) return { date, startAt, endAt };
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  throw new Error('Unable to resolve a business sending window.');
}

function nextBusinessDate(now, timeZone) {
  return nextBusinessWindow(now, timeZone, '00:00', '23:59').date;
}

function planSendTimes({ count, now = new Date(), timeZone = 'America/New_York', windowStart = '09:30', windowEnd = '16:30', minimumSpacingSeconds = 600, seed = 'outbound' }) {
  const total = Math.max(0, Math.min(MAX_DAILY_SENDS, Math.trunc(Number(count) || 0)));
  if (!total) return [];
  const { date, startAt, endAt } = nextBusinessWindow(now, timeZone, windowStart, windowEnd);
  const availableSeconds = Math.max(0, Math.floor((endAt - startAt) / 1000));
  const spacing = Math.max(Number(minimumSpacingSeconds) || 600, total > 1 ? Math.floor(availableSeconds / (total - 1)) : 0);
  if (total > 1 && spacing * (total - 1) > availableSeconds) throw new Error('The daily limit cannot fit inside the configured sending window.');
  return Array.from({ length: total }, (_, index) => {
    const digest = crypto.createHash('sha256').update(`${seed}|${date.year}-${date.month}-${date.day}|${index}`).digest();
    const jitter = total === 1 ? Math.floor(availableSeconds / 2) : Math.min(Math.floor(spacing * 0.15), digest.readUInt16BE(0) % Math.max(1, Math.floor(spacing * 0.15)));
    return new Date(startAt.getTime() + ((index * spacing + jitter) * 1000)).toISOString();
  });
}

function assertLiveDeliveryRuntime({ runtime, controls, circuitBreaker }) {
  if (!PHASE_ALLOWS_LIVE_SENDING || runtime?.liveSendingAvailable !== true || controls?.liveSendingEnabled !== true) {
    const error = new Error('Live sending is code-locked.'); error.code = 'LIVE_SENDING_PHASE_LOCKED'; throw error;
  }
  if (controls.shadowModeEnabled || controls.emergencyPaused || circuitBreaker?.state === 'open') {
    const error = new Error('Delivery safety controls block sending.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  return true;
}

function assertLiveSendAllowed({ runtime, controls, message, contact, suppressions = [], circuitBreaker }) {
  assertLiveDeliveryRuntime({ runtime, controls, circuitBreaker });
  if (!message || message.generationStatus !== 'generated' || message.evidenceValidationStatus !== 'passed' || message.deliveryState !== 'ready') {
    const error = new Error('Message is not ready for delivery.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  if (!contact?.sendEligible || suppressions.length) {
    const error = new Error('Recipient is not eligible for delivery.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  return true;
}

function nextDeliveryRetry(attempt, now = new Date(), random = Math.random) {
  return new Date(now.getTime() + retryDelaySeconds(attempt, random) * 1000).toISOString();
}

module.exports = {
  MAX_DAILY_SENDS,
  rate,
  evaluateCircuitBreaker,
  datePartsInZone,
  timeZoneOffsetMs,
  zonedLocalToUtc,
  nextBusinessDate,
  nextBusinessWindow,
  planSendTimes,
  assertLiveDeliveryRuntime,
  assertLiveSendAllowed,
  nextDeliveryRetry,
};
