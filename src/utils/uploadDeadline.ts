/** Settle even when a browser fails to reject an aborted network operation. */
export function withUploadDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      controller.abort();
      reject(new DOMException('Artwork request cancelled or timed out.', 'AbortError'));
    };
    const timer = setTimeout(cancel, timeoutMs);
    if (externalSignal?.aborted) {
      cancel();
      return;
    }
    externalSignal?.addEventListener('abort', cancel, { once: true });
    Promise.resolve().then(() => operation(controller.signal)).then((result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }, (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}
