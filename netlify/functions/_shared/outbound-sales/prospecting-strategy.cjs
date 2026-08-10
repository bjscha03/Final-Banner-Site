'use strict';

const crypto = require('node:crypto');

const EVENT_FIRST_INDUSTRY_KEYWORDS = Object.freeze([
  'trade show organizers',
  'conference and convention organizers',
  'exhibition services',
  'event production companies',
  'convention centers',
  'festival organizers',
  'sports tournament organizers',
]);

const BASELINE_INDUSTRY_KEYWORDS = Object.freeze([
  ...EVENT_FIRST_INDUSTRY_KEYWORDS,
  'schools',
  'churches',
  'construction',
  'real estate',
  'sports organizations',
  'event venues',
  'restaurants',
  'retail stores',
  'nonprofit organizations',
]);

function boundedKeyword(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 &/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

async function loadAppliedIndustryStrategy(sql) {
  const rows = await sql(
    `SELECT DISTINCT ON (dimension_key)
            dimension_key,recommendation,recommended_weight,sample_size,applied_at
       FROM outbound_learning_recommendations
      WHERE dimension_type='industry' AND status='applied'
      ORDER BY dimension_key,applied_at DESC NULLS LAST,created_at DESC`,
  );
  return rows.map((row) => ({
    keyword: boundedKeyword(row.dimension_key),
    recommendation: row.recommendation,
    weight: Math.max(0, Number(row.recommended_weight) || 0),
    sampleSize: Math.max(0, Number(row.sample_size) || 0),
  })).filter((row) => row.keyword && row.recommendation !== 'pause' && row.weight > 0 && row.sampleSize >= 30);
}

function deterministicUnit(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  return (digest.readUInt32BE(0) + 1) / 0x100000001;
}

function selectProspectingKeywords(strategy, { seed = 'outbound', limit = 3 } = {}) {
  const safeLimit = Math.max(1, Math.min(5, Number(limit) || 3));
  const learned = Array.isArray(strategy) && strategy.length > 0;
  const source = learned
    ? strategy
    : BASELINE_INDUSTRY_KEYWORDS.map((keyword) => ({ keyword, weight: 1, sampleSize: 0, recommendation: 'baseline' }));
  const ranked = source
    .map((item) => ({
      ...item,
      // Efraimidis–Spirakis weighted sampling without replacement. The hash
      // makes the selection replayable for a given automation cycle.
      rank: -Math.log(deterministicUnit(`${seed}|${item.keyword}`)) / Math.max(0.000001, Number(item.weight) || 1),
    }))
    .sort((a, b) => a.rank - b.rank || a.keyword.localeCompare(b.keyword))
    .map((item) => item.keyword);
  if (learned) return ranked.slice(0, safeLimit);
  // Until outcome-backed learning has enough sample, reserve one slot per
  // discovery cycle for companies most likely to have an upcoming exhibitor,
  // conference, expo, festival, or tournament banner need.
  const eventIndex = Math.floor(deterministicUnit(`${seed}|event-first`) * EVENT_FIRST_INDUSTRY_KEYWORDS.length);
  const eventKeyword = EVENT_FIRST_INDUSTRY_KEYWORDS[Math.min(EVENT_FIRST_INDUSTRY_KEYWORDS.length - 1, eventIndex)];
  return [eventKeyword, ...ranked.filter((keyword) => keyword !== eventKeyword)].slice(0, safeLimit);
}

module.exports = {
  EVENT_FIRST_INDUSTRY_KEYWORDS,
  BASELINE_INDUSTRY_KEYWORDS,
  boundedKeyword,
  loadAppliedIndustryStrategy,
  deterministicUnit,
  selectProspectingKeywords,
};
