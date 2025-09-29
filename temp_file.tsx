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
            
                  
                  {/* Professional Print Guidelines Section */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
