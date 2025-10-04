import React from 'react';
import { renderPdfToDataUrl } from '@/utils/pdf/renderPdfToDataUrl';
import { FileText, Download, AlertCircle } from 'lucide-react';

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
  const [downloadUrl, setDownloadUrl] = React.useState<string | null>(null);
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

        // Create download URL for fallback
        const downloadBlobUrl = URL.createObjectURL(pdfFile);
        setDownloadUrl(downloadBlobUrl);

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
  }, [file, fileUrl, fileName, onError]);

  // Clean up download URL on unmount
  React.useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleDownload = () => {
    if (downloadUrl && (file || fileName)) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName || file?.name || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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
        <div className="text-center p-4 max-w-sm">
          {/* PDF Icon */}
          <div className="mx-auto mb-3 w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          
          {/* File name */}
          <div className="text-sm font-medium mb-2 text-gray-700">
            {fileName || file?.name || 'PDF Document'}
          </div>
          
          {/* Error message (if not too technical) */}
          {error && !error.includes('InvalidPDFException') && !error.includes('corrupted') && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border mb-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>Preview unavailable</span>
            </div>
          )}
          
          {/* Download button */}
          {downloadUrl && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          )}
          
          {/* Fallback text if no download available */}
          {!downloadUrl && (
            <div className="text-xs text-gray-500">
              PDF preview not available
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
