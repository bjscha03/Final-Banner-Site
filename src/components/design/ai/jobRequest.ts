// Background image work can take minutes; its small queue/status HTTP requests
// should not wait indefinitely when a mobile connection drops.
export async function fetchAIRequest(input: string, init: RequestInit = {}, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController();
  const parent = init.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error('The connection is taking too long. Your versions are saved. Retry the same request to recover its result.');
    throw error;
  } finally {
    window.clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}
