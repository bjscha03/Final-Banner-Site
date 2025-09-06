'use client';
import { useRef, useState } from 'react';
import ARPreviewModal from './ARPreviewModal';
import { buildBannerGLBUSDZ } from '@/lib/ar/buildModel';
import { composeTexture } from '@/lib/ar/texture';
import { Smartphone, AlertCircle } from 'lucide-react';

// Provide current config & artwork from the Design Tool
type GetDesign = () => Promise<{
  widthIn: number; 
  heightIn: number;
  imageUrl?: string;                      // raster artwork
  pdfUrl?: string;                        // optional PDF (first page)
  grommetMode?: 'none'|'every-2-3ft'|'every-1-2ft'|'4-corners'|'top-corners'|'right-corners'|'left-corners';
}>;

export default function ARPreviewButton({ getDesign }: { getDesign: GetDesign }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<{glbUrl: string; usdzUrl: string}>();
  const dims = useRef({ w: 48, h: 24 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAR = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const { widthIn, heightIn, imageUrl, pdfUrl, grommetMode = 'none' } = await getDesign();
      dims.current = { w: widthIn, h: heightIn };

      // 1) Load artwork (rasterize PDF if needed)
      let artworkEl: HTMLImageElement | HTMLCanvasElement | null = null;
      if (imageUrl) {
        artworkEl = await loadImage(imageUrl);
      } else if (pdfUrl) {
        artworkEl = await pdfToCanvas(pdfUrl);
      }

      if (!artworkEl) {
        // Create a simple placeholder canvas
        artworkEl = createPlaceholderCanvas(widthIn, heightIn);
      }

      // 2) Compose texture (+ grommet markers if you like)
      const textureCanvas = await composeTexture({
        artwork: artworkEl,
        widthIn,
        heightIn,
        grommetMode,
        showGrommets: true
      });

      // Validate texture canvas
      if (!textureCanvas || textureCanvas.width === 0 || textureCanvas.height === 0) {
        throw new Error('Failed to create texture from artwork');
      }

      // 3) Build GLB/USDZ and open modal
      const built = await buildBannerGLBUSDZ({ widthIn, heightIn, textureCanvas });
      setUrls(built);
      setOpen(true);
      setBusy(false);
    } catch (err) {
      console.error('AR Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate AR preview');
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <button
          onClick={openAR}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          disabled={busy}
        >
          <Smartphone className="h-5 w-5" />
          <span>{busy ? 'Generating AR...' : 'AR Preview'}</span>
        </button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
      
      <ARPreviewModal
        open={open}
        onClose={() => {
          setOpen(false);
          // Clean up URLs when modal closes
          if (urls) {
            URL.revokeObjectURL(urls.glbUrl);
            URL.revokeObjectURL(urls.usdzUrl);
            setUrls(undefined);
          }
        }}
        glbUrl={urls?.glbUrl}
        usdzUrl={urls?.usdzUrl}
        widthIn={dims.current.w}
        heightIn={dims.current.h}
      />
    </>
  );
}

function createPlaceholderCanvas(widthIn: number, heightIn: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const aspectRatio = widthIn / heightIn;

  // Set canvas size (max 1024px on longest side)
  if (aspectRatio > 1) {
    canvas.width = 1024;
    canvas.height = Math.round(1024 / aspectRatio);
  } else {
    canvas.width = Math.round(1024 * aspectRatio);
    canvas.height = 1024;
  }

  const ctx = canvas.getContext('2d')!;

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add text
  ctx.fillStyle = 'white';
  ctx.font = `${Math.min(canvas.width, canvas.height) / 10}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Banners On The Fly', canvas.width / 2, canvas.height / 2 - 20);

  ctx.font = `${Math.min(canvas.width, canvas.height) / 20}px Arial`;
  ctx.fillText(`${widthIn}" × ${heightIn}"`, canvas.width / 2, canvas.height / 2 + 20);

  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Image loaded but has no dimensions'));
      } else {
        resolve(img);
      }
    };

    img.onerror = (e) => {
      console.error('Image load error:', e);
      reject(new Error(`Failed to load image: ${src}`));
    };

    // Add timeout
    setTimeout(() => {
      if (!img.complete) {
        reject(new Error('Image load timeout'));
      }
    }, 10000);

    img.src = src;
  });
}

// Optional PDF support
async function pdfToCanvas(url: string): Promise<HTMLCanvasElement> {
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf');
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker')).default;
    
    const doc = await pdfjs.getDocument(url).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; 
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  } catch (error) {
    console.error('PDF to canvas conversion failed:', error);
    throw new Error('Failed to process PDF file');
  }
}
