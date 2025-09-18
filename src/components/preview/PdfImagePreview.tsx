import React from 'react';
import { renderPdfToDataUrl } from '@/utils/pdf/renderPdfToDataUrl';

type Props = {
  file?: File; // Actual File object
  fileUrl?: string; // Blob URL or data URL
  fileName?: string; // File name for alt text
  className?: string;
  onError?: (err: unknown) => void;
};

export default function PdfImagePreview({ file, fileUrl, fileName, className, onError }: Props) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        setError(null); // Clear previous errors
        setIsLoading(true); // Show loading state
        let pdfFile: File;

        if (file) {
          // Use provided File object directly
          pdfFile = file;
        } else if (fileUrl) {
          // Fetch the file from the URL and create a File object
          const response = await fetch(fileUrl);
          if (!response.ok) throw new Error(`Failed to fetch PDF file: ${response.status} ${response.statusText}`);
          const blob = await response.blob();
          pdfFile = new File([blob], fileName || 'document.pdf', { type: 'application/pdf' });
        } else {
          throw new Error('No file or fileUrl provided');
        }

        // Render PDF at fixed scale (1.0) - let CSS handle UI scaling for smooth performance
        const url = await renderPdfToDataUrl(pdfFile, {
          scale: 1.0, // Always render at 100% - CSS will handle preview scaling
          deviceScale: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
          signal: ac.signal,
        });
        if (!ac.signal.aborted) {
          setSrc(url);
          setIsLoading(false);
        }
      } catch (e) {
        if (!ac.signal.aborted) { // Only show errors if not aborted
          console.error('PDF rendering error:', e);
          const errorMessage = e instanceof Error ? e.message : 'Unknown PDF rendering error';
          // Don't show "Aborted" errors to user - these are expected during component cleanup
          if (!errorMessage.includes('Aborted') && !errorMessage.includes('cancelled')) {
            setError(errorMessage);
          }
          if (onError) onError(e);
          setSrc(null);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [file, fileUrl, fileName, onError]); // Removed 'scale' from dependencies - no longer re-renders on scale change

  if (isLoading) {
    return (
      <div className={`flex h-48 w-full items-center justify-center rounded bg-neutral-100 text-neutral-500 ${className ?? ''}`}>
        <div className="text-center p-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <div className="text-sm font-medium">Loading PDF preview...</div>
        </div>
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`flex h-48 w-full items-center justify-center rounded bg-neutral-100 text-neutral-500 ${className ?? ''}`}>
        <div className="text-center p-4">
          <div className="text-sm font-medium mb-2">PDF preview unavailable</div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border">
              Error: {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render as an image so NO native PDF controls appear in Firefox/others
  // Parent component (LivePreviewCard) handles CSS transform scaling for smooth performance
  return (
    <img
      src={src}
      alt={fileName || file?.name || 'PDF preview'}
      className={`block max-w-full select-none ${className ?? ''}`}
      draggable={false}
    />
  );
}
