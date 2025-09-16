import React, { useState, useEffect } from 'react';
import { FileText, Eye } from 'lucide-react';

interface PDFPreviewProps {
  url: string;
  className?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ url, className = '' }) => {
  const [canPreview, setCanPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if browser supports PDF viewing in iframe
    const checkPDFSupport = () => {
      setLoading(true);

      // Try to create a test iframe to see if PDF viewing is supported
      const testFrame = document.createElement('iframe');
      testFrame.style.display = 'none';
      testFrame.src = url;

      const timeout = setTimeout(() => {
        // If no load event after 2 seconds, assume it won't work
        setCanPreview(false);
        setLoading(false);
        document.body.removeChild(testFrame);
      }, 2000);

      testFrame.onload = () => {
        clearTimeout(timeout);
        setCanPreview(true);
        setLoading(false);
        document.body.removeChild(testFrame);
      };

      testFrame.onerror = () => {
        clearTimeout(timeout);
        setCanPreview(false);
        setLoading(false);
        document.body.removeChild(testFrame);
      };

      document.body.appendChild(testFrame);
    };

    checkPDFSupport();
  }, [url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="h-6 w-6 text-red-500 animate-pulse" />
          </div>
          <p className="text-sm text-gray-600">Loading PDF preview...</p>
        </div>
      </div>
    );
  }

  if (canPreview) {
    return (
      <div className={`relative bg-gray-100 rounded-lg overflow-hidden ${className}`}>
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          className="w-full h-full border-0"
          title="PDF Preview"
          style={{ minHeight: '300px' }}
        />
      </div>
    );
  }

  // Enhanced fallback with preview option
  return (
    <div className={`flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg ${className}`}>
      <div className="text-center p-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <FileText className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-2">PDF Uploaded Successfully</p>
        <p className="text-xs text-gray-500 mb-3">Preview not available in this browser</p>
        <p className="text-xs text-gray-500 mb-3">Your PDF will be used in production</p>

        {/* Add a button to open PDF in new tab */}
        <button
          onClick={() => window.open(url, '_blank')}
          className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View PDF
        </button>
      </div>
    </div>
  );
};

export default PDFPreview;
