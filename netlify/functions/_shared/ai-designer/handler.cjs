'use strict';

const crypto = require('crypto');
const { isEnabled, getImageModel, getValidationModel, getImageQuality, MODEL_SNAPSHOT } = require('./config.cjs');
const { normalizeBrief, cleanText, stableHash } = require('./schema.cjs');
const { buildGenerationPrompt, buildEditPrompt, buildRepairPrompt } = require('./prompt.cjs');
const { verifyModelAccess, verifyValidationModelAccess, generateImage, editImage, structureCreativeBrief } = require('./provider.cjs');
const {
  isTemporaryStorageConfigured,
  storeTemporaryArtwork,
  readTemporaryArtwork,
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

function publicBrief(brief) {
  return {
    ...brief,
    requiredTextHash: stableHash(brief.requiredText),
  };
}

function withPipelineStage(stage, task) {
  return Promise.resolve()
    .then(task)
    .catch((error) => {
      const currentCode = String(error?.code || '');
      if (!/^(AI_|INVALID_|PROVIDER_|MODEL_|UNAPPROVED_|VALIDATION_|DESCRIPTION_|IDEMPOTENCY_)/.test(currentCode)) {
        error.originalCode = currentCode || null;
        error.code = 'AI_PIPELINE_FAILED';
      }
      error.pipelineStage = error.pipelineStage || stage;
      throw error;
    });
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
  // Load Sharp-backed helpers only inside the background worker. The public
  // queue, status, and polling functions must be able to authenticate and
  // respond without loading a native image-processing binary.
  const { planCanvas, parseDataImage, validateInputImage } = require('./image-utils.cjs');
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

function requestForJob(body) {
  const request = { ...body };
  delete request.adminSessionToken;
  delete request.sessionToken;
  return request;
}

const JOB_LIMITS = {
  brief: { bytes: 100 * 1024, requests: 20 },
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
    ensureConfigured(event);
    const access = await verifyModelAccess();
    if (!access.available) {
      const error = new Error('Model unavailable.');
      error.code = 'MODEL_ACCESS_DENIED';
      throw error;
    }
    const body = parseBody(event);
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
  const sizeError = enforceBodyLimit(event, 64 * 1024);
  if (sizeError) return sizeError;
  let reference;
  let claimed;
  try {
    reference = String(parseBody(event).jobRef || '');
    const record = await readJobInternal(reference);
    claimed = await claimJob(reference, record);
    if (!claimed) return json(200, { ok: true, status: record?.status || 'ignored' });
    ensureConfigured(event);
    let result;
    if (claimed.action === 'brief') result = await runBriefRequest(claimed.request, claimed.session);
    else if (claimed.action === 'generate') result = await runGenerateRequest(claimed.request, claimed.session);
    else if (claimed.action === 'edit') result = await runEditRequest(claimed.request, claimed.session);
    else {
      const error = new Error('Unknown AI job action.');
      error.code = 'INVALID_REQUEST';
      throw error;
    }
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
    const diagnosticId = String(claimed?.jobId || crypto.randomUUID()).slice(0, 12);
    console.error('[ai_designer_background_failed]', {
      diagnosticId,
      action: claimed?.action || null,
      stage: error?.pipelineStage || claimed?.stage || null,
      category: error?.code || 'AI_REQUEST_FAILED',
      originalCode: error?.originalCode || null,
      providerRequestId: error?.providerRequestId || null,
      providerStatus: Number(error?.status || error?.response?.status || 0) || null,
      errorName: error?.name || null,
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

async function runBriefRequest(body, session) {
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
    user: providerUser(session),
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
  return { ok: true, brief: publicBrief(brief), model: interpreted.model, requestId: interpreted.requestId };
}

async function briefHandler(event) {
  return enqueueHandler(event, 'brief');
}

function repairableFailures(validation) {
  if (validation.passed) return [];
  const failures = [];
  if (!validation.checks.edgeCoverage.passed) failures.push('blank or letterboxed edge coverage');
  if (validation.vision.available && !validation.checks.flatArtwork.passed && validation.checks.flatArtwork.flags.length) failures.push(...validation.checks.flatArtwork.flags);
  if (!validation.checks.aspectRatio.passed) failures.push('incorrect aspect ratio');
  return failures;
}

async function finalizeConcept({ rawBackground, brief, plan, logo, reference, session, providerResult, providerCalls, allowRepair = true }) {
  const { normalizeBackground } = require('./image-utils.cjs');
  const { compositeArtwork } = require('./compositor.cjs');
  const { validateArtwork } = require('./validation.cjs');
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

async function runGenerateRequest(body, session) {
  const started = Date.now();
  const { brief, plan, reference, logo } = await withPipelineStage('preparing the design inputs', () => prepareInputs(body));
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
  const generated = await withPipelineStage('generating the artwork', () => generateImage({
    prompt: buildGenerationPrompt(brief, plan, 0),
    size: plan.providerSize,
    user: providerUser(session),
  }));
  const providerCalls = [generated];
  let guided = generated;
  if (reference || plan.strategy === 'gpt-image-2-outpainting') {
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
      user: providerUser(session),
    }));
    providerCalls.push(guided);
  }
  const finalized = await withPipelineStage('compositing and validating the artwork', () => finalizeConcept({ rawBackground: guided.buffer, brief, plan, logo, reference, session, providerResult: guided, providerCalls }));
  const backgroundRef = await withPipelineStage('saving the editable artwork', () => storeTemporaryArtwork(finalized.background, { session, generationId }));
  const aggregateUsage = aggregateImageUsage(providerCalls);
  const concept = conceptPayload({
    id: crypto.randomUUID(),
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

async function runEditRequest(body, session) {
  const { validateInputImage } = require('./image-utils.cjs');
  const started = Date.now();
  const { brief, plan, reference, logo } = await withPipelineStage('preparing the edit inputs', () => prepareInputs(body));
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
  const edited = await withPipelineStage('editing the artwork', () => editImage({
    prompt: buildEditPrompt(brief, plan, instruction),
    size: plan.providerSize,
    currentImage: current.buffer,
    currentMime: current.mimeType,
    referenceImage: reference,
    user: providerUser(session),
  }));
  const providerCalls = [edited];
  const finalized = await withPipelineStage('compositing and validating the edited artwork', () => finalizeConcept({ rawBackground: edited.buffer, brief, plan, logo, reference, session, providerResult: edited, providerCalls }));
  const backgroundRef = await withPipelineStage('saving the editable artwork', () => storeTemporaryArtwork(finalized.background, { session, generationId: String(body.generationId || 'edit') }));
  const aggregateUsage = aggregateImageUsage(providerCalls);
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
    usage: aggregateUsage,
    estimatedCostUsd: estimatedImageCostUsd(aggregateUsage),
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
  return { ok: true, brief: publicBrief(brief), concept, usedOriginalImage: true, durationMs: Date.now() - started };
}

async function editHandler(event) {
  return enqueueHandler(event, 'edit');
}

function retiredHandler(event) {
  const auth = authorize(event, { requireOrigin: event.httpMethod !== 'GET' });
  if (auth.response) return auth.response;
  return json(410, {
    error: 'EXPERIMENTAL_ENDPOINT_RETIRED',
    message: 'This experimental AI endpoint has been retired. Use the production AI Designer.',
  });
}

module.exports = { statusHandler, briefHandler, generateHandler, editHandler, jobHandler, workerHandler, retiredHandler };
