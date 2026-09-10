'use strict';

const crypto = require('crypto');

const TOKEN_CONTEXT = 'bof-marketing-unsubscribe-v1';
const TOKEN_PATTERN = /^p1\.[A-Za-z0-9_-]{43}$/;
const DEFAULT_SITE_ORIGIN = 'https://bannersonthefly.com';

function configuredSecret(env = process.env) {
  return String(
    env.MARKETING_EMAIL_TOKEN_SECRET
      || env.RECOVERY_EMAIL_TOKEN_SECRET
      || env.AUTH_SESSION_SECRET
      || env.CLOUDINARY_API_SECRET
      || '',
  ).trim();
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeCampaign(value) {
  const campaign = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,79}$/.test(campaign) ? campaign : null;
}

function createMarketingUnsubscribeToken(emailValue, campaignValue, options = {}) {
  const email = normalizeEmail(emailValue);
  const campaign = normalizeCampaign(campaignValue);
  const secret = String(options.secret || configuredSecret(options.env)).trim();
  if (!email || !campaign) throw new Error('A valid email and campaign are required');
  if (!secret) throw new Error('MARKETING_EMAIL_TOKEN_SECRET is not configured');
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${TOKEN_CONTEXT}\0${campaign}\0${email}`)
    .digest('base64url');
  return `p1.${digest}`;
}

function hashMarketingUnsubscribeToken(token) {
  if (!TOKEN_PATTERN.test(String(token || ''))) throw new Error('A valid unsubscribe token is required');
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function publicSiteOrigin(env = process.env) {
  for (const candidate of [env.PUBLIC_SITE_URL, env.URL, DEFAULT_SITE_ORIGIN]) {
    try {
      const url = new URL(String(candidate || ''));
      if (url.protocol === 'https:') return url.origin;
    } catch {
      // Try the next configured origin.
    }
  }
  return DEFAULT_SITE_ORIGIN;
}

function buildMarketingUnsubscribeUrl(token, env = process.env) {
  if (!TOKEN_PATTERN.test(String(token || ''))) throw new Error('A valid unsubscribe token is required');
  return `${publicSiteOrigin(env)}/.netlify/functions/marketing-email-unsubscribe?token=${encodeURIComponent(token)}`;
}

module.exports = {
  TOKEN_PATTERN,
  buildMarketingUnsubscribeUrl,
  configuredSecret,
  createMarketingUnsubscribeToken,
  hashMarketingUnsubscribeToken,
  normalizeCampaign,
  normalizeEmail,
  publicSiteOrigin,
};
