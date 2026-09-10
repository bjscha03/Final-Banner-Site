import React, { useRef, useState, useEffect } from 'react';

import { useEditorStore } from '@/store/editor';
import { convertPDFToImage } from '@/lib/pdfUtils';
import { useQuoteStore } from '@/store/quote';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon , Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
interface UploadedImage {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  isPDF?: boolean;
  fileKey?: string; // Cloudinary public_id
  cloudinaryUrl?: string; // Permanent Cloudinary URL
}

// Create a persistent store for uploaded images (survives component re-renders)
let persistentUploadedImages: UploadedImage[] = [];

interface AssetsPanelProps {
  onClose?: () => void;
}

const AssetsPanel: React.FC<AssetsPanelProps> = ({ onClose }) => {
  console.log('[AssetsPanel] Component rendered');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(persistentUploadedImages);
  const [uploading, setUploading] = useState(false);
  const { addObject } = useEditorStore();
  const { widthIn, heightIn, editingItemId } = useQuoteStore();

  // Sync local state with persistent store
  const { toast } = useToast();  useEffect(() => {
    persistentUploadedImages = uploadedImages;
  }, [uploadedImages]);

  // Clear images when cart action is completed (add to cart or update cart)
  // This is triggered by the parent component via a custom event
  useEffect(() => {
    const handleClearImages = () => {
      console.log('[AssetsPanel] Clearing uploaded images after cart action');
      setUploadedImages([]);
      persistentUploadedImages = [];
    };

    window.addEventListener('clearUploadedImages', handleClearImages);
    return () => window.removeEventListener('clearUploadedImages', handleClearImages);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[AssetsPanel] handleFileSelect called');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    for (const file of Array.from(files)) {
      // Validate file size (25MB max)
      if (file.size > 25 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 25MB.`);
        continue;
      }

      // Validate file type
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      
      if (!isImage && !isPDF) {
        alert(`File ${file.name} must be an image or PDF.`);
        continue;
      }

      // Create local URL for preview
      const url = URL.createObjectURL(file);
      
      if (isPDF) {
        // Convert PDF to image for preview and canvas rendering
        try {
          console.log('[AssetsPanel] Converting PDF to image:', file.name);
          const pdfPreview = await convertPDFToImage(url, 2);
          
          const newImage: UploadedImage = {
            id: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: pdfPreview.imageUrl, // Use the converted image URL instead of PDF blob
            name: file.name,
            width: pdfPreview.width,
            height: pdfPreview.height,
            isPDF: true, // Keep this flag for reference
          };
          
          console.log('[AssetsPanel] PDF converted successfully:', pdfPreview.width, 'x', pdfPreview.height);
          setUploadedImages((prev) => [...prev, newImage]);
          
          // AUTO-ADD: Automatically add PDF to canvas after conversion
          console.log("[AssetsPanel] Auto-adding PDF to canvas");
          setTimeout(async () => {
            try {
              await handleAddToCanvas(newImage);
              toast({
                title: "PDF added to banner",
                duration: 2000,
              });
              console.log("[AssetsPanel] PDF added and remains in list");
            } catch (error) {
              console.error("[AssetsPanel] ERROR in PDF auto-add:", error);
            }
          }, 100);
        } catch (error) {
          console.error('[AssetsPanel] Error converting PDF:', error);
          alert(`Failed to load PDF: ${file.name}. Please try again.`);
        }
      } else {
        // HYBRID APPROACH: Use blob URL immediately, upload to Cloudinary in background
        console.log('[AssetsPanel] Creating blob URL for image:', file.name);
        console.log('[AssetsPanel] Blob URL created:', url);
        
        const img = new Image();
        
        img.onerror = (error) => {
          console.error('[AssetsPanel] Image load error:', error);
          console.error('[AssetsPanel] Failed to load blob URL:', url);
        };
        
        img.onload = async () => {
          console.log('[AssetsPanel] Image onload fired for:', file.name);
          console.log('[AssetsPanel] Image dimensions:', img.width, 'x', img.height);
          
          const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Add image immediately with blob URL for instant preview
          const tempImage: UploadedImage = {
            id: imageId,
            url,
            name: file.name,
            width: img.width,
            height: img.height,
          };
          
          console.log('[AssetsPanel] Adding image to state:', tempImage);
          setUploadedImages((prev) => {
            console.log('[AssetsPanel] Previous uploadedImages:', prev);
            const newImages = [...prev, tempImage];
            console.log('[AssetsPanel] New uploadedImages:', newImages);
            return newImages;
          });
          console.log('[AssetsPanel] Image added with blob URL:', file.name);
          
          // Detect if mobile for auto-add behavior
          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 9999;
          const hasTouchSupport = 'ontouchstart' in window;
          const isMobileDevice = windowWidth < 1024 || (hasTouchSupport && windowWidth < 1280);
          
          console.log('[AssetsPanel] 🔍 MOBILE DETECTION:', {
            windowWidth,
            hasTouchSupport,
            isMobileDevice,
            onCloseExists: !!onClose
          });
          
          // Upload to Cloudinary FIRST (critical for mobile to avoid blob URL CORS issues)
          try {
            console.log('[AssetsPanel] Uploading to Cloudinary in background:', file.name);
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/.netlify/functions/upload-file', {
              method: 'POST',
              body: formData,
            });

            if (response.ok) {
              const result = await response.json();
              console.log('[AssetsPanel] Cloudinary upload success:', result);
              
              // Update the image with Cloudinary URL
              const cloudinaryImage = { ...tempImage, url: result.secureUrl, fileKey: result.publicId || result.fileKey, cloudinaryUrl: result.secureUrl };
              
              setUploadedImages((prev) => 
                prev.map((img) => 
                  img.id === imageId 
                    ? cloudinaryImage
                    : img
                )
              );
              console.log('[AssetsPanel] Image updated with Cloudinary URL and fileKey');
              
              // AUTO-ADD: Automatically add image to canvas after upload completes
              console.log("[AssetsPanel] Auto-adding image to canvas");
              setTimeout(async () => {
                try {
                  await handleAddToCanvas(cloudinaryImage);
                  
                  // Mobile UX: Close panel and remove from list for clean experience
                  if (isMobileDevice) {
                    console.log("[AssetsPanel] MOBILE - Removing from list and closing panel");
                    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
                    if (onClose) onClose();
                  } else {
                    // Desktop: Show toast and keep in list for re-adding
                    toast({
                      title: "Image added to banner",
                      duration: 2000,
                    });
                    console.log("[AssetsPanel] Image added and remains in list");
                  }
                } catch (error) {
                  console.error("[AssetsPanel] ERROR in auto-add:", error);
                }
              }, 100);
            } else {
              console.error('[AssetsPanel] Cloudinary upload failed:', response.status, response.statusText);
              
              // On mobile, still try to add with blob URL as fallback
              if (isMobileDevice) {
                console.log('[AssetsPanel] 📱 MOBILE - Cloudinary failed, using blob URL as fallback');
                setTimeout(async () => {
                  try {
                    await handleAddToCanvas(tempImage);
                    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
                    if (onClose) onClose();
                  } catch (error) {
                    console.error('[AssetsPanel] 📱 ❌ ERROR in fallback auto-add:', error);
                  }
                }, 100);
              }
            }
          } catch (error) {
            console.error('[AssetsPanel] Error uploading to Cloudinary:', error);
            
            // On mobile, still try to add with blob URL as fallback
            if (isMobileDevice) {
              console.log('[AssetsPanel] 📱 MOBILE - Cloudinary error, using blob URL as fallback');
              setTimeout(async () => {
                try {
                  await handleAddToCanvas(tempImage);
                  setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
                  if (onClose) onClose();
                } catch (error) {
                  console.error('[AssetsPanel] 📱 ❌ ERROR in fallback auto-add:', error);
                }
              }, 100);
            }
          }
        };
        
        console.log('[AssetsPanel] Setting img.src to trigger onload:', url);
        img.src = url;
      }
    }

    setUploading(false);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const input = fileInputRef.current;
      if (input) {
        input.files = files;
        handleFileSelect({ target: input } as any);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleAddToCanvas = async (image: UploadedImage) => {
    console.log('[AssetsPanel] ========================================');
    console.log('[AssetsPanel] handleAddToCanvas called');
    console.log('[AssetsPanel] Image:', image);
    console.log('[AssetsPanel] Canvas dimensions (inches):', { widthIn, heightIn });
    console.log('[AssetsPanel] ========================================');
    
    // CRITICAL FIX: Ensure image is uploaded to Cloudinary before adding to canvas
    // This ensures the fileKey is available for saving to cart and restoring later
    let finalImage = image;
    
    if (!image.fileKey && !image.cloudinaryUrl && image.url.startsWith('blob:')) {
      console.log('[IMAGE ADD] Image not yet uploaded to Cloudinary, uploading now...');
      
      try {
        // Fetch the blob and upload to Cloudinary
        const response = await fetch(image.url);
        const blob = await response.blob();
        const file = new File([blob], image.name, { type: blob.type });
        
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/.netlify/functions/upload-file', {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const result = await uploadResponse.json();
          console.log('[IMAGE ADD] Cloudinary upload success:', result);
          
          // Update the image in state with Cloudinary URL and fileKey
          const updatedImage = {
            ...image,
            url: result.secureUrl,
            fileKey: result.fileKey || result.publicId,
            cloudinaryUrl: result.secureUrl,
          };
          
          setUploadedImages((prev) => 
            prev.map((img) => img.id === image.id ? updatedImage : img)
          );
          
          finalImage = updatedImage;
          console.log('[IMAGE ADD] Image updated with Cloudinary URL and fileKey:', finalImage.fileKey);
        } else {
          const errorText = await uploadResponse.text();
          console.error('[IMAGE ADD] Cloudinary upload failed:', {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorBody: errorText
          });
          alert(`Failed to upload image to cloud storage. Error: ${uploadResponse.status} ${uploadResponse.statusText}. Please try again.`);
          return;
        }
      } catch (error) {
        console.error('[IMAGE ADD] Error uploading to Cloudinary:', error);
        alert('Failed to upload image to cloud storage. Please try again.');
        return;
      }
    }
    
    // Calculate size to fit on canvas (max 50% of canvas width/height)
    const maxWidth = widthIn * 0.5;
    const maxHeight = heightIn * 0.5;
    const aspectRatio = finalImage.width / finalImage.height;
    
    let width = maxWidth;
    let height = width / aspectRatio;
    
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    const imageObject = {
      type: 'image' as const,
      url: finalImage.url,
      x: widthIn / 2 - width / 2,
      y: heightIn / 2 - height / 2,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      isPDF: finalImage.isPDF || false,
      // CRITICAL: Include cloudinaryPublicId (fileKey) so image can be saved/restored from cart
      cloudinaryPublicId: finalImage.fileKey || finalImage.cloudinaryUrl,
      name: finalImage.name,
    };
    
    console.log('[IMAGE ADD] Adding image object to canvas:', imageObject);
    console.log('[BUG 2 FIX] Image object includes fileKey:', imageObject.cloudinaryPublicId, 'and name:', imageObject.name);
    addObject(imageObject);
    console.log('[IMAGE ADD] Image added successfully');
    
    // Panel closing is handled by the auto-add logic on mobile
    // On desktop, keep panel open so user can add more images
  };

  const handleRemoveImage = (id: string) => {
    setUploadedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.url);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Uploads</h3>
      
      {/* Upload area */}
      <label 
        className="block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#E4002B] hover:bg-red-50 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="sr-only"
        />
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 mb-1">
          Click to upload or drag and drop
        </p>
        <p className="text-xs text-gray-400">
          PNG, JPG, GIF, PDF up to 25MB
        </p>
      </label>

      {uploading && (
        <div className="text-center text-sm text-gray-500">
          Uploading...
        </div>
      )}

      {uploadedImages.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">Your Images</h4>
          <div className="grid grid-cols-2 gap-2">
            {uploadedImages.map((image) => {
              console.log('[AssetsPanel] Rendering image:', image.id, 'URL:', image.url);
              return (
              <Card key={image.id} className="relative group">
                <button
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="space-y-1">
                  <div className="hover:opacity-80 transition-opacity">
                    <div className="aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                      {image.isPDF ? (
                        <div className="w-full h-full bg-gradient-to-br from-red-50 to-red-100 flex flex-col items-center justify-center p-4 border-2 border-red-200">
                          <svg className="w-12 h-12 text-red-600 mb-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <p className="text-sm font-bold text-red-700">PDF</p>
                          <p className="text-xs text-red-600 mt-1 text-center truncate w-full">{image.name}</p>
                        </div>
                      ) : (
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 truncate p-1">
                      {image.name}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleAddToCanvas(image)}
                    size="sm"
                    className="w-full text-xs h-7"
                    variant="outline"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add to Canvas
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {uploadedImages.length === 0 && !uploading && (
        <div className="text-center text-xs text-gray-400 py-4">
          <ImageIcon className="h-12 w-12 mx-auto text-gray-300 mb-2" />
          No images uploaded yet
        </div>
      )}
    </div>
  );
};

export default AssetsPanel;
