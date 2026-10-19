// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import YardSignConfigurator from './YardSignConfigurator';
import YardSignOrderPreview from './YardSignOrderPreview';
import { calcYardSignPricing, getTotalDesignQuantity, type YardSignDesign } from '@/lib/yard-sign-pricing';

vi.mock('@/lib/featureFlags', () => ({ ENABLE_AI: false }));
vi.mock('@/lib/uxAnalytics', () => ({ logUx: vi.fn() }));
vi.mock('@/components/ui/FileUploader', () => ({ default: React.forwardRef(() => <button>Upload artwork</button>) }));
vi.mock('@/components/design/CreateWithAIModal', () => ({ default: () => null }));
vi.mock('@/components/design/ArtworkPreviewEditor', () => ({ default: React.forwardRef(() => null) }));
vi.mock('@/components/preview/StablePreviewImage', () => ({ default: ({ src, sources, alt }: any) => <img src={src || sources?.[0]} alt={alt} /> }));

const first: YardSignDesign = { id: 'first', fileName: 'original.pdf', fileUrl: 'https://cdn.test/original.pdf', fileKey: 'original', thumbnailUrl: 'https://cdn.test/page.jpg', isPdf: true, quantity: 7, imgScale: 1.2, imgPos: { x: 5, y: 10 }, previewThumbnailUrl: 'https://cdn.test/saved-placement.jpg' };
const second: YardSignDesign = { ...first, id: 'second', fileKey: 'second', fileName: 'second.pdf', quantity: 3, previewThumbnailUrl: 'https://cdn.test/second-placement.jpg' };
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
let state: { designs: YardSignDesign[]; enabled: boolean; quantity: number; total: number; discounted: number };
let restore: (designs: YardSignDesign[], enabled: boolean, quantity: number, key: string) => void;

function Harness({ empty = false }: { empty?: boolean }) {
  const [designs, setDesigns] = useState(empty ? [] : [first, second]);
  const [enabled, setEnabled] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [restoreKey, setRestoreKey] = useState<string | null>(null);
  const [sidedness, setSidedness] = useState<'single' | 'double'>('single');
  const pricing = calcYardSignPricing(sidedness, getTotalDesignQuantity(designs), enabled, quantity);
  state = { designs, enabled, quantity, total: pricing.totalCents, discounted: calcYardSignPricing(sidedness, getTotalDesignQuantity(designs), enabled, quantity, .2).totalCents };
  restore = (next, stakes, qty, key) => { setDesigns(next); setEnabled(stakes); setQuantity(qty); setRestoreKey(key); };
  return <>
    <YardSignConfigurator designs={designs} onDesignsChange={setDesigns} sidedness={sidedness} onSidednessChange={setSidedness}
      addStepStakes={enabled} stepStakeQuantity={quantity} onStepStakesChange={setEnabled} onStepStakeQuantityChange={setQuantity}
      autoOpenDesignId={restoreKey} promoCode="" promoApplied={false} onPromoCodeChange={vi.fn()} onPromoApply={vi.fn()} onPromoRemove={vi.fn()} />
    <YardSignOrderPreview designs={designs} withStakes={enabled} />
  </>;
}

const clickSelector = async (selector: string) => {
  const element = host.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  await act(async () => element!.click());
};
const clickText = async (text: string) => {
  const element = [...host.querySelectorAll('button')].find(item => item.textContent === text);
  expect(element, text).toBeTruthy();
  await act(async () => element!.click());
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('selects stakes, updates hardware and existing pricing, and leaves saved PDF artwork untouched', async () => {
  expect(state.total).toBe(12000);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Without stakes"]')?.checked).toBe(true);
  await clickSelector('input[aria-label="With stakes"]');
  expect(state).toMatchObject({ enabled: true, quantity: 10, total: 13500, discounted: 10800 });
  expect(state.designs).toEqual([first, second]);
  expect(host.querySelector('[aria-label="Yard sign product preview"] [data-yard-sign-hardware]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Yard sign product preview"] img')?.getAttribute('src')).toBe(first.previewThumbnailUrl);
  await clickSelector('input[aria-label="Without stakes"]');
  expect(state).toMatchObject({ enabled: false, total: 12000, discounted: 9600 });
  expect(host.querySelector('[aria-label="Yard sign product preview"] [data-yard-sign-hardware]')).toBeNull();
  expect(state.designs).toEqual([first, second]);
});

it('matches total quantities across designs and preserves a customer-adjusted stake count', async () => {
  await clickSelector('input[aria-label="With stakes"]');
  await clickText('20');
  expect(state.quantity).toBe(20);
  expect(state.designs.map(item => item.quantity)).toEqual([10, 10]);
  await clickText('Adjust quantity');
  await clickSelector('button[aria-label="Decrease stakes"]');
  expect(state.quantity).toBe(19);
  await clickText('30');
  expect(state.quantity).toBe(19);
  expect(state.total).toBe(38850);
  await clickText('Match sign quantity');
  expect(state.quantity).toBe(30);
  await clickText('40');
  expect(state.quantity).toBe(40);
  await clickSelector('button[aria-label="Remove second.pdf"]');
  expect(state.quantity).toBe(20);
  expect(state.designs[0]).toEqual({ ...first, quantity: 20 });
});

it('supports selecting stakes before upload and follows the first design quantity', async () => {
  await act(async () => root.render(<Harness key="empty" empty />));
  await clickSelector('input[aria-label="With stakes"]');
  expect(state.quantity).toBe(10);
  // The parent receives upload results through the same designs prop.
  await act(async () => restore([{ ...first, quantity: 20 }], true, 10, null as any));
  expect(state.quantity).toBe(20);
});

it('preserves restored cart hardware, including a custom quantity equal to the previous order total', async () => {
  await clickSelector('input[aria-label="With stakes"]');
  await act(async () => restore([{ ...first, quantity: 20 }], true, 10, 'first'));
  expect(state).toMatchObject({ enabled: true, quantity: 10, total: 25500 });
  await clickText('30');
  expect(state.quantity).toBe(10);
  await act(async () => restore([{ ...first, quantity: 10 }], false, 1, 'second-cart'));
  expect(state).toMatchObject({ enabled: false, quantity: 1, total: 12000 });
});

it('keeps print-side selection and multiple-design previews independent from hardware', async () => {
  await clickSelector('input[aria-label="With stakes"]');
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.startsWith('Double-Sided'))!;
  await act(async () => button.click());
  expect(state).toMatchObject({ quantity: 10, total: 15500 });
  const select = host.querySelector('select')!;
  await act(async () => { select.value = 'second'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('[aria-label="Yard sign product preview"] img')?.getAttribute('src')).toBe(second.previewThumbnailUrl);
  expect(state.designs).toEqual([first, second]);
});

it('keeps custom stakes within the existing 1–90 limit and uses accessible real radio controls', async () => {
  await clickSelector('input[aria-label="With stakes"]');
  await clickText('90');
  await clickText('Adjust quantity');
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Increase stakes"]')?.disabled).toBe(true);
  const radios = [...host.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input')];
  expect(radios.map(input => input.type)).toEqual(['radio', 'radio']);
  expect(radios[0].name).toBe(radios[1].name);
  expect(host.querySelector('#yard-finishing-section h3')?.textContent).toBe('Choose your setup');
});
