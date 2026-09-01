import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, signOut } from './auth';
import {
  authorizedHeaders,
  getServerSessionToken,
  setServerSessionToken,
} from './serverAuth';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('secure auth logout identity boundary', () => {
  it('removes the prior subject before guest checkout and cart capture headers are built', async () => {
    const localStorage = memoryStorage();
    const sessionStorage = memoryStorage();
    const cookieWrites: string[] = [];
    const document = {} as Document;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieWrites.join('; '),
      set: (value: string) => { cookieWrites.push(value); },
    });
    const dispatchEvent = vi.fn();

    vi.stubGlobal('window', {
      localStorage,
      sessionStorage,
      location: {
        hostname: 'bannersonthefly.com',
        pathname: '/checkout',
        protocol: 'https:',
      },
      dispatchEvent,
    });
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', document);

    localStorage.setItem('banners_current_user', JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'account-a@example.com',
    }));
    localStorage.setItem('cart_owner_user_id', '11111111-1111-4111-8111-111111111111');
    setServerSessionToken('signed-account-a-session');

    expect(authorizedHeaders()).toMatchObject({
      Authorization: 'Bearer signed-account-a-session',
      'X-Banners-Admin-Session': 'signed-account-a-session',
    });

    await signOut();

    expect(localStorage.getItem('banners_current_user')).toBeNull();
    expect(localStorage.getItem('cart_owner_user_id')).toBeNull();
    expect(localStorage.getItem('banners_server_session')).toBeNull();
    expect(sessionStorage.getItem('banners_server_session')).toBeNull();
    expect(await getCurrentUser()).toBeNull();
    expect(getServerSessionToken()).toBeNull();
    expect(authorizedHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
    });
    expect(cookieWrites).toContainEqual(expect.stringMatching(
      /^banners_admin_session=;.*Max-Age=0.*Secure$/,
    ));
    expect(dispatchEvent).toHaveBeenCalled();
  });
});
