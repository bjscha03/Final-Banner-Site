const CHUNK_RECOVERY_STORAGE_KEY = 'botf_chunk_recovery_at';
const CHUNK_RECOVERY_GUARD_MS = 30_000;

type RecoveryWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location' | 'sessionStorage'>;
type ManualRecoveryWindow = Pick<Window, 'location' | 'sessionStorage'>;

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
 * User-initiated recovery must bypass both the automatic reload guard and a
 * cached HTML response. `replace` also prevents the broken document from
 * remaining as a useless Back-history entry.
 */
export const reloadLatestVersion = (
  target: ManualRecoveryWindow = window,
  now = Date.now(),
): void => {
  try {
    target.sessionStorage.removeItem(CHUNK_RECOVERY_STORAGE_KEY);
  } catch {
    // A cache-busted navigation still works when storage is unavailable.
  }

  const destination = new URL(target.location.href);
  destination.searchParams.set('_botf_refresh', String(now));
  target.location.replace(destination.toString());
};

const recoveringWindows = new WeakSet<object>();

/** Shared by Vite and React's boundary: caught lazy imports do not emit an
 * unhandledrejection. Preserve the URL/cart and bypass stale HTML on recovery. */
export const attemptChunkRecovery = (target: ManualRecoveryWindow = window): boolean => {
  if (recoveringWindows.has(target)) return true;
  const now = Date.now();
  try {
    if (!canAttemptChunkRecovery(target.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), now)) return false;
    // A persisted guard is mandatory: blocked storage must never cause a loop.
    target.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  const destination = new URL(target.location.href);
  destination.searchParams.set('_botf_refresh', String(now));
  recoveringWindows.add(target);
  target.location.replace(destination.toString());
  return true;
};

export const installChunkRecovery = (target: RecoveryWindow = window): (() => void) => {
  const handlePreloadError = (_event: Event): void => {
    attemptChunkRecovery(target);
    // Do NOT preventDefault here. Vite 5 otherwise resolves a failed import
    // with undefined and React.lazy crashes reading module.default while the
    // navigation is pending (observed in Safari and Chrome production reports).
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (!isChunkLoadFailure(event.reason)) return;
    if (attemptChunkRecovery(target)) event.preventDefault();
  };

  target.addEventListener('vite:preloadError', handlePreloadError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    target.removeEventListener('vite:preloadError', handlePreloadError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
};
