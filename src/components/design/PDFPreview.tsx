import React, { useState, useEffect } from 'react';
import { FileText, AlertCircle } from 'lucide-react';

interface PDFPreviewProps {
  url: string;
  className?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ url, className = '' }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        // Import PDF.js dynamically to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        // Load the PDF document
        const pdf = await pdfjsLib.getDocument(url).promise;
        
        if (!mounted) return;

        // Get the first page
        const page = await pdf.getPage(1);
        
        if (!mounted) return;

        // Set up canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        // Calculate scale to fit within preview area
        const viewport = page.getViewport({ scale: 1 });
        const maxWidth = 400;
        const maxHeight = 300;
        
        const scaleX = maxWidth / viewport.width;
        const scaleY = maxHeight / viewport.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

        const scaledViewport = page.getViewport({ scale });
        
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Render the page
        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;

        if (!mounted) return;

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png');
        setPdfUrl(dataUrl);
        
      } catch (err) {
        console.error('Error loading PDF:', err);
        if (mounted) {
          setError('Could not load PDF preview');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      mounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center p-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="h-6 w-6 text-red-500 animate-pulse" />
          </div>
          <p className="text-sm text-gray-600">Loading PDF preview...</p>
        </div>
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center p-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm text-gray-600 mb-2">PDF Preview Unavailable</p>
          <p className="text-xs text-gray-500">Your PDF will be used in production</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <img
        src={pdfUrl}
        alt="PDF Preview"
        className="max-w-full max-h-full object-contain"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  );
};

export default PDFPreview;
