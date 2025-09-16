import React, { useState, useRef, useMemo } from 'react';
import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuoteStore, Grommets } from '@/store/quote';
import { formatDimensions } from '@/lib/pricing';
import { grommetPoints } from '@/lib/preview/grommets';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { GrommetPicker } from '@/components/ui/GrommetPicker';
import PreviewCanvas from './PreviewCanvas';

const grommetOptions = [
  { id: 'none', label: 'None', description: 'No grommets' },
  { id: 'every-2-3ft', label: 'Every 2–3 feet', description: 'Standard spacing' },
  { id: 'every-1-2ft', label: 'Every 1–2 feet', description: 'Close spacing' },
  { id: '4-corners', label: '4 corners only', description: 'Corner grommets' },
  { id: 'top-corners', label: 'Top corners only', description: 'Top edge mounting' },
  { id: 'right-corners', label: 'Right corners only', description: 'Right edge mounting' },
  { id: 'left-corners', label: 'Left corners only', description: 'Left edge mounting' }
];

const LivePreviewCard: React.FC = () => {
  const { widthIn, heightIn, previewScalePct, grommets, file, set } = useQuoteStore();

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate grommet info
  const grommetInfo = useMemo(() => {
    const points = grommetPoints(widthIn, heightIn, grommets);
    const grommetName = {
      'none': 'None',
      'every-2-3ft': 'Every 2-3 feet',
      'every-1-2ft': 'Every 1-2 feet',
      '4-corners': '4 corners only',
      'top-corners': 'Top corners only',
      'right-corners': 'Right corners only',
      'left-corners': 'Left corners only'
    }[grommets];

    return {
      count: points.length,
      name: grommetName
    };
  }, [widthIn, heightIn, grommets]);

  // File upload logic
  const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const maxSizeBytes = 100 * 1024 * 1024; // 100MB

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return 'Please upload a PDF, JPG, JPEG, or PNG file.';
    }
    if (file.size > maxSizeBytes) {
      return 'File size must be less than 100MB.';
    }
    return null;
  };

  const handleFile = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }

    setUploadError('');
    const isPdf = file.type === 'application/pdf';
    let url: string | undefined;

    // Create URL for both PDFs and images - PDFs will be handled by PDF viewer
    url = URL.createObjectURL(file);

    set({
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        url,
        isPdf
      },
      // Reset scale to 100% when uploading a new file
      previewScalePct: 100
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const removeFile = () => {
    if (file?.url && !file.isPdf) {
      URL.revokeObjectURL(file.url);
    }
    set({ file: null });
    setUploadError('');
  };

  const handleScaleChange = (value: number[]) => {
    set({ previewScalePct: value[0] });
  };

  const handleZoomIn = () => {
    const newScale = Math.min(100, previewScalePct + 25);
    set({ previewScalePct: newScale });
  };

  const handleZoomOut = () => {
    const newScale = Math.max(25, previewScalePct - 25);
    set({ previewScalePct: newScale });
  };

  const handleResetZoom = () => {
    set({ previewScalePct: 100 });
  };

  return (
    <div className="bg-white border border-gray-200/60 rounded-2xl overflow-hidden shadow-sm">
      {/* Header - responsive design */}
      <div className="px-3 sm:px-6 py-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-sm">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Live Preview</h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            {/* Grommets Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">Grommets:</span>
              <div className="min-w-[140px]">
                <GrommetPicker
                  value={grommets}
                  onChange={(value) => set({ grommets: value as Grommets })}
                  options={grommetOptions}
                  placeholder="Choose grommets"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Real-time</span>
            </div>
          </div>
        </div>
      </div>



      {/* Scale Controls - responsive design */}
      <div className="px-3 sm:px-6 py-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-gray-700">Preview Scale:</span>
            <div className="flex items-center gap-3">
              <Slider
                value={[previewScalePct]}
                onValueChange={(value) => set({ previewScalePct: value[0] })}
                min={25}
                max={100}
                step={5}
                className="w-24 sm:w-32"
              />
              <span className="text-sm font-medium text-blue-600 min-w-[50px]">
                {previewScalePct}%
              </span>
            </div>
          </div>

          <div className="text-sm text-gray-600 text-center sm:text-right">
            Banner: {formatDimensions(widthIn, heightIn)}
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="relative flex-1">
        {!file ? (
          /* Upload State - matching the design with drag and drop */
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onTouchStart={(e) => {
              // Prevent drag events from interfering with mobile scrolling
              e.stopPropagation();
            }}
            className={`drag-area mx-3 sm:mx-6 mb-4 sm:mb-6 border border-gray-300 rounded-2xl flex items-center justify-center text-center p-4 sm:p-8 transition-all duration-200 h-72 sm:h-96 ${
              dragActive
                ? 'bg-blue-50 border-blue-400 border-dashed'
                : 'bg-gray-100 hover:bg-gray-50'
            }`}
          >
            <div>
              <h3 className="text-lg font-medium text-gray-500 mb-2">Upload artwork to preview</h3>
              <p className="text-gray-400 mb-4">Your banner will appear here</p>
              <p className="text-sm text-gray-400 mb-4">Supports: JPG, PNG, JPEG, PDF</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mb-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Upload Artwork
              </button>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-left max-w-md mx-auto">
                <p className="text-xs text-blue-700 font-medium mb-1">File requirements:</p>
                <p className="text-xs text-blue-600">
                  High-resolution files (300 DPI) work best. We'll review your artwork and contact you if any adjustments are needed.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Preview Canvas */
          <div className="mx-3 sm:mx-6 mb-4 sm:mb-6 bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden relative h-80 sm:h-[600px]">
            <div className="flex items-center justify-center h-full p-2">
              <div
                style={{
                  transform: `scale(${previewScalePct / 100})`,
                  transformOrigin: 'center center',
                  width: '90%',
                  height: '90%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <PreviewCanvas
                  widthIn={widthIn}
                  heightIn={heightIn}
                  grommets={grommets}
                  imageUrl={file?.url && !file.isPdf ? file.url : undefined}
                  className="shadow-lg"
                  file={file}
                />
              </div>
            </div>

            {/* File controls */}
            <div className="absolute top-4 right-4">
              <button
                onClick={removeFile}
                className="flex items-center gap-2 px-3 py-2 bg-white/90 hover:bg-white text-gray-600 hover:text-red-600 rounded-lg transition-colors duration-150 shadow-sm"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
            </div>
          </div>
        )}



        {/* Upload error */}
        {uploadError && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{uploadError}</p>
          </div>
        )}
      </div>



      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default LivePreviewCard;
