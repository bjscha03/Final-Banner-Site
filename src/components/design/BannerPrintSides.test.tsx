// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BannerPrintSides from './BannerPrintSides';
import { useBannerPrinting } from '@/hooks/useBannerPrinting';
import type { MaterialKey } from '@/store/quote';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Builder({ savedMaterial }: { savedMaterial?: MaterialKey }) {
  const { material, setMaterial, setDoubleSided } = useBannerPrinting();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { if (savedMaterial) setMaterial(savedMaterial); }, [savedMaterial, setMaterial]);
  return <>
    <BannerPrintSides doubleSided={material === '18oz_double'} onChange={setDoubleSided} />
    <output data-material>{material}</output>
    <output data-query>{location.search}</output>
    <button onClick={() => setMaterial('mesh')}>Choose mesh</button>
    <button onClick={() => navigate('/design?product=banner&sides=double')}>Open double-sided link</button>
  </>;
}

function mount(path = '/design', savedMaterial?: MaterialKey) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<MemoryRouter initialEntries={[path]}><Builder savedMaterial={savedMaterial} /></MemoryRouter>));
  return {
    container,
    choose: (value: string) => act(() => (container.querySelector(`input[value="${value}"]`) as HTMLInputElement).click()),
    button: (label: string) => act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!.click()),
    material: () => container.querySelector('[data-material]')!.textContent,
    params: () => new URLSearchParams(container.querySelector('[data-query]')!.textContent!),
    close: () => { act(() => root.unmount()); container.remove(); },
  };
}

describe('unified banner printing choice', () => {
  it('defaults to single-sided and restores the prior single-sided material when toggled back', () => {
    const page = mount('/design?width=48&height=24&utm_source=email');
    try {
      expect(page.material()).toBe('13oz');
      expect((page.container.querySelector('[value="single"]') as HTMLInputElement).checked).toBe(true);
      page.button('Choose mesh');
      page.choose('double');
      expect(page.material()).toBe('18oz_double');
      expect(page.container.textContent).toContain('$6.25/sq. ft. includes both sides');
      expect(page.params().get('width')).toBe('48');
      expect(page.params().get('utm_source')).toBe('email');
      page.choose('single');
      expect(page.material()).toBe('mesh');
      expect(page.params().has('sides')).toBe(false);
    } finally { page.close(); }
  });

  it.each(['/design', '/google-ads-banner', '/large-banners-fast'])('opens double-sided directly on %s', (path) => {
    const page = mount(`${path}?sides=double`);
    try { expect(page.material()).toBe('18oz_double'); } finally { page.close(); }
  });

  it('handles a double-sided link while the existing designer is already mounted', () => {
    const page = mount();
    try {
      page.button('Open double-sided link');
      expect(page.material()).toBe('18oz_double');
    } finally { page.close(); }
  });

  it('restores old double-sided cart items without a sides parameter and preserves their edit ID', () => {
    const page = mount('/design?editItem=saved-banner', '18oz_double');
    try {
      expect(page.material()).toBe('18oz_double');
      page.choose('single');
      expect(page.material()).toBe('13oz');
      expect(page.params().get('editItem')).toBe('saved-banner');
      page.choose('double');
      expect(page.material()).toBe('18oz_double');
    } finally { page.close(); }
  });

  it('lets saved single-sided cart material override an outdated double-sided URL', () => {
    const page = mount('/design?sides=double&editItem=saved-banner', '15oz');
    try { expect(page.material()).toBe('15oz'); } finally { page.close(); }
  });
});
