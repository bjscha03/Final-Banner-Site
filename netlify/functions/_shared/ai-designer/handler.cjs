'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createProgressWriter } = require('./progress.cjs');
const pipelineProgress = new AsyncLocalStorage();
async function reportProgress(stage, preview) {
  const report = pipelineProgress.getStore();
  if (report) await report(stage, preview).catch(() => null);
}
const { mergeLayerEdits, removePhotoLayers } = require('./layers.cjs');
const { isUploadedLogoRemoval } = require('./edit-intent.cjs');
const { isEnabled, getImageModel, getValidationModel, getImageQuality, MODEL_SNAPSHOT } = require('./config.cjs');
const { normalizeBrief, cleanText, stableHash, buildImprovedPrompt, freshPromptBrief, fitInterpretedDirection, groundedCopy } = require('./schema.cjs');
const { buildGenerationPrompt, buildEditPrompt, buildCopyChangeInstruction } = require('./prompt.cjs');
const { verifyModelAccess, verifyValidationModelAccess, generateImage, editImage, structureCreativeBrief, planDesignEdit } = require('./provider.cjs');
const {
  isTemporaryStorageConfigured,
  storeTemporaryArtwork,
  readTemporaryArtwork,
  temporaryArtworkUrl,
  createJob,
  readJob,
  readJobInternal,
  writeJobInternal,
} = require('./storage.cjs');
const { json, authorize, enforceBodyLimit, rateLimit, idempotencyKey, runIdempotent, safeError, safeErrorPayload } = require('./security.cjs');

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

function providerRequestKey(jobId, operation) {
  return crypto.createHash('sha256').update(`ai-designer:${String(jobId)}:${operation}`).digest('hex');
}

function publicBrief(brief) {
  return {
    ...brief,
    requiredTextHash: stableHash(brief.requiredText),
  };
}

async function withPipelineStage(stage, task) {
  await reportProgress(stage);
  const startedAt = Date.now();
  try {
    return await task();
  } catch (error) {
    const currentCode = String(error?.code || '');
    if (!/^(AI_|INVALID_|PROVIDER_|MODEL_|UNAPPROVED_|VALIDATION_|DESCRIPTION_|IDEMPOTENCY_)/.test(currentCode)) {
      error.originalCode = currentCode || null;
      error.code = 'AI_PIPELINE_FAILED';
    }
    error.pipelineStage = error.pipelineStage || stage;
    throw error;
  } finally {
    pipelineProgress.getStore()?.timings?.push({ stage, durationMs: Date.now() - startedAt });
  }
}

function aggregateImageUsage(providerCalls) {
  const usage = providerCalls.reduce((total, call) => {
    const item = call?.usage || {};
    total.input_tokens += Number(item.input_tokens || 0);
    total.output_tokens += Number(item.output_tokens || 0);
    total.total_tokens += Number(item.total_tokens || 0);
    total.input_tokens_details.image_tokens += Number(item.input_tokens_details?.image_tokens || 0);
    total.input_tokens_details.text_tokens += Number(item.input_tokens_details?.text_tokens || 0);
    return total;
  }, { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { image_tokens: 0, text_tokens: 0 } });
  return usage.total_tokens || usage.input_tokens || usage.output_tokens ? usage : null;
}

function estimatedImageCostUsd(usage) {
  if (!usage) return null;
  const imageInput = Number(usage.input_tokens_details?.image_tokens || 0) * 8 / 1_000_000;
  const textInput = Number(usage.input_tokens_details?.text_tokens || 0) * 5 / 1_000_000;
  const output = Number(usage.output_tokens || 0) * 30 / 1_000_000;
  return Number((imageInput + textInput + output).toFixed(6));
}

function conceptPayload({ id, versionId, generationId, backgroundRef, artworkRef, artwork, brief, plan, validation, model, requestId, durationMs, textLayers, logoLayer, photoLayers, repaired, usage, estimatedCostUsd }) {
  return {
    id,
    versionId,
    generationId,
    backgroundRef,
    artworkRef,
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
    photoLayers: photoLayers || [],
    brief: publicBrief(brief),
    diagnostics: {
      model,
      modelSnapshot: model === MODEL_SNAPSHOT ? MODEL_SNAPSHOT : null,
      providerRequestId: requestId,
      durationMs,
      stageTimings: [...(pipelineProgress.getStore()?.timings || [])],
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
  // Load Sharp-backed helpers only inside the background worker. The public
  // queue, status, and polling functions must be able to authenticate and
  // respond without loading a native image-processing binary.
  const { planCanvas, parseDataImage, validateInputImage } = require('./image-utils.cjs');
  const brief = normalizeBrief(body.brief || body);
  const plan = planCanvas(brief.widthIn, brief.heightIn);
  brief.outputWidthPx = plan.finalWidth;
  brief.outputHeightPx = plan.finalHeight;
  const reference = await validateInputImage(parseDataImage(body.referenceImage, 3 * 1024 * 1024));
  const { prepareLogo, logoPaletteDirection } = require('./logo.cjs');
  const logo = await prepareLogo(await validateInputImage(parseDataImage(body.logoImage, 2 * 1024 * 1024), 12_000_000));
  if (logo) {
    brief.logoAspectRatio = logo.width / logo.height;
    brief.logoNeedsContrastPlate = logo.needsContrastPlate;
    brief.colorPalette = logoPaletteDirection(brief);
  }
  if (body.photoImages != null && (!Array.isArray(body.photoImages) || body.photoImages.length > 3)) {
    const error = new Error('Choose up to three photos.'); error.code = 'INVALID_IMAGE'; throw error;
  }
  const photos = await Promise.all((body.photoImages || []).map(value => validateInputImage(parseDataImage(value, 384 * 1024), 12_000_000)));
  if (photos.some(photo => !photo)) { const error = new Error('Invalid photo.'); error.code = 'INVALID_IMAGE'; throw error; }
  return { brief, plan, reference, logo, photos };
}

function requestForJob(body) {
  const request = { ...body };
  delete request.adminSessionToken;
  delete request.sessionToken;
  return request;
}

const JOB_LIMITS = {
  brief: { bytes: 3 * 1024 * 1024, requests: 20 },
  generate: { bytes: 5 * 1024 * 1024, requests: 8 },
  edit: { bytes: 5 * 1024 * 1024, requests: 12 },
};

async function enqueueHandler(event, action) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
  const auth = authorize(event);
  if (auth.response) return auth.response;
  const limits = JOB_LIMITS[action];
  const sizeError = enforceBodyLimit(event, limits.bytes);
  if (sizeError) return sizeError;
  const limited = rateLimit(event, auth.session, action, limits.requests, 10 * 60 * 1000);
  if (limited) return limited;
  try {
    const body = parseBody(event);
    ensureConfigured(event);
    // Readiness checks already verify access. The actual provider request is
    // authoritative if access changes; do not add a second cold network probe
    // before every queue submission. Auth, configuration and limits still gate it.
    const key = idempotencyKey(event, body, auth.session, action);
    return await runIdempotent(key, async () => {
      const job = await createJob({
        session: auth.session,
        action,
        request: requestForJob(body),
        jobId: key,
      });
      return json(202, {
        ok: true,
        status: job.record.status,
        jobRef: job.reference,
        workerPath: '/.netlify/functions/ai-designer-worker-background',
        pollPath: '/.netlify/functions/ai-designer-job',
        pollAfterMs: 2000,
      });
    });
  } catch (error) {
    return safeError(error);
  }
}

async function jobHandler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });
  // Polling is read-only. Authentication and the session-bound signed job
  // reference protect the result even when Netlify's preview drawer rewrites
  // the forwarded host.
  const auth = authorize(event, { skipOrigin: true });
  if (auth.response) return auth.response;
  const sizeError = enforceBodyLimit(event, 64 * 1024);
  if (sizeError) return sizeError;
  try {
    const body = parseBody(event);
    const record = await readJob(body.jobRef, auth.session);
    if (record.status === 'completed') return json(200, { ok: true, status: 'completed', action: record.action, ...record.result });
    if (record.status === 'failed') return json(200, { ok: false, status: 'failed', action: record.action, ...record.error });
    return json(200, {
      ok: true,
      status: record.status,
      action: record.action,
      stage: record.stage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.preview && body.previewVersion !== record.previewVersion ? { preview: record.preview, previewVersion: record.previewVersion } : {}),
    });
  } catch (error) {
    return safeError(error);
  }
}

async function writeJobReliable(reference, record) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeJobInternal(reference, record);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function claimJob(reference, record) {
  if (!record || ['completed', 'failed'].includes(record.status)) return null;
  if (record.status === 'processing') {
    const ageMs = Date.now() - new Date(record.updatedAt || record.createdAt || 0).getTime();
    if (ageMs < 12 * 60 * 1000) return null;
  }
  const attemptId = crypto.randomUUID();
  const claimed = { ...record, status: 'processing', stage: 'Preparing the AI request', attemptId };
  await writeJobReliable(reference, claimed);
  const confirmed = await readJobInternal(reference);
  return confirmed?.attemptId === attemptId ? confirmed : null;
}

async function workerHandler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, { Allow: 'POST' });
  // The signed job reference protects the stored payload, but the worker is
  // still an AI/billing surface and therefore also requires a verified admin.
  const auth = authorize(event, { skipOrigin: true });
  if (auth.response) return auth.response;
  const sizeError = enforceBodyLimit(event, 64 * 1024);
  if (sizeError) return sizeError;
  let reference;
  let claimed;
  let progressWriter;
  try {
    reference = String(parseBody(event).jobRef || '');
    const record = await readJobInternal(reference);
    claimed = await claimJob(reference, record);
    if (!claimed) return json(200, { ok: true, status: record?.status || 'ignored' });
    ensureConfigured(event);
    progressWriter = createProgressWriter(record => writeJobReliable(reference, record));
    const progress = async (stage, preview) => {
      claimed = { ...claimed, stage, ...(preview ? { preview, previewVersion: crypto.randomUUID() } : {}) };
      progressWriter.publish(claimed);
    };
    progress.timings = [];
    const result = await pipelineProgress.run(progress, async () => {
      if (claimed.action === 'brief') return runBriefRequest(claimed.request, claimed.session, claimed.jobId);
      if (claimed.action === 'generate') return runGenerateRequest(claimed.request, claimed.session, claimed.jobId);
      if (claimed.action === 'edit') return runEditRequest(claimed.request, claimed.session, claimed.jobId);
      const error = new Error('Unknown AI job action.');
      error.code = 'INVALID_REQUEST';
      throw error;
    });
    await progressWriter.close();
    await writeJobReliable(reference, {
      version: claimed.version,
      jobId: claimed.jobId,
      action: claimed.action,
      status: 'completed',
      stage: 'Complete',
      createdAt: claimed.createdAt,
      result,
    });
    return json(200, { ok: true, status: 'completed' });
  } catch (error) {
    await progressWriter?.close();
    const diagnosticId = String(claimed?.jobId || crypto.randomUUID()).slice(0, 12);
    console.error('[ai_designer_background_failed]', {
      diagnosticId,
      action: claimed?.action || null,
      stage: error?.pipelineStage || claimed?.stage || null,
      category: error?.code || 'AI_REQUEST_FAILED',
      originalCode: error?.originalCode || null,
      providerRequestId: error?.providerRequestId || null,
      providerStatus: Number(error?.providerStatus || error?.status || error?.response?.status || 0) || null,
      errorName: error?.originalName || error?.name || null,
    });
    if (reference && claimed) {
      const safe = { ...safeErrorPayload(error), diagnosticId };
      await writeJobReliable(reference, {
        version: claimed.version,
        jobId: claimed.jobId,
        action: claimed.action,
        status: 'failed',
        stage: error?.pipelineStage || 'Failed',
        createdAt: claimed.createdAt,
        error: safe,
      }).catch(() => null);
    }
    return json(200, { ok: false, status: 'failed' });
  }
}

async function runBriefRequest(body, session, jobId = crypto.randomUUID()) {
  const current = freshPromptBrief(body.brief || body);
  const { parseDataImage, validateInputImage } = require('./image-utils.cjs');
  const { prepareLogo, logoPaletteDirection } = require('./logo.cjs');
  const logo = await prepareLogo(await validateInputImage(parseDataImage(body.logoImage, 2 * 1024 * 1024), 12_000_000));
  if (logo) current.colorPalette = logoPaletteDirection(current, true);
  const interpreted = await structureCreativeBrief({
    logoImage: logo,
    logoRendering: current.logoRendering,
    improvePrompt: body.improvePrompt === true,
    description: current.description,
    current: { ...current.directionOverrides, ...(logo ? { colorPalette: current.colorPalette } : {}), copy: current.copy },
    dimensions: `${current.widthIn} inches wide by ${current.heightIn} inches high (${current.aspectRatio.toFixed(6)}:1)`,
    usage: current.usage,
    user: providerUser(session),
    idempotencyKey: providerRequestKey(jobId, 'brief'),
  });
  const copy = groundedCopy(interpreted.brief.copy, current);
  const brief = normalizeBrief({
    ...current,
    ...fitInterpretedDirection(interpreted.brief),
    ...current.directionOverrides,
    copy,
    logoRendering: current.logoRendering,
    logoWording: logo ? interpreted.brief.logoWording : [],
    widthIn: current.widthIn,
    heightIn: current.heightIn,
    material: current.material,
    quantity: current.quantity,
    productType: current.productType,
    textPosition: current.directionOverrides.textPosition || interpreted.brief.textPosition || current.textPosition,
    logoPosition: current.logoPosition,
    description: current.description,
    structured: true,
  });
  let improvedPrompt;
  if (body.improvePrompt === true) {
    const discardedWording = Object.keys(copy).some(key => interpreted.brief.copy?.[key] && !copy[key]);
    improvedPrompt = buildImprovedPrompt(discardedWording ? '' : interpreted.brief.improvedPrompt, brief);
  }
  return { ok: true, brief: publicBrief(brief), improvedPrompt, model: interpreted.model, requestId: interpreted.requestId };
}

async function briefHandler(event) {
  return enqueueHandler(event, 'brief');
}

async function finalizeConcept({ rawBackground, brief, plan, logo, photos, providerResult, preserveBackground = false, reuseVisualValidation = null }) {
  const { normalizeBackground } = require('./image-utils.cjs');
  const { compositeArtwork } = require('./compositor.cjs');
  const { validateArtwork } = require('./validation.cjs');
  const background = preserveBackground ? rawBackground : await normalizeBackground(rawBackground, plan);
  const composite = await compositeArtwork({ background, brief, logo, photos });
  // Show the actual artwork immediately. Approval remains gated by checks.
  await reportProgress('Your artwork is ready — checking wording and print details', {
    imageBase64: composite.preview.toString('base64'), mimeType: 'image/jpeg',
  });
  const validation = await validateArtwork({ background, artwork: composite.buffer, brief, plan, protectedRegions: [composite.logoLayer, ...composite.photoLayers].filter(Boolean), logoReference: brief.logoRendering === 'integrated' ? logo : null, reuseVisualValidation });
  // Never hide another paid image edit behind a validation failure.
  return { background, composite, validation, repaired: false, provider: providerResult };
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
  let validationAccess = { available: false, error: enabled && keyConfigured ? 'MODEL_NOT_CHECKED' : 'AI_NOT_CONFIGURED' };
  try {
    model = getImageModel();
    if (enabled && keyConfigured && temporaryStorageConfigured) {
      [access, validationAccess] = await Promise.all([verifyModelAccess(), verifyValidationModelAccess()]);
    }
  } catch (error) {
    access = { available: false, error: error.code || 'UNAPPROVED_IMAGE_MODEL' };
    validationAccess = { available: false, error: error.code || 'MODEL_ACCESS_DENIED' };
  }
  return json(200, {
    authorized: true,
    enabled,
    keyConfigured,
    temporaryStorageConfigured,
    model,
    modelSnapshot: model === MODEL_SNAPSHOT ? MODEL_SNAPSHOT : null,
    validationModel: getValidationModel(),
    imageQuality: getImageQuality(),
    modelAvailable: access.available === true,
    validationModelAvailable: validationAccess.available === true,
    checkedAt: access.checkedAt || new Date().toISOString(),
    ready: enabled && keyConfigured && temporaryStorageConfigured && access.available === true && validationAccess.available === true,
    blocker: !enabled ? 'AI_NOT_CONFIGURED'
      : !keyConfigured ? 'AI_NOT_CONFIGURED'
        : !temporaryStorageConfigured ? 'TEMP_STORAGE_NOT_CONFIGURED'
          : !access.available ? access.error
            : validationAccess.available ? null : 'VALIDATION_MODEL_ACCESS_DENIED',
  });
}

async function runGenerateRequest(body, session, jobId = crypto.randomUUID()) {
  const started = Date.now();
  if ((body.brief || body).structured !== true) {
    const planned = await withPipelineStage('Planning your banner and organizing the wording', () => runBriefRequest(body, session, jobId));
    body = { ...body, brief: planned.brief };
  }
  const { brief, plan, reference, logo, photos } = await withPipelineStage('preparing the design inputs', () => prepareInputs(body));
  // New designs use integrated, art-directed AI lettering. Older saved versions
  // retain their explicit layer mode so undo/recovery never doubles their text.
  brief.typographyMode = 'ai';
  brief.hasProtectedLogo = Boolean(logo) && brief.logoRendering !== 'integrated';
  brief.hasIntegratedLogo = Boolean(logo) && brief.logoRendering === 'integrated';
  if (!brief.structured) {
    const error = new Error('Review and confirm the structured creative brief before generating.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  // A single high-quality concept per background job keeps every request
  // inside Netlify's 15-minute background limit. The UI retains up to four
  // concepts for comparison across separate requests.
  const generationId = crypto.randomUUID();
  const conceptStarted = Date.now();
  const generationOptions = {
    prompt: buildGenerationPrompt(brief, plan, 0),
    size: plan.providerSize,
    user: providerUser(session),
    idempotencyKey: providerRequestKey(jobId, 'generate'),
  };
  const generated = await withPipelineStage('Creating your artwork', () => reference || logo
    ? editImage({ ...generationOptions, prompt: `${generationOptions.prompt}\nCreate a NEW banner composition. ${reference ? 'The first supplied image is visual style guidance only; do not copy its wording.' : 'The first supplied image is the customer logo, not a banner composition to preserve.'} ${reference && logo ? 'The second supplied image is the customer logo reference.' : ''} ${brief.hasIntegratedLogo ? 'Print the approved banner wording and the exact source-logo wording; integrate that logo faithfully once as part of the design without a second logo overlay.' : 'Print only the approved wording; never reproduce the supplied logo in the generated artwork.'}`, currentImage: (reference || logo).buffer, currentMime: (reference || logo).mimeType, logoReferenceImage: reference ? logo : null, logoRendering: brief.logoRendering })
    : generateImage(generationOptions));
  const providerCalls = [generated];
  let guided = generated;
  if (plan.strategy === 'gpt-image-2-outpainting') {
    const { prepareOutpaintInput } = require('./image-utils.cjs');
    const outpaint = await withPipelineStage('preparing the exact banner ratio', () => prepareOutpaintInput(generated.buffer, plan));
    const guidance = [
      reference ? 'Use the second supplied image only as visual brand and style guidance. Do not reproduce text from the reference.' : '',
      plan.strategy === 'gpt-image-2-outpainting'
        ? 'Outpaint every transparent area for the stated extreme-ratio safe corridor before final-canvas extraction. Keep the complete opaque source composition intact and extend only coherent, nonessential background beyond it.'
        : '',
      'Preserve the first image as the current composition and keep everything else as unchanged as technically possible.',
    ].filter(Boolean).join(' ');
    guided = await withPipelineStage('extending the artwork to the banner ratio', () => editImage({
      prompt: buildEditPrompt(brief, plan, guidance),
      size: plan.providerSize,
      currentImage: outpaint?.image || generated.buffer,
      currentMime: outpaint?.mimeType || 'image/jpeg',
      maskImage: outpaint?.mask,
      referenceImage: reference,
      logoReferenceImage: logo,
      logoRendering: brief.logoRendering,
      user: providerUser(session),
      idempotencyKey: providerRequestKey(jobId, 'outpaint'),
    }));
    providerCalls.push(guided);
  }
  const finalized = await withPipelineStage('compositing and validating the artwork', () => finalizeConcept({ rawBackground: guided.buffer, brief, plan, logo, photos, reference, session, providerResult: guided, providerCalls, providerKey: jobId }));
  const [backgroundRef, artworkRef] = await withPipelineStage('Saving your artwork', () => Promise.all([storeTemporaryArtwork(finalized.background, { session, generationId }), storeTemporaryArtwork(finalized.composite.buffer, { session, generationId })]));
  const aggregateUsage = aggregateImageUsage(providerCalls);
  const concept = conceptPayload({
    id: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    generationId,
    backgroundRef,
    artworkRef,
    artwork: finalized.composite.preview,
    brief,
    plan,
    validation: finalized.validation,
    model: finalized.provider.model,
    requestId: finalized.provider.requestId,
    durationMs: Date.now() - conceptStarted,
    textLayers: finalized.composite.textLayers,
    logoLayer: finalized.composite.logoLayer,
    photoLayers: finalized.composite.photoLayers,
    repaired: finalized.repaired,
    usage: aggregateUsage,
    estimatedCostUsd: estimatedImageCostUsd(aggregateUsage),
  });
  console.info('[ai_designer_generation]', {
    generationId,
    model: getImageModel(),
    durationMs: Date.now() - started,
    outputDimensions: `${plan.finalWidth}x${plan.finalHeight}`,
    requestedAspectRatio: brief.aspectRatio,
    ratioStrategy: plan.strategy,
    validationStatuses: [concept.validation.status],
  });
  return { ok: true, generationId, brief: publicBrief(brief), concepts: [concept], durationMs: Date.now() - started };
}

async function generateHandler(event) {
  return enqueueHandler(event, 'generate');
}

async function runEditRequest(body, session, jobId = crypto.randomUUID()) {
  const { validateInputImage } = require('./image-utils.cjs');
  const generationId = String(body.generationId || crypto.randomUUID());
  const started = Date.now();
  let { brief, plan, reference, logo, photos } = await withPipelineStage('preparing the edit inputs', () => prepareInputs(body));
  if (!brief.structured) {
    const error = new Error('A confirmed structured creative brief is required for editing.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  const current = await withPipelineStage('loading the current artwork', async () => validateInputImage(await readTemporaryArtwork(body.currentBackgroundRef, session), 40_000_000));
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
  const removeUploadedLogo = body.editMode === 'remove-logo' || isUploadedLogoRemoval(instruction, Boolean(logo));
  const integratedLogo = brief.logoRendering === 'integrated' && Boolean(logo);
  const previousLogoWording = [...brief.logoWording];
  const logoOnly = body.editMode === 'logo' || removeUploadedLogo;
  const manual = body.editMode === 'layers' || logoOnly;
  const editPlan = manual ? { backgroundInstruction: '', removeLogo: removeUploadedLogo, removePhotos: [] } : await withPipelineStage('understanding your changes', () => planDesignEdit({ brief, instruction, photos, user: providerUser(session), idempotencyKey: providerRequestKey(jobId, 'edit-plan') }));
  const previousBrief = brief;
  if (!manual) {
    brief = normalizeBrief({ ...brief, copy: editPlan.copy, layers: mergeLayerEdits(brief.layers, editPlan.layers), structured: true });
    brief.outputWidthPx = plan.finalWidth;
    brief.outputHeightPx = plan.finalHeight;
    if (Array.isArray(editPlan.removePhotos) && editPlan.removePhotos.length) {
      brief.layers = removePhotoLayers(brief.layers, photos.length, editPlan.removePhotos);
      photos = photos.filter((_, index) => !editPlan.removePhotos.includes(index));
    }
  }
  if (editPlan.removeLogo) {
    logo = null;
    brief.logoWording = [];
  }
  brief.hasProtectedLogo = Boolean(logo) && brief.logoRendering !== 'integrated';
  brief.hasIntegratedLogo = Boolean(logo) && brief.logoRendering === 'integrated';
  if (logo) {
    brief.logoAspectRatio = logo.width / logo.height;
    brief.logoNeedsContrastPlate = logo.needsContrastPlate;
  }
  // A protected-layer removal must never be forwarded as "remove logo" to the
  // image model, which would erase artwork already baked into the background.
  // For mixed requests, forward only the separately planned artwork/copy edits.
  const removalArtworkInstruction = editPlan.removeLogo ? [
    integratedLogo ? `Remove the integrated customer logo and its logo-specific lettering ${JSON.stringify(previousLogoWording)} from the existing artwork. Fill that area with coherent surrounding artwork. Preserve all unrelated illustration and approved banner wording; do not redraw or replace the removed logo.` : '',
    cleanText(editPlan.backgroundInstruction, 700),
    buildCopyChangeInstruction(previousBrief.copy, brief.copy),
    ...Object.keys(brief.copy).filter((role) => JSON.stringify(previousBrief.layers?.[role] || {}) !== JSON.stringify(brief.layers?.[role] || {}))
      .map((role) => `Apply these text layer settings to ${role}: ${JSON.stringify(brief.layers[role])}.`),
  ].filter(Boolean).join('\n') : '';
  const backgroundInstruction = logoOnly ? integratedLogo ? editPlan.removeLogo ? removalArtworkInstruction : `Edit the existing integrated customer logo in place: ${instruction}. Apply requested placement/scale settings ${JSON.stringify(brief.layers.logo || {})}; preserve its lettering and identity, with exactly one logo in the artwork.` : '' : brief.typographyMode === 'ai'
    ? editPlan.removeLogo ? removalArtworkInstruction : [manual ? `Apply the updated wording and requested text styling/placement: ${JSON.stringify(brief.layers)}. Preserve the existing artistic lettering style unless a style change is requested.` : instruction, buildCopyChangeInstruction(body.previousCopy, brief.copy)].filter(Boolean).join('\n')
    : cleanText(editPlan.backgroundInstruction, 700);
  const edited = backgroundInstruction ? await withPipelineStage('editing the artwork', () => editImage({
    prompt: buildEditPrompt(brief, plan, backgroundInstruction),
    size: plan.providerSize,
    currentImage: current.buffer,
    currentMime: current.mimeType,
    referenceImage: reference,
    logoReferenceImage: logo,
    logoRendering: brief.logoRendering,
    user: providerUser(session),
    idempotencyKey: providerRequestKey(jobId, 'edit'),
  })) : { buffer: current.buffer, model: getImageModel(), requestId: null, usage: null };
  const providerCalls = backgroundInstruction ? [edited] : [];
  const finalized = await withPipelineStage('compositing and validating the edited artwork', () => finalizeConcept({ rawBackground: edited.buffer, brief, plan, logo, photos, reference, session, providerResult: edited, providerCalls, providerKey: jobId, preserveBackground: !backgroundInstruction, reuseVisualValidation: logoOnly && !integratedLogo ? body.previousValidation : null }));
  const [backgroundRef, artworkRef] = await withPipelineStage('Saving your changes', () => Promise.all([backgroundInstruction ? storeTemporaryArtwork(finalized.background, { session, generationId }) : Promise.resolve(body.currentBackgroundRef), storeTemporaryArtwork(finalized.composite.buffer, { session, generationId })]));
  const aggregateUsage = aggregateImageUsage(providerCalls);
  const concept = conceptPayload({
    id: String(body.conceptId || crypto.randomUUID()),
    versionId: crypto.randomUUID(),
    generationId: String(body.generationId || crypto.randomUUID()),
    backgroundRef,
    artworkRef,
    artwork: finalized.composite.preview,
    brief,
    plan,
    validation: finalized.validation,
    model: finalized.provider.model,
    requestId: finalized.provider.requestId,
    durationMs: Date.now() - started,
    textLayers: finalized.composite.textLayers,
    logoLayer: finalized.composite.logoLayer,
    photoLayers: finalized.composite.photoLayers,
    repaired: finalized.repaired,
    usage: aggregateUsage,
    estimatedCostUsd: backgroundInstruction ? estimatedImageCostUsd(aggregateUsage) : 0,
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
  return { ok: true, brief: publicBrief(brief), concept, usedOriginalImage: true, logoRemoved: editPlan.removeLogo === true, removedPhotos: editPlan.removePhotos || [], backgroundUnchanged: !backgroundInstruction, durationMs: Date.now() - started };
}

async function editHandler(event) {
  return enqueueHandler(event, 'edit');
}

async function exportHandler(event) {
  const auth = authorize(event);
  if (auth.response) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const tooLarge = enforceBodyLimit(event, 8192);
    if (tooLarge) return tooLarge;
    const body = parseBody(event);
    return json(200, { url: temporaryArtworkUrl(body.artworkRef, auth.session) });
  } catch (error) { return safeError(error); }
}

async function eventsHandler(event) {
  const auth = authorize(event);
  if (auth.response) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  const tooLarge = enforceBodyLimit(event, 8192);
  if (tooLarge) return tooLarge;
  const limited = rateLimit(event, auth.session, 'events', 180, 600_000);
  if (limited) return limited;
  try {
    const body = parseBody(event);
    const events = new Set(['ai_designer_opened', 'ai_prompt_entered', 'ai_brief_created', 'ai_generation_started', 'ai_generation_succeeded', 'ai_generation_failed', 'ai_validation_failed', 'ai_concept_selected', 'ai_edit_started', 'ai_edit_succeeded', 'ai_edit_rejected', 'ai_design_approved', 'ai_applied_to_configurator', 'ai_added_to_cart', 'ai_checkout_started', 'ai_purchase_completed']);
    if (!events.has(body.event)) return json(400, { error: 'INVALID_EVENT' });
    const properties = {};
    const keys = ['product_type', 'concept_id', 'version_id', 'order_id', 'concept_count', 'validation_failures', 'validation_passed', 'exact_copy_fields', 'count', 'category'];
    for (const key of keys) {
      const value = body.properties?.[key];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) properties[key] = value;
      else if (typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value)) properties[key] = value;
    }
    console.info('[ai_designer_funnel]', { event: body.event, ...properties, adminTest: true });
    return json(202, { ok: true });
  } catch (error) { return safeError(error); }
}

function retiredHandler(event) {
  const auth = authorize(event, { requireOrigin: event.httpMethod !== 'GET' });
  if (auth.response) return auth.response;
  return json(410, {
    error: 'EXPERIMENTAL_ENDPOINT_RETIRED',
    message: 'This experimental AI endpoint has been retired. Use the production AI Designer.',
  });
}

module.exports = { statusHandler, briefHandler, generateHandler, editHandler, exportHandler, eventsHandler, jobHandler, workerHandler, retiredHandler };
