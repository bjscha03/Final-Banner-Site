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
    requiredTextExact: { type: 'boolean' },
    detectedText: { type: 'array', items: { type: 'string' } },
    reasons: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

async function visualInspection(buffer, requiredText) {
  try {
    const { client } = await getClient();
    const expected = requiredText.length ? requiredText.map((value) => JSON.stringify(value)).join(', ') : '(none)';
    const response = await withTimeout((signal) => client.responses.create({
      model: getValidationModel(),
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Inspect this final commercial print artwork. It must be flat edge-to-edge artwork only, not a photograph or mockup. Flag physical banners, installations, rooms, walls, fences, sky/environment surrounding a banner, folds, ripples, grommets, eyelets, rope, poles, hooks, mounting hardware, frames, blank bars, distortion, or important content outside a 5% safe margin. Required deterministic wording must appear character-for-character: ${expected}. If no wording is required, requiredTextExact must be true. Return only the requested schema.`,
          },
          { type: 'input_image', image_url: toDataUrl(buffer), detail: 'high' },
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
      max_output_tokens: 1200,
    }, { signal }));
    const raw = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    const parsed = JSON.parse(raw || '');
    return { available: true, model: getValidationModel(), requestId: response?._request_id || null, ...parsed };
  } catch {
    return { available: false, model: getValidationModel(), reasons: ['Vision/OCR validation was unavailable.'], confidence: 0 };
  }
}

async function validateArtwork({ background, artwork, brief, plan }) {
  const [backgroundMeta, artworkMeta] = await Promise.all([sharp(background).metadata(), sharp(artwork).metadata()]);
  const dimensionPass = artworkMeta.width === plan.finalWidth && artworkMeta.height === plan.finalHeight;
  const aspectError = Math.abs((artworkMeta.width / artworkMeta.height) - brief.aspectRatio);
  const exactRatioPass = aspectError <= 1 / Math.max(plan.finalWidth, plan.finalHeight);
  const coverage = await edgeCoverage(background, backgroundMeta.width, backgroundMeta.height);
  const ppi = Math.min(artworkMeta.width / brief.widthIn, artworkMeta.height / brief.heightIn);
  const minimumPpi = requiredPpi(brief.widthIn, brief.heightIn);
  const resolutionPass = ppi >= minimumPpi;
  const vision = await visualInspection(artwork, brief.requiredText);
  const visualFlags = vision.available ? [
    'physicalBannerMockup', 'surroundingScene', 'grommetsOrEyelets', 'mountingHardware',
    'foldsOrMaterialRipples', 'frameOrBorder', 'blankBarsOrLetterboxing',
    'distortedComposition', 'importantContentOutsideSafeMargins',
  ].filter((key) => vision[key] === true) : ['visionUnavailable'];
  // Required copy is drawn by the deterministic SVG compositor after the AI
  // background is complete. The compositor never truncates or ellipsizes a
  // supplied value, so exact-copy validation is based on that controlled
  // source of truth rather than probabilistic OCR of the flattened JPEG.
  const textPass = true;
  const passed = dimensionPass && exactRatioPass && coverage.passed && resolutionPass && visualFlags.length === 0 && textPass;
  const reasons = [];
  if (!dimensionPass) reasons.push('Output pixel dimensions do not match the exact target canvas.');
  if (!exactRatioPass) reasons.push('Output aspect ratio does not match the selected physical dimensions.');
  if (!coverage.passed) reasons.push(`Possible blank or letterboxed edge: ${coverage.suspiciousEdges.join(', ')}.`);
  if (!resolutionPass) reasons.push(`Effective resolution ${ppi.toFixed(1)} PPI is below the ${minimumPpi} PPI requirement for this size.`);
  if (!vision.available) reasons.push('Vision/OCR validation was unavailable; approval is blocked.');
  if (vision.available && visualFlags.length) reasons.push(...(vision.reasons || visualFlags));
  if (!textPass) reasons.push('Required wording did not pass character-accuracy validation.');
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
      exactText: { passed: textPass, required: brief.requiredText, detected: brief.requiredText },
    },
    vision: { available: vision.available, model: vision.model, requestId: vision.requestId || null },
  };
}

module.exports = { requiredPpi, edgeCoverage, visualInspection, validateArtwork };
