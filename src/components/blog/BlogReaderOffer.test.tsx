// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import BlogReaderOffer, { BLOG_OFFER_KEY } from './BlogReaderOffer';

vi.mock('@/lib/analytics', () => ({ gtag: vi.fn(), trackFBLead: vi.fn() }));

it('waits for reading, expands on request, recovers from email failure, suppresses repeats and never requires marketing consent', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  localStorage.clear();
  const host = document.createElement('div'); document.body.append(host);
  const article = document.createElement('article'); const prose = document.createElement('div'); prose.className = 'prose'; article.append(prose); document.body.append(article);
  let articleTop = 1500;
  prose.getBoundingClientRect = () => ({ top: articleTop, height: 2400 } as DOMRect);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const root = createRoot(host);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Email is temporarily unavailable.' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, code: 'READ25-ABCDEF01', expiresAt: '2026-10-16T12:00:00Z', emailSent: true }) });
  vi.stubGlobal('fetch', fetchMock);
  try {
    await act(async () => root.render(<MemoryRouter><BlogReaderOffer slug="banner-ideas" /></MemoryRouter>));
    await act(async () => vi.advanceTimersByTime(25000));
    expect(host.querySelector('aside')).toBeNull();
    articleTop = -700;
    await act(async () => window.dispatchEvent(new Event('scroll')));
    expect(host.querySelector('aside')).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false); expect(checkbox.required).toBe(false);
    const expand = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('reader discount'))!;
    await act(async () => expand.click());
    const input = host.querySelector('input[type="email"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'reader@example.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = host.querySelector('form')!;
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('temporarily unavailable');
    expect(JSON.parse(localStorage.getItem(BLOG_OFFER_KEY)!).claimed).toBe(false);
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ email: 'reader@example.com', marketingConsent: false, slug: 'banner-ideas' });
    expect(host.textContent).toContain('READ25-ABCDEF01');
    expect(JSON.parse(localStorage.getItem(BLOG_OFFER_KEY)!).claimed).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(host.querySelector('aside')).toBeNull();
    await act(async () => root.render(<MemoryRouter><BlogReaderOffer key="new-post" slug="another-post" /></MemoryRouter>));
    await act(async () => { vi.advanceTimersByTime(60000); window.dispatchEvent(new Event('scroll')); });
    expect(host.querySelector('aside')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); article.remove();
    vi.useRealTimers(); vi.unstubAllGlobals();
  }
});
