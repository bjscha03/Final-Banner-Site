'use strict';

const crypto = require('crypto');
const { isEnabled, getImageModel, getValidationModel, getMaxConcepts, MODEL_SNAPSHOT } = require('./config.cjs');
const { normalizeBrief, cleanText, stableHash } = require('./schema.cjs');
const { planCanvas, parseDataImage, validateInputImage, normalizeBackground, prepareOutpaintInput } = require('./image-utils.cjs');
const { buildGenerationPrompt, buildEditPrompt, buildRepairPrompt } = require('./prompt.cjs');
const { verifyModelAccess, generateImage, editImage, structureCreativeBrief } = require('./provider.cjs');
const { compositeArtwork } = require('./compositor.cjs');
const { validateArtwork } = require('./validation.cjs');
const { isTemporaryStorageConfigured, storeTemporaryArtwork, readTemporaryArtwork } = require('./storage.cjs');
const { json, authorize, enforceBodyLimit, rateLimit, idempotencyKey, runIdempotent, safeError } = require('./security.cjs');

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    const error = new Error('Invalid JSON request.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
}

function ensureConfigured(event) {
  if (!isEnabled(event?.netlify?.deployContext) || !process.env.OPENAI_API_KEY || !isTemporaryStorageConfigured()) {
    const error = new Error('AI designer is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  return getImageModel();
}

function providerUser(session) {
  return crypto.createHash('sha256').update(String(session.sub || 'admin')).digest('hex').slice(0, 64);
}

function estimateImageCost(results) {
  const total = results.reduce((sum, result) => {
    const usage = result?.usage;
    if (!usage) return sum;
    const inputImage = Number(usage.input_tokens_details?.image_tokens || 0);
    const inputText = Number(usage.input_tokens_details?.text_tokens || Math.max(0, Number(usage.input_tokens || 0) - inputImage));
    const outputImage = Number(usage.output_tokens_details?.image_tokens || usage.output_tokens || 0);
    return sum + (inputImage * 8 + inputText * 5 + outputImage * 30) / 1_000_000;
  }, 0);
  return results.some((result) => result?.usage) ? Number(total.toFixed(6)) : null;
}

function publicBrief(brief) {
  return {
    ...brief,
    requiredTextHash: stableHash(brief.requiredText),
  };
}

function conceptPayload({ id, versionId, generationId, backgroundRef, artwork, brief, plan, validation, model, requestId, durationMs, textLayers, logoLayer, repaired, usage, estimatedCostUsd }) {
  return {
    id,
    versionId,
    generationId,
    backgroundRef,
    imageBase64: artwork.toString('base64'),
    mimeType: 'image/jpeg',
    widthPx: plan.finalWidth,
    heightPx: plan.finalHeight,
    widthIn: brief.widthIn,
    heightIn: brief.heightIn,
    aspectRatio: brief.aspectRatio,
    validation,
    printReady: validation.passed,
    textLayers,
    logoLayer,
    diagnostics: {
      model,
      modelSnapshot: model === MODEL_SNAPSHOT ? MODEL_SNAPSHOT : null,
      providerRequestId: requestId,
      durationMs,
      outputDimensions: `${plan.finalWidth}x${plan.finalHeight}`,
      requestedAspectRatio: brief.aspectRatio,
      finalAspectRatio: plan.finalWidth / plan.finalHeight,
      ratioStrategy: plan.strategy,
      repaired,
      usage: usage || null,
      estimatedCostUsd,
    },
  };
}

async function prepareInputs(body) {
  const brief = normalizeBrief(body.brief || body);
  brief.textColor = /^#[0-9a-f]{6}$/i.test(body?.brief?.textColor || '') ? body.brief.textColor : '#ffffff';
  brief.accentColor = /^#[0-9a-f]{6}$/i.test(body?.brief?.accentColor || '') ? body.brief.accentColor : '#f97316';
  const plan = planCanvas(brief.widthIn, brief.heightIn);
  brief.outputWidthPx = plan.finalWidth;
  brief.outputHeightPx = plan.finalHeight;
  const reference = await validateInputImage(parseDataImage(body.referenceImage, 3 * 1024 * 1024));
  const logo = await validateInputImage(parseDataImage(body.logoImage, 2 * 1024 * 1024), 12_000_000);
  return { brief, plan, reference, logo };
}

async function briefHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
  const auth = authorize(event);
  if (auth.response) return auth.response;
  const sizeError = enforceBodyLimit(event, 100 * 1024);
  if (sizeError) return sizeError;
  const limited = rateLimit(event, auth.session, 'brief', 20, 10 * 60 * 1000);
  if (limited) return limited;
  try {
    ensureConfigured(event);
    const body = parseBody(event);
    const key = idempotencyKey(event, body, auth.session, 'brief');
    return await runIdempotent(key, async () => {
      const current = normalizeBrief({ ...(body.brief || body), structured: false });
      const interpreted = await structureCreativeBrief({
        description: current.description,
        current: {
          purpose: current.purpose,
          targetAudience: current.targetAudience,
          visualStyle: current.visualStyle,
          brandPersonality: current.brandPersonality,
          colorPalette: current.colorPalette,
          subjectMatter: current.subjectMatter,
          composition: current.composition,
          focalPoint: current.focalPoint,
          viewingDistance: current.viewingDistance,
          textPosition: current.textPosition,
        },
        dimensions: `${current.widthIn} inches wide by ${current.heightIn} inches high (${current.aspectRatio.toFixed(6)}:1)`,
        usage: current.usage,
        user: providerUser(auth.session),
      });
      const brief = normalizeBrief({
        ...current,
        ...interpreted.brief,
        copy: current.copy,
        widthIn: current.widthIn,
        heightIn: current.heightIn,
        material: current.material,
        quantity: current.quantity,
        productType: current.productType,
        textPosition: current.textPosition,
        logoPosition: current.logoPosition,
        description: current.description,
        structured: true,
      });
      return json(200, { ok: true, brief: publicBrief(brief), model: interpreted.model, requestId: interpreted.requestId });
    });
  } catch (error) {
    return safeError(error);
  }
}

function repairableFailures(validation) {
  if (validation.passed) return [];
  const failures = [];
  if (!validation.checks.edgeCoverage.passed) failures.push('blank or letterboxed edge coverage');
  if (!validation.checks.flatArtwork.passed && validation.checks.flatArtwork.flags.length) failures.push(...validation.checks.flatArtwork.flags);
  if (!validation.checks.aspectRatio.passed) failures.push('incorrect aspect ratio');
  return failures;
}

async function finalizeConcept({ rawBackground, brief, plan, logo, reference, session, providerResult, providerCalls, allowRepair = true }) {
  let background = await normalizeBackground(rawBackground, plan);
  let composite = await compositeArtwork({ background, brief, logo });
  let validation = await validateArtwork({ background, artwork: composite.buffer, brief, plan });
  let repaired = false;
  let lastProvider = providerResult;
  const failures = repairableFailures(validation);
  if (!validation.passed && allowRepair && failures.length) {
    const repair = await editImage({
      prompt: buildRepairPrompt(brief, plan, failures),
      size: plan.providerSize,
      currentImage: background,
      currentMime: 'image/jpeg',
      referenceImage: reference,
      user: providerUser(session),
    });
    background = await normalizeBackground(repair.buffer, plan);
    composite = await compositeArtwork({ background, brief, logo });
    validation = await validateArtwork({ background, artwork: composite.buffer, brief, plan });
    repaired = true;
    lastProvider = repair;
    providerCalls.push(repair);
  }
  return { background, composite, validation, repaired, provider: lastProvider };
}

async function statusHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'GET, POST, OPTIONS' }, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST.' }, { Allow: 'GET, POST, OPTIONS' });
  // This endpoint is read-only. Do not let Netlify's preview drawer/proxy host
  // rewriting turn a valid signed session into a false 403.
  const auth = authorize(event, { skipOrigin: true });
  if (auth.response) return auth.response;
  const enabled = isEnabled(event?.netlify?.deployContext);
  const keyConfigured = Boolean(process.env.OPENAI_API_KEY);
  const temporaryStorageConfigured = isTemporaryStorageConfigured();
  let model = null;
  let access = { available: false, error: enabled && keyConfigured ? 'MODEL_NOT_CHECKED' : 'AI_NOT_CONFIGURED' };
  try {
    model = getImageModel();
    if (enabled && keyConfigured && temporaryStorageConfigured) access = await verifyModelAccess();
  } catch (error) {
    access = { available: false, error: error.code || 'UNAPPROVED_IMAGE_MODEL' };
  }
  return json(200, {
    authorized: true,
    enabled,
    keyConfigured,
    temporaryStorageConfigured,
    model,
    modelSnapshot: model === MODEL_SNAPSHOT ? MODEL_SNAPSHOT : null,
    validationModel: getValidationModel(),
    modelAvailable: access.available === true,
    checkedAt: access.checkedAt || new Date().toISOString(),
    ready: enabled && keyConfigured && temporaryStorageConfigured && access.available === true,
    blocker: !enabled ? 'AI_NOT_CONFIGURED'
      : !keyConfigured ? 'AI_NOT_CONFIGURED'
        : !temporaryStorageConfigured ? 'TEMP_STORAGE_NOT_CONFIGURED'
          : access.available ? null : access.error,
  });
}

async function generateHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
  const auth = authorize(event);
  if (auth.response) return auth.response;
  const sizeError = enforceBodyLimit(event, 7 * 1024 * 1024);
  if (sizeError) return sizeError;
  const limited = rateLimit(event, auth.session, 'generate', 8, 10 * 60 * 1000);
  if (limited) return limited;
  try {
    ensureConfigured(event);
    const access = await verifyModelAccess();
    if (!access.available) {
      const error = new Error('Model unavailable.');
      error.code = 'MODEL_ACCESS_DENIED';
      throw error;
    }
    const body = parseBody(event);
    const key = idempotencyKey(event, body, auth.session, 'generate');
    return await runIdempotent(key, async () => {
      const started = Date.now();
      const { brief, plan, reference, logo } = await prepareInputs(body);
      if (!brief.structured) {
        const error = new Error('Review and confirm the structured creative brief before generating.');
        error.code = 'INVALID_REQUEST';
        throw error;
      }
      const count = Math.max(1, Math.min(getMaxConcepts(), Math.floor(Number(body.conceptCount) || 1)));
      const generationId = crypto.randomUUID();
      const concepts = [];
      for (let index = 0; index < count; index += 1) {
        const conceptStarted = Date.now();
        const generated = await generateImage({
          prompt: buildGenerationPrompt(brief, plan, index),
          size: plan.providerSize,
          user: providerUser(auth.session),
        });
        const providerCalls = [generated];
        let guided = generated;
        if (reference || plan.strategy === 'gpt-image-2-outpainting') {
          const outpaint = await prepareOutpaintInput(generated.buffer, plan);
          const guidance = [
            reference ? 'Use the second supplied image only as visual brand and style guidance. Do not reproduce text from the reference.' : '',
            plan.strategy === 'gpt-image-2-outpainting'
              ? 'Outpaint every transparent area for the stated extreme-ratio safe corridor before final-canvas extraction. Keep the complete opaque source composition intact and extend only coherent, nonessential background beyond it.'
              : '',
            'Preserve the first image as the current composition and keep everything else as unchanged as technically possible.',
          ].filter(Boolean).join(' ');
          guided = await editImage({
            prompt: buildEditPrompt(brief, plan, guidance),
            size: plan.providerSize,
            currentImage: outpaint?.image || generated.buffer,
            currentMime: outpaint?.mimeType || 'image/jpeg',
            maskImage: outpaint?.mask,
            referenceImage: reference,
            user: providerUser(auth.session),
          });
          providerCalls.push(guided);
        }
        const finalized = await finalizeConcept({ rawBackground: guided.buffer, brief, plan, logo, reference, session: auth.session, providerResult: guided, providerCalls });
        const conceptId = crypto.randomUUID();
        const backgroundRef = await storeTemporaryArtwork(finalized.background, { session: auth.session, generationId });
        concepts.push(conceptPayload({
          id: conceptId,
          versionId: crypto.randomUUID(),
          generationId,
          backgroundRef,
          artwork: finalized.composite.buffer,
          brief,
          plan,
          validation: finalized.validation,
          model: finalized.provider.model,
          requestId: finalized.provider.requestId,
          durationMs: Date.now() - conceptStarted,
          textLayers: finalized.composite.textLayers,
          logoLayer: finalized.composite.logoLayer,
          repaired: finalized.repaired,
          usage: finalized.provider.usage,
          estimatedCostUsd: estimateImageCost(providerCalls),
        }));
      }
      console.info('[ai_designer_generation]', {
        generationId,
        model: getImageModel(),
        durationMs: Date.now() - started,
        outputDimensions: `${plan.finalWidth}x${plan.finalHeight}`,
        requestedAspectRatio: brief.aspectRatio,
        ratioStrategy: plan.strategy,
        validationStatuses: concepts.map((concept) => concept.validation.status),
      });
      return json(200, { ok: true, generationId, brief: publicBrief(brief), concepts, durationMs: Date.now() - started });
    });
  } catch (error) {
    return safeError(error);
  }
}

async function editHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
  const auth = authorize(event);
  if (auth.response) return auth.response;
  const sizeError = enforceBodyLimit(event, 10 * 1024 * 1024);
  if (sizeError) return sizeError;
  const limited = rateLimit(event, auth.session, 'edit', 12, 10 * 60 * 1000);
  if (limited) return limited;
  try {
    ensureConfigured(event);
    const access = await verifyModelAccess();
    if (!access.available) {
      const error = new Error('Model unavailable.');
      error.code = 'MODEL_ACCESS_DENIED';
      throw error;
    }
    const body = parseBody(event);
    const key = idempotencyKey(event, body, auth.session, 'edit');
    return await runIdempotent(key, async () => {
      const started = Date.now();
      const { brief, plan, reference, logo } = await prepareInputs(body);
      if (!brief.structured) {
        const error = new Error('A confirmed structured creative brief is required for editing.');
        error.code = 'INVALID_REQUEST';
        throw error;
      }
      const current = await validateInputImage(await readTemporaryArtwork(body.currentBackgroundRef, auth.session), 40_000_000);
      if (!current) {
        const error = new Error('Current artwork is required for editing.');
        error.code = 'INVALID_IMAGE';
        throw error;
      }
      const instruction = cleanText(body.editInstruction, 700);
      if (!instruction) {
        const error = new Error('Describe the change to make.');
        error.code = 'INVALID_REQUEST';
        throw error;
      }
      const edited = await editImage({
        prompt: buildEditPrompt(brief, plan, instruction),
        size: plan.providerSize,
        currentImage: current.buffer,
        currentMime: current.mimeType,
        referenceImage: reference,
        user: providerUser(auth.session),
      });
      const providerCalls = [edited];
      const finalized = await finalizeConcept({ rawBackground: edited.buffer, brief, plan, logo, reference, session: auth.session, providerResult: edited, providerCalls });
      const backgroundRef = await storeTemporaryArtwork(finalized.background, { session: auth.session, generationId: String(body.generationId || 'edit') });
      const concept = conceptPayload({
        id: String(body.conceptId || crypto.randomUUID()),
        versionId: crypto.randomUUID(),
        generationId: String(body.generationId || crypto.randomUUID()),
        backgroundRef,
        artwork: finalized.composite.buffer,
        brief,
        plan,
        validation: finalized.validation,
        model: finalized.provider.model,
        requestId: finalized.provider.requestId,
        durationMs: Date.now() - started,
        textLayers: finalized.composite.textLayers,
        logoLayer: finalized.composite.logoLayer,
        repaired: finalized.repaired,
        usage: finalized.provider.usage,
        estimatedCostUsd: estimateImageCost(providerCalls),
      });
      console.info('[ai_designer_edit]', {
        conceptId: concept.id,
        versionId: concept.versionId,
        model: getImageModel(),
        durationMs: Date.now() - started,
        usedOriginalImage: true,
        outputDimensions: `${plan.finalWidth}x${plan.finalHeight}`,
        validationStatus: concept.validation.status,
      });
      return json(200, { ok: true, brief: publicBrief(brief), concept, usedOriginalImage: true, durationMs: Date.now() - started });
    });
  } catch (error) {
    return safeError(error);
  }
}

function retiredHandler(event) {
  const auth = authorize(event, { requireOrigin: event.httpMethod !== 'GET' });
  if (auth.response) return auth.response;
  return json(410, {
    error: 'EXPERIMENTAL_ENDPOINT_RETIRED',
    message: 'This experimental AI endpoint has been retired. Use the production AI Designer.',
  });
}

module.exports = { statusHandler, briefHandler, generateHandler, editHandler, retiredHandler };
