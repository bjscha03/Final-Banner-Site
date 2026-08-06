'use strict';

const { getRuntimeConfig, OUTBOUND_OPENAI_MODEL } = require('./config.cjs');
const { reserveBudget, commitBudget, releaseBudget, validateCost } = require('./budget.cjs');
const { appendAudit } = require('./audit.cjs');
const { loadExclusions } = require('./exclusions.cjs');
const { scoreLead } = require('./qualification.cjs');
const discoveryRepository = require('./discovery-repository.cjs');
const repository = require('./personalization-repository.cjs');
const { loadCampaignExperiment, assignCampaignVariants } = require('./campaign-repository.cjs');
const { generateStructuredPersonalization } = require('./openai-personalization.cjs');
const {
  PROMPT_VERSION,
  OUTPUT_SCHEMA_VERSION,
  buildEvidenceBundle,
  deterministicVariantAssignments,
  buildPersonalizationPrompt,
  validatePersonalizationOutput,
  generationKey,
  calculateOpenAICostMicrousd,
  validateOpenAIUsage,
  estimateOpenAICostMicrousd,
  outputContentHash,
  recommendedFollowUpAt,
} = require('./personalization-contract.cjs');
const { renderOutboundEmailPreview } = require('./personalization-template.cjs');
const { redactSecretText } = require('./security.cjs');

function personalizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPersonalizationControls(controls) {
  if (controls?.outboundSalesEnabled !== true) {
    throw personalizationError('SHADOW_GENERATION_DISABLED', 'The outbound-sales environment kill switch is disabled.');
  }
  if (!controls?.shadowModeEnabled || controls?.liveSendingEnabled) {
    throw personalizationError('SHADOW_GENERATION_DISABLED', 'Personalization requires Shadow Mode with Live Sending disabled.');
  }
  if (controls?.emergencyPaused) {
    throw personalizationError('SHADOW_GENERATION_DISABLED', 'The emergency pause blocks personalization.');
  }
  if (controls?.shadowGenerationEnabled !== true) {
    throw personalizationError('SHADOW_GENERATION_DISABLED', 'Shadow personalization is disabled.');
  }
}

function assertCandidateEligible(candidate) {
  const prospect = candidate?.prospect;
  const contact = candidate?.contact;
  const research = candidate?.research;
  const blocked = !prospect
    || prospect.status !== 'ready_for_outreach'
    || prospect.priorCustomerMatch
    || prospect.firstContactedAt
    || prospect.suppressionReason
    || (prospect.exclusionCodes || []).length
    || !research?.contentHash
    || !contact
    || !contact.syntaxValid
    || contact.mxStatus !== 'present'
    || contact.isRoleAddress
    || contact.isFreeMailbox
    || !contact.domainMatches;
  if (blocked) {
    throw personalizationError('PERSONALIZATION_NOT_ELIGIBLE', 'The prospect is not eligible for grounded Shadow Mode personalization.');
  }
  return candidate;
}

function cachedResult(candidate, key) {
  if (candidate?.message?.generationStatus !== 'generated' || candidate.message.generationKey !== key) return null;
  return {
    skipped: true,
    cacheHit: true,
    prospectId: candidate.prospect.id,
    message: candidate.message,
  };
}

async function refreshHardExclusions(sql, candidate, dependencies, requestId) {
  const prospect = candidate.prospect;
  const exclusions = await dependencies.loadExclusions(sql, {
    providerId: prospect.providerId,
    providerRecordId: prospect.providerRecordId,
    canonicalDomain: prospect.canonicalDomain,
  }, [candidate.contact.email], { prospectId: prospect.id });
  if (!exclusions.length) return [];
  const qualification = dependencies.scoreLead({ prospect, exclusions });
  await dependencies.saveQualification(sql, prospect.id, qualification);
  await dependencies.appendAudit(sql, {
    action: 'prospect.personalization_blocked_by_exclusion',
    entityType: 'prospect',
    entityId: prospect.id,
    newValues: { status: qualification.status, leadScore: qualification.score },
    metadata: { exclusionCodes: qualification.exclusionCodes, phase: 'shadow_personalization' },
    requestId,
  });
  throw personalizationError('PERSONALIZATION_NOT_ELIGIBLE', 'A current suppression or customer-history exclusion blocks personalization.');
}

async function generateShadowPersonalization(options) {
  const dependencies = {
    getRuntimeConfig,
    ...repository,
    appendAudit,
    loadExclusions,
    scoreLead,
    saveQualification: discoveryRepository.saveQualification,
    reserveBudget,
    commitBudget,
    releaseBudget,
    generateStructuredPersonalization,
    loadCampaignExperiment,
    assignCampaignVariants,
    ...options.dependencies,
  };
  const sql = options.sql;
  if (typeof sql !== 'function') throw new TypeError('A database query function is required.');
  assertPersonalizationControls(options.controls);

  const prospectId = String(options.prospectId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(prospectId)) {
    throw personalizationError('PERSONALIZATION_NOT_ELIGIBLE', 'A valid prospect identifier is required.');
  }
  let candidate = assertCandidateEligible(await dependencies.loadPersonalizationCandidate(sql, prospectId));
  await refreshHardExclusions(sql, candidate, dependencies, options.requestId || null);

  const bundle = buildEvidenceBundle(candidate);
  const experiment = await dependencies.loadCampaignExperiment(sql);
  const variants = dependencies.assignCampaignVariants(prospectId, experiment);
  // A malformed or empty campaign configuration must never silently remove
  // the required copy controls. The deterministic baseline is safe and keeps
  // personalization available while the campaign is repaired.
  const resolvedVariants = Object.keys(variants || {}).length > 1
    ? variants
    : deterministicVariantAssignments(prospectId, bundle.researchContentHash);
  const prompt = buildPersonalizationPrompt(bundle, resolvedVariants);
  const runtime = dependencies.getRuntimeConfig(options.env || process.env);
  const key = generationKey({ prospectId, researchContentHash: bundle.researchContentHash, variants: resolvedVariants, model: runtime.openAIModel });
  const existing = cachedResult(candidate, key);
  if (existing) return existing;

  const estimatedCostMicrousd = validateCost(
    'openai',
    estimateOpenAICostMicrousd(prompt.inputTokenUpperBound),
  );
  const claim = await dependencies.claimPersonalization(sql, {
    prospectId,
    contactId: candidate.contact.id,
    campaignId: experiment.campaignId,
    generationKey: key,
    promptVersion: PROMPT_VERSION,
    outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    researchContentHash: bundle.researchContentHash,
    model: runtime.openAIModel || OUTBOUND_OPENAI_MODEL,
    variantAssignments: resolvedVariants,
    estimatedCostMicrousd,
  });

  const reservationKey = `openai:${key}`;
  let reservation = null;
  let providerResult = null;
  let providerInvoked = false;
  let actualCostMicrousd = null;
  try {
    reservation = await dependencies.reserveBudget(sql, {
      category: 'openai',
      providerId: 'openai',
      reservationKey,
      estimatedCostMicrousd,
      referenceType: 'message',
      referenceId: claim.id,
      usageMetadata: {
        purpose: 'personalized_outreach',
        promptVersion: PROMPT_VERSION,
        model: runtime.openAIModel,
        researchContentHash: bundle.researchContentHash,
      },
    });
    if (!reservation) throw personalizationError('PERSONALIZATION_BUDGET_EXHAUSTED', 'The local OpenAI budget is exhausted.');
    if (reservation.existing === true) {
      candidate = await dependencies.loadPersonalizationCandidate(sql, prospectId);
      const cached = cachedResult(candidate, key);
      if (cached) return cached;
      throw personalizationError('PERSONALIZATION_ALREADY_RUNNING', 'This evidence is already reserved for personalization.');
    }

    providerInvoked = true;
    providerResult = await dependencies.generateStructuredPersonalization({
      prompt,
      generationKey: key,
      env: options.env || process.env,
      client: options.client,
      dependencies: options.providerDependencies || {},
    });
    const validated = validatePersonalizationOutput(providerResult.output, { bundle });
    const { inputTokens, cachedInputTokens, outputTokens } = validateOpenAIUsage(providerResult.usage);
    actualCostMicrousd = validateCost('openai', calculateOpenAICostMicrousd({
      inputTokens,
      cachedInputTokens,
      outputTokens,
    }));
    const selectedEvidence = validated.evidenceIds
      .map((id) => bundle.evidence.find((item) => item.id === id))
      .filter(Boolean);
    const bodyHtml = renderOutboundEmailPreview({ subject: validated.subject, bodyText: validated.bodyText });
    const followUpAt = recommendedFollowUpAt(validated.recommendedFollowUpDelayDays, options.now || new Date());
    const contentHash = outputContentHash({
      subject: validated.subject,
      bodyText: validated.bodyText,
      researchSummary: validated.researchSummary,
    });
    const metadata = {
      attempts: providerResult.attempts,
      wordCount: validated.wordCount,
      personalizationNotes: validated.personalizationNotes,
      recommendedFollowUpDelayDays: validated.recommendedFollowUpDelayDays,
      cacheHit: false,
      shadowMode: true,
    };
    const saved = await dependencies.savePersonalizationSuccess(sql, {
      messageId: claim.id,
      generationKey: key,
      prospectId,
      subject: validated.subject,
      bodyText: validated.bodyText,
      bodyHtml,
      researchSummary: validated.researchSummary,
      personalizationEvidence: selectedEvidence,
      sourceUrls: bundle.sourceUrls,
      variantAssignments: resolvedVariants,
      recommendedFollowUpAt: followUpAt,
      model: providerResult.model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      estimatedCostMicrousd,
      actualCostMicrousd,
      contentHash,
      generationMetadata: metadata,
      researchContentHash: bundle.researchContentHash,
      costLedgerId: reservation.id,
      providerRequestId: providerResult.providerRequestId,
      promptVersion: PROMPT_VERSION,
      latencyMs: providerResult.latencyMs,
    });
    if (!saved) throw personalizationError('PERSONALIZATION_SAVE_CONFLICT', 'The personalization claim changed before it could be saved.');
    await dependencies.commitBudget(sql, {
      reservationKey,
      actualCostMicrousd,
      usageMetadata: {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        promptVersion: PROMPT_VERSION,
        model: providerResult.model,
      },
    });
    await dependencies.appendAudit(sql, {
      action: 'message.shadow_personalization_generated',
      entityType: 'message',
      entityId: claim.id,
      newValues: { generationStatus: 'generated', contentHash, researchContentHash: bundle.researchContentHash },
      metadata: {
        prospectId,
        promptVersion: PROMPT_VERSION,
        model: providerResult.model,
        evidenceIds: validated.evidenceIds,
        estimatedCostMicrousd,
        actualCostMicrousd,
        inputTokens,
        outputTokens,
        shadowMode: true,
      },
      requestId: options.requestId || null,
    });
    return {
      skipped: false,
      cacheHit: false,
      prospectId,
      message: {
        id: claim.id,
        generationStatus: 'generated',
        promptVersion: PROMPT_VERSION,
        outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
        researchContentHash: bundle.researchContentHash,
        model: providerResult.model,
        subject: validated.subject,
        bodyText: validated.bodyText,
        bodyHtml,
        researchSummary: validated.researchSummary,
        personalizationEvidence: selectedEvidence,
        sourceUrls: bundle.sourceUrls,
        variantAssignments: resolvedVariants,
        recommendedFollowUpAt: followUpAt,
        estimatedOpenAICostMicrousd: estimatedCostMicrousd,
        actualOpenAICostMicrousd: actualCostMicrousd,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        evidenceValidationStatus: 'passed',
        generationMetadata: metadata,
        contentHash,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const safeCode = redactSecretText(error?.code || 'PERSONALIZATION_FAILED').slice(0, 100);
    const conservativeCost = providerInvoked ? (actualCostMicrousd ?? estimatedCostMicrousd) : 0;
    if (reservation && reservation.existing !== true) {
      if (providerInvoked) {
        await dependencies.commitBudget(sql, {
          reservationKey,
          actualCostMicrousd: conservativeCost,
          usageMetadata: { failed: true, errorCode: safeCode, promptVersion: PROMPT_VERSION },
        }).catch(() => null);
      } else {
        await dependencies.releaseBudget(sql, reservationKey).catch(() => null);
      }
    }
    await dependencies.savePersonalizationFailure(sql, {
      messageId: claim.id,
      generationKey: key,
      prospectId,
      blocked: ['PERSONALIZATION_BUDGET_EXHAUSTED', 'PERSONALIZATION_NOT_ELIGIBLE'].includes(safeCode),
      errorCode: safeCode,
      costLedgerId: reservation?.id || null,
      model: runtime.openAIModel,
      estimatedCostMicrousd,
      actualCostMicrousd: providerInvoked ? conservativeCost : null,
      providerRequestId: providerResult?.providerRequestId || error?.providerRequestId || null,
      researchContentHash: bundle.researchContentHash,
      promptVersion: PROMPT_VERSION,
      latencyMs: providerResult?.latencyMs ?? error?.latencyMs ?? null,
      metadata: {
        providerInvoked,
        providerStatus: Number(error?.providerStatus) || null,
        providerCode: redactSecretText(error?.providerCode || '').slice(0, 80) || null,
        providerType: redactSecretText(error?.providerType || '').slice(0, 80) || null,
        shadowMode: true,
      },
    }).catch(() => null);
    await dependencies.appendAudit(sql, {
      action: 'message.shadow_personalization_failed',
      entityType: 'message',
      entityId: claim.id,
      metadata: {
        prospectId,
        errorCode: safeCode,
        providerInvoked,
        providerStatus: Number(error?.providerStatus) || null,
        providerCode: redactSecretText(error?.providerCode || '').slice(0, 80) || null,
        estimatedCostMicrousd,
        actualCostMicrousd: providerInvoked ? conservativeCost : null,
        shadowMode: true,
      },
      requestId: options.requestId || null,
    }).catch(() => null);
    throw error;
  }
}

module.exports = {
  personalizationError,
  assertPersonalizationControls,
  assertCandidateEligible,
  cachedResult,
  refreshHardExclusions,
  generateShadowPersonalization,
};
