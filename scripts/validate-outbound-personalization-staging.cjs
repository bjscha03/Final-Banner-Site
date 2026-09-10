#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const { appendAudit } = require('../netlify/functions/_shared/outbound-sales/audit.cjs');
const { reserveBudget, validateCost } = require('../netlify/functions/_shared/outbound-sales/budget.cjs');
const {
  OUTBOUND_OPENAI_MODEL,
  effectiveControlState,
  getRuntimeConfig,
} = require('../netlify/functions/_shared/outbound-sales/config.cjs');
const {
  OUTPUT_FORMAT,
  PROMPT_VERSION,
} = require('../netlify/functions/_shared/outbound-sales/personalization-contract.cjs');
const {
  MAX_REQUEST_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  assertOpenAIExecutionAllowed,
  classifyProviderError,
} = require('../netlify/functions/_shared/outbound-sales/openai-personalization.cjs');
const { generateShadowPersonalization } = require('../netlify/functions/_shared/outbound-sales/personalization.cjs');

const CONFIRMATION = 'one-shadow-request-approved';
const PROSPECT_ID = '00000000-0000-4000-8000-000000000303';
const PROVIDER_RECORD_ID = 'phase3-deterministic-shadow-validation-v1';
const EXPECTED_EXTERNAL_REQUESTS = 1;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function safeError(error) {
  return String(error?.message || error || 'Unknown staging validation failure')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b(?:sk|rk|re)-[a-z0-9_-]{8,}/gi, '[REDACTED_API_KEY]')
    .slice(0, 1200);
}

function readOwnerOnlyFile(filePath, label) {
  if (!filePath) fail('STAGING_VALIDATION_CONFIGURATION_MISSING', `${label} file path is required.`);
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || (stats.mode & 0o077) !== 0) {
    fail('STAGING_VALIDATION_SECRET_PERMISSIONS', `${label} must be an owner-only regular file.`);
  }
  const value = fs.readFileSync(filePath, 'utf8').trim();
  if (!value) fail('STAGING_VALIDATION_CONFIGURATION_MISSING', `${label} is empty.`);
  return value;
}

function apiKeyFromFile(filePath) {
  const source = readOwnerOnlyFile(filePath, 'Outbound OpenAI key');
  const candidate = source.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && (line.includes('sk-') || !line.includes('=')));
  const value = String(candidate || '').replace(/^[A-Z0-9_]+\s*=\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(value)) {
    fail('STAGING_VALIDATION_CONFIGURATION_INVALID', 'The dedicated outbound OpenAI key file is invalid.');
  }
  return value;
}

function assertValidationConfirmation(env = process.env) {
  if (env.OUTBOUND_STAGING_OPENAI_VALIDATION_CONFIRMATION !== CONFIRMATION
      || Number(env.OUTBOUND_STAGING_EXPECTED_OPENAI_REQUESTS) !== EXPECTED_EXTERNAL_REQUESTS) {
    fail('STAGING_VALIDATION_NOT_APPROVED', 'The exact one-request Shadow Mode confirmation is required.');
  }
}

function validatePreviewTarget(databaseUrl, env = process.env) {
  const branchLabel = String(env.OUTBOUND_TEST_BRANCH_LABEL || '').trim();
  if (!/(preview|staging|test|phase[-_ ]?[123])/i.test(branchLabel)) {
    fail('STAGING_VALIDATION_TARGET_REJECTED', 'The branch label does not identify an isolated preview branch.');
  }
  const parsed = new URL(databaseUrl);
  const endpointId = parsed.hostname.split('.')[0].toLowerCase().replace(/-pooler$/, '');
  const expectedEndpointId = String(env.OUTBOUND_TEST_ENDPOINT_ID || '').trim().toLowerCase();
  if (!parsed.password || !parsed.hostname.endsWith('.neon.tech') || endpointId !== expectedEndpointId) {
    fail('STAGING_VALIDATION_TARGET_REJECTED', 'The database is not the explicitly approved Neon preview endpoint.');
  }
  for (const candidate of [env.NETLIFY_DATABASE_URL, env.DATABASE_URL, env.NEON_DATABASE_URL].filter(Boolean)) {
    try {
      if (new URL(candidate).hostname.toLowerCase() === parsed.hostname.toLowerCase()) {
        fail('STAGING_VALIDATION_TARGET_REJECTED', 'The preview endpoint matches an ordinary application database endpoint.');
      }
    } catch (error) {
      if (error?.code === 'STAGING_VALIDATION_TARGET_REJECTED') throw error;
    }
  }
  return { branchLabel, endpointId };
}

function captureCode(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return error?.code || 'UNCLASSIFIED';
  }
}

function dollarsFromMicrousd(value) {
  return Number((Number(value || 0) / 1_000_000).toFixed(6));
}

async function seedDeterministicProspect(sql) {
  const existing = await sql(`SELECT id FROM outbound_prospects WHERE id = $1 OR source_record_id = $2`, [PROSPECT_ID, PROVIDER_RECORD_ID]);
  if (existing.length) fail('STAGING_VALIDATION_ALREADY_RECORDED', 'The deterministic Phase 3 validation prospect already exists.');

  const sourceUrl = 'https://rivercitysports.example/events';
  const evidence = [
    {
      code: 'upcoming_youth_tournaments',
      label: 'Upcoming youth tournaments',
      evidence: 'River City Sports Center lists three September youth soccer tournaments at its two Louisville sports complexes.',
      sourceUrl,
    },
    {
      code: 'sponsor_banner_opportunity',
      label: 'Sponsor banner opportunity',
      evidence: 'The public sponsorship page offers courtside banner placement and sponsor recognition during tournament weekends.',
      sourceUrl,
    },
    {
      code: 'event_wayfinding_need',
      label: 'Event wayfinding need',
      evidence: 'The registration page highlights family check-in areas and directional wayfinding for visiting teams.',
      sourceUrl,
    },
  ];
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');

  await sql(
    `INSERT INTO outbound_prospects (
       id, source_provider_id, source_record_id, source_url,
       business_name, normalized_business_name, dedupe_fingerprint,
       website_url, canonical_domain, industry, business_type, location_count,
       status, lead_score, score_breakdown, score_explanation,
       qualification_evidence, research_state, contact_state,
       qualification_version, exclusion_codes, last_qualified_at,
       website_content_hash, last_researched_at
     ) VALUES (
       $1, 'licensed_fixture', $2, $3,
       'River City Sports Center', 'river city sports center',
       'domain:rivercitysports.example', $3, 'rivercitysports.example',
       'Sports and recreation', 'Youth sports facility', 2,
       'ready_for_outreach', 86, $4::jsonb, $5::jsonb,
       $6::jsonb, 'fetched', 'found', 'deterministic-v1', '[]'::jsonb,
       NOW(), $7, NOW()
     )`,
    [
      PROSPECT_ID,
      PROVIDER_RECORD_ID,
      sourceUrl,
      JSON.stringify({ industry: 15, upcoming_events: 15, visible_print_marketing_need: 20, contact_quality: 15, multiple_locations: 8 }),
      JSON.stringify(evidence.map((item) => ({ factor: item.code, points: item.code === 'sponsor_banner_opportunity' ? 20 : 15, evidence: item.evidence, sourceUrl }))),
      JSON.stringify(evidence),
      contentHash,
    ],
  );
  await sql(
    `INSERT INTO outbound_prospect_sources (prospect_id, provider_id, provider_record_id, source_url, provider_metadata)
     VALUES ($1, 'licensed_fixture', $2, $3, '{"validation_only":true}'::jsonb)`,
    [PROSPECT_ID, PROVIDER_RECORD_ID, sourceUrl],
  );
  const contacts = await sql(
    `INSERT INTO outbound_contacts (
       prospect_id, full_name, job_title, email, email_normalized, is_primary,
       contact_quality_score, verification_status, verification_reason,
       source_url, syntax_valid, is_role_address, is_free_mailbox,
       domain_matches, active, mx_status, mx_checked_at, send_eligible
     ) VALUES (
       $1, 'Alex Morgan', 'Community Events Director',
       'alex@rivercitysports.example', 'alex@rivercitysports.example', TRUE,
       95, 'valid', 'deterministic staging fixture', $2,
       TRUE, FALSE, FALSE, TRUE, TRUE, 'present', NOW(), FALSE
     ) RETURNING id, send_eligible`,
    [PROSPECT_ID, sourceUrl],
  );
  await sql(
    `INSERT INTO outbound_research_snapshots (
       prospect_id, content_hash, website_url, source_urls,
       extracted_facts, evidence, banner_need_signals,
       website_freshness_score, final_url, http_status, content_type,
       content_bytes, extraction_version, cache_status, page_manifest
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $6::jsonb,
       92, $3, 200, 'text/html', 1024, 'deterministic-html-v1',
       'fresh', $7::jsonb
     )`,
    [
      PROSPECT_ID,
      contentHash,
      sourceUrl,
      JSON.stringify([sourceUrl]),
      JSON.stringify({
        title: 'Youth soccer tournaments and sponsor opportunities',
        description: 'River City Sports Center hosts Louisville youth tournaments with sponsor banners, family check-in, and visiting-team wayfinding.',
      }),
      JSON.stringify(evidence),
      JSON.stringify([{ url: sourceUrl, contentHash, status: 200 }]),
    ],
  );
  await appendAudit(sql, {
    action: 'prospect.phase3_validation_seeded',
    entityType: 'prospect',
    entityId: PROSPECT_ID,
    metadata: { providerId: 'licensed_fixture', validationOnly: true, shadowMode: true },
    requestId: 'phase3-staging-validation',
  });
  if (contacts[0]?.send_eligible !== false) fail('STAGING_VALIDATION_UNSAFE_CONTACT', 'The validation contact is unexpectedly send-eligible.');
  return { contentHash, contactId: contacts[0]?.id };
}

async function main() {
  assertValidationConfirmation();
  const databaseUrl = readOwnerOnlyFile(process.env.OUTBOUND_TEST_DATABASE_URL_FILE, 'Neon preview URL');
  const apiKey = apiKeyFromFile(process.env.OUTBOUND_OPENAI_API_KEY_FILE);
  const target = validatePreviewTarget(databaseUrl);
  const { neon } = await import('@neondatabase/serverless');
  const OpenAI = (await import('openai')).default;
  const sql = neon(databaseUrl);
  const identity = await sql(`
    SELECT current_database() AS database_name, current_user AS database_user,
           current_setting('transaction_read_only') AS transaction_read_only,
           EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='outbound_settings'
                AND column_name='shadow_generation_enabled'
           ) AS phase3_ready
  `);
  if (identity[0]?.transaction_read_only !== 'off' || identity[0]?.phase3_ready !== true) {
    fail('STAGING_VALIDATION_TARGET_REJECTED', 'The preview database is not writable or migration 023 is absent.');
  }

  const settingsRows = await sql(`
    SELECT shadow_mode_enabled, shadow_generation_enabled, live_sending_enabled,
           emergency_paused, daily_send_limit, monthly_openai_budget_cents,
           openai_project_limit_recommendation_cents, settings_version
      FROM outbound_settings WHERE id=1
  `);
  const original = settingsRows[0];
  if (!original || original.shadow_mode_enabled !== true || original.live_sending_enabled !== false) {
    fail('STAGING_VALIDATION_UNSAFE_SETTINGS', 'Shadow Mode must be on and Live Sending off before validation.');
  }

  let seeded = false;
  let externalRequests = 0;
  let requestContract = null;
  try {
    await seedDeterministicProspect(sql);
    seeded = true;

    await sql(`UPDATE outbound_settings SET shadow_generation_enabled=TRUE, monthly_openai_budget_cents=0 WHERE id=1`);
    const zeroBudgetReservation = await reserveBudget(sql, {
      category: 'openai', providerId: 'openai',
      reservationKey: 'phase3-validation-zero-budget-v1',
      estimatedCostMicrousd: 1,
      referenceType: 'prospect', referenceId: PROSPECT_ID,
      usageMetadata: { validationOnly: true },
    });
    if (zeroBudgetReservation !== null) fail('STAGING_VALIDATION_BUDGET_FAILURE', 'A zero-dollar local budget accepted a reservation.');
    await sql(`UPDATE outbound_settings SET monthly_openai_budget_cents=$1 WHERE id=1`, [original.monthly_openai_budget_cents]);

    const perProspectCapCode = captureCode(() => validateCost('openai', 10001));
    if (perProspectCapCode !== 'OPENAI_PROSPECT_COST_LIMIT') {
      fail('STAGING_VALIDATION_BUDGET_FAILURE', 'The per-prospect OpenAI ceiling did not fail closed.');
    }

    const runtimeEnv = {
      CONTEXT: 'deploy-preview',
      NODE_ENV: 'production',
      OUTBOUND_SALES_ENABLED: 'true',
      OUTBOUND_PHASE3_SHADOW_EXECUTION_ENABLED: 'true',
      OUTBOUND_OPENAI_API_KEY: apiKey,
    };
    const runtime = getRuntimeConfig(runtimeEnv);
    const controls = effectiveControlState({
      shadowModeEnabled: true,
      shadowGenerationEnabled: true,
      liveSendingEnabled: false,
      emergencyPaused: false,
      dailySendLimit: Number(original.daily_send_limit),
      monthlyOpenAIBudgetCents: Number(original.monthly_openai_budget_cents),
    }, runtime);
    if (!controls.shadowGenerationEnabled || controls.liveSendingEnabled) {
      fail('STAGING_VALIDATION_UNSAFE_SETTINGS', 'The approved Shadow controls did not resolve safely.');
    }

    const productionGateCode = captureCode(() => assertOpenAIExecutionAllowed({ ...runtimeEnv, CONTEXT: 'production' }));
    const missingKeyCode = captureCode(() => assertOpenAIExecutionAllowed({ ...runtimeEnv, OUTBOUND_OPENAI_API_KEY: '' }));
    const gracefulErrors = {
      authorization: classifyProviderError(Object.assign(new Error('synthetic'), { status: 401 })).code,
      projectBudget: classifyProviderError(Object.assign(new Error('synthetic'), { status: 429, code: 'insufficient_quota' })).code,
      rateLimit: classifyProviderError(Object.assign(new Error('synthetic'), { status: 429, code: 'rate_limit_exceeded' })).code,
      timeout: classifyProviderError(Object.assign(new Error('synthetic'), { name: 'APIConnectionTimeoutError' })).code,
    };
    if (productionGateCode !== 'PERSONALIZATION_CONTEXT_BLOCKED'
        || missingKeyCode !== 'OUTBOUND_OPENAI_NOT_CONFIGURED'
        || gracefulErrors.authorization !== 'OUTBOUND_OPENAI_AUTHORIZATION_FAILED'
        || gracefulErrors.projectBudget !== 'OUTBOUND_OPENAI_PROJECT_BUDGET_REACHED'
        || gracefulErrors.rateLimit !== 'OUTBOUND_OPENAI_RATE_LIMITED'
        || gracefulErrors.timeout !== 'OUTBOUND_OPENAI_TIMEOUT') {
      fail('STAGING_VALIDATION_ERROR_MAPPING_FAILURE', 'A fail-closed OpenAI error mapping is incorrect.');
    }

    const realClient = new OpenAI({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
    const guardedClient = {
      responses: {
        create: async (request, requestOptions) => {
          if (externalRequests >= EXPECTED_EXTERNAL_REQUESTS) {
            const error = new Error('The one-request staging validation limit blocked another external request.');
            error.status = 400;
            error.code = 'validation_single_request_limit';
            throw error;
          }
          externalRequests += 1;
          requestContract = {
            model: request.model,
            store: request.store,
            maxOutputTokens: request.max_output_tokens,
            reasoningEffort: request.reasoning?.effort,
            verbosity: request.text?.verbosity,
            structuredOutputType: request.text?.format?.type,
            structuredOutputName: request.text?.format?.name,
            structuredOutputStrict: request.text?.format?.strict,
            toolsPresent: Object.hasOwn(request, 'tools'),
            idempotencyKeyPresent: Boolean(requestOptions?.headers?.['Idempotency-Key']),
            timeoutMs: REQUEST_TIMEOUT_MS,
            sdkMaxRetries: 0,
            applicationMaximumAttempts: MAX_REQUEST_ATTEMPTS,
          };
          return realClient.responses.create(request, requestOptions);
        },
      },
    };

    const result = await generateShadowPersonalization({
      sql, prospectId: PROSPECT_ID, controls, env: runtimeEnv,
      client: guardedClient,
      requestId: 'phase3-staging-validation',
      now: new Date('2026-08-06T12:00:00.000Z'),
    });
    const cached = await generateShadowPersonalization({
      sql, prospectId: PROSPECT_ID, controls, env: runtimeEnv,
      client: guardedClient,
      requestId: 'phase3-staging-validation-cache-check',
      now: new Date('2026-08-06T12:00:00.000Z'),
    });
    if (externalRequests !== EXPECTED_EXTERNAL_REQUESTS || !cached.cacheHit || !cached.skipped) {
      fail('STAGING_VALIDATION_REQUEST_COUNT_FAILURE', 'The validation did not make exactly one external request followed by a cache hit.');
    }

    const diagnostics = await sql(
      `SELECT m.id AS message_id, m.status AS message_status, m.generation_status,
              m.model, m.input_tokens, m.cached_input_tokens, m.output_tokens,
              m.estimated_openai_cost_microusd, m.actual_openai_cost_microusd,
              m.evidence_validation_status, m.generation_metadata, m.content_hash,
              m.resend_message_id, m.scheduled_at, m.sent_at, m.delivered_at,
              c.send_eligible,
              u.provider_request_id, u.status AS usage_status, u.latency_ms,
              u.usage_metadata, l.status AS ledger_status,
              l.estimated_cost_microusd AS ledger_estimated_cost_microusd,
              l.actual_cost_microusd AS ledger_actual_cost_microusd,
              (SELECT count(*)::int FROM outbound_email_events e WHERE e.message_id=m.id) AS email_event_count
         FROM outbound_messages m
         JOIN outbound_contacts c ON c.id=m.contact_id
         JOIN outbound_ai_usage u ON u.message_id=m.id
         JOIN outbound_cost_ledger l ON l.id=u.cost_ledger_id
        WHERE m.id=$1`,
      [result.message.id],
    );
    const row = diagnostics[0];
    if (!row
        || row.message_status !== 'draft'
        || row.generation_status !== 'generated'
        || row.evidence_validation_status !== 'passed'
        || row.send_eligible !== false
        || row.resend_message_id !== null
        || row.scheduled_at !== null
        || row.sent_at !== null
        || row.delivered_at !== null
        || Number(row.email_event_count) !== 0
        || row.usage_status !== 'completed'
        || row.ledger_status !== 'committed'
        || Number(row.actual_openai_cost_microusd) !== Number(row.ledger_actual_cost_microusd)
        || row.generation_metadata?.rawResponse
        || row.generation_metadata?.prompt
        || row.usage_metadata?.rawResponse
        || row.usage_metadata?.prompt) {
      fail('STAGING_VALIDATION_PERSISTENCE_FAILURE', 'The persisted Shadow diagnostics failed their no-send or minimal-data contract.');
    }
    if (!requestContract
        || requestContract.model !== OUTBOUND_OPENAI_MODEL
        || requestContract.store !== false
        || requestContract.reasoningEffort !== 'none'
        || requestContract.verbosity !== 'low'
        || requestContract.structuredOutputType !== OUTPUT_FORMAT.type
        || requestContract.structuredOutputName !== OUTPUT_FORMAT.name
        || requestContract.structuredOutputStrict !== true
        || requestContract.toolsPresent
        || !requestContract.idempotencyKeyPresent
        || requestContract.timeoutMs !== 30000
        || requestContract.applicationMaximumAttempts !== 2) {
      fail('STAGING_VALIDATION_REQUEST_CONTRACT_FAILURE', 'The live request did not honor the reviewed OpenAI contract.');
    }
    if (Number(row.actual_openai_cost_microusd) >= 20000
        || Number(row.estimated_openai_cost_microusd) > 10000) {
      fail('STAGING_VALIDATION_COST_FAILURE', 'The validation exceeded an OpenAI cost target or ceiling.');
    }

    await appendAudit(sql, {
      action: 'message.phase3_staging_validation_completed',
      entityType: 'message', entityId: row.message_id,
      newValues: { generationStatus: row.generation_status, evidenceValidationStatus: row.evidence_validation_status },
      metadata: {
        validationOnly: true,
        shadowMode: true,
        externalRequests,
        model: row.model,
        promptVersion: PROMPT_VERSION,
        providerRequestId: row.provider_request_id,
        inputTokens: Number(row.input_tokens),
        cachedInputTokens: Number(row.cached_input_tokens),
        outputTokens: Number(row.output_tokens),
        latencyMs: Number(row.latency_ms),
        estimatedCostMicrousd: Number(row.estimated_openai_cost_microusd),
        actualCostMicrousd: Number(row.actual_openai_cost_microusd),
        cacheHitVerified: true,
        zeroEmailEvents: true,
      },
      requestId: 'phase3-staging-validation',
    });

    await sql(`UPDATE outbound_settings SET shadow_generation_enabled=$1, monthly_openai_budget_cents=$2 WHERE id=1`, [
      original.shadow_generation_enabled,
      original.monthly_openai_budget_cents,
    ]);
    const restored = await sql(`SELECT shadow_mode_enabled, shadow_generation_enabled, live_sending_enabled FROM outbound_settings WHERE id=1`);
    if (restored[0]?.shadow_mode_enabled !== true
        || restored[0]?.shadow_generation_enabled !== false
        || restored[0]?.live_sending_enabled !== false) {
      fail('STAGING_VALIDATION_SETTINGS_RESTORE_FAILURE', 'The staging controls were not restored to fail-closed defaults.');
    }

    console.log(JSON.stringify({
      ok: true,
      target: {
        provider: 'Neon', endpointId: target.endpointId, branchLabel: target.branchLabel,
        databaseName: identity[0]?.database_name, databaseUser: identity[0]?.database_user,
        production: false,
      },
      request: { ...requestContract, externalRequests },
      response: {
        providerRequestId: row.provider_request_id || null,
        model: row.model,
        generationStatus: row.generation_status,
        evidenceValidationStatus: row.evidence_validation_status,
        contentHash: row.content_hash,
        attempts: Number(row.generation_metadata?.attempts) || 0,
        cacheHitVerified: true,
      },
      usage: {
        inputTokens: Number(row.input_tokens),
        cachedInputTokens: Number(row.cached_input_tokens),
        outputTokens: Number(row.output_tokens),
      },
      cost: {
        estimatedMicrousd: Number(row.estimated_openai_cost_microusd),
        estimatedUsd: dollarsFromMicrousd(row.estimated_openai_cost_microusd),
        actualMicrousd: Number(row.actual_openai_cost_microusd),
        actualUsd: dollarsFromMicrousd(row.actual_openai_cost_microusd),
        ledgerStatus: row.ledger_status,
        localMonthlyBudgetUsd: Number(original.monthly_openai_budget_cents) / 100,
        perProspectApplicationCeilingUsd: 0.01,
        targetAverageUsd: 0.02,
      },
      latencyMs: Number(row.latency_ms),
      validations: {
        localZeroBudgetBlocked: true,
        perProspectCeilingBlocked: true,
        productionContextBlocked: true,
        missingCredentialBlocked: true,
        gracefulErrors,
        structuredOutputValidated: true,
        promptAndRawResponseNotPersisted: true,
        unchangedResearchCacheHit: true,
        settingsRestoredFailClosed: true,
      },
      delivery: {
        messageStatus: row.message_status,
        sendEligible: row.send_eligible,
        resendMessageId: row.resend_message_id,
        scheduledAt: row.scheduled_at,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        emailEventCount: Number(row.email_event_count),
        emailsSent: 0,
      },
    }, null, 2));
  } finally {
    if (seeded) {
      await sql(`UPDATE outbound_settings SET shadow_generation_enabled=$1, monthly_openai_budget_cents=$2 WHERE id=1`, [
        original.shadow_generation_enabled,
        original.monthly_openai_budget_cents,
      ]).catch(() => null);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: error?.code || 'STAGING_PERSONALIZATION_VALIDATION_FAILED',
      message: safeError(error),
    }));
    process.exitCode = 1;
  });
}
