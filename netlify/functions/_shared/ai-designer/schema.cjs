'use strict';

const crypto = require('crypto');

const COPY_FIELDS = [
  'headline',
  'supportingText',
  'offer',
  'callToAction',
  'businessName',
  'phone',
  'website',
  'address',
  'date',
  'other',
];

const TEXT_LIMITS = {
  headline: 100,
  supportingText: 180,
  offer: 80,
  callToAction: 60,
  businessName: 100,
  phone: 40,
  website: 100,
  address: 140,
  date: 60,
  other: 180,
};

const BRIEF_LIMITS = {
  description: 1200,
  purpose: 120,
  targetAudience: 160,
  primaryMessage: 220,
  visualStyle: 100,
  brandPersonality: 100,
  colorPalette: 100,
  subjectMatter: 180,
  composition: 100,
  focalPoint: 140,
  usage: 40,
  viewingDistance: 60,
};

function sanitizeText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value, max) {
  return sanitizeText(value).slice(0, max);
}

function boundedText(value, max, field) {
  const cleaned = sanitizeText(value);
  if (cleaned.length > max) {
    const error = new Error(`${field} must be ${max} characters or fewer.`);
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  return cleaned;
}

function requireNumber(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const error = new Error(`${name} must be between ${min} and ${max}.`);
    error.code = 'INVALID_DIMENSIONS';
    throw error;
  }
  return Math.round(parsed * 100) / 100;
}

function normalizeCopy(copy = {}) {
  return Object.fromEntries(COPY_FIELDS.map((field) => [field, boundedText(copy[field], TEXT_LIMITS[field], field)]));
}

function requiredText(copy) {
  return COPY_FIELDS.map((field) => copy[field]).filter(Boolean);
}

function normalizeBrief(input = {}) {
  const widthIn = requireNumber(input.widthIn, 'Width', 6, 600);
  const heightIn = requireNumber(input.heightIn, 'Height', 6, 600);
  const description = boundedText(input.description, BRIEF_LIMITS.description, 'Description');
  if (!description) {
    const error = new Error('Describe the design you want before generating.');
    error.code = 'DESCRIPTION_REQUIRED';
    throw error;
  }

  const productType = ['banner', 'yard_sign', 'car_magnet'].includes(input.productType)
    ? input.productType
    : 'banner';
  const copy = normalizeCopy(input.copy);
  const textPosition = ['left', 'center', 'right'].includes(input.textPosition) ? input.textPosition : 'left';
  const logoPosition = ['upper-left', 'upper-right', 'lower-left', 'lower-right'].includes(input.logoPosition)
    ? input.logoPosition
    : 'upper-right';

  return {
    description,
    purpose: boundedText(input.purpose, BRIEF_LIMITS.purpose, 'Purpose') || 'Promote a business, offer, or event',
    targetAudience: boundedText(input.targetAudience, BRIEF_LIMITS.targetAudience, 'Target audience') || 'General local audience',
    primaryMessage: boundedText(input.primaryMessage, BRIEF_LIMITS.primaryMessage, 'Primary message') || copy.headline || description,
    visualStyle: boundedText(input.visualStyle, BRIEF_LIMITS.visualStyle, 'Visual style') || 'Clean and professional',
    brandPersonality: boundedText(input.brandPersonality, BRIEF_LIMITS.brandPersonality, 'Brand personality') || 'Confident and trustworthy',
    colorPalette: boundedText(input.colorPalette, BRIEF_LIMITS.colorPalette, 'Color palette') || 'High-contrast brand-appropriate colors',
    subjectMatter: boundedText(input.subjectMatter, BRIEF_LIMITS.subjectMatter, 'Subject matter') || description,
    composition: boundedText(input.composition, BRIEF_LIMITS.composition, 'Composition') || `${textPosition} text zone with a clear focal image`,
    focalPoint: boundedText(input.focalPoint, BRIEF_LIMITS.focalPoint, 'Focal point') || 'Primary subject and headline zone',
    usage: boundedText(input.usage, BRIEF_LIMITS.usage, 'Usage') || 'outdoor',
    viewingDistance: boundedText(input.viewingDistance, BRIEF_LIMITS.viewingDistance, 'Viewing distance') || '20–50 feet',
    widthIn,
    heightIn,
    aspectRatio: widthIn / heightIn,
    material: boundedText(input.material, 80, 'Material') || '13oz vinyl',
    quantity: Math.max(1, Math.min(999, Math.floor(Number(input.quantity) || 1))),
    productType,
    textPosition,
    logoPosition,
    copy,
    requiredText: requiredText(copy),
    safeZonePercent: 5,
    prohibitedElements: [
      'physical banner', 'mockup', 'grommets', 'eyelets', 'hardware', 'ropes', 'poles',
      'folds', 'ripples', 'installation scene', 'surrounding environment', 'frame', 'blank bars',
    ],
    flatArtworkOnly: true,
    noGrommets: true,
    fullTemplateFill: true,
    structured: input.structured === true,
  };
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

module.exports = {
  COPY_FIELDS,
  normalizeCopy,
  requiredText,
  normalizeBrief,
  cleanText,
  stableHash,
};
