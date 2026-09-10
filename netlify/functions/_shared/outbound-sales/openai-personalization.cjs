'use strict';

const crypto = require('node:crypto');

const {
  OUTBOUND_OPENAI_MODEL,
  shadowPersonalizationContextAllowed,
  executionContext,
} = require('./config.cjs');
const {
  MAX_OUTPUT_TOKENS,
  OUTPUT_FORMAT,
  PROMPT_VERSION,
} = require('./personalization-contract.cjs');

const REQUEST_TIMEOUT_MS = 30000;
const MAX_REQUEST_ATTEMPTS = 2;
const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH',
  'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);

let cachedClient = null;
let cachedKeyIdentity = null;

function personalizationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause?.request_id || cause?._request_id) error.providerRequestId = cause.request_id || cause._request_id;
  if (Number(cause?.status)) error.providerStatus = Number(cause.status);
  const details = providerDetails(cause);
  if (details.code) error.providerCode = details.code.replace(/[^a-z0-9_.-]/gi, '').slice(0, 80);
  if (details.type) error.providerType = details.type.replace(/[^a-z0-9_.-]/gi, '').slice(0, 80);
  return error;
}

function assertOpenAIExecutionAllowed(env = process.env) {
  const context = executionContext(env);
  if (context === 'production' || !shadowPersonalizationContextAllowed(env)) {
    throw personalizationError(
      'PERSONALIZATION_CONTEXT_BLOCKED',
      'OpenAI personalization is blocked outside explicitly enabled test and staging deployments.',
    );
  }
  const apiKey = String(env.OUTBOUND_OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw personalizationError('OUTBOUND_OPENAI_NOT_CONFIGURED', 'The isolated outbound OpenAI project is not configured.');
  }
  return { context, apiKey };
}

async function getClient(env = process.env) {
  const { apiKey } = assertOpenAIExecutionAllowed(env);
  // Keep even the credential suffix out of process state used for cache
  // comparison. This digest is never returned, logged, or persisted.
  const identity = crypto.createHash('sha256').update(apiKey).digest('hex');
  if (!cachedClient || cachedKeyIdentity !== identity) {
    const sdk = await import('openai');
    cachedClient = new sdk.default({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
    cachedKeyIdentity = identity;
  }
  return cachedClient;
}

function providerDetails(error) {
  const nested = error?.error && typeof error.error === 'object' ? error.error : {};
  return {
    status: Number(error?.status || error?.response?.status || nested.status || 0),
    code: String(error?.code || nested.code || error?.cause?.code || ''),
    type: String(error?.type || nested.type || ''),
    name: String(error?.name || error?.cause?.name || ''),
    requestId: error?.request_id || error?._request_id || nested.request_id || null,
  };
}

function isTransientProviderError(error) {
  const details = providerDetails(error);
  return details.status === 408
    || details.status === 409
    || details.status === 429
    || details.status >= 500
    || details.name === 'APIConnectionError'
    || details.name === 'APIConnectionTimeoutError'
    || details.name === 'AbortError'
    || TRANSIENT_CODES.has(details.code);
}

function classifyProviderError(error) {
  const details = providerDetails(error);
  if (details.status === 401 || details.status === 403 || details.code === 'invalid_api_key') {
    return personalizationError('OUTBOUND_OPENAI_AUTHORIZATION_FAILED', 'The outbound OpenAI project rejected its credential.', error);
  }
  if (details.status === 429) {
    const code = ['insufficient_quota', 'billing_hard_limit_reached', 'usage_limit_reached'].includes(details.code)
      || details.type === 'insufficient_quota'
      ? 'OUTBOUND_OPENAI_PROJECT_BUDGET_REACHED'
      : 'OUTBOUND_OPENAI_RATE_LIMITED';
    return personalizationError(code, code.endsWith('BUDGET_REACHED')
      ? 'The outbound OpenAI project budget has been reached.'
      : 'The outbound OpenAI project is rate limited.', error);
  }
  if (details.name === 'AbortError' || details.name === 'APIConnectionTimeoutError' || details.code === 'ETIMEDOUT') {
    return personalizationError('OUTBOUND_OPENAI_TIMEOUT', 'The outbound OpenAI request timed out.', error);
  }
  if (isTransientProviderError(error)) {
    return personalizationError('OUTBOUND_OPENAI_UNAVAILABLE', 'The outbound OpenAI service is temporarily unavailable.', error);
  }
  if ([400, 404, 422].includes(details.status) || details.code === 'model_not_found') {
    return personalizationError('OUTBOUND_OPENAI_REQUEST_REJECTED', 'The outbound OpenAI request or model was rejected.', error);
  }
  return personalizationError('OUTBOUND_OPENAI_REQUEST_FAILED', 'The outbound OpenAI request failed.', error);
}

function requestOptions(signal, generationKey) {
  return {
    signal,
    maxRetries: 0,
    idempotencyKey: generationKey,
    headers: { 'Idempotency-Key': generationKey },
  };
}

async function oneRequest(client, request, generationKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    return await client.responses.create(request, requestOptions(controller.signal, generationKey));
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(client, request, generationKey, dependencies = {}) {
  const sleep = dependencies.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await oneRequest(client, request, generationKey);
      return { response, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_REQUEST_ATTEMPTS || !isTransientProviderError(error)) break;
      await sleep(400 + (attempt * 250));
    }
  }
  throw classifyProviderError(lastError);
}

function parseStructuredOutput(response) {
  const text = String(response?.output_text || '').trim();
  if (!text) throw personalizationError('PERSONALIZATION_EMPTY_OUTPUT', 'OpenAI returned no personalization output.', response);
  try {
    return JSON.parse(text);
  } catch {
    throw personalizationError('PERSONALIZATION_INVALID_OUTPUT', 'OpenAI returned invalid structured personalization output.', response);
  }
}

async function generateStructuredPersonalization({ prompt, generationKey, client, env = process.env, dependencies = {} }) {
  assertOpenAIExecutionAllowed(env);
  const openAI = client || await getClient(env);
  const started = Date.now();
  const request = {
    model: OUTBOUND_OPENAI_MODEL,
    store: false,
    instructions: prompt.system,
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt.user }] }],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: 'none' },
    text: { format: OUTPUT_FORMAT, verbosity: 'low' },
    metadata: { subsystem: 'outbound_sales', phase: 'shadow', prompt_version: PROMPT_VERSION },
  };
  let result;
  try {
    result = await requestWithRetry(openAI, request, generationKey, dependencies);
  } catch (error) {
    error.latencyMs = Math.max(0, Date.now() - started);
    throw error;
  }
  const { response, attempts } = result;
  return Object.freeze({
    output: parseStructuredOutput(response),
    usage: response?.usage || {},
    providerRequestId: response?._request_id || response?.request_id || null,
    model: response?.model || OUTBOUND_OPENAI_MODEL,
    latencyMs: Math.max(0, Date.now() - started),
    attempts,
  });
}

function resetClientForTests() {
  cachedClient = null;
  cachedKeyIdentity = null;
}

module.exports = {
  REQUEST_TIMEOUT_MS,
  MAX_REQUEST_ATTEMPTS,
  assertOpenAIExecutionAllowed,
  getClient,
  providerDetails,
  isTransientProviderError,
  classifyProviderError,
  requestOptions,
  requestWithRetry,
  parseStructuredOutput,
  generateStructuredPersonalization,
  resetClientForTests,
};
