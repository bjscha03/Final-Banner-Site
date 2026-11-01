// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminFetch, getServerSessionToken, setServerSessionToken } from './serverAuth';

const key = 'banners_server_session';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/admin/setup');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses the new shared login before a stale tab can clear it', () => {
  sessionStorage.setItem(key, 'expired-tab-session');
  localStorage.setItem(key, 'replacement-session');
  expect(getServerSessionToken()).toBe('replacement-session');
  expect(sessionStorage.getItem(key)).toBe('replacement-session');
});

it('honors logout from another tab instead of restoring its tab-local session', () => {
  setServerSessionToken('previous-session');
  localStorage.removeItem(key);
  expect(getServerSessionToken()).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});

it('falls back to session storage when the localStorage getter is blocked', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Blocked storage'); });
  expect(() => setServerSessionToken('tab-session')).not.toThrow();
  expect(getServerSessionToken()).toBe('tab-session');
});

it('does not let a late unauthorized response invalidate a newer sign-in', async () => {
  setServerSessionToken('old-session');
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const request = adminFetch('/.netlify/functions/get-orders');
  setServerSessionToken('replacement-session');
  finish(new Response('{}', { status: 401 }));
  await request;
  expect(getServerSessionToken()).toBe('replacement-session');
});

it('still clears a rejected current session', async () => {
  setServerSessionToken('rejected-session');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  await adminFetch('/.netlify/functions/get-orders');
  expect(getServerSessionToken()).toBeNull();
});

it('ignores unauthorized responses from canceled page requests', async () => {
  setServerSessionToken('current-session');
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => {
    controller.abort();
    return new Response('{}', { status: 401 });
  }));
  await adminFetch('/.netlify/functions/get-orders', { signal: controller.signal });
  expect(getServerSessionToken()).toBe('current-session');
});
