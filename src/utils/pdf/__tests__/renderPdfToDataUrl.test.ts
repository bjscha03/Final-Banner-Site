import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPdfToDataUrl } from '../renderPdfToDataUrl';

// Mock pdfjs-dist
const mockPdf = {
  getPage: vi.fn(),
  destroy: vi.fn(),
};

const mockPage = {
  getViewport: vi.fn(),
  render: vi.fn(),
};

const mockRenderTask = {
  promise: Promise.resolve(),
  cancel: vi.fn(),
};

const mockPdfjsLib = {
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
};

// Mock dynamic imports
vi.mock('pdfjs-dist', () => mockPdfjsLib);
vi.mock('pdfjs-dist/build/pdf.worker.min.js?worker', () => ({
  default: 'mock-worker-url',
}));

describe('renderPdfToDataUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock chain
    mockPdfjsLib.getDocument.mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });
    
    mockPdf.getPage.mockResolvedValue(mockPage);
    
    mockPage.getViewport.mockReturnValue({
      width: 800,
      height: 600,
    });
    
    mockPage.render.mockReturnValue(mockRenderTask);
    
    // Mock canvas and context
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(),
      toDataURL: vi.fn(),
    };
    
    const mockContext = {};
    
    mockCanvas.getContext.mockReturnValue(mockContext);
    mockCanvas.toDataURL.mockReturnValue('data:image/png;base64,mock-data');
    
    // Mock document.createElement
    global.document = {
      createElement: vi.fn().mockReturnValue(mockCanvas),
    } as any;
  });

  it('should throw error for non-PDF files', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    
    await expect(renderPdfToDataUrl(file)).rejects.toThrow('Not a PDF file');
  });

  it('should render PDF to data URL', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Mock file.arrayBuffer()
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    
    const result = await renderPdfToDataUrl(file, { scale: 1 });
    
    expect(result).toBe('data:image/png;base64,mock-data');
    expect(mockPdfjsLib.getDocument).toHaveBeenCalled();
    expect(mockPdf.getPage).toHaveBeenCalledWith(1);
    expect(mockPdf.destroy).toHaveBeenCalled();
  });

  it('should handle abort signal', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    
    const abortController = new AbortController();
    abortController.abort();
    
    await expect(
      renderPdfToDataUrl(file, { signal: abortController.signal })
    ).rejects.toThrow('Aborted');
  });

  it('should apply scale and device scale', async () => {
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    
    await renderPdfToDataUrl(file, { scale: 2, deviceScale: 2 });
    
    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 4 }); // 2 * 2
  });
});
