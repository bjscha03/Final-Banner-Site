import { authenticatedJsonBody, authorizedHeaders } from '@/lib/serverAuth';
import { fetchAIJson } from '@/components/design/ai/jobRequest';

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

// This is a read-only readiness/session request, never a paid generation.
// Recover short network/gateway failures without asking a customer to retry.
export async function requestAIAccess(signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchAIJson('/.netlify/functions/ai-designer-status', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: authorizedHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }),
        body: authenticatedJsonBody({}),
      }, 15_000);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const transient = result.response.status === 408 || result.response.status >= 500;
      const malformed = result.response.ok && typeof result.body?.authorized !== 'boolean';
      if (!transient && !malformed) return result;
      throw new Error('STATUS_UNAVAILABLE');
    } catch (error) {
      if (signal.aborted || (error as Error)?.name === 'AbortError' || attempt === 2) throw error;
    }
    await pause(600 * (attempt + 1), signal);
  }
  throw new Error('STATUS_UNAVAILABLE');
}
