'use strict';

const { FLAT_ARTWORK_CONSTRAINT } = require('./config.cjs');

function textZoneInstruction(position) {
  if (position === 'right') return 'Reserve a clean, low-detail negative-space zone on the right 48% of the composition for deterministic typography.';
  if (position === 'center') return 'Reserve a clean, low-detail central zone for deterministic typography while keeping supporting imagery around it.';
  return 'Reserve a clean, low-detail negative-space zone on the left 48% of the composition for deterministic typography.';
}

function extremeRatioInstruction(plan, mode = 'edit') {
  if (plan.strategy !== 'gpt-image-2-outpainting') return '';
  if (mode === 'generation') {
    return `This is the nearest-native core composition for an extreme final ratio. Keep every important subject, typography zone, logo zone, and focal element comfortably inside the composition. The complete core will be preserved and extended in a separate masked GPT Image 2 outpainting pass for the exact ${plan.finalWidth}×${plan.finalHeight} canvas.`;
  }
  return `This extreme ratio exceeds the provider's single-image native ratio. Use masked outpainting to extend the supplied composition into all transparent areas. Preserve every original subject and the complete original composition inside the conceptual safe corridor — ${plan.safeCorridor}. Continue only coherent background, texture, and supporting decorative content into the outpainted area so the final ${plan.finalWidth}×${plan.finalHeight} extraction loses no important content and has no stretching, padding, seams, or blank bars.`;
}

function buildGenerationPrompt(brief, plan, variationIndex = 0) {
  return [
    FLAT_ARTWORK_CONSTRAINT,
    'Create the imagery, background, supporting graphics, and professional visual direction for a large-format commercial print design.',
    'Do not render words, letters, numbers, logos, fake copy, placeholder copy, gibberish typography, or watermarks. Exact customer wording and logos are added afterward as deterministic layers.',
    `Final physical dimensions: ${brief.widthIn} inches wide by ${brief.heightIn} inches high. Exact aspect ratio: ${brief.aspectRatio.toFixed(6)}:1. The printable background must extend fully to all four edges.`,
    textZoneInstruction(brief.textPosition),
    extremeRatioInstruction(plan, 'generation'),
    `Purpose: ${brief.purpose}.`,
    `Audience: ${brief.targetAudience}.`,
    `Primary message and creative intent: ${brief.primaryMessage}.`,
    `Visual style: ${brief.visualStyle}. Brand personality: ${brief.brandPersonality}.`,
    `Color palette: ${brief.colorPalette}. Subject matter: ${brief.subjectMatter}.`,
    `Composition: ${brief.composition}. Desired focal point: ${brief.focalPoint}.`,
    `Usage: ${brief.usage}; expected viewing distance: ${brief.viewingDistance}.`,
    'Use strong visual hierarchy, high contrast, large-format readability, clean typography zones, and safe internal margins. Keep important subjects at least 5% from every edge.',
    `Create a distinct professional direction ${variationIndex + 1}; avoid the generic glossy AI-art look.`,
  ].filter(Boolean).join('\n');
}

function buildEditPrompt(brief, plan, instruction) {
  return [
    FLAT_ARTWORK_CONSTRAINT,
    `Edit the supplied current flat artwork background. Requested change: ${instruction}.`,
    'Keep every unrelated visual element as unchanged as technically possible. Preserve composition, focal subject, negative-space typography zone, edge-to-edge background coverage, and overall brand character.',
    'Do not add any words, letters, numbers, logos, fake copy, placeholder copy, or watermarks. Exact customer wording and logos remain separate deterministic layers.',
    `Preserve the final physical ratio ${brief.widthIn}:${brief.heightIn} (${brief.aspectRatio.toFixed(6)}:1).`,
    textZoneInstruction(brief.textPosition),
    extremeRatioInstruction(plan),
    'Do not introduce a mockup, physical banner, grommets, eyelets, folds, hardware, surrounding scene, frame, blank bars, or letterboxing.',
  ].filter(Boolean).join('\n');
}

function buildRepairPrompt(brief, plan, failures) {
  return [
    FLAT_ARTWORK_CONSTRAINT,
    'Repair the supplied image while preserving its intended theme and all compliant visual elements.',
    `Remove or correct these validation failures: ${failures.join('; ')}.`,
    `Return an edge-to-edge ${brief.aspectRatio.toFixed(6)}:1 composition with the essential subject inside safe margins.`,
    textZoneInstruction(brief.textPosition),
    extremeRatioInstruction(plan),
    'Do not render text or logos; those are applied separately.',
  ].filter(Boolean).join('\n');
}

module.exports = { buildGenerationPrompt, buildEditPrompt, buildRepairPrompt };
