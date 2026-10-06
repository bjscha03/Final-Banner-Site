import { authenticatedJsonBody, authorizedHeaders } from '@/lib/serverAuth';
import { fetchAIRequest, fetchAIJson } from './jobRequest';

export type PendingAIJob = {
  startPath: string;
  payloadFingerprint: string;
  idempotencyKey: string;
  createdAt: number;
  jobRef?: string;
  workerPath?: string;
  pollPath?: string;
  pollAfterMs?: number;
  dispatched: boolean;
};
const pendingKey = 'banners_ai_designer_pending_job';
const pendingMemory = new Map<string, PendingAIJob>();

function remember(job: PendingAIJob) {
  pendingMemory.set(job.payloadFingerprint, job);
  try { window.sessionStorage.setItem(pendingKey, JSON.stringify(job)); } catch { /* In-memory recovery still works. */ }
}

export function forgetPendingJob(job: PendingAIJob) {
  pendingMemory.delete(job.payloadFingerprint);
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(pendingKey) || 'null');
    if (saved?.idempotencyKey === job.idempotencyKey) window.sessionStorage.removeItem(pendingKey);
  } catch { /* Storage must never discard an otherwise successful result. */ }
}

export class AIJobFailedError extends Error {}
export class AIRequestRateLimitError extends Error {
  readonly retryAt: number;
  constructor(message: string, retryAfter: string | null) {
    super(message);
    this.name = 'AIRequestRateLimitError';
    const seconds = Number(retryAfter);
    this.retryAt = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
  }
}

function completedResultIsValid(job: Record<string, any>, startPath: string) {
  if (startPath.endsWith('/ai-designer-fit')) return Boolean(job.fit?.id && job.fit.imageBase64
    && job.fit.widthIn > 0 && job.fit.heightIn > 0 && typeof job.fit.verification?.passed === 'boolean');
  const validConcept = (concept: Record<string, any>) => Boolean(concept?.versionId && concept.imageBase64 && concept.backgroundRef && concept.validation?.checks && concept.diagnostics);
  if (startPath.endsWith('/ai-designer-edit')) return job.usedOriginalImage === true && validConcept(job.concept);
  if (startPath.endsWith('/ai-designer-generate')) return Array.isArray(job.concepts) && job.concepts.length > 0 && job.concepts.every(validConcept);
  return job.brief?.structured === true;
}

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitFor(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runBackgroundJob(
  startPath: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  waitingMessage: string,
  onStage: (message: string) => void,
  onPreview?: (source: string) => void,
  onPending?: (job: PendingAIJob) => void,
  scope = '',
) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ scope, startPath, payload })));
  const payloadFingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let start: PendingAIJob | null = pendingMemory.get(payloadFingerprint) || null;
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(pendingKey) || 'null');
    if (
      pending?.startPath === startPath
      && pending?.payloadFingerprint === payloadFingerprint
      && Date.now() - Number(pending.createdAt || 0) < 2 * 60 * 60 * 1000
    ) start = pending;
  } catch {
    // Private browsing and exhausted storage must not break the AI request.
  }

  if (start && Date.now() - start.createdAt >= 2 * 60 * 60 * 1000) start = null;

  if (!start?.jobRef) {
    const idempotencyKey = String(start?.idempotencyKey || requestId());
    // Persist request identity before sending: retrying a lost response must
    // not create a second paid generation.
    start = { startPath, payloadFingerprint, idempotencyKey, createdAt: Date.now(), dispatched: false };
    remember(start);
    const { response: startResponse, body: started } = await fetchAIJson(startPath, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      }),
      body: authenticatedJsonBody({ ...payload, idempotencyKey }),
    });
    if (startResponse.status === 429) throw new AIRequestRateLimitError(started?.message || 'Please wait before trying again.', startResponse.headers.get('Retry-After'));
    if (!startResponse.ok || !started?.jobRef) throw new Error(started?.message || 'The AI job could not be started safely.');
    start = { ...started, startPath, payloadFingerprint, idempotencyKey, createdAt: Date.now(), dispatched: false };
    remember(start);
  }

  onPending?.(start);
  return resumeBackgroundJob(start, signal, waitingMessage, onStage, onPreview, onPending);
}

export async function resumeBackgroundJob(
  start: PendingAIJob,
  signal: AbortSignal,
  waitingMessage: string,
  onStage: (message: string) => void,
  onPreview?: (source: string) => void,
  onPending?: (job: PendingAIJob) => void,
) {
  const requestStartedAt = Date.now();
  if (!start.jobRef) throw new Error('The edit has not started yet. Please retry your request.');

  onStage(waitingMessage);
  // Status recovery only reads the existing result. Dispatch only if the
  // initial worker acknowledgement was never received.
  if (start.dispatched !== true) {
    const workerResponse = await fetchAIRequest(String(start.workerPath || '/.netlify/functions/ai-designer-worker-background'), {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: authenticatedJsonBody({ jobRef: start.jobRef }),
    });
    if (!workerResponse.ok) throw new Error('The secure AI worker could not be started. Please retry.');
    start = { ...start, dispatched: true };
    remember(start);
    onPending?.(start);
  }

  const deadline = Date.now() + 7 * 60 * 1000;
  let previewVersion = "";
  let consecutiveFailures = 0;
  let delay = Math.max(1000, Math.min(10_000, Number(start.pollAfterMs) || 2000));
  const pollPath = String(start.pollPath || '/.netlify/functions/ai-designer-job');
  while (Date.now() < deadline) {
    await waitFor(delay, signal);
    let job: Record<string, any>;
    let retryAfter = 0;
    try {
      const result = await fetchAIJson(pollPath, {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: authenticatedJsonBody({ jobRef: start.jobRef, previewVersion }),
      }, Math.min(45_000, Math.max(1, deadline - Date.now())));
      const { response, body } = result;
      if (!response.ok && ![408, 429].includes(response.status) && response.status < 500) {
        forgetPendingJob(start);
        throw new AIJobFailedError(body?.message || 'Your design session could not retrieve this job. Reopen the designer and try again.');
      }
      retryAfter = Number(response.headers?.get('Retry-After') || 0) * 1000;
      if (!response.ok || !body || !['queued', 'processing', 'completed', 'failed'].includes(body.status)
        || (body.status === 'completed' && !completedResultIsValid(body, start.startPath))) {
        throw new Error('The job response is temporarily unavailable.');
      }
      job = body;
    } catch (reason) {
      if (signal.aborted || reason instanceof AIJobFailedError) throw reason;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 6) throw new Error('The connection was interrupted. Your previous versions and latest preview are still here. Check again to retrieve this same design.');
      delay = Math.min(30_000, Math.max(retryAfter, 2000 * 2 ** (consecutiveFailures - 1)));
      onStage('Reconnecting to your design. Your latest preview is safe.');
      continue;
    }
    consecutiveFailures = 0;
    delay = Math.max(1000, Math.min(10_000, Number(start.pollAfterMs) || 2000));
    if (job?.preview?.mimeType === 'image/jpeg' && job.preview.imageBase64) {
      previewVersion = job.previewVersion;
      onPreview?.(`data:image/jpeg;base64,${job.preview.imageBase64}`);
    }
    if (job?.status === 'completed') {
      forgetPendingJob(start);
      for (const concept of [...(job.concepts || []), ...(job.concept ? [job.concept] : [])]) {
        concept.diagnostics = { ...concept.diagnostics, clientDurationMs: Date.now() - requestStartedAt };
      }
      return job;
    }
    if (job?.status === 'failed') {
      forgetPendingJob(start);
      const stage = job?.stage ? ` Stage: ${String(job.stage)}.` : '';
      const category = job?.error ? ` Category: ${String(job.error)}.` : '';
      const reference = job?.diagnosticId ? ` Reference: ${job.diagnosticId}.` : '';
      throw new AIJobFailedError(`${job?.message || 'The AI job could not be completed safely.'}${stage}${category}${reference}`);
    }
    onStage(job?.stage === 'Preparing the AI request' ? waitingMessage : (job?.stage || waitingMessage));
  }
  throw new Error('The AI job took too long to finish. Your draft is saved. Retry the same request to check its existing result.');
}
