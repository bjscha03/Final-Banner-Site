// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TextDecoder } from 'node:util';
import { getAuthAdapter, getCurrentUser, useAuth } from './auth';
import { setServerSessionToken } from './serverAuth';

const userA = { id: '11111111-1111-4111-8111-111111111111', email: 'first@customer.com', is_admin: false };
const userB = { id: '22222222-2222-4222-8222-222222222222', email: 'second@customer.com', is_admin: false };
const token = (user = userA, exp = Math.floor(Date.now() / 1000) + 3600) => `${btoa(JSON.stringify({ sub: user.id, email: user.email, exp })).replace(/=+$/, '')}.test-signature`;
let root: Root;
let element: HTMLDivElement;
function current(user = userA, credential = token(user)) {
  localStorage.setItem('banners_current_user', JSON.stringify(user));
  setServerSessionToken(credential);
}
function Identity() {
  const { user, loading } = useAuth();
  return <output>{loading ? 'loading' : user?.email || 'signed out'}</output>;
}
const mount = async () => { await act(async () => { root.render(<Identity />); }); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('TextDecoder', TextDecoder);
  localStorage.clear();
  sessionStorage.clear();
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  element.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('updates mounted account views immediately after activation and sign-out events', async () => {
  await mount();
  expect(element.textContent).toBe('signed out');
  await act(async () => {
    current();
    window.dispatchEvent(new Event('user-changed'));
  });
  expect(element.textContent).toBe(userA.email);
  await act(async () => {
    localStorage.removeItem('banners_current_user');
    setServerSessionToken(null);
    window.dispatchEvent(new Event('user-changed'));
  });
  expect(element.textContent).toBe('signed out');
});

it('clears missing, expired, malformed, or different-account credentials instead of keeping an unusable signed-in screen', async () => {
  for (const credential of [null, token(userA, Math.floor(Date.now() / 1000) - 1), 'invalid-token', token(userB)]) {
    localStorage.setItem('banners_current_user', JSON.stringify(userA));
    setServerSessionToken(credential);
    expect(await getCurrentUser()).toBeNull();
    expect(localStorage.getItem('banners_current_user')).toBeNull();
    expect(localStorage.getItem('banners_server_session')).toBeNull();
    expect(sessionStorage.getItem('banners_server_session')).toBeNull();
  }
});

it('does not allow a late identity read to restore an account after a newer account switch', async () => {
  const adapter = await getAuthAdapter();
  let resolveOld!: (value: typeof userA) => void;
  const old = new Promise<typeof userA>((resolve) => { resolveOld = resolve; });
  vi.spyOn(adapter, 'getCurrentUser').mockReturnValueOnce(old).mockResolvedValue(userB);
  current();
  await mount();
  await act(async () => {
    current(userB);
    window.dispatchEvent(new Event('user-changed'));
  });
  expect(element.textContent).toBe(userB.email);
  await act(async () => { resolveOld(userA); });
  expect(element.textContent).toBe(userB.email);
});

it('updates another tab to the shared identity and replaces its stale tab-local credential', async () => {
  current();
  await mount();
  expect(element.textContent).toBe(userA.email);
  const nextToken = token(userB);
  await act(async () => {
    localStorage.setItem('banners_current_user', JSON.stringify(userB));
    localStorage.setItem('banners_server_session', nextToken);
    window.dispatchEvent(new StorageEvent('storage', { key: 'banners_server_session', newValue: nextToken }));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(element.textContent).toBe(userB.email);
  expect(sessionStorage.getItem('banners_server_session')).toBe(nextToken);
});

it('expires an already-open account screen when its signed session lifetime ends', async () => {
  vi.useFakeTimers();
  current(userA, token(userA, Math.floor(Date.now() / 1000) + 1));
  await mount();
  expect(element.textContent).toBe(userA.email);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(element.textContent).toBe('signed out');
});

it('removes its identity subscriptions when unmounted', async () => {
  const removed = vi.spyOn(window, 'removeEventListener');
  await mount();
  await act(async () => { root.unmount(); });
  expect(removed.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['user-changed', 'storage', 'focus']));
  root = createRoot(element);
});
