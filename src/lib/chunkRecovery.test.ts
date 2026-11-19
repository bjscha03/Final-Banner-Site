import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attemptChunkRecovery,
  canAttemptChunkRecovery,
  installChunkRecovery,
  isChunkLoadFailure,
  reloadLatestVersion,
} from './chunkRecovery';

const createRecoveryTarget = (storedTimestamp: string | null = null) => {
  const listeners = new Map<string, EventListener>();
  let timestamp = storedTimestamp;
  const reload = vi.fn();
  const target = {
    addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    location: { href: 'https://bannersonthefly.com/terms?source=footer#details', replace: reload },
    sessionStorage: {
      getItem: vi.fn(() => timestamp),
      setItem: vi.fn((_key: string, value: string) => { timestamp = value; }),
    },
  };
  return { target, listeners, reload };
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('chunk recovery', () => {
  it('recognizes deploy-skewed dynamic import failures', () => {
    expect(isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/Checkout-old.js'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading chunk Checkout-123 failed'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Unable to preload CSS for /assets/GoogleAdsBanner-BcFuyzJd.css'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Unable to preload CSS for /assets/RealisticBannerPreview-DExepVu7.css'))).toBe(true);
  });

  it('does not reload for unrelated application failures', () => {
    expect(isChunkLoadFailure(new SyntaxError('Unexpected token in cart response'))).toBe(false);
    expect(isChunkLoadFailure(new Error('Payment was declined'))).toBe(false);
  });

  it('allows one recovery per guard window', () => {
    expect(canAttemptChunkRecovery(null, 50_000)).toBe(true);
    expect(canAttemptChunkRecovery('40000', 50_000)).toBe(false);
    expect(canAttemptChunkRecovery('20000', 50_000)).toBe(false);
    expect(canAttemptChunkRecovery('20000', 320_000)).toBe(true);
    expect(canAttemptChunkRecovery('not-a-number', 50_000)).toBe(true);
  });

  it('reloads exactly once and preserves failed import rejections while avoiding duplicate reloads', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget();
    installChunkRecovery(target as unknown as Window);

    const firstEvent = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(firstEvent);
    const duplicateEvent = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(duplicateEvent);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(firstEvent.preventDefault).not.toHaveBeenCalled();
    expect(duplicateEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('does not enter a reload loop after the page has already recovered recently', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget('40000');
    installChunkRecovery(target as unknown as Window);

    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('recovers with a URL loop guard when sessionStorage cannot be read', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget();
    target.sessionStorage.getItem.mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    });
    installChunkRecovery(target as unknown as Window);

    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);

    expect(reload).toHaveBeenCalledExactlyOnceWith('https://bannersonthefly.com/terms?source=footer&_botf_refresh=50000#details');
    expect(target.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('recovers with a URL loop guard when sessionStorage cannot be written', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget();
    target.sessionStorage.setItem.mockImplementation(() => {
      throw new DOMException('Storage is read-only', 'QuotaExceededError');
    });
    installChunkRecovery(target as unknown as Window);

    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);

    expect(reload).toHaveBeenCalledExactlyOnceWith('https://bannersonthefly.com/terms?source=footer&_botf_refresh=50000#details');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('never automatically reloads a recovery document, even after a slow load with blocked storage', () => {
    vi.spyOn(Date, 'now').mockReturnValue(600_000);
    const { target, reload } = createRecoveryTarget();
    target.location.href = 'https://bannersonthefly.com/design?_botf_refresh=100';
    target.sessionStorage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    expect(attemptChunkRecovery(target as unknown as Window)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('registers recovery once when both preload and application entries install it', () => {
    const { target, listeners } = createRecoveryTarget();
    const cleanup = installChunkRecovery(target as unknown as Window);
    expect(installChunkRecovery(target as unknown as Window)).toBe(cleanup);
    expect(target.addEventListener).toHaveBeenCalledTimes(3);
    cleanup();
    expect(listeners.size).toBe(0);
    installChunkRecovery(target as unknown as Window);
    expect(target.addEventListener).toHaveBeenCalledTimes(6);
  });

  it('forces a cache-busted navigation and clears the automatic recovery guard', () => {
    const removeItem = vi.fn();
    const replace = vi.fn();
    const target = {
      location: {
        href: 'https://preview.example/checkout?promo=SAVE20#payment',
        replace,
      },
      sessionStorage: { removeItem },
    };

    reloadLatestVersion(target as unknown as Window, 123456);

    expect(removeItem).toHaveBeenCalledWith('botf_chunk_recovery_at');
    expect(replace).toHaveBeenCalledWith(
      'https://preview.example/checkout?promo=SAVE20&_botf_refresh=123456#payment',
    );
  });

  it('still navigates when browser storage is unavailable', () => {
    const replace = vi.fn();
    const target = {
      location: { href: 'https://preview.example/checkout', replace },
      sessionStorage: {
        removeItem: vi.fn(() => {
          throw new DOMException('Storage is disabled', 'SecurityError');
        }),
      },
    };

    reloadLatestVersion(target as unknown as Window, 55);

    expect(replace).toHaveBeenCalledWith('https://preview.example/checkout?_botf_refresh=55');
  });
});


it('keeps a failed Vite import rejected instead of resolving undefined for React.lazy', async () => {
  const { target, listeners } = createRecoveryTarget();
  installChunkRecovery(target as unknown as Window);
  const failure = new TypeError('Failed to fetch dynamically imported module: /assets/Terms-old.js');
  // Vite 5 handlePreloadError swallows the import rejection if the event is cancelled.
  const viteImport = Promise.reject(failure).catch(error => {
    const event = new Event('vite:preloadError', { cancelable: true });
    Object.assign(event, { payload: error });
    listeners.get('vite:preloadError')!(event);
    if (!event.defaultPrevented) throw error;
  });
  await expect(viteImport).rejects.toBe(failure);
});


it('recovers a caught lazy import through the same guard and cache-busts HTML', () => {
  vi.spyOn(Date, 'now').mockReturnValue(50_000);
  const { target, reload } = createRecoveryTarget();
  expect(attemptChunkRecovery(target as unknown as Window)).toBe(true);
  expect(attemptChunkRecovery(target as unknown as Window)).toBe(true);
  expect(reload).toHaveBeenCalledExactlyOnceWith('https://bannersonthefly.com/terms?source=footer&_botf_refresh=50000#details');
  const nextDocument = createRecoveryTarget('50000');
  expect(attemptChunkRecovery(nextDocument.target as unknown as Window)).toBe(false);
  expect(nextDocument.reload).not.toHaveBeenCalled();
});

it('refreshes failed application module bytes before navigating, including manual retry', async () => {
  vi.useFakeTimers();
  for (const manual of [false, true]) {
    const { target, listeners, reload } = createRecoveryTarget();
    const body = vi.fn(async () => new ArrayBuffer(4));
    const fetch = vi.fn(async () => ({ arrayBuffer: body }));
    Object.assign(target, { fetch });
    installChunkRecovery(target as unknown as Window);
    listeners.get('error')!({ target: { tagName: 'LINK', rel: 'modulepreload', href: 'https://bannersonthefly.com/assets/route-abc.js' } } as unknown as Event);
    if (manual) reloadLatestVersion(target as unknown as Window);
    else { attemptChunkRecovery(target as unknown as Window); attemptChunkRecovery(target as unknown as Window); }
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://bannersonthefly.com/assets/route-abc.js', expect.objectContaining({ cache: 'reload', credentials: 'same-origin' }));
    expect(body).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  }
});

it('does not fetch unrelated images, external scripts, or API URLs during recovery', () => {
  const { target, listeners, reload } = createRecoveryTarget();
  const fetch = vi.fn(); Object.assign(target, { fetch });
  installChunkRecovery(target as unknown as Window);
  for (const element of [
    { tagName: 'IMG', src: 'https://bannersonthefly.com/assets/art.js' },
    { tagName: 'SCRIPT', src: 'https://unrelated.example/assets/route.js' },
    { tagName: 'SCRIPT', src: 'https://bannersonthefly.com/.netlify/functions/route.js' },
  ]) listeners.get('error')!({ target: element } as unknown as Event);
  attemptChunkRecovery(target as unknown as Window);
  expect(fetch).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledOnce();
});

it('keeps navigation bounded when refreshing an asset hangs', async () => {
  vi.useFakeTimers();
  const { target, listeners, reload } = createRecoveryTarget();
  const fetch = vi.fn((_url: string, _options: RequestInit) => new Promise(() => {})); Object.assign(target, { fetch });
  installChunkRecovery(target as unknown as Window);
  listeners.get('error')!({ target: { tagName: 'LINK', rel: 'modulepreload', href: 'https://bannersonthefly.com/assets/route-abc.js' } } as unknown as Event);
  attemptChunkRecovery(target as unknown as Window);
  await vi.advanceTimersByTimeAsync(3050);
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(reload).toHaveBeenCalledOnce();
});
