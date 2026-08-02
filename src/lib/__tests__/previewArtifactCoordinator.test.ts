import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  measure: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/utils/generatePositionedThumbnail', () => ({
  renderPositionedThumbnailBlob: mocks.render,
  measureVisibleArtworkFraction: mocks.measure,
}));

vi.mock('@/utils/uploadCanvasImage', () => ({
  uploadCanvasImageToCloudinary: mocks.upload,
}));

import {
  clearPlacementPreviewCoordinatorForTests,
  createPermanentPlacementPreview,
} from '../previewArtifactCoordinator';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  type ArtworkCompositionSpec,
} from '../previewLifecycle';

const spec = (revision = 1): ArtworkCompositionSpec => ({
  version: PREVIEW_ARTIFACT_VERSION,
  sourceIdentity: 'source@1@1',
  sourceUrl: 'https://cdn.example.com/source.png',
  productType: 'banner',
  widthIn: 120,
  heightIn: 48,
  fitMode: 'fit',
  transform: { xPct: 10, yPct: -5, scaleX: 1.8, scaleY: 1.6 },
  revision,
});

class FakeImage {
  naturalWidth = 1400;
  naturalHeight = 560;
  complete = false;
  crossOrigin = '';
  decoding = '';
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  private value = '';

  decode() { return Promise.resolve(); }

  set src(value: string) {
    this.value = value;
    this.complete = true;
    queueMicrotask(() => this.onload?.());
  }

  get src() { return this.value; }
}

function installBrowserStubs() {
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`Unexpected element ${tag}`);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '#ffffff',
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
      };
    },
  });
}

describe('preview artifact coordinator', () => {
  beforeEach(() => {
    clearPlacementPreviewCoordinatorForTests();
    vi.clearAllMocks();
    installBrowserStubs();
    mocks.render.mockResolvedValue({
      blob: new Blob(['exact-preview'], { type: 'image/jpeg' }),
      widthPx: 1400,
      heightPx: 560,
      visiblePixelFraction: 0.72,
    });
    mocks.measure.mockReturnValue(0.72);
    mocks.upload.mockImplementation(async (_blob: Blob, filename: string) => ({
      secureUrl: `https://cdn.example.com/${filename}`,
      fileKey: filename.replace(/\.jpg$/, ''),
    }));
  });

  it('joins double taps for the same immutable signature', async () => {
    const first = createPermanentPlacementPreview(spec());
    const second = createPermanentPlacementPreview(spec());
    expect(second).toBe(first);

    const [one, two] = await Promise.all([first, second]);
    expect(two).toBe(one);
    expect(one.compositionSignature).toBe(buildCompositionSignature(spec()));
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('isolates revisions so an older completion cannot overwrite the newer artifact', async () => {
    const uploads = new Map<string, (value: { secureUrl: string; fileKey: string }) => void>();
    mocks.upload.mockImplementation((_blob: Blob, filename: string) => new Promise((resolve) => {
      uploads.set(filename, resolve);
    }));

    const oldSpec = spec(10);
    const newSpec = spec(11);
    const oldPromise = createPermanentPlacementPreview(oldSpec);
    const newPromise = createPermanentPlacementPreview(newSpec);
    await vi.waitFor(() => expect(uploads.size).toBe(2));

    const newName = `${buildCompositionSignature(newSpec)}.jpg`;
    uploads.get(newName)?.({ secureUrl: `https://cdn.example.com/${newName}`, fileKey: newName });
    const newer = await newPromise;

    const oldName = `${buildCompositionSignature(oldSpec)}.jpg`;
    uploads.get(oldName)?.({ secureUrl: `https://cdn.example.com/${oldName}`, fileKey: oldName });
    const older = await oldPromise;

    expect(newer.compositionSignature).toBe(buildCompositionSignature(newSpec));
    expect(older.compositionSignature).toBe(buildCompositionSignature(oldSpec));
    expect(newer.previewUrl).not.toBe(older.previewUrl);
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });
});
