import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image, X, ChevronDown, ChevronUp, Wand2, Crop, RefreshCw, Ruler, Shield, Square } from 'lucide-react';
import { useQuoteStore, Grommets } from '@/store/quote';
import { formatDimensions } from '@/lib/pricing';
import { grommetPoints } from '@/lib/preview/grommets';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { GrommetPicker } from '@/components/ui/GrommetPicker';
import { useToast } from '@/components/ui/use-toast';
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

interface LivePreviewCardProps {
  onOpenAIModal?: () => void;
}
// Helper function to create Cloudinary transformation URL for fitting to dimensions
const createFittedImageUrl = (originalUrl: string, targetWidthIn: number, targetHeightIn: number): string => {
  // Extract Cloudinary public ID from URL
  const urlParts = originalUrl.split('/');
  const uploadIndex = urlParts.findIndex(part => part === 'upload');
  if (uploadIndex === -1) return originalUrl;
  
  const publicIdWithExtension = urlParts.slice(uploadIndex + 1).join('/');
  const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, ''); // Remove extension
  const baseUrl = urlParts.slice(0, uploadIndex + 1).join('/');
  
  // Use Cloudinary transformations to fit the image to exact dimensions
  const transformation = `ar_${targetWidthIn}:${targetHeightIn},c_fill,q_auto:best`;
  
  return `${baseUrl}/${transformation}/${publicId}.jpg`;
};


const LivePreviewCard: React.FC<LivePreviewCardProps> = ({ onOpenAIModal }) => {
  const { widthIn, heightIn, previewScalePct, grommets, file, set } = useQuoteStore();
  const { toast } = useToast();

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isFittingImage, setIsFittingImage] = useState(false);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const [isResettingImage, setIsResettingImage] = useState(false);
  
  // Image positioning state
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Professional print guidelines state
  const [showSafetyArea, setShowSafetyArea] = useState(false);
  const [showBleedArea, setShowBleedArea] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);


  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Image positioning state

  // Global event listeners for image dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleImageMouseMove(e);
    const handleGlobalMouseUp = () => handleImageMouseUp();
    const handleGlobalTouchMove = (e) => handleImageTouchMove(e);
    const handleGlobalTouchEnd = () => handleImageTouchEnd();

    if (isDraggingImage) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDraggingImage, dragStart, imagePosition]);

  // Reset image position when file changes
  useEffect(() => {
    if (file?.url) {
      resetImagePosition();
    }
  }, [file?.url]);

  // Global event listeners for image dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleImageMouseMove(e);
    const handleGlobalMouseUp = () => handleImageMouseUp();
    const handleGlobalTouchMove = (e) => handleImageTouchMove(e);
    const handleGlobalTouchEnd = () => handleImageTouchEnd();

    if (isDraggingImage) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDraggingImage, dragStart, imagePosition]);

  // Reset image position when file changes
  useEffect(() => {
    if (file?.url) {
      resetImagePosition();
    }
  }, [file?.url]);

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
  // Check if current file is an AI-generated image (has Cloudinary URL and is not PDF)
  const isAIImage = useMemo(() => {
    return file && 
           file.url && 
           !file.isPdf && 
           (file.url.includes('cloudinary.com') || file.isAI === true);
  }, [file]);


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

  const handleFile = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }

    setUploadError('');
    const isPdf = file.type === 'application/pdf';

    // Create URL for preview
    const url = URL.createObjectURL(file);

    // Upload actual file content to server
    try {
      const form = new FormData();
      form.append("file", file); // Append the actual File object
      const response = await fetch("/.netlify/functions/upload-file", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      set({
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          url,
          isPdf,
          fileKey: result.fileKey // Store the server file key
        },
        // Reset scale to 100% when uploading a new file
        previewScalePct: 100
      });
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      setUploadError('Failed to upload file. Please try again.');
      return;
    }
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
  // Fit Image to Dimensions functionality
  const handleFitImageToDimensions = async () => {
    if (!file?.url || !isAIImage) {
      toast({
        title: 'No AI image to fit',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    setIsFittingImage(true);

    try {
      // Create fitted image URL using Cloudinary transformations
      const fittedUrl = createFittedImageUrl(file.url, widthIn, heightIn);
      
      // Update the file with the fitted URL
      set({
        file: {
          ...file,
          url: fittedUrl,
          name: `${file.name.replace(/\.[^/.]+$/, '')}_fitted_${widthIn}x${heightIn}.jpg`
        }
      });

      toast({
        title: 'Image fitted successfully!',
        description: `Image has been resized to perfectly match your ${widthIn}" × ${heightIn}" banner dimensions.`
      });

    } catch (error) {
      console.error("🚨 RESIZE ERROR DETAILS:", error);
      console.error("🚨 ORIGINAL URL:", file?.url);
      console.error("🚨 PUBLIC ID:", publicId);      console.error('Error fitting image:', error);
      toast({
        title: 'Failed to fit image',
        description: 'There was an error resizing the image. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsFittingImage(false);
    }
  };
  // Enhanced Resize Image functionality - Creates print-ready high-DPI version
  const handleResizeImage = async () => {
    console.log('�� handleResizeImage called');
    console.log('📊 Current state:', { 
      file: file ? { url: file.url, isPdf: file.isPdf, isAI: file.isAI, aiMetadata: file.aiMetadata } : null,
      isAIImage, 
      widthIn, 
      heightIn,
      isResizingImage 
    });

    if (!file?.url || !isAIImage || !file.aiMetadata) {
      console.log('❌ Validation failed:', { 
        hasFile: !!file?.url, 
        isAIImage, 
        hasAiMetadata: !!file?.aiMetadata 
      });
      toast({
        title: 'No AI image to resize',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    // Prevent double-clicks by checking if already processing
    if (isResizingImage) {
      console.log('⏳ Already processing, skipping...');
      return;
    }

    console.log('✅ Starting resize process...');
    setIsResizingImage(true);
    const originalUrl = file.url; // Store original URL
    
    try {
      // Calculate exact dimensions for print (300 DPI)
      const printWidthPx = Math.round(widthIn * 300);
      const printHeightPx = Math.round(heightIn * 300);
      
      console.log('📐 Calculated dimensions:', { printWidthPx, printHeightPx });
      
      // Create print-ready version with exact dimensions and high quality
      const baseUrl = file.url.split('?')[0]; // Remove query params
      console.log('🔗 Base URL:', baseUrl);
      
      const printReadyUrl = baseUrl.replace(
        '/upload/', 
        `/upload/c_fill,w_${printWidthPx},h_${printHeightPx},g_center,dpr_1.0,f_auto,q_auto:best/`
      );
      
      console.log('🎯 Print-ready URL:', printReadyUrl);
      
      // Update with print-ready version
      const newFileData = {
        file: {
          ...file,
          url: printReadyUrl,
          aiMetadata: {
            ...file.aiMetadata,
            printReady: true,
            dpi: 300,
            dimensions: {
              widthPx: printWidthPx,
              heightPx: printHeightPx,
              widthIn: widthIn,
              heightIn: heightIn
            },
            processedAt: new Date().toISOString()
          }
        }
      };
      
      console.log('💾 Updating store with:', newFileData);
      set(newFileData);

      toast({
        title: 'Print-ready version generated!',
        description: `Image optimized for ${widthIn}×${heightIn}" printing at 300 DPI (${printWidthPx}×${printHeightPx}px).`,
        variant: 'default'
      });

      console.log('✅ Resize completed successfully');

    } catch (error) {
      console.error('💥 Error generating print-ready version:', error);
      console.error('📍 Error stack:', error.stack);
      
      // Restore original URL on error
      set({
        file: {
          ...file,
          url: originalUrl
        }
      });
      toast({
        title: 'Resize failed',
        description: 'Could not generate print-ready version. Original image preserved.',
        variant: 'destructive'
      });
    } finally {
      console.log('🏁 Resize process finished, setting isResizingImage to false');
      setIsResizingImage(false);
    }
  };
  // NEW: Reset Image functionality - Restores AI image to original generated size/aspect ratio
  const handleResetImage = async () => {
    if (!file?.url || !isAIImage || !file.aiMetadata) {
      toast({
        title: 'No AI image to reset',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    setIsResettingImage(true);
    const originalUrl = file.url; // Store current URL
    
    try {
      // Reset to original AI generated image (remove transformations)
      const baseUrl = file.url.split('?')[0]; // Remove query params
      let resetUrl = baseUrl;
      
      // Remove any transformations by finding the base Cloudinary URL
      if (resetUrl.includes('/upload/')) {
        const parts = resetUrl.split('/upload/');
        const afterUpload = parts[1];
        // Remove transformation parameters (anything before the version or folder)
        const cleanPath = afterUpload.replace(/^[^v\/]*\//, "");
        resetUrl = parts[0] + '/upload/' + cleanPath;
      }
      
      // Update with reset version
      set({
        file: {
          ...file,
          url: resetUrl,
          aiMetadata: {
            ...file.aiMetadata,
            printReady: false,
            dpi: 72,
            processedAt: new Date().toISOString()
          }
        }
      });

      toast({
        title: 'Image reset successfully!',
        description: 'Image restored to original AI-generated version.',
        variant: 'default'
      });

    } catch (error) {
      console.error('Error resetting image:', error);
      // Keep current URL on error
      toast({
        title: 'Reset failed',
        description: 'Could not reset the image. Current version preserved.',
        variant: 'destructive'
      });
    } finally {
      setIsResettingImage(false);
    }
  };

  // Image positioning handlers for drag and touch support
  const handleImageMouseDown = (e) => {
    if (!isAIImage || !file?.url) return;
    
    e.preventDefault();
    setIsDraggingImage(true);
    setDragStart({
      x: e.clientX - imagePosition.x,
      y: e.clientY - imagePosition.y
    });
  };

  const handleImageTouchStart = (e) => {
    if (!isAIImage || !file?.url) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    setIsDraggingImage(true);
    setDragStart({
      x: touch.clientX - imagePosition.x,
      y: touch.clientY - imagePosition.y
    });
  };

  const handleImageMouseMove = (e) => {
    if (!isDraggingImage) return;
    
    e.preventDefault();
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    // Constrain movement within reasonable bounds
    const constrainedX = Math.max(-100, Math.min(100, newX));
    const constrainedY = Math.max(-100, Math.min(100, newY));
    
    setImagePosition({ x: constrainedX, y: constrainedY });
  };

  const handleImageTouchMove = (e) => {
    if (!isDraggingImage) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    
    // Constrain movement within reasonable bounds
    const constrainedX = Math.max(-100, Math.min(100, newX));
    const constrainedY = Math.max(-100, Math.min(100, newY));
    
    setImagePosition({ x: constrainedX, y: constrainedY });
  };

  const handleImageMouseUp = () => {
    setIsDraggingImage(false);
  };

  const handleImageTouchEnd = () => {
    setIsDraggingImage(false);
  };

  // Reset image position when new image is loaded
  const resetImagePosition = () => {
    setImagePosition({ x: 0, y: 0 });
    setIsDraggingImage(false);
  };

  // Image positioning handlers for drag and touch support

  // Reset image position when new image is loaded

  // Helper function to extract Cloudinary public ID from URL
  const extractPublicIdFromUrl = (url) => {
    try {
      console.log('🔍 Extracting public ID from URL:', url);
      
      const urlParts = url.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      if (uploadIndex === -1) {
        console.warn('⚠️ No "upload" found in URL');
        return null;
      }
      
      // Get everything after 'upload/'
      let pathAfterUpload = urlParts.slice(uploadIndex + 1);
      console.log('📂 Path after upload:', pathAfterUpload);
      
      // Remove transformation parameters (they start with letters like 'c_', 'w_', etc.)
      // The public ID is typically the last part that doesn't start with transformation params
      const publicIdParts = [];
      let foundTransformations = false;
      
      for (const part of pathAfterUpload) {
        // Check if this looks like a transformation parameter (contains underscores and starts with letter)
        if (part.includes('_') && /^[a-z]_/.test(part)) {
          foundTransformations = true;
          continue;
        }
        
        // If we haven't found transformations yet, or this is clearly a path segment
        if (!foundTransformations || !part.includes('_')) {
          publicIdParts.push(part);
        }
      }
      
      // Join the parts and remove file extension
      const publicIdWithExtension = publicIdParts.join('/');
      const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');
      
      console.log('✅ Extracted public ID:', publicId);
      return publicId;
      
    } catch (error) {
      console.error("🚨 RESIZE ERROR DETAILS:", error);
      console.error("🚨 ORIGINAL URL:", file?.url);
      console.error("🚨 PUBLIC ID:", publicId);      console.error('❌ Error extracting public ID:', error);
      return null;
    }
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
        
        {/* Professional Print Guidelines Section - Properly positioned */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <span className="text-sm font-medium text-gray-600">Print Guidelines:</span>
          
          <Button
            onClick={() => setShowDimensions(!showDimensions)}
            variant={showDimensions ? "default" : "outline"}
            size="sm"
            className="flex items-center gap-1.5 text-xs"
          >
            <Ruler className="w-3 h-3" />
            Dimensions
          </Button>
          
          <Button
            onClick={() => setShowSafetyArea(!showSafetyArea)}
            variant={showSafetyArea ? "default" : "outline"}
            size="sm"
            className="flex items-center gap-1.5 text-xs"
          >
            <Shield className="w-3 h-3" />
            Safety Area
          </Button>
          
          <Button
            onClick={() => setShowBleedArea(!showBleedArea)}
            variant={showBleedArea ? "default" : "outline"}
            size="sm"
            className="flex items-center gap-1.5 text-xs"
            disabled={!showDimensions}
          >
            <Square className="w-3 h-3" />
            Bleed Area
          </Button>
        </div>            </div>
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
            <div className="flex flex-col items-center">
              <h3 className="text-lg font-medium text-gray-500 mb-2">Upload artwork to preview</h3>
              <p className="text-gray-400 mb-4">Your banner will appear here</p>
              <p className="text-sm text-gray-400 mb-4">Supports: JPG, PNG, JPEG, PDF</p>
              
              {/* Button container with proper centering */}
              <div className="flex flex-col items-center gap-3 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 w-full max-w-xs h-12 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                >
                  <Upload className="w-5 h-5" />
                  Upload Artwork
                </button>
                {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && onOpenAIModal && (
                  <>
                    <div className="text-gray-400 text-sm">or</div>
                    <button
                      onClick={onOpenAIModal}
                      className="px-6 py-3 relative bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 hover:border-purple-400 hover:from-purple-100 hover:to-blue-100 text-purple-700 hover:text-purple-800 rounded-lg font-medium transition-all duration-200 w-full max-w-xs h-12 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                      data-cta="ai-generate-open"
                    >
                      <Wand2 className="w-5 h-5" />
                      Generate with AI
                      <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        BETA
                      </span>
                    </button>
                  </>
                )}
              </div>
              
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
                  scale={previewScalePct / 100} // Convert percentage to decimal
                  file={file}
                  imagePosition={imagePosition}
                  onImageMouseDown={handleImageMouseDown}
                  onImageTouchStart={handleImageTouchStart}
                  isDraggingImage={isDraggingImage}
                  showSafetyArea={showSafetyArea}
                  showBleedArea={showBleedArea}
                  showDimensions={showDimensions}
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
            {/* AI Image Control Buttons - Enhanced with Resize and Reset */}
            {isAIImage && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-center">
                <div className="flex gap-2 bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-lg border">
                  {/* Fit Image to Dimensions Button */}
                  <Button
                    onClick={handleFitImageToDimensions}
                    disabled={isFittingImage || isResizingImage || isResettingImage}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {isFittingImage ? (
                      <>
                        <div className="w-3 h-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                        Fitting...
                      </>
                    ) : (
                      <>
                        <Crop className="w-3 h-3" />
                        Fit to Size
                      </>
                    )}
                  </Button>

                  {/* NEW: Resize Image Button */}
                  <Button
                    onClick={handleResizeImage}
                    disabled={isFittingImage || isResizingImage || isResettingImage}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    {isResizingImage ? (
                      <>
                        <div className="w-3 h-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                        Resizing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3" />
                        Resize Image
                      </>
                    )}
                  </Button>

                  {/* NEW: Reset Image Button */}
                  <Button
                    onClick={handleResetImage}
                    disabled={isFittingImage || isResizingImage || isResettingImage}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {isResettingImage ? (
                      <>
                        <div className="w-3 h-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Reset
                      </>
                    )}
                  </Button>
                
                  
                </div>
              </div>
            )}
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
console.log("🔥 AI BUTTONS DEBUG: LivePreviewCard loaded at", new Date().toISOString());
window.AI_BUTTONS_FIXED = true;
