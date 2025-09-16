import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';

interface PDFPreviewProps {
  url: string;
  className?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ url, className = '' }) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Reset state when URL changes
    setIframeLoaded(false);
    setShowFallback(false);

    // Set a timeout to show fallback if iframe doesn't load
    const timer = setTimeout(() => {
      if (!iframeLoaded) {
        setShowFallback(true);
      }
    }, 3000); // 3 second timeout

    return () => clearTimeout(timer);
  }, [url, iframeLoaded]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    setShowFallback(false);
  };

  const handleIframeError = () => {
    setShowFallback(true);
  };

  return (
    <div className={`relative bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      {/* Try multiple PDF viewing approaches */}

      {/* Approach 1: Direct iframe */}
      {!showFallback && (
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          className="w-full h-full border-0 absolute inset-0"
          title="PDF Preview"
          style={{ minHeight: '300px' }}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      )}

      {/* Approach 2: Google Docs Viewer as backup */}
      {!showFallback && !iframeLoaded && (
        <iframe
          src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
          className="w-full h-full border-0 absolute inset-0"
          title="PDF Preview (Google Viewer)"
          style={{ minHeight: '300px' }}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      )}

      {/* Fallback display */}
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">PDF Uploaded</p>
            <p className="text-xs text-gray-500">Preview shows layout only</p>
            <p className="text-xs text-gray-500">Your PDF will be used in production</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!iframeLoaded && !showFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText className="h-6 w-6 text-red-500 animate-pulse" />
            </div>
            <p className="text-sm text-gray-600">Loading PDF preview...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFPreview;
