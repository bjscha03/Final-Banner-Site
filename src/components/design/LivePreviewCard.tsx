import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image as ImageIcon, X, ChevronDown, ChevronUp, Wand2, Crop, RefreshCw, Loader2, Type, Palette } from 'lucide-react';
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
import PreviewCanvas from './PreviewCanvas';
import { useAuth, isAdmin } from '@/lib/auth';
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
  if (!originalUrl) return "";
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


// Helper function to calculate distance between two touch points
const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

const LivePreviewCard: React.FC<LivePreviewCardProps> = ({ onOpenAIModal, isGeneratingAI = false }) => {
  const { widthIn, heightIn, previewScalePct, grommets, file, overlayImage, textElements, editingItemId, set, addTextElement, updateTextElement, deleteTextElement } = useQuoteStore();
  const { user } = useAuth();
  const isAdminUser = user && isAdmin(user);
  console.log('🔐 CANVA DEBUG:', { 
    user: user ? { id: user.id, email: user.email, is_admin: user.is_admin } : 'NO USER',
    isAdminUser: isAdminUser
  });
  console.log('🔐 CANVA DEBUG:', { 
    user: user ? { id: user.id, email: user.email, is_admin: user.is_admin } : 'NO USER',
    isAdminUser: isAdminUser
  });
  console.log('🔍 LIVE PREVIEW: overlayImage from quote store:', overlayImage);
  const { toast } = useToast();

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);  // Image interaction state
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);  
  // Use quote store for imagePosition and imageScale so they persist when editing from cart
  const imagePosition = useQuoteStore((state) => state.imagePosition || { x: 0, y: 0 });
  const imageScale = useQuoteStore((state) => state.imageScale || 1);
  const setImagePosition = (pos: { x: number; y: number }) => set({ imagePosition: pos });
  const setImageScale = (scale: number) => set({ imageScale: scale });
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
  const previewContainerRef = useRef<HTMLDivElement>(null);
  
  // Pinch-to-zoom state for main image
  const [isPinchingImage, setIsPinchingImage] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [pinchStartScale, setPinchStartScale] = useState(1);
  
  // Pinch-to-zoom state for overlay
  const [isPinchingOverlay, setIsPinchingOverlay] = useState(false);
  const [initialOverlayPinchDistance, setInitialOverlayPinchDistance] = useState(0);
  const [pinchStartOverlayScale, setPinchStartOverlayScale] = useState(0.3);

  // Reset image position and scale when file is cleared
  // Only reset image state when file is actually removed, not when it changes
  const prevFileRef = React.useRef(file);
  
  React.useEffect(() => {
    const hadFile = prevFileRef.current !== undefined;
    const hasFile = file !== undefined;
    
    // Only reset if we HAD a file and now we DON'T (file was removed)
    if (hadFile && !hasFile && !editingItemId) {
      setImagePosition({ x: 0, y: 0 });
      setImageScale(1);
      setIsImageSelected(false);
      setIsDraggingImage(false);
      setIsResizingImage(false);
      setResizeHandle(null);
    }
    
    // CRITICAL FIX: Auto-select image when file is loaded (upload or edit from cart)
    // This ensures resize handles appear immediately
    if (!hadFile && hasFile) {
      console.log('✅ File loaded - auto-selecting image to show resize handles');
      setIsImageSelected(true);
    }
    
    prevFileRef.current = file;
  }, [file, editingItemId]);

  React.useEffect(() => {
    console.log('🔍 LivePreviewCard: imagePosition changed:', imagePosition);
    console.log('�� LivePreviewCard: imageScale changed:', imageScale);
    console.log('🔍 LivePreviewCard: editingItemId:', editingItemId);
    console.log('🔍 LivePreviewCard: file:', file);
  }, [imagePosition, imageScale, editingItemId, file]);
  // Handle banner dimension changes - recalculate image fit
  // SKIP auto-fit when editing from cart to preserve user's saved scale/position
  // Handle banner dimension changes - recalculate image fit
  // SKIP auto-fit when editing from cart to preserve user's saved scale/position
  useEffect(() => {
    // Don't auto-fit if editing from cart - preserve saved scale/position
    if (editingItemId) {
      console.log('📐 Editing from cart - skipping auto-fit, preserving saved imageScale and imagePosition');
      return;
    }
    
    // Don't auto-fit if user has manually scaled the image
    // Only auto-fit when dimensions change AND image is at default scale
    if (file?.url && imageScale === 1) {
      console.log('📐 Banner dimensions changed with default scale, recalculating image fit');
      
      const img = new Image();
      img.onload = () => {
        const imgAspect = img.width / img.height;
        const bannerAspect = widthIn / heightIn;
        
        // Calculate scale to fit image within banner (no clipping)
        // With preserveAspectRatio="meet", the image will automatically fit within the container
        // So we always use fitScale = 1 to use the full banner dimensions as the container
        let fitScale = 1;
        
        console.log('📐 Dimension change - new fit scale:', {
          bannerSize: `${widthIn}"x${heightIn}"`,
          bannerAspect: bannerAspect.toFixed(2),
          imageAspect: imgAspect.toFixed(2),
          newFitScale: fitScale.toFixed(2),
          oldScale: imageScale.toFixed(2)
        });
        
        // Only update if scale actually changed to prevent infinite loops
        // CRITICAL: Don't reset position when editing from cart
        if (Math.abs(fitScale - imageScale) > 0.001 && !editingItemId) {
          setImageScale(fitScale);
          setImagePosition({ x: 0, y: 0 });
        }
      };
      img.onerror = () => {
        console.error('Failed to load image for dimension change recalculation');
      };
      img.src = file.url;
    } else if (file?.url && imageScale !== 1) {
      console.log('📐 Banner dimensions changed but image has custom scale - preserving user adjustments');
    }
  }, [widthIn, heightIn, file, imageScale, editingItemId]); // Include all dependencies
  // Responsive scale factor based on container dimensions

  // Auto-convert PDFs to bitmaps when uploaded and dimensions are available
  useEffect(() => {
    const convertPdfToBitmap = async () => {
      // Only convert if:
      // 1. File exists and is a PDF
      // 2. File URL is a blob URL (not already converted)
      // 3. Banner dimensions are set
      // 4. Not already rendering
      // 5. Not editing from cart (preserve existing conversion)
      if (!file?.isPdf || !file?.url || !widthIn || !heightIn || isRenderingPdf || editingItemId) {
        return;
      }

      // Check if PDF has already been converted to bitmap (has artworkWidth)
      if (file.artworkWidth) {
        console.log('📄 PDF already converted to bitmap, skipping re-conversion');
        return;
      }
      
      // For Cloudinary PDFs, we need to fetch and convert them client-side
      console.log('📄 PDF from Cloudinary detected, will convert client-side');

      console.log('📄 Auto-converting PDF to bitmap for preview...', {
        fileName: file.name,
        dimensions: `${widthIn}" x ${heightIn}"`,
        fileUrl: file.url.substring(0, 50) + '...'
      });

      setIsRenderingPdf(true);

      try {
        // Fetch the PDF blob from the blob URL
        const response = await fetch(file.url);
        const pdfBlob = await response.blob();
        const pdfFile = new File([pdfBlob], file.name, { type: 'application/pdf' });

        // Convert PDF to bitmap
        const pdfResult = await loadPdfToBitmap(pdfFile, {
          bannerWidthInches: widthIn,
          bannerHeightInches: heightIn,
          targetDPI: 200,
          maxDimension: 6000,
          compressionQuality: 0.85,
          maxUploadSize: 50 * 1024 * 1024
        });

        console.log('✅ PDF converted successfully:', {
          width: pdfResult.width,
          height: pdfResult.height,
          actualDPI: pdfResult.actualDPI,
          fileSize: `${Math.round(pdfResult.fileSize / 1024 / 1024 * 100) / 100}MB`
        });

        // Update the file with the bitmap URL and dimensions
        // CRITICAL: Keep original Cloudinary URL in originalUrl for cart storage
        set({
          file: {
            ...file,
            url: pdfResult.blobUrl,
            originalUrl: file.url, // PRESERVE original Cloudinary URL for cart/orders
            artworkWidth: pdfResult.width,
            artworkHeight: pdfResult.height,
            isPdf: true, // Keep isPdf flag for reference
            fileKey: file.fileKey || `upload-${Date.now()}`
          }
        });

        toast({
          title: 'PDF processed successfully',
          description: `Converted to ${pdfResult.actualDPI} DPI bitmap for preview.`
        });

      } catch (error) {
        console.error('❌ PDF conversion failed:', error);
        toast({
          title: 'PDF processing failed',
          description: error instanceof Error ? error.message : 'Failed to process PDF. Please try uploading again.',
          variant: 'destructive'
        });
      } finally {
        setIsRenderingPdf(false);
      }
    };

    convertPdfToBitmap();
  }, [file, widthIn, heightIn, isRenderingPdf, editingItemId, set, toast]);
  const [responsiveScale, setResponsiveScale] = useState(100);

  // Calculate responsive scale based on container size
  const calculateResponsiveScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    
    const container = previewContainerRef.current;
    const containerWidth = container.clientWidth;
    
    // Base calculation: scale text proportionally based on actual container width
    // Reference width: 800px for desktop = 100% scale
    const referenceWidth = 800;
    const calculatedScale = (containerWidth / referenceWidth) * 100;
    
    // Clamp between reasonable bounds (30% to 150%)
    const clampedScale = Math.max(30, Math.min(150, calculatedScale));
    
    console.log('📏 Responsive scale calculated:', {
      containerWidth,
      calculatedScale: calculatedScale.toFixed(1),
      clampedScale: clampedScale.toFixed(1)
    });
    
    setResponsiveScale(clampedScale);
  }, []);

  // Measure container on mount and when it changes
  useEffect(() => {
    calculateResponsiveScale();
    
    // Use ResizeObserver for accurate container size tracking
    const resizeObserver = new ResizeObserver(() => {
      calculateResponsiveScale();
    });
    
    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateResponsiveScale]);

  // Handle orientation changes and window resize
  useEffect(() => {
    const handleOrientationChange = () => {
      console.log('📱 Orientation changed - recalculating preview layout');
      // Force a re-render to recalculate dimensions
      // The preview canvas will automatically adjust based on container size
    };
    
    const handleResize = () => {
      console.log('📐 Window resized - preview will adjust automatically');
    };
    
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Overlay image interaction state
  const [isOverlaySelected, setIsOverlaySelected] = useState(false);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [isResizingOverlay, setIsResizingOverlay] = useState(false);
  const [overlayResizeHandle, setOverlayResizeHandle] = useState<string | null>(null);
  const [initialOverlayPosition, setInitialOverlayPosition] = useState({ x: 50, y: 50 });
  const [initialOverlayScale, setInitialOverlayScale] = useState(0.3);




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

      // ALWAYS upload to Cloudinary to get permanent URLs
      // Never use blob URLs as they don't persist across sessions
      let result;
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
      
      // CRITICAL: Never save blob URLs - they expire on page reload
      const permanentUrl = result.secureUrl || result.fileUrl;
      if (!permanentUrl || permanentUrl.startsWith('blob:')) {
        console.error('❌ No permanent URL from upload:', { result, previewUrl });
        throw new Error('Upload failed to return a permanent URL. Please try again.');
      }
      
      console.log('✅ Using permanent URL:', permanentUrl);
      
      // PERFORMANCE FIX: Set image URL immediately so rendering starts right away
      // Don't wait for dimension calculation - do it in parallel
      set({
        file: {
          name: file.name,
          type: isPdf ? 'application/pdf' : file.type,
          size: file.size,
          url: permanentUrl, // ONLY use permanent Cloudinary URL
          isPdf,
          fileKey: result.fileKey,
          artworkWidth: artworkWidth || undefined,
          artworkHeight: artworkHeight || undefined
        },
        // Reset scale to 100% when uploading a new file
        previewScalePct: 100
      });
      
      // Reset image state immediately for instant rendering
      setImageScale(1);
      setImagePosition({ x: 0, y: 0 });
      setIsImageSelected(false);
      setIsUploading(false);
      
      // Show success toast immediately
      toast({
        title: "Upload Successful",
        description: isPdf 
          ? `PDF converted and uploaded successfully (${Math.round(fileToUpload.size / 1024 / 1024 * 100) / 100}MB)`
          : "Image uploaded successfully",
      });
      
      // Calculate dimensions asynchronously in background (non-blocking)
      // This doesn't delay rendering - it just updates metadata
      const img = new Image();
      img.onload = () => {
        const imgAspect = img.width / img.height;
        const bannerAspect = widthIn / heightIn;
        let fitScale = 1;
        
        console.log('📐 Image fit calculation (background):', {
          imageSize: `${img.width}x${img.height}`,
          imageAspect: imgAspect.toFixed(2),
          bannerSize: `${widthIn}"x${heightIn}"`,
          bannerAspect: bannerAspect.toFixed(2),
          fitScale: fitScale.toFixed(2)
        });
        
        // Update dimensions in background without affecting rendering
        if (!isPdf) {
          set({
            file: {
              ...useQuoteStore.getState().file!,
              artworkWidth: img.width,
              artworkHeight: img.height
            }
          });
        }
      };
      img.onerror = () => {
        console.error('Failed to load image for fit calculation (non-critical)');
      };
      img.src = permanentUrl;
      
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

  // Canva integration handler
  const handleDesignInCanva = () => {
    // Check if user is logged in
    if (!user || !user.id) {
      console.error('❌ User not logged in');
      // You could show a toast or redirect to login here
      alert('Please log in to use Canva design feature');
      return;
    }
    
    // Generate a temporary order ID
    const tempOrderId = `temp-${Date.now()}`;
    
    // ✅ Use real user ID from auth
    const userId = user.id;
    
    // Build the Canva start URL with parameters
    const params = new URLSearchParams({
      orderId: tempOrderId,
      userId: userId,
      width: widthIn.toString(),
      height: heightIn.toString()
    });
    
    const canvaStartUrl = `/.netlify/functions/canva-start?${params.toString()}`;
    
    console.log('🎨 Opening Canva design session:', { tempOrderId, userId, widthIn, heightIn });
    
    // Open Canva in a new window
    window.location.href = canvaStartUrl;
  };
  const removeFile = () => {
    if (file?.url) {
      URL.revokeObjectURL(file.url);
    }
    set({ file: null });
    setUploadError('');
    
    // If we were editing a cart item, clear editingItemId since we're starting fresh
    if (editingItemId) {
      console.log('🔄 LivePreviewCard: File removed while editing, clearing editingItemId');
      set({ editingItemId: null });
    }
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

      // Load image to get dimensions
      const img = document.createElement('img');
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        console.log('📐 Overlay image dimensions:', { width: img.width, height: img.height, aspectRatio });
        
        // Add overlay to store with default position (centered) and scale
        set({
          overlayImage: {
            name: overlayFile.name,
            url: result.secureUrl,
            fileKey: result.fileKey,
            position: { x: 50, y: 50 }, // Center of banner
            scale: 0.3, // 30% of banner size by default
            aspectRatio,
          },
        });

        toast({
          title: 'Overlay Added',
          description: 'Logo/image overlay added successfully.',
        });
      };
      img.onerror = () => {
        console.error('❌ Failed to load overlay image');
        toast({
          title: 'Error',
          description: 'Failed to load overlay image',
          variant: 'destructive',
        });
      };
      img.src = result.secureUrl;
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
    setIsOverlaySelected(false);
    toast({
      title: 'Overlay Removed',
      description: 'Logo/image overlay has been removed',
    });
  };

  // Overlay image interaction handlers
  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!overlayImage) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target as SVGElement;
    
    // Check if clicking on a resize handle
    if (target.classList.contains("overlay-resize-handle") || target.getAttribute("data-overlay-handle")) {
      const handle = target.getAttribute("data-overlay-handle") || target.classList[1];
      console.log('✅ Overlay resize handle detected:', handle);
      setIsOverlaySelected(true);
      setIsResizingOverlay(true);
      setOverlayResizeHandle(handle);
      setInitialOverlayScale(overlayImage.scale);
      setInitialOverlayPosition({ ...overlayImage.position });
    } else {
      // Clicking on overlay body - select it and enable dragging
      console.log('📍 Overlay body clicked (drag mode)');
      setIsOverlaySelected(true);
      setIsDraggingOverlay(true);
      setInitialOverlayPosition({ ...overlayImage.position });
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleOverlayTouchStart = (e: React.TouchEvent) => {
    if (!overlayImage) return;

    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling to canvas
    const target = e.target as SVGElement;
    
    // Detect two-finger pinch gesture for zoom
    if (e.touches.length === 2) {
      console.log('📌 Two-finger pinch detected on overlay');
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setIsPinchingOverlay(true);
      setInitialOverlayPinchDistance(distance);
      setPinchStartOverlayScale(overlayImage.scale);
      setIsOverlaySelected(true);
      return;
    }
    
    const touch = e.touches[0];

    // Check if touching a resize handle
    if (target.classList.contains("overlay-resize-handle") || target.getAttribute("data-overlay-handle")) {
      const handle = target.getAttribute("data-overlay-handle") || target.classList[1];
      setIsOverlaySelected(true);
      setIsResizingOverlay(true);
      setOverlayResizeHandle(handle);
      setInitialOverlayScale(overlayImage.scale);
      setInitialOverlayPosition({ ...overlayImage.position });
    } else {
      setIsOverlaySelected(true);
      setIsDraggingOverlay(true);
      setInitialOverlayPosition({ ...overlayImage.position });
    }

    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Deselect text, image, and overlay when clicking on canvas background
    // Check if the click target is NOT an interactive element
    const target = e.target as HTMLElement;
    const tagName = target.tagName?.toLowerCase();
    
    // Check if clicking on an interactive element (image, text, handles, etc.)
    const isInteractiveElement = tagName === 'image' || 
                                 tagName === 'text' ||
                                 tagName === 'tspan' ||
                                 target.classList?.contains('resize-handle') ||
                                 target.classList?.contains('overlay-resize-handle') ||
                                 target.classList?.contains('resize-handle-group') ||
                                 target.classList?.contains('text-element') ||
                                 target.getAttribute?.('data-handle') ||
                                 target.getAttribute?.('data-overlay-handle') ||
                                 target.getAttribute?.('data-text-element') ||
                                 target.closest?.('[data-text-element]') !== null;
    
    // Only deselect if clicking on empty canvas area (not on interactive elements)
    if (!isInteractiveElement) {
      setSelectedTextId(null);
      setIsImageSelected(false);
      setIsOverlaySelected(false);
      console.log('🔵 Deselected all - clicked on canvas background');
    }
  };

  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    // Deselect on tap (touch equivalent of handleCanvasClick)
    const target = e.target as HTMLElement;
    const tagName = target.tagName?.toLowerCase();
    
    console.log('👆 Canvas touch end - target:', tagName, 'classList:', target.classList);
    console.log('👆 isOverlaySelected before check:', isOverlaySelected);
    
    const isInteractiveElement = tagName === 'image' || 
                                 tagName === 'text' ||
                                 tagName === 'tspan' ||
                                 target.classList?.contains('resize-handle') ||
                                 target.classList?.contains('overlay-resize-handle') ||
                                 target.classList?.contains('resize-handle-group') ||
                                 target.classList?.contains('text-element') ||
                                 target.getAttribute?.('data-handle') ||
                                 target.getAttribute?.('data-overlay-handle') ||
                                 target.getAttribute?.('data-text-element') ||
                                 target.closest?.('[data-text-element]') !== null;
    
    console.log('👆 Is interactive element?', isInteractiveElement);
    
    if (!isInteractiveElement) {
      setSelectedTextId(null);
      setIsImageSelected(false);
      setIsOverlaySelected(false);
      console.log('🔵 Deselected all - tapped on canvas background');
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
    
    // Detect two-finger pinch gesture for zoom
    if (e.touches.length === 2) {
      console.log('📌 Two-finger pinch detected on main image');
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setIsPinchingImage(true);
      setInitialPinchDistance(distance);
      setPinchStartScale(imageScale);
      setIsImageSelected(true);
      return;
    }
    
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
      if (!isDraggingImage && !isResizingImage && !isDraggingOverlay && !isResizingOverlay) return;
      
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

      // Handle overlay dragging and resizing
      if (isDraggingOverlay && overlayImage) {
        // Drag overlay - update position in store (matches image drag sensitivity)
        const sensitivity = 0.3; // Increased from 0.05 for responsive dragging
        const newX = Math.max(0, Math.min(100, initialOverlayPosition.x + (deltaX * sensitivity)));
        const newY = Math.max(0, Math.min(100, initialOverlayPosition.y + (deltaY * sensitivity)));
        
        set({
          overlayImage: {
            ...overlayImage,
            position: { x: newX, y: newY }
          }
        });
      } else if (isResizingOverlay && overlayResizeHandle && overlayImage) {
        // Resize overlay - update scale in store
        const sensitivity = 0.0015;
        let scaleChange = 0;

        if (overlayResizeHandle === 'se') {
          scaleChange = (deltaX + deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'nw') {
          scaleChange = -(deltaX + deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'ne') {
          scaleChange = (deltaX - deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'sw') {
          scaleChange = -(deltaX - deltaY) * sensitivity;
        }

        const newScale = Math.max(0.05, Math.min(2, initialOverlayScale + scaleChange));
        
        set({
          overlayImage: {
            ...overlayImage,
            scale: newScale
          }
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingImage(false);
      setIsResizingImage(false);
      setResizeHandle(null);
      setIsDraggingOverlay(false);
      setIsResizingOverlay(false);
      setOverlayResizeHandle(null);
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      // Handle pinch-to-zoom for main image
      if (isPinchingImage && e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const scaleFactor = currentDistance / initialPinchDistance;
        const newScale = Math.max(0.1, Math.min(5, pinchStartScale * scaleFactor));
        setImageScale(newScale);
        console.log('🔍 Pinching main image - scale:', newScale.toFixed(2));
        return;
      }
      
      // Handle pinch-to-zoom for overlay
      if (isPinchingOverlay && e.touches.length === 2 && overlayImage) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const scaleFactor = currentDistance / initialOverlayPinchDistance;
        const newScale = Math.max(0.05, Math.min(2, pinchStartOverlayScale * scaleFactor));
        set({
          overlayImage: {
            ...overlayImage,
            scale: newScale
          }
        });
        console.log('🔍 Pinching overlay - scale:', newScale.toFixed(2));
        return;
      }
      
      if (!isDraggingImage && !isResizingImage && !isDraggingOverlay && !isResizingOverlay) return;

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

      // Handle overlay dragging and resizing
      if (isDraggingOverlay && overlayImage) {
        // Drag overlay - update position in store (matches image drag sensitivity)
        const sensitivity = 0.3; // Increased from 0.05 for responsive dragging
        const newX = Math.max(0, Math.min(100, initialOverlayPosition.x + (deltaX * sensitivity)));
        const newY = Math.max(0, Math.min(100, initialOverlayPosition.y + (deltaY * sensitivity)));
        
        set({
          overlayImage: {
            ...overlayImage,
            position: { x: newX, y: newY }
          }
        });
      } else if (isResizingOverlay && overlayResizeHandle && overlayImage) {
        // Resize overlay - update scale in store
        const sensitivity = 0.0015;
        let scaleChange = 0;

        if (overlayResizeHandle === 'se') {
          scaleChange = (deltaX + deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'nw') {
          scaleChange = -(deltaX + deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'ne') {
          scaleChange = (deltaX - deltaY) * sensitivity;
        } else if (overlayResizeHandle === 'sw') {
          scaleChange = -(deltaX - deltaY) * sensitivity;
        }

        const newScale = Math.max(0.05, Math.min(2, initialOverlayScale + scaleChange));
        
        set({
          overlayImage: {
            ...overlayImage,
            scale: newScale
          }
        });
      }
    };
    
    const handleTouchEnd = () => {
      // Auto-deselect overlay after drag/resize on mobile for better UX
      if (isDraggingOverlay || isResizingOverlay) {
        setIsOverlaySelected(false);
        console.log('🔵 Auto-deselected overlay after touch drag/resize');
      }
      
      setIsDraggingImage(false);
      setIsResizingImage(false);
      setResizeHandle(null);
      setIsDraggingOverlay(false);
      setIsResizingOverlay(false);
      setOverlayResizeHandle(null);
      setIsPinchingImage(false);
      setIsPinchingOverlay(false);
    };
    
    if (isDraggingImage || isResizingImage || isDraggingOverlay || isResizingOverlay || isPinchingImage || isPinchingOverlay) {
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
  }, [isDraggingImage, isResizingImage, isDraggingOverlay, isResizingOverlay, isPinchingImage, isPinchingOverlay, dragStart, initialImagePosition, initialImageScale, initialOverlayPosition, initialOverlayScale, imagePosition, imageScale, resizeHandle, overlayResizeHandle, widthIn, heightIn, overlayImage, set, initialPinchDistance, pinchStartScale, initialOverlayPinchDistance, pinchStartOverlayScale]);


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
            <div className="relative">
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full shadow-sm animate-pulse"></div>
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
                  onChange={(value) => {
                    console.log('[GROMMET DEBUG] GrommetPicker onChange called with value:', value);
                    set({ grommets: value as Grommets });
                    console.log('[GROMMET DEBUG] After set, grommets in store:', useQuoteStore.getState().grommets);
                    // Also update showGrommets in editor store when grommets change
                    const { setShowGrommets } = useEditorStore.getState();
                    setShowGrommets(value !== 'none');
                    console.log('[GROMMET DEBUG] After setShowGrommets, showGrommets in store:', useEditorStore.getState().showGrommets);
                  }}
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
      <div ref={previewContainerRef} className="relative flex-1 pb-8">
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
                {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && onOpenAIModal && isAdminUser && (
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
                {/* Design with Canva button - Admin only for testing */}
                {isAdminUser && (
                  <>
                    <div className="text-gray-400 text-sm">or</div>
                    <button
                      onClick={handleDesignInCanva}
                      className="px-6 py-3.5 relative bg-gradient-to-r from-[#8B3DFF] to-[#00C4CC] hover:from-[#7D2AE7] hover:to-[#00B8C4] active:from-[#6C24C4] active:to-[#00A8B4] text-white rounded-xl font-semibold transition-all duration-200 w-full max-w-xs min-h-[48px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg touch-manipulation"
                      data-cta="canva-design-open"
                    >
                      <Palette className="w-5 h-5" />
                      Design with Canva
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        ADMIN
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
          <div className="mx-4 sm:mx-6 mb-4 sm:mb-6 bg-gray-100 border-2 border-gray-300 rounded-lg overflow-hidden relative min-h-[500px] sm:min-h-[600px] h-auto touch-pan-x touch-pan-y touch-pinch-zoom">
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
                  {/* DEBUG: Log props being passed to PreviewCanvas */}
                  {console.log('═══════════════════════════════════════════════════════')}
                  {console.log('🎨 [PREVIEW CANVAS PROPS]')}
                  {console.log('  file:', file ? { url: file.url?.substring(0, 60) + '...', fileKey: file.fileKey, isPdf: file.isPdf } : 'UNDEFINED')}
                  {console.log('  imageUrl:', file?.url && !file.isPdf ? file.url.substring(0, 60) + '...' : 'UNDEFINED')}
                  {console.log('  overlayImage:', overlayImage ? { url: overlayImage.url?.substring(0, 60) + '...', position: overlayImage.position, scale: overlayImage.scale } : 'UNDEFINED')}
                  {console.log('  imageScale:', imageScale)}
                  {console.log('  imagePosition:', imagePosition)}
                  {console.log('═══════════════════════════════════════════════════════')}
                  
                  {console.log('[GROMMET DEBUG] LivePreviewCard - passing grommets to PreviewCanvas:', grommets)}
                  {console.log('[GROMMET DEBUG] LivePreviewCard - passing grommets to PreviewCanvas:', grommets)}
                  <PreviewCanvas
                    key={file?.url || file?.fileKey || "no-file"}
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
                    onOverlayMouseDown={handleOverlayMouseDown}
                    onOverlayTouchStart={handleOverlayTouchStart}
                    onCanvasClick={handleCanvasClick}
                    onCanvasTouchEnd={handleCanvasTouchEnd}
                    isDraggingImage={isDraggingImage}
                    isImageSelected={isImageSelected}
                    isOverlaySelected={isOverlaySelected}
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
                      scale={responsiveScale / 100}
                      previewScale={responsiveScale}
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


            </div>

            {/* File controls - Mobile Responsive */}
            <div className="absolute top-2 left-2 right-2 sm:top-4 sm:left-auto sm:right-4 flex flex-wrap gap-2 justify-center sm:justify-end">
              <button
                onClick={handleAddText}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg sm:rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation text-sm sm:text-base"
                title="Add text to banner"
              >
                <Type className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">Add Text</span>
              </button>
              {isAIImage && !overlayImage && (
                <button
                  onClick={() => overlayFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-lg sm:rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation text-sm sm:text-base"
                  title="Add logo or image overlay"
                >
                  <ImageIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">Add Logo/Image</span>
                  <span className="sm:hidden whitespace-nowrap">Logo</span>
                </button>
              )}
              {overlayImage && (
                <button
                  onClick={handleRemoveOverlay}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg sm:rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation text-sm sm:text-base"
                  title="Remove overlay image"
                >
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">Remove Overlay</span>
                  <span className="sm:hidden whitespace-nowrap">Overlay</span>
                </button>
              )}
              {textElements.length > 0 && (
                <button
                  onClick={handleClearAllText}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg sm:rounded-xl transition-colors duration-150 shadow-md hover:shadow-lg min-h-[44px] min-w-[44px] touch-manipulation text-sm sm:text-base"
                  title="Clear all text elements"
                >
                  <span className="whitespace-nowrap">Clear Text ({textElements.length})</span>
                </button>
              )}
              <button
                onClick={removeFile}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white/95 hover:bg-white active:bg-gray-50 text-gray-700 hover:text-red-600 rounded-lg sm:rounded-xl transition-colors duration-150 shadow-md hover:shadow-sm min-h-[44px] min-w-[44px] touch-manipulation text-sm sm:text-base"
                title="Remove uploaded file"
              >
                <X className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">Remove</span>
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
