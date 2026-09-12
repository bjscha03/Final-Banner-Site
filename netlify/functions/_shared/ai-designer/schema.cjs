'use strict';

const crypto = require('crypto');
const { normalizeLayers } = require('./layers.cjs');

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

const DIRECTION_FIELDS = ['purpose', 'targetAudience', 'visualStyle', 'brandPersonality', 'colorPalette', 'subjectMatter', 'composition', 'focalPoint', 'viewingDistance', 'textPosition', 'textColor', 'accentColor'];

function normalizeDirectionOverrides(input = {}) {
  return Object.fromEntries(DIRECTION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input || {}, field)).map(field => [field,
    boundedText(input[field], BRIEF_LIMITS[field] || 20, field),
  ]));
}

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
    typographyMode: input.typographyMode === 'ai' ? 'ai' : 'layers',
    logoPosition,
    logoRendering: input.logoRendering === 'integrated' ? 'integrated' : 'original',
    logoWording: Array.isArray(input.logoWording) ? [...new Set(input.logoWording.slice(0, 12).map(value => boundedText(value, 180, 'Logo wording')).filter(Boolean))] : [],
    layers: normalizeLayers(input.layers),
    textColor: /^#[a-f0-9]{6}$/i.test(input.textColor || '') ? input.textColor : '#ffffff',
    accentColor: /^#[a-f0-9]{6}$/i.test(input.accentColor || '') ? input.accentColor : '#f97316',
    copy,
    copyOverrides: Object.fromEntries(COPY_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input.copyOverrides || {}, field)).map(field => [field, boundedText(input.copyOverrides[field], TEXT_LIMITS[field], field)])),
    directionOverrides: normalizeDirectionOverrides(input.directionOverrides),
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

function validateImprovedPrompt(value, exactWording = []) {
  const prompt = sanitizeText(value);
  if (!prompt || prompt.length > 1200 || exactWording.some(text => !prompt.includes(text))) {
    const error = new Error('The improved prompt did not preserve all of your wording. Your original prompt is unchanged; please try again.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  return prompt;
}

function fitInterpretedDirection(input = {}) {
  // Only internal art-direction summaries may be shortened. Never truncate
  // the customer's description, improved prompt, or exact printed wording.
  const result = { ...input };
  for (const [key, limit] of Object.entries(BRIEF_LIMITS)) {
    if (key !== 'description' && typeof result[key] === 'string') {
      const cleaned = sanitizeText(result[key]);
      result[key] = cleaned.length > limit ? cleaned.slice(0, limit).replace(/\s+\S*$/, '').replace(/[ ,;:–—-]+$/, '') : cleaned;
    }
  }
  return result;
}

// Prompt rewriting starts from the current request, not inferred metadata from
// a previously selected design. Explicit customer wording remains authoritative.
function freshPromptBrief(input) {
  const directionOverrides = normalizeDirectionOverrides(input.directionOverrides);
  return normalizeBrief({
    productType: input.productType, widthIn: input.widthIn, heightIn: input.heightIn,
    material: input.material, quantity: input.quantity, usage: input.usage,
    description: input.description, copy: input.copyOverrides || {},
    copyOverrides: input.copyOverrides || {}, logoPosition: input.logoPosition, logoRendering: input.logoRendering,
    ...directionOverrides, directionOverrides, structured: false,
  });
}

function groundedCopy(candidate, brief) {
  // Treat possessives as a separate token so a request such as "Makenzie's
  // season" grounds the exact headline "Makenzie" instead of discarding it.
  const normalize = value => sanitizeText(value).normalize('NFKC').toLowerCase().replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const source = ` ${normalize(brief.description)} `;
  return Object.fromEntries(COPY_FIELDS.map(field => {
    if (Object.prototype.hasOwnProperty.call(brief.copyOverrides, field)) return [field, brief.copyOverrides[field]];
    const value = boundedText(candidate?.[field], TEXT_LIMITS[field], field);
    const wording = normalize(value);
    // Art direction and imagery are not evidence for commercial claims. Only
    // the actual customer request or explicit exact-copy fields may print.
    const birthdayHeadline = field === 'headline' && /\bbirthday\b/.test(source) && /^happy birthday(?: .+)?$/.test(wording)
      && wording.replace(/^happy birthday\s*/, '').split(' ').filter(Boolean).every(word => source.includes(` ${word} `));
    return [field, wording && (source.includes(` ${wording} `) || birthdayHeadline) ? value : ''];
  }));
}

function buildImprovedPrompt(candidate, brief) {
  try { return validateImprovedPrompt(candidate, brief.requiredText); } catch {
    // A verbose or imperfect prose rewrite must not require another paid call.
    // Assemble the same AI art direction around the approved exact wording.
    let prompt = brief.requiredText.length
      ? `Create a finished banner. Use exactly this wording: ${brief.requiredText.map(text => JSON.stringify(text)).join('; ')}.`
      : 'Create a finished banner with no written words, letters, or placeholder text.';
    for (const sentence of [
      `Theme and imagery: ${brief.subjectMatter}.`,
      `Visual style: ${brief.visualStyle}.`,
      `Colors: ${brief.colorPalette}.`,
      `Make ${brief.focalPoint} the focal point.`,
      'Integrate expressive, theme-appropriate lettering with the artwork. Keep it readable with strong hierarchy and safe margins. Fill the canvas edge to edge.',
    ]) {
      if (`${prompt} ${sentence}`.length <= 1200) prompt += ` ${sentence}`;
    }
    return validateImprovedPrompt(prompt, brief.requiredText);
  }
}

module.exports = {
  COPY_FIELDS,
  normalizeCopy,
  requiredText,
  normalizeBrief,
  cleanText,
  stableHash,
  validateImprovedPrompt,
  fitInterpretedDirection,
  buildImprovedPrompt,
  freshPromptBrief,
  groundedCopy,
};
