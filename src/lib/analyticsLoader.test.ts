import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeScriptHandler = (() => void) | null;

class FakeScript {
  id = '';
  async = false;
  src = '';
  onload: FakeScriptHandler = null;
  onerror: FakeScriptHandler = null;

  remove = () => {
    const index = attachedScripts.indexOf(this);
    if (index >= 0) attachedScripts.splice(index, 1);
  };
}

let attachedScripts: FakeScript[] = [];
let createdScripts: FakeScript[] = [];
let clarity: ReturnType<typeof vi.fn>;

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    get length() { return values.size; },
  } as Storage;
};

const googleScripts = (): FakeScript[] => createdScripts.filter((script) => script.id === 'botf-google-tag');

const queuedCommands = (): unknown[][] => (window.dataLayer || []).map((command) => Array.from(command as ArrayLike<unknown>));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', '');

  attachedScripts = [];
  createdScripts = [];
  clarity = vi.fn();

  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('window', {
    location: {
      hostname: 'bannersonthefly.com',
      pathname: '/design',
      protocol: 'https:',
    },
    navigator: {
      webdriver: false,
      userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36',
    },
    dataLayer: [],
    clarity,
    setTimeout: (callback: TimerHandler, delay?: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
  });
  vi.stubGlobal('document', {
    createElement: (tagName: string) => {
      expect(tagName).toBe('script');
      const script = new FakeScript();
      createdScripts.push(script);
      return script;
    },
    getElementById: (id: string) => attachedScripts.find((script) => script.id === id) ?? null,
    head: {
      appendChild: (script: FakeScript) => {
        attachedScripts.push(script);
        return script;
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Google tag loader', () => {
  it('moves from idle to loading to loaded on the first script load', async () => {
    const loader = await import('./analyticsLoader');

    expect(loader.getGoogleTagLoadState()).toBe('idle');
    expect(loader.initializeCustomerAnalytics()).toBe(true);
    expect(loader.getGoogleTagLoadState()).toBe('loading');
    expect(googleScripts()).toHaveLength(1);
    expect(googleScripts()[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-2TQ6JYYZV7');

    googleScripts()[0].onload?.();

    expect(loader.getGoogleTagLoadState()).toBe('loaded');
  });

  it('queues js and config as genuine Arguments objects understood by gtag.js', async () => {
    const loader = await import('./analyticsLoader');

    loader.initializeCustomerAnalytics();

    expect(window.dataLayer).toHaveLength(2);
    for (const command of window.dataLayer || []) {
      expect(Array.isArray(command)).toBe(false);
      expect(Object.prototype.toString.call(command)).toBe('[object Arguments]');
    }
    expect(queuedCommands()[0][0]).toBe('js');
    expect(queuedCommands()[0][1]).toBeInstanceOf(Date);
    expect(queuedCommands()[1]).toEqual(['config', 'G-2TQ6JYYZV7', { send_page_view: false }]);
  });

  it('retries once with cache busting and reaches loaded without reconfiguring GA', async () => {
    const loader = await import('./analyticsLoader');
    loader.initializeCustomerAnalytics();
    const first = googleScripts()[0];

    first.onerror?.();
    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(attachedScripts).not.toContain(first);
    expect(first.onload).toBeNull();
    expect(first.onerror).toBeNull();
    expect(clarity).toHaveBeenCalledWith('event', 'ga_tag_load_error');

    vi.advanceTimersByTime(1_000);
    expect(loader.getGoogleTagLoadState()).toBe('loading');
    expect(googleScripts()).toHaveLength(2);
    const retry = googleScripts()[1];
    expect(retry.src).toContain('botf_retry=1');
    expect(retry.src).toContain('botf_cb=');

    retry.onload?.();
    expect(loader.getGoogleTagLoadState()).toBe('loaded');
    expect(queuedCommands().filter((command) => command[0] === 'config' && command[1] === 'G-2TQ6JYYZV7')).toHaveLength(1);
    expect(queuedCommands().filter((command) => command[0] === 'page_view')).toHaveLength(0);
    expect(clarity).not.toHaveBeenCalledWith('event', 'ga_tag_retry_exhausted');
  });

  it('times out, detaches the stale generation, and retries exactly once', async () => {
    const loader = await import('./analyticsLoader');
    loader.initializeCustomerAnalytics();
    const first = googleScripts()[0];
    const lateOnload = first.onload!;
    const lateOnerror = first.onerror!;

    vi.advanceTimersByTime(8_000);

    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(attachedScripts).not.toContain(first);
    expect(first.onload).toBeNull();
    expect(first.onerror).toBeNull();
    expect(clarity.mock.calls.filter((call) => call[1] === 'ga_tag_load_error')).toHaveLength(1);

    // A browser may still dispatch a callback already queued before removal.
    // The generation guard must make both callbacks inert.
    lateOnload();
    lateOnerror();
    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(clarity.mock.calls.filter((call) => call[1] === 'ga_tag_load_error')).toHaveLength(1);

    vi.advanceTimersByTime(1_000);
    expect(googleScripts()).toHaveLength(2);
    expect(loader.getGoogleTagLoadState()).toBe('loading');

    const retry = googleScripts()[1];
    retry.onload?.();
    vi.advanceTimersByTime(20_000);

    expect(loader.getGoogleTagLoadState()).toBe('loaded');
    expect(googleScripts()).toHaveLength(2);
    expect(queuedCommands().filter((command) => command[0] === 'config' && command[1] === 'G-2TQ6JYYZV7')).toHaveLength(1);
  });

  it('invalidates late load and error callbacks when analytics loads are stopped', async () => {
    const loader = await import('./analyticsLoader');
    loader.initializeCustomerAnalytics();
    const first = googleScripts()[0];
    const lateOnload = first.onload!;
    const lateOnerror = first.onerror!;

    loader.stopScheduledAnalyticsLoads();

    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(attachedScripts).not.toContain(first);
    expect(first.onload).toBeNull();
    expect(first.onerror).toBeNull();

    lateOnload();
    lateOnerror();
    vi.advanceTimersByTime(20_000);

    expect(googleScripts()).toHaveLength(1);
    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(clarity).not.toHaveBeenCalledWith('event', 'ga_tag_load_error');
    expect(clarity).not.toHaveBeenCalledWith('event', 'ga_tag_retry_exhausted');
  });

  it('stops after one retry and reports finite, PII-free Clarity events', async () => {
    const loader = await import('./analyticsLoader');
    loader.initializeCustomerAnalytics();

    googleScripts()[0].onerror?.();
    vi.advanceTimersByTime(1_000);
    googleScripts()[1].onerror?.();
    vi.advanceTimersByTime(20_000);

    expect(loader.getGoogleTagLoadState()).toBe('failed');
    expect(googleScripts()).toHaveLength(2);
    expect(clarity.mock.calls.filter((call) => call[0] === 'event' && call[1] === 'ga_tag_load_error')).toHaveLength(2);
    expect(clarity.mock.calls.filter((call) => call[0] === 'event' && call[1] === 'ga_tag_retry_exhausted')).toHaveLength(1);
  });

  it('does not duplicate scripts, config commands, or page views across repeated initialization', async () => {
    const loader = await import('./analyticsLoader');

    loader.initializeCustomerAnalytics();
    loader.initializeCustomerAnalytics();
    loader.initializeCustomerAnalytics();
    googleScripts()[0].onload?.();
    loader.initializeCustomerAnalytics();

    expect(googleScripts()).toHaveLength(1);
    expect(queuedCommands().filter((command) => command[0] === 'config' && command[1] === 'G-2TQ6JYYZV7')).toHaveLength(1);
    expect(queuedCommands().filter((command) => command[0] === 'page_view')).toHaveLength(0);
  });
});
