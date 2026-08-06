'use strict';

const crypto = require('node:crypto');

const BASELINE_INDUSTRY_KEYWORDS = Object.freeze([
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
  const source = strategy?.length
    ? strategy
    : BASELINE_INDUSTRY_KEYWORDS.map((keyword) => ({ keyword, weight: 1, sampleSize: 0, recommendation: 'baseline' }));
  const safeLimit = Math.max(1, Math.min(5, Number(limit) || 3));
  return source
    .map((item) => ({
      ...item,
      // Efraimidis–Spirakis weighted sampling without replacement. The hash
      // makes the selection replayable for a given automation cycle.
      rank: -Math.log(deterministicUnit(`${seed}|${item.keyword}`)) / Math.max(0.000001, Number(item.weight) || 1),
    }))
    .sort((a, b) => a.rank - b.rank || a.keyword.localeCompare(b.keyword))
    .slice(0, safeLimit)
    .map((item) => item.keyword);
}

module.exports = {
  BASELINE_INDUSTRY_KEYWORDS,
  boundedKeyword,
  loadAppliedIndustryStrategy,
  deterministicUnit,
  selectProspectingKeywords,
};
