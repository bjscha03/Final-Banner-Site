'use strict';

const PROSPECT_STATUSES = Object.freeze([
  'discovered',
  'qualified',
  'rejected',
  'ready_for_outreach',
  'contacted',
  'replied',
  'interested',
  'quote_requested',
  'quote_sent',
  'won',
  'lost',
  'unsubscribed',
  'suppressed',
]);

const REPLY_CLASSIFICATIONS = Object.freeze([
  'interested',
  'quote_request',
  'question',
  'not_now',
  'not_interested',
  'unsubscribe',
  'out_of_office',
  'wrong_contact',
  'automatic_reply',
  'unclear',
]);

const LEAD_SCORE_FACTORS = Object.freeze([
  'industry',
  'business_type',
  'location_count',
  'upcoming_events',
  'hiring_or_expansion',
  'promotions_or_grand_openings',
  'real_estate_activity',
  'construction_activity',
  'community_or_event_activity',
  'visible_print_marketing_need',
  'contact_quality',
  'email_verification',
  'website_freshness',
  'prior_customer_or_suppression',
]);

const EXPERIMENT_DIMENSIONS = Object.freeze([
  'subject_line_style',
  'call_to_action_style',
  'email_length',
  'offer_framing',
  'industry_positioning',
]);

function isProspectStatus(value) {
  return PROSPECT_STATUSES.includes(value);
}

function isReplyClassification(value) {
  return REPLY_CLASSIFICATIONS.includes(value);
}

module.exports = {
  PROSPECT_STATUSES,
  REPLY_CLASSIFICATIONS,
  LEAD_SCORE_FACTORS,
  EXPERIMENT_DIMENSIONS,
  isProspectStatus,
  isReplyClassification,
};
