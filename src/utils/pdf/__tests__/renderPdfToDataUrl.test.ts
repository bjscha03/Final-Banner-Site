import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPdfToDataUrl } from '../renderPdfToDataUrl';

const mocks = vi.hoisted(() => {
  const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
  const page = { getViewport: vi.fn(), render: vi.fn(() => renderTask) };
  const pdf = { numPages: 1, getPage: vi.fn(() => Promise.resolve(page)), destroy: vi.fn(() => Promise.resolve()) };
  const pdfjs = { getDocument: vi.fn(() => ({ promise: Promise.resolve(pdf) })), GlobalWorkerOptions: { workerSrc: '' } };
  return { renderTask, page, pdf, pdfjs };
});

vi.mock('pdfjs-dist', () => mocks.pdfjs);

describe('renderPdfToDataUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page.getViewport.mockImplementation(({ scale }) => ({ width: 800 * scale, height: 600 * scale }));
    const mockContext = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillStyle: '#fff',
      fillRect: vi.fn(),
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock-data'),
    };
    global.document = { createElement: vi.fn().mockReturnValue(mockCanvas) } as any;
    global.window = { devicePixelRatio: 2 } as any;
  });

  it('should throw error for non-PDF files', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('Invalid file type');
  });

  it('should render PDF to high-resolution data URL', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const result = await renderPdfToDataUrl(file, { targetCssWidth: 1200, deviceScale: 2, qualityMultiplier: 2 });
    expect(result).toBe('data:image/png;base64,mock-data');
    expect(mocks.pdfjs.getDocument).toHaveBeenCalled();
    expect(mocks.pdf.getPage).toHaveBeenCalledWith(1);
    expect(mocks.page.render).toHaveBeenCalled();
    expect(mocks.pdf.destroy).toHaveBeenCalled();
  });

  it('should handle abort signal', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const abortController = new AbortController();
    abortController.abort();
    await expect(renderPdfToDataUrl(file, { signal: abortController.signal })).rejects.toThrow(/cancelled|aborted/i);
  });

  it('should cap huge previews by maxPixels', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    await renderPdfToDataUrl(file, { targetCssWidth: 10000, targetCssHeight: 10000, deviceScale: 4, qualityMultiplier: 2, maxPixels: 1_000_000 });
    const renderArg = mocks.page.render.mock.calls[0][0];
    expect(renderArg.viewport.width * renderArg.viewport.height).toBeLessThanOrEqual(1_000_001);
  });
});
