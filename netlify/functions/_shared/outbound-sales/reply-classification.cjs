'use strict';

const crypto = require('node:crypto');
const { cleanText, containsCredentialLikeText, containsInstructionInjection } = require('./personalization-contract.cjs');

const RULE_VERSION = 'reply-rules-v1';
const CLASSIFICATIONS = Object.freeze([
  'interested', 'quote_request', 'question', 'not_now', 'not_interested',
  'unsubscribe', 'out_of_office', 'wrong_contact', 'automatic_reply', 'unclear',
]);

const RULES = Object.freeze([
  ['unsubscribe', 0.995, /\b(?:unsubscribe|remove me|take me off|stop (?:emailing|sending)|do not (?:email|contact)|opt[ -]?out|no more emails)\b/i],
  ['wrong_contact', 0.97, /\b(?:wrong (?:person|contact|email)|no longer works? here|not the person|contact .{0,40} instead|you have the wrong)\b/i],
  ['out_of_office', 0.99, /\b(?:out of (?:the )?office|away from (?:the )?office|on (?:annual )?leave|vacation responder|return(?:ing)? on)\b/i],
  ['automatic_reply', 0.98, /\b(?:automatic reply|auto(?:matic)?[ -]?response|delivery status notification|undeliverable|mail delivery subsystem|message could not be delivered)\b/i],
  ['quote_request', 0.94, /\b(?:send|provide|need|like|want|request|prepare|share).{0,35}\b(?:quote|estimate|pricing|price|cost)\b|\b(?:quote|estimate|pricing).{0,35}\b(?:for|on|please)\b/i],
  ['not_interested', 0.96, /\b(?:not interested|no interest|we(?:'re| are) (?:all )?set|not a fit|please pass|we do not need|don\'?t need)\b/i],
  ['not_now', 0.91, /\b(?:not (?:right )?now|maybe later|check back|reach (?:back )?out|next (?:month|quarter|year|season)|after .{0,30}|circle back)\b/i],
  ['interested', 0.9, /\b(?:interested|sounds good|looks good|let'?s talk|tell me more|happy to discuss|please call|set up (?:a )?(?:call|meeting))\b/i],
]);

function stripQuotedReply(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').slice(0, 50000);
  const current = text
    .split(/\nOn .{3,200} wrote:\s*(?:\n|$)/i)[0]
    .split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0];
  return current
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .trim()
    .slice(0, 12000);
}

function normalizeReplyText({ subject, bodyText }) {
  return cleanText(`${subject || ''}\n${stripQuotedReply(bodyText)}`, 12000);
}

function isQuestion(text) {
  return /\?/.test(text) || /^(?:can|could|do|does|how|what|when|where|which|who|why|would|is|are)\b/i.test(text);
}

function classifyReply(input) {
  const text = normalizeReplyText(input || {});
  const reasons = [];
  if (!text) return { classification: 'unclear', confidence: 0, source: 'deterministic', reasons: ['empty_reply'], needsAI: false, ruleVersion: RULE_VERSION };

  for (const [classification, confidence, pattern] of RULES) {
    if (pattern.test(text)) {
      reasons.push(`matched_${classification}`);
      return { classification, confidence, source: 'deterministic', reasons, needsAI: false, ruleVersion: RULE_VERSION };
    }
  }
  if (isQuestion(text)) {
    return { classification: 'question', confidence: 0.86, source: 'deterministic', reasons: ['question_form'], needsAI: false, ruleVersion: RULE_VERSION };
  }
  return {
    classification: 'unclear', confidence: 0.35, source: 'deterministic',
    reasons: ['no_reliable_rule'], needsAI: true, ruleVersion: RULE_VERSION,
  };
}

function replyContentHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify({
    from: cleanText(input?.fromEmail, 320).toLowerCase(),
    subject: cleanText(input?.subject, 500),
    body: stripQuotedReply(input?.bodyText),
  })).digest('hex');
}

function suggestedResponseDraft(classification, context = {}) {
  const business = cleanText(context.businessName, 180) || 'your team';
  const signature = 'Best,\nBrandon\nBanners On The Fly';
  const drafts = {
    interested: `Thanks for getting back to me. I’d be glad to learn what ${business} has in mind and help with the next step. What banner size, quantity, and target date are you considering?\n\n${signature}`,
    quote_request: `Absolutely—I can help prepare a quote. Please send the approximate banner size, quantity, material preference if known, delivery ZIP code, and any artwork or deadline details.\n\n${signature}`,
    question: `Thanks for the question. I’ve flagged your message for a personal response so we can answer accurately without guessing.\n\n${signature}`,
    not_now: `Thanks for letting me know. I’ll leave things here for now. If banner or sign needs come up later, we’ll be happy to help.\n\n${signature}`,
  };
  const body = drafts[classification] || null;
  if (!body) return { status: 'not_requested', subject: null, body: null, reviewRequired: true };
  if (containsCredentialLikeText(body) || containsInstructionInjection(body)) {
    return { status: 'blocked', subject: null, body: null, reviewRequired: true };
  }
  return { status: 'deterministic', subject: `Re: ${cleanText(context.subject, 400).replace(/^\s*(?:re:\s*)+/i, '') || 'Your banner question'}`, body, reviewRequired: true };
}

module.exports = {
  RULE_VERSION,
  CLASSIFICATIONS,
  stripQuotedReply,
  normalizeReplyText,
  classifyReply,
  replyContentHash,
  suggestedResponseDraft,
};
