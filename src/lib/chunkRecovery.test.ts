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

afterEach(() => vi.restoreAllMocks());

describe('chunk recovery', () => {
  it('recognizes deploy-skewed dynamic import failures', () => {
    expect(isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/Checkout-old.js'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading chunk Checkout-123 failed'))).toBe(true);
  });

  it('does not reload for unrelated application failures', () => {
    expect(isChunkLoadFailure(new SyntaxError('Unexpected token in cart response'))).toBe(false);
    expect(isChunkLoadFailure(new Error('Payment was declined'))).toBe(false);
  });

  it('allows one recovery per guard window', () => {
    expect(canAttemptChunkRecovery(null, 50_000)).toBe(true);
    expect(canAttemptChunkRecovery('40000', 50_000)).toBe(false);
    expect(canAttemptChunkRecovery('20000', 50_000)).toBe(true);
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

  it('declines automatic recovery when the sessionStorage guard cannot be read', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget();
    target.sessionStorage.getItem.mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    });
    installChunkRecovery(target as unknown as Window);

    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);

    expect(reload).not.toHaveBeenCalled();
    expect(target.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('declines automatic recovery when the loop-prevention timestamp cannot be written', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const { target, listeners, reload } = createRecoveryTarget();
    target.sessionStorage.setItem.mockImplementation(() => {
      throw new DOMException('Storage is read-only', 'QuotaExceededError');
    });
    installChunkRecovery(target as unknown as Window);

    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
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
