'use strict';

const sharp = require('sharp');
const { getClient, getValidationModel, withTimeout } = require('./provider.cjs');
const { toDataUrl } = require('./image-utils.cjs');

function requiredPpi(widthIn, heightIn) {
  const longest = Math.max(widthIn, heightIn);
  if (longest <= 24) return 100;
  if (longest <= 48) return 60;
  if (longest <= 96) return 40;
  return 30;
}

async function stripStats(buffer, width, height, side) {
  const strip = Math.max(2, Math.round(Math.min(width, height) * 0.015));
  const inner = Math.max(strip * 3, Math.round(Math.min(width, height) * 0.06));
  const regions = side === 'top'
    ? [{ left: 0, top: 0, width, height: strip }, { left: 0, top: inner, width, height: strip }]
    : side === 'bottom'
      ? [{ left: 0, top: height - strip, width, height: strip }, { left: 0, top: height - inner - strip, width, height: strip }]
      : side === 'left'
        ? [{ left: 0, top: 0, width: strip, height }, { left: inner, top: 0, width: strip, height }]
        : [{ left: width - strip, top: 0, width: strip, height }, { left: width - inner - strip, top: 0, width: strip, height }];
  const stats = await Promise.all(regions.map((region) => sharp(buffer).extract(region).stats()));
  const mean = (value) => value.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  const stdev = (value) => value.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  return { edgeMean: mean(stats[0]), innerMean: mean(stats[1]), edgeStd: stdev(stats[0]), innerStd: stdev(stats[1]) };
}

async function edgeCoverage(buffer, width, height) {
  const sides = ['top', 'right', 'bottom', 'left'];
  const results = await Promise.all(sides.map(async (side) => [side, await stripStats(buffer, width, height, side)]));
  const suspicious = results.filter(([, value]) => value.edgeStd < 3 && value.innerStd > 10 && Math.abs(value.edgeMean - value.innerMean) > 45).map(([side]) => side);
  return { passed: suspicious.length === 0, suspiciousEdges: suspicious };
}

function validationSchema() {
  const properties = {
    physicalBannerMockup: { type: 'boolean' },
    surroundingScene: { type: 'boolean' },
    grommetsOrEyelets: { type: 'boolean' },
    mountingHardware: { type: 'boolean' },
    foldsOrMaterialRipples: { type: 'boolean' },
    frameOrBorder: { type: 'boolean' },
    blankBarsOrLetterboxing: { type: 'boolean' },
    distortedComposition: { type: 'boolean' },
    importantContentOutsideSafeMargins: { type: 'boolean' },
    illegibleOrOverlappingText: { type: 'boolean' },
    requiredTextExact: { type: 'boolean' },
    unexpectedText: { type: 'boolean' },
    unexpectedTextSamples: { type: 'array', items: { type: 'string' } },
    logoMatchesReference: { type: 'boolean' },
    duplicateLogo: { type: 'boolean' },
    detectedText: { type: 'array', items: { type: 'string' } },
    reasons: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function matchesDetectedWording(required, detected) {
  if (!Array.isArray(detected)) return false;
  const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
  const sources = [...detected, detected.join(' ')].map(normalize);
  return required.every(text => {
    const expected = normalize(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${expected}(?=$|[^\\p{L}\\p{N}])`, 'u');
    return sources.some(source => pattern.test(source));
  });
}

async function visualInspection(buffer, requiredText, protectedRegions = [], logoReference = null, logoWording = [], bannerWording = requiredText) {
  try {
    const { client } = await getClient();
    const expected = requiredText.length ? requiredText.map((value) => JSON.stringify(value)).join(', ') : '(none)';
    const authorizedTextInstruction = `AUTHORIZED TEXT HAS TWO INDEPENDENT SOURCES. (A) Approved banner copy: ${JSON.stringify(bannerWording)}. This headline and other approved wording MUST appear in the artwork and is allowed even when completely absent from the source logo. (B) Original source-logo lettering: ${JSON.stringify(logoWording)}${logoReference?.buffer ? ', plus any other lettering actually visible in the supplied original logo' : ''}. Both A and B are authorized together; the logo is not the sole list of permitted banner wording. Never flag approved banner copy as an added brand claim merely because it is not inside the source logo. If unexpectedText=true, return unexpectedTextSamples containing every exact visible unauthorized phrase you flagged (not explanations); otherwise return an empty array.`;
    const response = await withTimeout((signal) => client.responses.create({
      model: getValidationModel(),
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${authorizedTextInstruction} Inspect the FIRST image as the final commercial print artwork. It must be flat edge-to-edge artwork only, not a photograph or mockup. Flag physical banners, installations, rooms, walls, fences, sky/environment surrounding a banner, folds, ripples, grommets, eyelets, rope, poles, hooks, mounting hardware, frames, blank bars, distortion, or important content outside a 5% safe margin. Flag illegibleOrOverlappingText if text overlaps other text or a logo, or has insufficient contrast to read. Required wording must preserve spelling, names, numbers and internal punctuation exactly. Artistic capitalization, line breaks and omitted sentence-ending periods are acceptable: ${expected}. If no wording is required, requiredTextExact must be true. Flag unexpectedText for invented taglines, unrelated labels, gibberish, signatures or watermarks outside the supplied original customer asset regions. Original customer assets may contain their own text: exempt these pixel rectangles from unexpectedText only: ${JSON.stringify(protectedRegions)}. ${logoReference?.buffer ? `The SECOND image is the original customer logo for comparison only, not another artwork to inspect. The final artwork must contain exactly ONE recognizable faithful integrated version of this logo, preserving its identity, key shapes, brand colors and all visible source lettering. Compare against the actual source image, including its small tagline. Source logo wording ${JSON.stringify(logoWording)} is required/allowed in the integrated logo, not an invented banner claim; any other wording actually visible in the original logo is also allowed. Do not count source-image text itself as detected artwork text. Set logoMatchesReference=false if the logo is missing or its identity/lettering is materially altered. Set duplicateLogo=true if the artwork contains multiple versions/copies of the logo. Adapted position, scale, or removal of plain source-image background is acceptable.` : 'No separate source logo comparison is requested: set logoMatchesReference=true and duplicateLogo=false.'} Decorative lettering effects are allowed when legible. Return only the requested schema.`,
          },
          { type: 'input_image', image_url: toDataUrl(buffer), detail: 'high' },
          ...(logoReference?.buffer ? [{ type: 'input_image', image_url: toDataUrl(logoReference.buffer, logoReference.mimeType), detail: 'high' }] : []),
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'flat_print_artwork_validation',
          strict: true,
          schema: validationSchema(),
        },
      },
      max_output_tokens: 4000,
      ...(getValidationModel() === 'gpt-5-mini' ? { reasoning: { effort: 'low' } } : {}),
    }, { signal, maxRetries: 0 }), 45000);
    const raw = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    const parsed = JSON.parse(raw || '');
    return { available: true, model: getValidationModel(), requestId: response?._request_id || null, ...parsed };
  } catch {
    return { available: false, model: getValidationModel(), reasons: ['Vision/OCR validation was unavailable.'], confidence: 0 };
  }
}

async function validateArtwork({ background, artwork, brief, plan, protectedRegions = [], logoReference = null, reuseVisualValidation = null }) {
  const integratedLogo = brief.logoRendering === 'integrated' && Boolean(logoReference?.buffer);
  const expectedText = [...new Set([...brief.requiredText, ...(integratedLogo ? brief.logoWording || [] : [])])];
  const [backgroundMeta, artworkMeta] = await Promise.all([sharp(background).metadata(), sharp(artwork).metadata()]);
  const dimensionPass = artworkMeta.width === plan.finalWidth && artworkMeta.height === plan.finalHeight;
  const aspectError = Math.abs((artworkMeta.width / artworkMeta.height) - brief.aspectRatio);
  const exactRatioPass = aspectError / brief.aspectRatio <= 1 / Math.min(plan.finalWidth, plan.finalHeight);
  const coverage = await edgeCoverage(background, backgroundMeta.width, backgroundMeta.height);
  const ppi = Math.min(artworkMeta.width / brief.widthIn, artworkMeta.height / brief.heightIn);
  const minimumPpi = requiredPpi(brief.widthIn, brief.heightIn);
  const resolutionPass = ppi >= minimumPpi;
  // Logo-only changes preserve every background and lettering pixel. Reuse the
  // preceding completed visual inspection so a size/position adjustment is a
  // quick deterministic composite, rather than another 45-second AI review.
  const reused = !integratedLogo && reuseVisualValidation?.passed === true && reuseVisualValidation?.vision?.available === true
    ? reuseVisualValidation
    : null;
  const vision = reused ? {
    available: true,
    model: reused.vision.model,
    requestId: reused.vision.requestId || null,
    confidence: reused.checks?.flatArtwork?.confidence || 0,
    requiredTextExact: reused.checks?.exactText?.passed === true,
    detectedText: reused.checks?.exactText?.detected || [],
    reasons: reused.reasons || [],
    ...Object.fromEntries((reused.checks?.flatArtwork?.flags || []).map((key) => [key, true])),
  } : await visualInspection(artwork, expectedText, protectedRegions, integratedLogo ? logoReference : null, brief.logoWording, brief.requiredText);
  // Reconcile only a demonstrable false alarm: every reported unauthorized
  // phrase must equal one approved phrase under the existing OCR normalization.
  // Missing samples, substrings, real extras, and every other flag stay blocked.
  if (vision.unexpectedText === true && Array.isArray(vision.unexpectedTextSamples) && vision.unexpectedTextSamples.length > 0
    && vision.unexpectedTextSamples.every(sample => typeof sample === 'string' && sample.trim() && expectedText.some(expected =>
      matchesDetectedWording([sample], [expected]) && matchesDetectedWording([expected], [sample])))) {
    vision.unexpectedText = false;
  }
  const visualFlags = vision.available ? [
    'physicalBannerMockup', 'surroundingScene', 'grommetsOrEyelets', 'mountingHardware',
    'foldsOrMaterialRipples', 'frameOrBorder', 'blankBarsOrLetterboxing',
    'distortedComposition', 'importantContentOutsideSafeMargins', 'illegibleOrOverlappingText',
    'unexpectedText',
  ].filter((key) => vision[key] === true) : ['visionUnavailable'];
  if (integratedLogo && vision.available && vision.logoMatchesReference !== true) visualFlags.push('logoMismatch');
  if (integratedLogo && vision.duplicateLogo === true) visualFlags.push('duplicateLogo');
  // Artistic lettering must pass independent visual wording inspection.
  // Legacy saved designs still use the exact-copy vector compositor.
  const textPass = brief.typographyMode === 'ai'
    ? vision.available && (vision.requiredTextExact === true || matchesDetectedWording(expectedText, vision.detectedText))
    : true;
  const passed = dimensionPass && exactRatioPass && coverage.passed && resolutionPass && visualFlags.length === 0 && textPass;
  const reasons = [];
  if (!dimensionPass) reasons.push('Output pixel dimensions do not match the exact target canvas.');
  if (!exactRatioPass) reasons.push('Output aspect ratio does not match the selected physical dimensions.');
  if (!coverage.passed) reasons.push(`Possible blank or letterboxed edge: ${coverage.suspiciousEdges.join(', ')}.`);
  if (!resolutionPass) reasons.push(`Effective resolution ${ppi.toFixed(1)} PPI is below the ${minimumPpi} PPI requirement for this size.`);
  if (!vision.available) reasons.push('Vision/OCR validation was unavailable; approval is blocked.');
  if (vision.available && visualFlags.length) reasons.push(...(vision.reasons || visualFlags));
  if (!textPass) reasons.push('Required wording did not pass character-accuracy validation.');
  if (visualFlags.includes('logoMismatch')) reasons.push('The integrated logo did not match the uploaded logo identity and wording.');
  if (visualFlags.includes('duplicateLogo')) reasons.push('The artwork contains more than one copy of the uploaded logo.');
  return {
    status: passed ? 'passed' : 'failed',
    passed,
    reasons,
    checks: {
      dimensions: { passed: dimensionPass, width: artworkMeta.width, height: artworkMeta.height, expectedWidth: plan.finalWidth, expectedHeight: plan.finalHeight },
      aspectRatio: { passed: exactRatioPass, requested: brief.aspectRatio, actual: artworkMeta.width / artworkMeta.height },
      edgeCoverage: coverage,
      resolution: { passed: resolutionPass, effectivePpi: Number(ppi.toFixed(1)), minimumPpi },
      flatArtwork: { passed: vision.available && visualFlags.length === 0, flags: visualFlags, confidence: vision.confidence || 0 },
      exactText: { passed: textPass, required: expectedText, detected: brief.typographyMode === 'ai' ? (vision.detectedText || []) : expectedText },
      ...(integratedLogo ? { logoIdentity: { passed: vision.available && vision.logoMatchesReference === true && vision.duplicateLogo !== true } } : {}),
    },
    vision: { available: vision.available, model: vision.model, requestId: vision.requestId || null },
  };
}

module.exports = { requiredPpi, edgeCoverage, visualInspection, validateArtwork, matchesDetectedWording };
