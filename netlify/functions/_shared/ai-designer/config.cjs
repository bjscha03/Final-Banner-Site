'use strict';

const MODEL_ALIAS = 'gpt-image-2';
const MODEL_SNAPSHOT = 'gpt-image-2-2026-04-21';
const ALLOWED_IMAGE_MODELS = new Set([MODEL_ALIAS, MODEL_SNAPSHOT]);
const FLAT_ARTWORK_CONSTRAINT = [
  'Create only flat, edge-to-edge commercial print artwork.',
  'Do not create a physical banner, banner mockup, product photograph, installation scene, wall, fence, storefront, room, table, building, sky, grass, hands, pole, rope, hooks, clips, stands, mounting hardware, fabric folds, vinyl ripples, grommets, eyelets, hems, rulers, crop marks, safe-zone marks, measurement marks, shadows that imply a physical object, blank bars, letterboxing, or a surrounding environment.',
  'Do not place the artwork inside a frame or floating canvas. Output only the final flat artwork.',
].join(' ');

function isEnabled() {
  return process.env.AI_DESIGNER_ENABLED === 'true';
}

function getImageModel() {
  const configured = String(process.env.OPENAI_IMAGE_MODEL || MODEL_SNAPSHOT).trim();
  if (!ALLOWED_IMAGE_MODELS.has(configured)) {
    const error = new Error('The configured image model is not an approved GPT Image 2 model.');
    error.code = 'UNAPPROVED_IMAGE_MODEL';
    throw error;
  }
  return configured;
}

function getValidationModel() {
  return String(process.env.OPENAI_IMAGE_VALIDATION_MODEL || 'gpt-5-mini').trim();
}

function getMaxConcepts() {
  const configured = Number(process.env.AI_DESIGNER_MAX_CONCEPTS || 1);
  return Math.max(1, Math.min(3, Number.isFinite(configured) ? Math.floor(configured) : 1));
}

function getTimeoutMs() {
  const configured = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 115000);
  return Math.max(15000, Math.min(118000, Number.isFinite(configured) ? configured : 115000));
}

module.exports = {
  MODEL_ALIAS,
  MODEL_SNAPSHOT,
  ALLOWED_IMAGE_MODELS,
  FLAT_ARTWORK_CONSTRAINT,
  isEnabled,
  getImageModel,
  getValidationModel,
  getMaxConcepts,
  getTimeoutMs,
};
