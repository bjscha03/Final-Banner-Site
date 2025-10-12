import React, { useState, useRef, useMemo } from 'react';
import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image, X, ChevronDown, ChevronUp, Wand2, Crop, RefreshCw, Loader2, Type } from 'lucide-react';
import DraggableText from './DraggableText';
import TextStylePanel from './TextStylePanel';
import { useQuoteStore, Grommets } from '@/store/quote';
import { formatDimensions } from '@/lib/pricing';
import { grommetPoints } from '@/lib/preview/grommets';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { GrommetPicker } from '@/components/ui/GrommetPicker';
import { useToast } from '@/components/ui/use-toast';
import { loadPdfToBitmap } from '@/utils/pdf/loadPdfToBitmap';
import QualityBadge from './QualityBadge';
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
  isGeneratingAI?: boolean;
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


const LivePreviewCard: React.FC<LivePreviewCardProps> = ({ onOpenAIModal, isGeneratingAI = false }) => {
  const { widthIn, heightIn, previewScalePct, grommets, file, overlayImage, textElements, set, addTextElement, updateTextElement, deleteTextElement } = useQuoteStore();
  const { toast } = useToast();

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);  // Image interaction state
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialImagePosition, setInitialImagePosition] = useState({ x: 0, y: 0 });
  const [initialImageScale, setInitialImageScale] = useState(1);
  const [isFittingImage, setIsFittingImage] = useState(false);
  const [isResettingImage, setIsResettingImage] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showTextPanel, setShowTextPanel] = useState(false);
  // Alignment guide states (shared across all text elements)
  const [showVerticalCenterGuide, setShowVerticalCenterGuide] = useState(false);
  const [showHorizontalCenterGuide, setShowHorizontalCenterGuide] = useState(false);
  const overlayFileInputRef = useRef<HTMLInputElement>(null);
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
    setIsUploading(true);

    const isPdf = file.type === 'application/pdf';
    let previewUrl = '';
    let artworkWidth = 0;
    let artworkHeight = 0;
    let fileToUpload: File | Blob = file;
    let uploadFileName = file.name;

    try {
      if (isPdf) {
        // Handle PDF files - convert to high-quality JPEG
        setIsRenderingPdf(true);
        
        console.log('📄 Processing PDF file:', {
          fileName: file.name,
          fileSize: `${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`,
          bannerSize: `${widthIn}" x ${heightIn}"`
        });
        
        const pdfResult = await loadPdfToBitmap(file, {
          bannerWidthInches: widthIn,
          bannerHeightInches: heightIn,
          targetDPI: 200,
          maxDimension: 6000,
          compressionQuality: 0.85,
          maxUploadSize: 50 * 1024 * 1024
        });
        
        previewUrl = pdfResult.blobUrl;
        artworkWidth = pdfResult.width;
        artworkHeight = pdfResult.height;
        
        // Convert blob URL to actual Blob for upload
        const response = await fetch(pdfResult.blobUrl);
        const blob = await response.blob();
        
        // Create a File object from the blob for upload
        uploadFileName = file.name.replace(/\.pdf$/i, '.jpg');
        fileToUpload = new File([blob], uploadFileName, { type: 'image/jpeg' });
        
        console.log('✅ PDF converted to JPEG:', {
          originalSize: `${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`,
          convertedSize: `${Math.round(fileToUpload.size / 1024 / 1024 * 100) / 100}MB`,
          dimensions: `${artworkWidth}x${artworkHeight}px`,
          actualDPI: pdfResult.actualDPI
        });
        
        setIsRenderingPdf(false);
      } else {
        // Handle regular image files
        previewUrl = URL.createObjectURL(file);
        
        console.log('🖼️ Processing image file:', {
          fileName: file.name,
          fileSize: `${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`,
          fileType: file.type
        });
      }

      // For local development, skip server upload and use local preview
      let result;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Local development - skip upload, use local preview
        console.log('🔧 Local development mode: skipping server upload');
        result = {
          success: true,
          fileUrl: previewUrl, // Use the local blob URL
          fileName: uploadFileName,
          fileSize: fileToUpload.size,
          uploadedAt: new Date().toISOString(),
          message: 'Local development - using client-side preview'
        };
      } else {
        // Production - upload to server
        const form = new FormData();
        form.append("file", fileToUpload);
        
        console.log("🚀 Starting upload to server...", {
          fileName: uploadFileName,
          fileSize: `${Math.round(fileToUpload.size / 1024 / 1024 * 100) / 100}MB`,
          fileType: fileToUpload.type,
          isPdf: isPdf
        });
        
        const response = await fetch("/.netlify/functions/upload-file", {
          method: "POST",
          body: form
        });

        console.log("📡 Upload response:", {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Upload failed:", {
            status: response.status,
            statusText: response.statusText,
            errorBody: errorText
          });
          
          // Provide more specific error messages
          let errorMessage = "Failed to upload file. Please try again.";
          if (response.status === 413) {
            errorMessage = "File is too large. Please use a smaller file or lower resolution PDF.";
          } else if (response.status === 415) {
            errorMessage = "File type not supported. Please use PDF, JPG, or PNG.";
          } else if (response.status === 400) {
            errorMessage = "Invalid file format. Please check your file and try again.";
          } else if (response.status >= 500) {
            errorMessage = "Server error. Please try again in a moment.";
          }
          
          throw new Error(errorMessage);
        }

        result = await response.json();
        console.log("✅ Upload successful:", {
          fileKey: result.fileKey,
          secureUrl: result.secureUrl ? 'present' : 'missing'
        });
      }
      
      set({
        file: {
          name: file.name,
          type: isPdf ? 'application/pdf' : file.type,
          size: file.size,
          url: previewUrl,
          isPdf,
          fileKey: result.fileKey,
          artworkWidth: artworkWidth || undefined,
          artworkHeight: artworkHeight || undefined
        },
        // Reset scale to 100% when uploading a new file
        previewScalePct: 100
      });
      
      // Reset image manipulation state
      setImagePosition({ x: 0, y: 0 });
      setImageScale(1);
      setIsImageSelected(false);
      setIsImageSelected(false);
      
      setIsUploading(false);
      
      // Show success toast
      toast({
        title: "Upload Successful",
        description: isPdf 
          ? `PDF converted and uploaded successfully (${Math.round(fileToUpload.size / 1024 / 1024 * 100) / 100}MB)`
          : "Image uploaded successfully",
      });
      
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      setIsUploading(false);
      setIsRenderingPdf(false);
      
      // Extract error message
      const errorMessage = uploadError instanceof Error 
        ? uploadError.message 
        : (isPdf ? "Failed to process PDF file. Please try again." : "Failed to upload file. Please try again.");
      
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      });
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
    if (file?.url) {
      URL.revokeObjectURL(file.url);
    }
    set({ file: null });
    setUploadError('');
  };

  // Text handling functions
  const handleAddText = () => {
    const newText = {
      content: 'New Text',
      xPercent: 50, // Center horizontally (50% from left)
      yPercent: 50, // Center vertically (50% from top)
      fontSize: 24, // Reasonable starting size
      fontFamily: 'Arial, sans-serif',
      color: '#000000', // Black text
      fontWeight: 'normal' as const,
      textAlign: 'center' as const,
      lineHeight: 1.5, // Default line spacing
    };
    
    // Add to store - this will generate an ID
    addTextElement(newText);
    
    // Get the ID that was just created (it's the last element)
    setTimeout(() => {
      const allElements = useQuoteStore.getState().textElements;
      const lastElement = allElements[allElements.length - 1];
      if (lastElement) {
        setSelectedTextId(lastElement.id);
        setShowTextPanel(true);
      }
    }, 50);
  };

  const handleClearAllText = () => {
    // Clear all text elements from the store
    set({ textElements: [] });
    setSelectedTextId(null);
    setShowTextPanel(false);
  };

  // Handle overlay image upload (for AI-generated backgrounds)
  const handleOverlayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const overlayFile = files[0];
    
    console.log('📤 Overlay upload started:', {
      name: overlayFile.name,
      type: overlayFile.type,
      size: overlayFile.size
    });
    
    // Validate file type
    if (!overlayFile.type.startsWith('image/')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload an image file (JPG, PNG, etc.)',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', overlayFile, overlayFile.name);
      
      console.log('📤 Sending FormData to upload-file function...');

      const response = await fetch('/.netlify/functions/upload-file', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary
      });

      console.log('📥 Upload response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Upload successful:', result);

      // Add overlay to store with default position (centered) and scale
      set({
        overlayImage: {
          name: overlayFile.name,
          url: result.secureUrl,
          fileKey: result.fileKey,
          position: { x: 50, y: 50 }, // Center of banner
          scale: 0.3, // 30% of banner size by default
        },
      });

      toast({
        title: 'Overlay Added',
        description: 'Logo/image overlay added successfully.',
      });
    } catch (error) {
      console.error('❌ Overlay upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload overlay image',
        variant: 'destructive',
      });
    }

    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveOverlay = () => {
    set({ overlayImage: undefined });
    toast({
      title: 'Overlay Removed',
      description: 'Logo/image overlay has been removed',
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Deselect text and image when clicking on canvas background
    // Check if the click target is NOT the image element
    const target = e.target as HTMLElement;
    const isImageClick = target.tagName === 'image' || 
                        target.classList?.contains('resize-handle') ||
                        target.classList?.contains('resize-handle-group') ||
                        target.getAttribute?.('data-handle');
    
    if (!isImageClick) {
      setSelectedTextId(null);
      setIsImageSelected(false);
      console.log('🔵 Deselected image - clicked on canvas background');
    }
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
      console.error('Error fitting image:', error);
      toast({
        title: 'Failed to fit image',
        description: 'There was an error resizing the image. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsFittingImage(false);
    }
  };
  // NEW: Resize Image functionality - Re-triggers AI artwork processing for new dimensions
  // NEW: Resize Image functionality - Re-triggers AI artwork processing for new dimensions
  const handleResizeImage = async () => {
    if (!file?.url || !isAIImage || !file.aiMetadata) {
      toast({
        title: 'No AI image to resize',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    setIsResizingImage(true);

    try {
      console.log(`🔥 RESIZE BUTTON CLICKED: Generating print-ready version for ${widthIn}×${heightIn}"`);
      console.log('🔥 RESIZE: This is the NEW CODE calling ai-image-processor API');

      // Extract public ID from the current image
      const publicId = file.aiMetadata?.cloudinary_public_id || extractPublicIdFromUrl(file.url);
      
      if (!publicId) {
        throw new Error('Could not extract Cloudinary public ID from image');
      }

      console.log('Using public ID:', publicId);

      // Call the new AI image processor
        console.log("�� Starting upload to server...", {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        });
        
        const response = await fetch("/.netlify/functions/upload-file", {
          method: "POST",
          body: form
        });

        console.log("📡 Upload response:", {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Upload failed:", {
            status: response.status,
            statusText: response.statusText,
            errorBody: errorText
          });
          throw new Error(`Upload failed (${response.status}): ${errorText || response.statusText}`);
        }

        result = await response.json();
        console.log("✅ Upload successful:", result);      console.log('AI image processor result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Image processing failed');
      }

      // Update the file with the print-ready version
      console.log('✅ Updating file with print-ready URL:', result.processedUrl);
      
      set({
        file: {
          ...file,
          url: result.processedUrl,
          name: file.name.replace(/_fitted_\d+x\d+|_resized_\d+x\d+|_print_ready_\d+x\d+/, '') + `_print_ready_${widthIn}x${heightIn}`,
          aiMetadata: {
            ...file.aiMetadata,
            printReadyVersion: {
              url: result.processedUrl,
              dimensions: result.dimensions,
              widthIn: widthIn,
              heightIn: heightIn
            }
          }
        }
      });

      toast({
        title: 'Print-ready version generated!',
        description: `Created high-resolution file at ${result.dimensions?.dpi || 150} DPI for ${widthIn}×${heightIn}" banner`,
        variant: 'default'
      });

    } catch (error) {
      console.error("🚨 RESIZE ERROR DETAILS:", error);
      console.error("🚨 ORIGINAL URL:", file?.url);
      console.error('Error generating print-ready version:', error);
      toast({
        title: 'Resize failed',
        description: error.message || 'Could not generate print-ready version. Please try again.',
        variant: 'destructive'
      });
    } finally {
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

    try {
      console.log('🔥 RESET BUTTON CLICKED: Resetting AI image to original state');
      console.log('🔥 RESET: This is the NEW CODE calling ai-image-processor API');

      // Extract public ID from the current image
      const publicId = file.aiMetadata?.cloudinary_public_id || extractPublicIdFromUrl(file.url);
      
      if (!publicId) {
        throw new Error('Could not extract Cloudinary public ID from image');
      }

      console.log('Using public ID for reset:', publicId);

      // Call the AI image processor to get original version
        console.log("�� Starting upload to server...", {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        });
        
        const response = await fetch("/.netlify/functions/upload-file", {
          method: "POST",
          body: form
        });

        console.log("📡 Upload response:", {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Upload failed:", {
            status: response.status,
            statusText: response.statusText,
            errorBody: errorText
          });
          throw new Error(`Upload failed (${response.status}): ${errorText || response.statusText}`);
        }

        result = await response.json();
        console.log("✅ Upload successful:", result);      console.log('AI image processor reset result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Image reset failed');
      }

      // Update the file with the original version
      console.log('✅ Resetting to original URL:', result.processedUrl);
      
      set({
        file: {
          ...file,
          url: result.processedUrl,
          name: file.name.replace(/_fitted_\d+x\d+|_resized_\d+x\d+|_print_ready_\d+x\d+/, ''),
          aiMetadata: {
            ...file.aiMetadata,
            // Remove any transformation metadata
            printReadyVersion: undefined,
            resizedDimensions: undefined
          }
        },
        // Reset scale to 100% when resetting image
        previewScalePct: 100
      });

      toast({
        title: 'Image reset successfully!',
        description: 'Restored AI image to its original state',
        variant: 'default'
      });

    } catch (error) {
      console.error("🚨 RESIZE ERROR DETAILS:", error);
      console.error("🚨 ORIGINAL URL:", file?.url);
      console.error('Error resetting image:', error);
      
      // Clear any broken image state
      set({
        file: null,
        previewScalePct: 100
      });
      
      // Clear any broken image state
      set({
        file: null,
        previewScalePct: 100
      });
      toast({
        title: 'Reset failed',
        description: error.message || 'Could not reset the image. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsResettingImage(false);
    }
  };

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
      console.error('❌ Error extracting public ID:', error);
      return null;
    }
  };
  // Image interaction handlers
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (!file?.url) return; // Allow both images and PDFs to be dragged
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target as SVGElement;
    
    // Removed for performance
    
    // Check if clicking on a resize handle
    if (target.classList.contains("resize-handle") || target.getAttribute("data-handle")) {
      const handle = target.getAttribute("data-handle") || target.classList[1];
      console.log('✅ Resize handle detected:', handle);
      setIsImageSelected(true);
      setIsResizingImage(true);
      setResizeHandle(handle);
      setInitialImageScale(imageScale);
      console.log("📊 State after handle click:", { isImageSelected: true, isResizingImage: true, isDraggingImage: false, handle });
    } else {
      // Clicking on image body - select it and enable dragging
      console.log('📍 Image body clicked (drag mode)');
      setIsImageSelected(true);
      setIsDraggingImage(true);
    }
    
    // CRITICAL FIX: Use absolute coordinates for dragStart
    // handleMouseMove uses e.clientX/Y which are absolute, so dragStart must also be absolute
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialImagePosition({ ...imagePosition });
  };
  
  const handleImageTouchStart = (e: React.TouchEvent) => {
    if (!file?.url) return; // Allow both images and PDFs to be dragged

    e.preventDefault();
    const target = e.target as SVGElement;
    const touch = e.touches[0];

    // Check if touching a resize handle
    if (target.classList.contains("resize-handle") || target.getAttribute("data-handle")) {
      const handle = target.getAttribute("data-handle") || target.classList[1];
      setIsImageSelected(true);
      setIsResizingImage(true);
      setResizeHandle(handle);
      setInitialImageScale(imageScale);
    } else {
      // Touching image body - select and enable dragging
      setIsImageSelected(true);
      setIsDraggingImage(true);
    }

    setDragStart({ x: touch.clientX, y: touch.clientY });
    setInitialImagePosition({ ...imagePosition });
  };
  
  // Canvas background click handler - deselect image
  
  // Global mouse/touch handlers for dragging
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingImage && !isResizingImage) return;
      
      e.preventDefault();
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      if (isDraggingImage) {
        // Smooth, fluid dragging with 1:1 pixel movement
        // Position is multiplied by 0.01 in rendering, so we multiply by 100 for storage
        const sensitivity = 30; // Reduced from 100 for slower, more precise dragging
        
        // Generous bounds - allow image to move far beyond visible area for flexibility
        // This prevents snapping and allows free positioning
        const maxMove = Math.max(widthIn, heightIn) * 100; // Very generous bounds
        
        const newX = Math.max(-maxMove, Math.min(maxMove, initialImagePosition.x + (deltaX * sensitivity)));
        const newY = Math.max(-maxMove, Math.min(maxMove, initialImagePosition.y + (deltaY * sensitivity)));
        setImagePosition({ x: newX, y: newY });
      } else if (isResizingImage && resizeHandle) {
        // Smooth, centered resizing - image scales from center point
        // Lower sensitivity for fine control, like professional design tools
        const sensitivity = 0.0015; // Smooth, precise resize sensitivity
        let scaleChange = 0;

        // Calculate scale change based on handle direction
        // All handles scale from center - drag away from center to grow
        if (resizeHandle === 'se') {
          // Southeast: drag right/down to grow
          scaleChange = (deltaX + deltaY) * sensitivity;
        } else if (resizeHandle === 'nw') {
          // Northwest: drag left/up to grow (away from center)
          scaleChange = -(deltaX + deltaY) * sensitivity;
        } else if (resizeHandle === 'ne') {
          // Northeast: drag right/up to grow
          scaleChange = (deltaX - deltaY) * sensitivity;
        } else if (resizeHandle === 'sw') {
          // Southwest: drag left/down to grow
          scaleChange = -(deltaX - deltaY) * sensitivity;
        }

        // Generous scale limits - allow very small to very large
        const newScale = Math.max(0.1, Math.min(5, initialImageScale + scaleChange));
        // Removed for performance
        setImageScale(newScale);
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingImage(false);
      setIsResizingImage(false);
      setResizeHandle(null);
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingImage && !isResizingImage) return;

      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStart.x;
      const deltaY = touch.clientY - dragStart.y;

      if (isDraggingImage) {
        // Match mouse drag sensitivity - smooth, precise movement
        const sensitivity = 30; // Reduced from 100 for slower, more precise dragging
        const maxMove = Math.max(widthIn, heightIn) * 100; // Very generous bounds
        const newX = Math.max(-maxMove, Math.min(maxMove, initialImagePosition.x + (deltaX * sensitivity)));
        const newY = Math.max(-maxMove, Math.min(maxMove, initialImagePosition.y + (deltaY * sensitivity)));
        setImagePosition({ x: newX, y: newY });
      } else if (isResizingImage && resizeHandle) {
        // Match mouse resize sensitivity - smooth, centered scaling
        const sensitivity = 0.0015;
        let scaleChange = 0;

        if (resizeHandle === 'se') {
          scaleChange = (deltaX + deltaY) * sensitivity;
        } else if (resizeHandle === 'nw') {
          scaleChange = -(deltaX + deltaY) * sensitivity;
        } else if (resizeHandle === 'ne') {
          scaleChange = (deltaX - deltaY) * sensitivity;
        } else if (resizeHandle === 'sw') {
          scaleChange = -(deltaX - deltaY) * sensitivity;
        }

        const newScale = Math.max(0.1, Math.min(5, initialImageScale + scaleChange));
        // Removed for performance
        setImageScale(newScale);
      }
    };
    
    const handleTouchEnd = () => {
      setIsDraggingImage(false);
      setIsResizingImage(false);
      setResizeHandle(null);
    };
    
    if (isDraggingImage || isResizingImage) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
      
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDraggingImage, isResizingImage, dragStart, initialImagePosition, initialImageScale, imagePosition, imageScale, resizeHandle, widthIn, heightIn]);


  return (
    <>
      {/* Hidden file input for overlay image upload */}
      <input
        ref={overlayFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleOverlayUpload}
        className="hidden"
      />
      
      <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm" style={{ touchAction: 'pan-y' }}>
      {/* Header - responsive design */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Live Preview</h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-4">
            {/* Grommets Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Grommets:</span>
              <div className="flex-1 sm:min-w-[160px]">
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
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-4">
            <span className="text-sm font-medium text-gray-700 hidden sm:inline">Preview Scale:</span>
            <div className="flex items-center gap-3 sm:gap-4 flex-1">
              <Slider
                value={[previewScalePct]}
                onValueChange={(value) => set({ previewScalePct: value[0] })}
                min={25}
                max={100}
                step={5}
                className="w-full sm:w-32 max-w-[120px] sm:max-w-none"
              />
              <span className="text-sm font-medium text-blue-600 min-w-[50px]">
                {previewScalePct}%
              </span>
            </div>
          </div>

          <div className="text-sm text-gray-600 text-center sm:text-right mt-3 sm:mt-0">
            Banner: {formatDimensions(widthIn, heightIn)}
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="relative flex-1 pb-8">
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
            className={`relative drag-area mx-4 sm:mx-6 mb-4 sm:mb-6 border-2 border-gray-300 rounded-lg flex items-center justify-center text-center p-6 pb-8 sm:p-8 transition-all duration-200 min-h-[400px] sm:min-h-[480px] ${
              dragActive
                ? 'bg-blue-50 border-blue-400 border-dashed'
                : 'bg-gray-100 hover:bg-gray-50'
            }`}
          >
            {/* Loading Spinner Overlay for Upload Area */}
            {isUploading && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  <p className="text-sm font-medium text-blue-700">Processing file...</p>
                </div>
              </div>
            )}            <div className="flex flex-col items-center">
              <h3 className="text-lg font-medium text-gray-500 mb-3 sm:mb-2 mt-8">Upload artwork to preview</h3>
              <p className="text-gray-400 mb-6 sm:mb-4">Your banner will appear here</p>
              <p className="text-sm text-gray-400 mb-6 sm:mb-4">Supports: JPG, PNG, JPEG, PDF</p>
              
              {/* Button container with proper centering */}
              <div className="flex flex-col items-center gap-4 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-medium transition-colors duration-200 w-full max-w-xs min-h-[48px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md touch-manipulation"
                >
                  <Upload className="w-5 h-5" />
                  Upload Artwork
                </button>
                {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && onOpenAIModal && (
                  <>
                    <div className="text-gray-400 text-sm">or</div>
                    <button
                      onClick={onOpenAIModal}
                      className="px-6 py-3.5 relative bg-white border-2 border-purple-300 hover:border-purple-400 active:border-purple-500 hover:from-purple-100 hover:to-blue-100 text-purple-700 hover:text-purple-800 rounded-xl font-medium transition-all duration-200 w-full max-w-xs min-h-[48px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md touch-manipulation"
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
              
              <div className="mt-6 sm:mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-left max-w-md mx-auto w-full">
                <p className="text-sm sm:text-xs text-blue-700 font-medium mb-2 sm:mb-1">File requirements:</p>
                <p className="text-sm sm:text-xs text-blue-600 leading-relaxed">
                  High-resolution files (300 DPI) work best. We'll review your artwork and contact you if any adjustments are needed.
                </p>
                <p className="text-sm sm:text-xs text-blue-600 leading-relaxed mt-2 flex items-center gap-1">
                  <span className="inline-block w-4 h-4 text-blue-500">ℹ️</span>
                  After uploading or generating an image, you can add custom text to your banner.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Preview Canvas */
          <div className="mx-4 sm:mx-6 mb-4 sm:mb-6 bg-gray-100 border-2 border-gray-300 rounded-lg overflow-hidden relative min-h-[500px] sm:min-h-[600px] h-auto">
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
                <div 
                  style={{ position: 'relative', width: '100%', height: '100%' }}
                  onClick={(e) => {
                    // Deselect text and image when clicking on the container background
                    if (e.target === e.currentTarget) {
                      setSelectedTextId(null);
                      setShowTextPanel(false);
                      setIsImageSelected(false);
                      console.log('🔵 Deselected image - clicked outside preview area');
                    }
                  }}
                >
                  <PreviewCanvas
                    widthIn={widthIn}
                    heightIn={heightIn}
                    grommets={grommets}
                    imageUrl={file?.url && !file.isPdf ? file.url : undefined}
                    className="shadow-sm"
                    
                    file={file}
                    imagePosition={imagePosition}
                    overlayImage={overlayImage}
                    onImageMouseDown={handleImageMouseDown}
                    onImageTouchStart={handleImageTouchStart}
                    onCanvasClick={handleCanvasClick}
                    isDraggingImage={isDraggingImage}
                    isImageSelected={isImageSelected}
                    imageScale={imageScale}
                    isUploading={isUploading || isGeneratingAI}
                    showVerticalCenterGuide={showVerticalCenterGuide}
                    showHorizontalCenterGuide={showHorizontalCenterGuide}
                  />

                  {/* Text Elements Overlay - Using DraggableText with percentage positioning */}
                  {textElements.map((element) => (
                    <DraggableText
                      key={element.id}
                      element={element}
                      bannerWidthIn={widthIn}
                      bannerHeightIn={heightIn}
                      scale={previewScalePct / 100}
                      previewScale={previewScalePct}
                      isSelected={selectedTextId === element.id}
                      onSelect={() => {
                        setSelectedTextId(element.id);
                        setShowTextPanel(true);
                      }}
                      onUpdate={(updates) => updateTextElement(element.id, updates)}
                      onDelete={() => {
                        deleteTextElement(element.id);
                        if (selectedTextId === element.id) {
                          setSelectedTextId(null);
                          setShowTextPanel(false);
                        }
                      }}
                      onDeselect={() => {
                        setSelectedTextId(null);
                        setShowTextPanel(false);
                      }}
                      onShowVerticalCenterGuide={setShowVerticalCenterGuide}
                      onShowHorizontalCenterGuide={setShowHorizontalCenterGuide}
                    />
                  ))}
                </div>
              </div>

                {/* Quality Badge for DPI warnings */}
                {file?.artworkWidth && file?.artworkHeight && (
                  <QualityBadge
                    imageScale={imageScale}
                    bannerWidthInches={widthIn}
                    bannerHeightInches={heightIn}
                    artworkPixelWidth={file.artworkWidth}
                    artworkPixelHeight={file.artworkHeight}
                  />
                )}
            </div>

            {/* File controls */}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={handleAddText}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation"
                title="Add text to banner"
              >
                <Type className="w-4 h-4" />
                Add Text
              </button>
              {isAIImage && !overlayImage && (
                <button
                  onClick={() => overlayFileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation"
                  title="Add logo or image overlay"
                >
                  <Image className="w-4 h-4" />
                  Add Logo/Image
                </button>
              )}
              {overlayImage && (
                <button
                  onClick={handleRemoveOverlay}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation"
                  title="Remove overlay image"
                >
                  <X className="w-4 h-4" />
                  Remove Overlay
                </button>
              )}
              {textElements.length > 0 && (
                <button
                  onClick={handleClearAllText}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation"
                  title="Clear all text elements"
                >
                  Clear All Text ({textElements.length})
                </button>
              )}
              <button
                onClick={removeFile}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/95 hover:bg-white active:bg-gray-50 text-gray-700 hover:text-red-600 rounded-xl transition-colors duration-150 shadow-md hover:shadow-sm min-h-[44px] min-w-[44px] touch-manipulation"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
            </div>
            {/* AI Image Control Buttons - REMOVED per user request */}
            {/* The Fit to Size, Resize Image, and Reset buttons have been removed for AI images */}
          </div>
        )}



        {/* Upload error */}
        {uploadError && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{uploadError}</p>
          </div>
        )}
      </div>



      {/* Text Style Panel */}
      {showTextPanel && selectedTextId && (
        <div className="mx-6 mb-6" data-text-style-panel="true">
          <TextStylePanel
            selectedElement={textElements.find(el => el.id === selectedTextId) || null}
            onUpdate={(updates) => {
              if (selectedTextId) {
                updateTextElement(selectedTextId, updates);
              }
            }}
          />
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
    </>
  );
};

export default LivePreviewCard;
console.log("🔥 AI BUTTONS DEBUG: LivePreviewCard loaded at", new Date().toISOString());
window.AI_BUTTONS_FIXED = true;
