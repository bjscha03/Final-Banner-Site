// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import YardSignConfigurator from './YardSignConfigurator';
import { artworkFitIdentity } from './ai/artworkFit';
import { yardSignFitArtwork } from './ai/yardSignArtworkFit';
import type { YardSignDesign } from '@/lib/yard-sign-pricing';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';

const mocks = vi.hoisted(() => ({ dialog: null as any }));
vi.mock('@/lib/featureFlags', () => ({ ENABLE_AI: true }));
vi.mock('@/lib/uxAnalytics', () => ({ logUx: vi.fn() }));
vi.mock('@/components/ui/FileUploader', () => ({ default: React.forwardRef(() => null) }));
vi.mock('@/components/design/CreateWithAIModal', () => ({ default: () => null }));
vi.mock('@/components/preview/StablePreviewImage', () => ({ default: () => null }));
vi.mock('./AIArtworkFitDialog', async original => ({
  ...await original<typeof import('./AIArtworkFitDialog')>(),
  default: (props: any) => { mocks.dialog = props; return props.open ? <div>Fit comparison</div> : null; },
}));
vi.mock('@/components/design/ArtworkPreviewEditor', () => ({
  default: React.forwardRef((props: any, ref) => {
    React.useImperativeHandle(ref, () => ({ getCompositionSnapshot: () => ({ transform: { x: .1, y: .2, scaleX: 1.2, scaleY: 1.2 } }) }));
    return <div data-editor-src={props.src}>{props.fitControls}</div>;
  }),
}));

const original: YardSignDesign = { id: 'first', fileName: 'original.pdf', fileUrl: 'https://cdn.test/original.pdf', fileKey: 'original', thumbnailUrl: 'https://cdn.test/page.jpg', isPdf: true, quantity: 7, imgScale: 1.2, imgPos: { x: 5, y: 10 }, previewThumbnailUrl: 'https://cdn.test/old-placement.jpg' };
const second: YardSignDesign = { ...original, id: 'second', fileKey: 'second', quantity: 3 };
const fitted: UploadedArtworkFile = { name: 'fitted.jpg', url: 'https://cdn.test/fitted.jpg', fileKey: 'fitted', isPdf: false, size: 100, permanentPreviewUrl: 'https://cdn.test/fitted-preview.jpg' };
let designs: YardSignDesign[], root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const changed = vi.fn();
const render = async () => {
  await act(async () => root.render(<YardSignConfigurator designs={designs} onDesignsChange={next => { designs = next; changed(next); }}
    sidedness="double" onSidednessChange={vi.fn()} addStepStakes stepStakeQuantity={10} onStepStakesChange={vi.fn()} onStepStakeQuantityChange={vi.fn()}
    promoCode="" promoApplied={false} onPromoCodeChange={vi.fn()} onPromoApply={vi.fn()} onPromoRemove={vi.fn()} />));
};
const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === label);
  expect(button).toBeTruthy(); await act(async () => button!.click());
};
async function openFit() {
  await act(async () => (host.querySelector('button[aria-label="Preview original.pdf"]') as HTMLButtonElement).click());
  await click('Fit my design with AI');
}
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  designs = [{ ...original }, { ...second }];
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('fits one yard sign, preserves quantities and other rows, clears stale previews, and restores the PDF', async () => {
  await openFit();
  expect(mocks.dialog).toMatchObject({ open: true, productType: 'yard_sign', widthIn: 24, heightIn: 18 });
  expect(mocks.dialog.artwork).toMatchObject({ url: original.fileUrl, permanentPreviewUrl: original.thumbnailUrl });
  const identity = artworkFitIdentity(mocks.dialog.artwork, 24, 18, 'yard_sign');
  await act(async () => mocks.dialog.onApply(fitted, identity)); await render();
  expect(designs[0]).toMatchObject({ id: 'first', fileKey: 'fitted', quantity: 7, isPdf: false, imgScale: 1, imgPos: { x: 0, y: 0 } });
  expect(designs[0].previewThumbnailUrl).toBeUndefined(); expect(designs[0].placementPreview).toBeUndefined();
  expect(designs[1]).toEqual(second);
  expect(host.querySelector('[data-editor-src]')?.getAttribute('data-editor-src')).toBe(fitted.url);
  designs = designs.map(design => design.id === 'first' ? { ...design, quantity: 9 } : design); await render();
  await click('Restore original'); await render();
  expect(designs[0]).toMatchObject({ fileKey: 'original', isPdf: true, quantity: 9, imgScale: 1.2, imgPos: { x: 5, y: 10 } });
  expect(designs[1]).toEqual(second);
});

it('cannot replace a deleted or changed design with a late fitted result', async () => {
  await openFit();
  const apply = mocks.dialog.onApply;
  const identity = artworkFitIdentity(yardSignFitArtwork(original), 24, 18, 'yard_sign');
  designs = [second]; await render();
  expect(() => apply(fitted, identity)).toThrow('changed or was removed');
  expect(changed).not.toHaveBeenCalled(); expect(designs).toEqual([second]);
});

it('keeps the original when the fit comparison is dismissed', async () => {
  await openFit(); await act(async () => mocks.dialog.onOpenChange(false));
  expect(designs).toEqual([original, second]); expect(changed).not.toHaveBeenCalled();
});
