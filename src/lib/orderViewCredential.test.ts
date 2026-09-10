import { describe, expect, it, vi } from 'vitest';
import {
  consumeOrderViewCredential,
  consumeOrderViewCredentialFromCurrentRoute,
} from './orderViewCredential';

const token = 'eyJwYXlsb2FkIjoidmlldyJ9.valid_signature-123';

function browserFor(hash: string, stored: string | null = null) {
  const values = new Map<string, string>();
  if (stored) values.set('botf.order-view.order-1', stored);
  return {
    location: { hash, pathname: '/orders/order-1', search: '?source=email' },
    history: { state: { from: 'email' }, replaceState: vi.fn() },
    sessionStorage: {
      getItem: vi.fn((key: string) => values.get(key) || null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    },
  };
}

describe('consumeOrderViewCredential', () => {
  it('consumes the fragment, strips it from the URL, and stores it only for the tab', () => {
    const browser = browserFor(`#orderView=${token}&section=summary`);

    expect(consumeOrderViewCredential('order-1', browser as any)).toBe(token);
    expect(browser.sessionStorage.setItem).toHaveBeenCalledWith('botf.order-view.order-1', token);
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      browser.history.state,
      '',
      '/orders/order-1?source=email#section=summary',
    );
  });

  it('uses the tab-scoped credential on refresh', () => {
    const browser = browserFor('', token);
    expect(consumeOrderViewCredential('order-1', browser as any)).toBe(token);
    expect(browser.history.replaceState).not.toHaveBeenCalled();
  });

  it('rejects malformed fragment credentials and removes stale storage', () => {
    const browser = browserFor('#orderView=not%20a%20token', token);
    expect(consumeOrderViewCredential('order-1', browser as any)).toBeNull();
    expect(browser.sessionStorage.removeItem).toHaveBeenCalledWith('botf.order-view.order-1');
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      browser.history.state,
      '',
      '/orders/order-1?source=email',
    );
  });

  it('can sanitize an emailed order route before analytics initializes', () => {
    const browser = browserFor(`#orderView=${token}`);
    expect(consumeOrderViewCredentialFromCurrentRoute(browser as any)).toBe(token);
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      browser.history.state,
      '',
      '/orders/order-1?source=email',
    );
  });

  it('hands the credential from bootstrap to the route even when tab storage is blocked', () => {
    const browser = browserFor(`#orderView=${token}`);
    browser.location.pathname = '/orders/storage-blocked-order';
    browser.sessionStorage.setItem.mockImplementation(() => { throw new Error('blocked'); });
    browser.sessionStorage.getItem.mockImplementation(() => { throw new Error('blocked'); });

    expect(consumeOrderViewCredentialFromCurrentRoute(browser as any)).toBe(token);
    browser.location.hash = '';
    expect(consumeOrderViewCredential('storage-blocked-order', browser as any)).toBe(token);
  });
});
