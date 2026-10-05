// Background image work can take minutes; its small queue/status HTTP requests
// should not wait indefinitely when a mobile connection drops.
async function withAIRequest<T>(input: string, init: RequestInit, timeoutMs: number, consume: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const parent = init.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const result = await consume(await fetch(input, { ...init, signal: controller.signal }));
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return result;
  } catch (error) {
    if (timedOut) throw new Error('The connection is taking too long. Your versions are saved. Retry the same request to recover its result.');
    throw error;
  } finally {
    window.clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}

export function fetchAIRequest(input: string, init: RequestInit = {}, timeoutMs = 45_000): Promise<Response> {
  return withAIRequest(input, init, timeoutMs, async response => response);
}

// Keep the timeout active while downloading/parsing the job result too.
export function fetchAIJson(input: string, init: RequestInit = {}, timeoutMs = 45_000) {
  return withAIRequest(input, init, timeoutMs, async response => {
    const body = await response.json().catch(() => null);
    return { response, body };
  });
}
