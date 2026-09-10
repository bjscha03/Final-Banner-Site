'use strict';

const QUALIFICATION_VERSION = 'deterministic-v1';
const QUALIFIED_SCORE = 45;

const INDUSTRY_RULES = Object.freeze([
  { pattern: /event|festival|conference|wedding|venue|entertainment|trade show/i, points: 15, label: 'Event-driven business' },
  { pattern: /school|education|academy|college|university|childcare/i, points: 14, label: 'Education organization' },
  { pattern: /church|ministry|religious|nonprofit|charity|foundation|community/i, points: 14, label: 'Community or nonprofit organization' },
  { pattern: /sport|athletic|fitness|recreation|league|club/i, points: 13, label: 'Sports or recreation organization' },
  { pattern: /construction|contractor|roofing|landscap|remodel|builder|developer/i, points: 13, label: 'Construction or property-improvement business' },
  { pattern: /real estate|realty|realtor|property|leasing/i, points: 12, label: 'Real-estate business' },
  { pattern: /restaurant|retail|automotive|dealership|hospitality|hotel|brewery|salon/i, points: 10, label: 'Location-based consumer business' },
  { pattern: /health|medical|dental|clinic|professional service/i, points: 7, label: 'Local service organization' },
]);

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function explanation(factor, points, label, detail, sourceUrls = []) {
  return { factor, points, label, detail, sourceUrls: [...new Set(sourceUrls.filter(Boolean))].slice(0, 10) };
}

function strongestContact(contacts = []) {
  return [...contacts].sort((left, right) => (right.contactQualityScore || 0) - (left.contactQualityScore || 0))[0] || null;
}

function signalMap(research) {
  return new Map((research?.bannerNeedSignals || []).map((signal) => [signal.code, signal]));
}

function scoreLead({ prospect = {}, research = {}, contacts = [], exclusions = [] }) {
  const hardExclusions = exclusions.filter((entry) => entry?.hard !== false);
  if (hardExclusions.length) {
    const reasons = hardExclusions.map((entry) => entry.code);
    return Object.freeze({
      qualificationVersion: QUALIFICATION_VERSION,
      score: 0,
      status: 'suppressed',
      qualified: false,
      outreachCandidate: false,
      breakdown: { prior_customer_or_suppression: -100 },
      explanations: hardExclusions.map((entry) => explanation(
        'prior_customer_or_suppression', -100, 'Hard exclusion', entry.detail || entry.code,
      )),
      evidence: [],
      rejectionReasons: [],
      exclusionCodes: reasons,
      suppressionReason: reasons.join(', '),
    });
  }

  const breakdown = {};
  const explanations = [];
  const evidence = [];
  const add = (factor, points, label, detail, sources = []) => {
    if (!points) return;
    breakdown[factor] = (breakdown[factor] || 0) + points;
    explanations.push(explanation(factor, points, label, detail, sources));
  };

  const industryText = `${prospect.industry || ''} ${prospect.businessType || ''} ${prospect.providerMetadata?.keywords?.join?.(' ') || ''}`;
  const industryRule = INDUSTRY_RULES.find((rule) => rule.pattern.test(industryText));
  if (industryRule) add('industry', industryRule.points, industryRule.label, `Matched disclosed industry or business type: ${industryText.trim().slice(0, 180)}`);

  const locations = Number(prospect.locationCount || research?.extractedFacts?.inferredLocationCount || 0);
  const locationPoints = locations >= 10 ? 8 : locations >= 4 ? 6 : locations >= 2 ? 4 : locations === 1 ? 2 : 0;
  if (locationPoints) add('location_count', locationPoints, 'Multiple physical locations', `${locations} public location${locations === 1 ? '' : 's'} identified.`);

  const employees = Number(prospect.providerMetadata?.estimatedEmployees || 0);
  const employeePoints = employees >= 250 ? 10 : employees >= 75 ? 8 : employees >= 20 ? 6 : employees >= 5 ? 3 : 0;
  if (employeePoints) add('company_scale', employeePoints, 'Established company scale', `${employees} estimated employees were supplied by the licensed company-data source.`);

  const revenue = Number(prospect.providerMetadata?.revenue || 0);
  const revenuePoints = revenue >= 25_000_000 ? 10 : revenue >= 5_000_000 ? 8 : revenue >= 1_000_000 ? 5 : 0;
  if (revenuePoints) add('company_revenue', revenuePoints, 'Meaningful operating scale', 'Licensed company data indicates sufficient operating scale for recurring print needs.');

  const growth = Number(prospect.providerMetadata?.sixMonthHeadcountGrowth || prospect.providerMetadata?.twelveMonthHeadcountGrowth || 0);
  const growthPoints = growth >= 0.2 ? 5 : growth >= 0.08 ? 3 : 0;
  if (growthPoints) add('company_growth', growthPoints, 'Company growth signal', 'Licensed company data indicates recent headcount growth.');

  const signals = signalMap(research);
  const signalWeights = {
    upcoming_events: 10,
    hiring_or_expansion: 8,
    promotions_or_grand_openings: 8,
    real_estate_activity: 7,
    construction_activity: 8,
    community_or_event_activity: 8,
    visible_print_marketing_need: 15,
  };
  for (const [code, points] of Object.entries(signalWeights)) {
    const signal = signals.get(code);
    if (!signal) continue;
    add(code, points, signal.label || code, signal.evidence || 'Evidence identified on the public website.', [signal.sourceUrl]);
    evidence.push({ code, sourceUrl: signal.sourceUrl, evidence: signal.evidence });
  }

  const contact = strongestContact(contacts);
  if (contact) {
    const qualityPoints = contact.contactQualityScore >= 75 ? 8 : contact.contactQualityScore >= 55 ? 5 : contact.contactQualityScore >= 30 ? 2 : 0;
    add('contact_quality', qualityPoints, 'Public contact quality', `Best public email quality score: ${contact.contactQualityScore || 0}/100.`, [contact.sourceUrl]);
    if (contact.mxStatus === 'present') add('email_verification', 5, 'MX record present', 'The public email domain publishes an MX record; mailbox-level verification remains pending.', [contact.sourceUrl]);
    if (contact.verificationStatus === 'valid') add('licensed_contact_verification', 5, 'Verified work contact', 'A licensed contact-data provider marked the work email as verified; DNS and company-domain checks were also repeated locally.', [contact.sourceUrl]);
  }

  const freshness = Number(research.websiteFreshnessScore || 0);
  const freshnessPoints = freshness >= 80 ? 5 : freshness >= 50 ? 3 : freshness >= 20 ? 1 : 0;
  if (freshnessPoints) add('website_freshness', freshnessPoints, 'Website freshness', `Deterministic freshness score: ${freshness}/100.`, research.sourceUrls || []);

  const score = clampScore(Object.values(breakdown).reduce((sum, points) => sum + points, 0));
  const rejectionReasons = [];
  if (!prospect.websiteUrl) rejectionReasons.push('NO_PUBLIC_WEBSITE');
  if (!research.contentHash) rejectionReasons.push('WEBSITE_RESEARCH_UNAVAILABLE');
  if (score < QUALIFIED_SCORE) rejectionReasons.push('LEAD_SCORE_BELOW_THRESHOLD');
  if (!contact) rejectionReasons.push('NO_PUBLIC_BUSINESS_EMAIL');
  else if (!contact.syntaxValid || ['missing', 'null_mx'].includes(contact.mxStatus)) rejectionReasons.push('NO_VALID_PUBLIC_BUSINESS_EMAIL');
  else if (contact.isRoleAddress) rejectionReasons.push('ROLE_ADDRESS_ONLY');
  else if (contact.isFreeMailbox || !contact.domainMatches) rejectionReasons.push('CONTACT_DOMAIN_MISMATCH');
  else if (contact.mxStatus !== 'present') rejectionReasons.push('EMAIL_DNS_UNCONFIRMED');

  const qualified = score >= QUALIFIED_SCORE && Boolean(research.contentHash);
  const ready = qualified && rejectionReasons.length === 0;
  return Object.freeze({
    qualificationVersion: QUALIFICATION_VERSION,
    score,
    status: ready ? 'ready_for_outreach' : qualified ? 'qualified' : 'rejected',
    qualified,
    outreachCandidate: ready,
    breakdown,
    explanations,
    evidence,
    rejectionReasons,
    exclusionCodes: [],
    suppressionReason: null,
  });
}

module.exports = {
  QUALIFICATION_VERSION,
  QUALIFIED_SCORE,
  INDUSTRY_RULES,
  clampScore,
  scoreLead,
};
