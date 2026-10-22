// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HeaderProductSearch from './HeaderProductSearch';

let container: HTMLDivElement;
let root: Root;
const search = async (value: string) => {
  await act(async () => {
    const input = document.querySelector('#bof-product-search')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><HeaderProductSearch /></MemoryRouter>); });
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('filters products case-insensitively and closes after selecting a result', async () => {
  await search('  YARD  ');
  const links = document.querySelectorAll('.bof-search-results a');
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute('href')).toBe('/design?product=yard-signs');
  await act(async () => { (links[0] as HTMLAnchorElement).click(); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('provides an empty result state and restores products when the query is cleared', async () => {
  await search('unmatched-product');
  expect(document.querySelector('.bof-search-results')?.textContent).toContain('No products found.');
  await search('');
  expect(document.querySelectorAll('.bof-search-results a').length).toBeGreaterThan(5);
});
