const CHUNK_RECOVERY_STORAGE_KEY = 'botf_chunk_recovery_at';
const CHUNK_RECOVERY_GUARD_MS = 30_000;

type RecoveryWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location' | 'sessionStorage'>;

const getErrorMessage = (reason: unknown): string => {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String((reason as { message?: unknown }).message || '');
  }
  return '';
};

/** Errors produced when an open tab asks a newer deploy for an obsolete Vite chunk. */
export const isChunkLoadFailure = (reason: unknown): boolean => {
  const message = getErrorMessage(reason);
  return /(?:Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \S+ failed|ChunkLoadError|CSS_CHUNK_LOAD_FAILED)/i.test(message);
};

export const canAttemptChunkRecovery = (lastAttemptAt: string | null, now: number): boolean => {
  const timestamp = Number(lastAttemptAt);
  return !Number.isFinite(timestamp) || timestamp <= 0 || now - timestamp >= CHUNK_RECOVERY_GUARD_MS;
};

/**
 * Reload once when a deployment invalidates a lazy route chunk. The current URL
 * and locally persisted cart survive the reload; the timestamp prevents loops.
 */
export const installChunkRecovery = (target: RecoveryWindow = window): (() => void) => {
  let recoveryInProgress = false;

  const recover = (): boolean => {
    if (recoveryInProgress) return true;

    let lastAttemptAt: string | null;
    try {
      lastAttemptAt = target.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    } catch (_error) {
      // Without a durable cross-reload guard, an unchanged chunk failure could
      // reload forever. Let the application ErrorBoundary handle it instead.
      return false;
    }

    const now = Date.now();
    if (!canAttemptChunkRecovery(lastAttemptAt, now)) return false;

    try {
      target.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));
    } catch (_error) {
      // Do not reload unless the loop-prevention timestamp was persisted.
      return false;
    }
    recoveryInProgress = true;
    target.location.reload();
    return true;
  };

  const handlePreloadError = (event: Event): void => {
    if (recover()) event.preventDefault();
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (!isChunkLoadFailure(event.reason)) return;
    if (recover()) event.preventDefault();
  };

  target.addEventListener('vite:preloadError', handlePreloadError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    target.removeEventListener('vite:preloadError', handlePreloadError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
};
