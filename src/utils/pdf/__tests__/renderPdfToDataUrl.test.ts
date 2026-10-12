import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPdfToDataUrl } from '../renderPdfToDataUrl';

const {
  mockPdf,
  mockPage,
  mockRenderTask,
  mockLoadingTask,
  mockPdfjsLib,
} = vi.hoisted(() => {
  const pdf = {
    numPages: 2,
    getPage: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    mockPdf: pdf,
    mockPage: {
      getViewport: vi.fn(),
      render: vi.fn(),
      cleanup: vi.fn(),
    },
    mockRenderTask: {
      promise: Promise.resolve(),
      cancel: vi.fn(),
    },
    mockLoadingTask: {
      promise: Promise.resolve(pdf),
      destroy: vi.fn(),
    },
    mockPdfjsLib: {
      PDFDataRangeTransport: class {
        onDataRange = vi.fn();
        constructor(public length: number, public initialData: Uint8Array) {}
      },
      getDocument: vi.fn(),
      GlobalWorkerOptions: { workerSrc: '' },
    },
  };
});

vi.mock('pdfjs-dist', () => mockPdfjsLib);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

const createMockCanvas = () => {
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['real jpeg'], { type: 'image/jpeg' }))),
    context,
  };
};

describe('renderPdfToDataUrl', () => {
  let mockCanvas: ReturnType<typeof createMockCanvas>;

  beforeEach(() => {
    vi.stubGlobal('window', { setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) });
    vi.clearAllMocks();
    mockPdf.numPages = 2;
    mockLoadingTask.promise = Promise.resolve(mockPdf);
    mockPdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
    mockPdf.getPage.mockResolvedValue(mockPage);
    mockPdf.destroy.mockResolvedValue(undefined);
    mockPage.getViewport.mockImplementation(({ scale }: { scale: number }) => ({
      width: 400 * scale,
      height: 200 * scale,
    }));
    mockPage.render.mockReturnValue(mockRenderTask);
    mockCanvas = createMockCanvas();
    global.document = {
      createElement: vi.fn().mockReturnValue(mockCanvas),
    } as unknown as Document;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rejects non-PDF files', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('Not a PDF file');
  });

  it('rejects empty PDFs', async () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' });
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('PDF file is empty');
  });

  it('renders the selected PDF page to a compact JPEG preview URL', async () => {
    const file = new File(['%PDF-1.7 page bytes'], 'test.pdf', { type: 'application/pdf' });
    const arrayBufferSpy = vi.spyOn(file, 'arrayBuffer');

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://preview.local/pdf-page');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const result = await renderPdfToDataUrl(file, {
      pageNumber: 2,
      scale: 1,
      deviceScale: 2,
      maxPixels: 1_000_000,
    });

    expect(result.previewUrl).toBe('blob:https://preview.local/pdf-page');
    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
    expect(result.blobSize).toBeGreaterThan(0);
    expect(result.pageNumber).toBe(2);
    result.cleanup();

    expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://preview.local/pdf-page');
    expect(arrayBufferSpy).toHaveBeenCalledTimes(1);
    expect(mockPdfjsLib.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.any(Uint8Array),
      useWorkerFetch: false,
    }));
    expect(mockPdf.getPage).toHaveBeenCalledWith(2);
    expect(mockPage.render).toHaveBeenCalledWith(expect.objectContaining({
      canvasContext: mockCanvas.context,
      viewport: expect.objectContaining({ width: 800, height: 400 }),
    }));
    expect(mockCanvas.context.fillRect).toHaveBeenCalledWith(0, 0, 800, 400);
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
    expect(mockPdf.destroy).toHaveBeenCalled();
    expect(mockCanvas.context.imageSmoothingEnabled).toBe(true);
    expect(mockCanvas.context.imageSmoothingQuality).toBe('high');
  });

  it('reads only requested slices of a large PDF instead of copying the whole original', async () => {
    const file = new File(['%PDF-1.7 page bytes'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 300 * 1024 * 1024 });
    const fullRead = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Full read must not run'));
    const slice = vi.spyOn(file, 'slice');
    mockPdfjsLib.getDocument.mockImplementationOnce(source => {
      expect(source.data).toBeUndefined();
      expect(source.disableAutoFetch).toBe(true);
      expect(source.disableStream).toBe(true);
      source.range.requestDataRange(8, 16);
      return mockLoadingTask;
    });
    await renderPdfToDataUrl(file);
    expect(fullRead).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledWith(0, 64 * 1024);
    expect(slice).toHaveBeenCalledWith(8, 16);
    const range = mockPdfjsLib.getDocument.mock.calls[0][0].range;
    expect(range.onDataRange).toHaveBeenCalledWith(8, expect.any(Uint8Array));
    range.requestDataRange(0, 8);
    expect(slice).toHaveBeenCalledTimes(2);
  });

  it('preserves aspect ratio while honoring target dimensions and pixel caps', async () => {
    const file = new File(['%PDF-1.7 page bytes'], 'test.pdf', { type: 'application/pdf' });
    await renderPdfToDataUrl(file, { targetWidth: 1600, maxPixels: 320_000 });

    const renderCall = mockPage.render.mock.calls[0][0];
    expect(renderCall.viewport.width / renderCall.viewport.height).toBeCloseTo(2);
    expect(renderCall.viewport.width * renderCall.viewport.height).toBeLessThanOrEqual(320_000);
  });

  it('rejects invalid page numbers', async () => {
    const file = new File(['%PDF-1.7 page bytes'], 'test.pdf', { type: 'application/pdf' });
    await expect(renderPdfToDataUrl(file, { pageNumber: 3 })).rejects.toThrow('outside the document range');
  });

  it('rejects invalid PDFs', async () => {
    mockLoadingTask.promise = Promise.reject(new Error('Invalid PDF structure'));
    mockPdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
    const file = new File(['not a real pdf'], 'bad.pdf', { type: 'application/pdf' });
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('Invalid PDF structure');
  });

  it('rejects PDFs with no pages', async () => {
    mockPdf.numPages = 0;
    const file = new File(['%PDF-1.7 page bytes'], 'nopages.pdf', { type: 'application/pdf' });
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('PDF has no pages');
  });

  it('rejects aborted renders and cancels PDF.js work', async () => {
    const file = new File(['%PDF-1.7 page bytes'], 'test.pdf', { type: 'application/pdf' });
    const abortController = new AbortController();
    abortController.abort();

    await expect(renderPdfToDataUrl(file, { signal: abortController.signal })).rejects.toThrow('aborted');
    expect(mockPdfjsLib.getDocument).not.toHaveBeenCalled();
  });
});
