import React from 'react';
import { FileText } from 'lucide-react';

interface PDFPreviewProps {
  url: string;
  className?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ url, className = '' }) => {
  // Use browser's native PDF rendering via iframe for better compatibility
  return (
    <div className={`flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <div className="w-full h-full relative">
        {/* Try to use browser's native PDF viewer first */}
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
          className="w-full h-full border-0"
          title="PDF Preview"
          onError={() => {
            // If iframe fails, show fallback
            console.log('PDF iframe failed, showing fallback');
          }}
        />

        {/* Fallback overlay for better UX */}
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
      </div>
    </div>
  );
};

export default PDFPreview;



export default PDFPreview;
