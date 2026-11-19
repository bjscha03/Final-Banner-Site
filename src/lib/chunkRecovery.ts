const CHUNK_RECOVERY_STORAGE_KEY = 'botf_chunk_recovery_at';
const CHUNK_RECOVERY_GUARD_MS = 5 * 60_000;

type ManualRecoveryWindow = Pick<Window, 'location' | 'sessionStorage'> & Partial<Pick<Window, 'fetch'>>;
type RecoveryWindow = ManualRecoveryWindow & Pick<Window, 'addEventListener' | 'removeEventListener'>;
const failedAssets = new WeakMap<object, Set<string>>();
const pendingNavigations = new WeakSet<object>();

function rememberFailedAsset(target: ManualRecoveryWindow, event: Event) {
  const element = event.target as (HTMLLinkElement & HTMLScriptElement) | null;
  if (!element || !(element.tagName === 'SCRIPT' || (element.tagName === 'LINK' && /^(modulepreload|stylesheet)$/.test(element.rel)))) return;
  try {
    const asset = new URL(element.src || element.href, target.location.href);
    const base = new URL(import.meta.env.BASE_URL || '/', target.location.href);
    if (asset.origin !== base.origin || !asset.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/assets/`) || !/\.(js|css)$/.test(asset.pathname)) return;
    const urls = failedAssets.get(target) || new Set<string>();
    if (urls.size < 20) urls.add(asset.href);
    failedAssets.set(target, urls);
  } catch { /* Ignore unrelated or malformed resource URLs. */ }
}

function navigateAfterAssetRefresh(target: ManualRecoveryWindow, destination: string) {
  if (pendingNavigations.has(target)) return;
  pendingNavigations.add(target);
  if (!target.fetch || !failedAssets.get(target)?.size) {
    target.location.replace(destination);
    return;
  }
  // WebKit can retain failed module downloads across page navigation. Refresh
  // their HTTP cache entries before replacing the document, without executing
  // fetched text. A bounded deadline still permits recovery during an outage.
  // Confirmed upstream: https://github.com/getgrav/grav-plugin-admin2/issues/181
  setTimeout(() => {
    const controller = new AbortController();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      target.location.replace(destination);
    };
    const deadline = setTimeout(() => { controller.abort(); finish(); }, 3000);
    void Promise.allSettled([...failedAssets.get(target)!].map(async url => {
      const response = await target.fetch!(url, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
      await response.arrayBuffer();
    })).then(finish);
  }, 50);
}

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
  return /(?:Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \S+ failed|ChunkLoadError|CSS_CHUNK_LOAD_FAILED|Unable to preload CSS for)/i.test(message);
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
  recoveringWindows.add(target);
  navigateAfterAssetRefresh(target, destination.toString());
};

const recoveringWindows = new WeakSet<object>();

/** True while the recovery navigation is pending, before the new URL loads. */
export const isChunkRecoveryPending = (target: ManualRecoveryWindow = window): boolean => recoveringWindows.has(target);

/** Shared by Vite and React's boundary: caught lazy imports do not emit an
 * unhandledrejection. Preserve the URL/cart and bypass stale HTML on recovery. */
export const attemptChunkRecovery = (target: ManualRecoveryWindow = window): boolean => {
  if (recoveringWindows.has(target)) return true;
  const now = Date.now();
  const destination = new URL(target.location.href);
  // The URL is also a loop guard when Safari/private browsing blocks storage.
  // Never automatically refresh a document that is itself a recovery attempt.
  if (destination.searchParams.has('_botf_refresh')) return false;
  try {
    if (!canAttemptChunkRecovery(target.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), now)) return false;
    target.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // The cache-busting URL below survives navigation even without storage.
  }
  destination.searchParams.set('_botf_refresh', String(now));
  recoveringWindows.add(target);
  navigateAfterAssetRefresh(target, destination.toString());
  return true;
};

const installedWindows = new WeakMap<object, () => void>();

export const installChunkRecovery = (target: RecoveryWindow = window): (() => void) => {
  const installed = installedWindows.get(target);
  if (installed) return installed;
  const handleAssetError = (event: Event): void => rememberFailedAsset(target, event);
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

  target.addEventListener('error', handleAssetError, true);
  target.addEventListener('vite:preloadError', handlePreloadError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  const cleanup = () => {
    target.removeEventListener('error', handleAssetError, true);
    target.removeEventListener('vite:preloadError', handlePreloadError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
    installedWindows.delete(target);
  };
  installedWindows.set(target, cleanup);
  return cleanup;
};
