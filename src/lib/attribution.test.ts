import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAttributionFromLocation } from './attribution';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
};

describe('paid-click attribution', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal('window', {
      location: {
        href: 'https://bannersonthefly.com/design?gclsrc=aw.ds&gbraid=braid-1&wbraid=braid-2&utm_source=google',
        origin: 'https://bannersonthefly.com',
        search: '?gclsrc=aw.ds&gbraid=braid-1&wbraid=braid-2&utm_source=google',
      },
      localStorage,
      sessionStorage,
    });
    vi.stubGlobal('document', { referrer: '' });
  });

  it('does not mistake gclsrc for a GCLID and preserves browser identifiers', () => {
    const attribution = captureAttributionFromLocation();
    expect(attribution).not.toHaveProperty('google_click_id');
    expect(attribution).toMatchObject({
      gbraid: 'braid-1',
      wbraid: 'braid-2',
      utm_source: 'google',
    });
  });

  it('persists a real GCLID verbatim', () => {
    window.location.search = '?gclid=click-123&gclsrc=aw.ds';
    window.location.href = `https://bannersonthefly.com/design${window.location.search}`;
    expect(captureAttributionFromLocation().google_click_id).toBe('click-123');
  });
});
