import React from 'react';
import { renderPdfToDataUrl } from '@/utils/pdf/renderPdfToDataUrl';

type Props = {
  file?: File; // Actual File object
  fileUrl?: string; // Blob URL or data URL
  fileName?: string; // File name for alt text
  scale: number; // 0.25–2.0 from Preview Scale UI (1 = 100%)
  className?: string;
  onError?: (err: unknown) => void;
};

export default function PdfImagePreview({ file, fileUrl, fileName, scale, className, onError }: Props) {
  const [src, setSrc] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        let pdfFile: File;

        if (file) {
          // Use provided File object directly
          pdfFile = file;
        } else if (fileUrl) {
          // Fetch the file from the URL and create a File object
          const response = await fetch(fileUrl);
          if (!response.ok) throw new Error('Failed to fetch PDF file');
          const blob = await response.blob();
          pdfFile = new File([blob], fileName || 'document.pdf', { type: 'application/pdf' });
        } else {
          throw new Error('No file or fileUrl provided');
        }

        const url = await renderPdfToDataUrl(pdfFile, {
          scale,
          deviceScale: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
          signal: ac.signal,
        });
        if (!ac.signal.aborted) setSrc(url);
      } catch (e) {
        if (onError) onError(e);
        // fallback to empty state
        setSrc(null);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [file, fileUrl, fileName, scale, onError]);

  if (!src) {
    return (
      <div className={`flex h-48 w-full items-center justify-center rounded bg-neutral-100 text-neutral-500 ${className ?? ''}`}>
        PDF preview unavailable
      </div>
    );
  }

  // Render as an image so NO native PDF controls appear in Firefox/others
  return (
    <img
      src={src}
      alt={fileName || file?.name || 'PDF preview'}
      className={`block max-w-full select-none ${className ?? ''}`}
      draggable={false}
    />
  );
}
