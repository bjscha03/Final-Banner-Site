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
  productionUrl?: string;
  productionPublicId?: string;
  resourceType?: 'image' | 'raw';
  mimeType?: string;
  originalFormat?: string;
  originalBytes?: number;
  originalWidth?: number;
  originalHeight?: number;
  pdfPageNumber?: number;
}

interface UploadError {
  message: string;
  fileName: string;
  canRetry: boolean;
  retryFile?: File;
}


// Supported file types
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, 'application/pdf'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const HEIC_EXTENSIONS = ['.heic', '.heif'];

const isHEICFile = (fileName: string): boolean => {
  const lowerName = fileName.toLowerCase();
  return HEIC_EXTENSIONS.some(ext => lowerName.endsWith(ext));
};

const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (isHEICFile(file.name)) {
    return { valid: false, error: 'HEIC not supported yet — please export as JPG/PNG.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.` };
  }
  if (!SUPPORTED_TYPES.includes(file.type)) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'pdf'];
    if (!ext || !validExts.includes(ext)) {
      return { valid: false, error: 'Unsupported file type. Please use PNG, JPG, JPEG, or PDF.' };
    }
  }
  return { valid: true };
};

const logUploadError = (file: File, status: number, errorBody: string) => {
  console.error('[UPLOAD ERROR]', {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    statusCode: status,
    errorBody: errorBody,
    timestamp: new Date().toISOString()
  });
};


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
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const handleRetry = () => {
    if (uploadError?.retryFile) {
      setUploadError(null);
      handleFileSelect({ target: { files: [uploadError.retryFile] } } as any);
    }
  };


  const { addObject, setIsAddingImage } = useEditorStore();
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

  const uploadOriginalFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: formData });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }
    return response.json();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[AssetsPanel] handleFileSelect called');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      const validation = validateFile(file);
      if (!validation.valid) {
        setUploadError({ message: validation.error || 'Unsupported file.', fileName: file.name, canRetry: false });
        continue;
      }

      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const localUrl = URL.createObjectURL(file);

      try {
        // CRITICAL: Upload untouched original first. The returned URL/public ID
        // is the production source; browser previews are separate and may be rasterized.
        const upload = await uploadOriginalFile(file);

        if (isPDF) {
          const pdfPreview = await convertPDFToImage(localUrl, 2);
          const newImage: UploadedImage = {
            id: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: pdfPreview.imageUrl,
            name: file.name,
            width: pdfPreview.width,
            height: pdfPreview.height,
            isPDF: true,
            fileKey: upload.publicId || upload.fileKey,
            cloudinaryUrl: upload.secureUrl,
            productionUrl: upload.secureUrl,
            productionPublicId: upload.publicId || upload.fileKey,
            resourceType: upload.resource_type || 'raw',
            mimeType: upload.mimeType || file.type || 'application/pdf',
            originalFormat: upload.format || 'pdf',
            originalBytes: upload.bytes || file.size,
            pdfPageNumber: 1,
          };
          setUploadedImages((prev) => [...prev, newImage]);
          setIsAddingImage(true);
          await handleAddToCanvas(newImage);
          setIsAddingImage(false);
          toast({ title: 'PDF added to banner', duration: 2000 });
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => reject(new Error('Failed to read image dimensions'));
            img.src = localUrl;
          });

          const newImage: UploadedImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: upload.secureUrl,
            name: file.name,
            width: dimensions.width,
            height: dimensions.height,
            fileKey: upload.publicId || upload.fileKey,
            cloudinaryUrl: upload.secureUrl,
            productionUrl: upload.secureUrl,
            productionPublicId: upload.publicId || upload.fileKey,
            resourceType: upload.resource_type || 'image',
            mimeType: upload.mimeType || file.type,
            originalFormat: upload.format || file.name.split('.').pop()?.toLowerCase(),
            originalBytes: upload.bytes || file.size,
            originalWidth: upload.width || dimensions.width,
            originalHeight: upload.height || dimensions.height,
          };
          setUploadedImages((prev) => [...prev, newImage]);
          setIsAddingImage(true);
          await handleAddToCanvas(newImage);
          setIsAddingImage(false);
          if (onClose) onClose();
          toast({ title: '✓ Image added', duration: 1500 });
        }
      } catch (error: any) {
        console.error('[AssetsPanel] Upload/add failed:', error);
        setUploadError({ message: error?.message || 'Failed to upload artwork.', fileName: file.name, canRetry: true, retryFile: file });
        toast({ title: 'Upload failed', description: error?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        URL.revokeObjectURL(localUrl);
        setIsAddingImage(false);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      cloudinaryPublicId: finalImage.fileKey || finalImage.productionPublicId || finalImage.cloudinaryUrl,
      productionUrl: finalImage.productionUrl || finalImage.cloudinaryUrl || finalImage.url,
      productionPublicId: finalImage.productionPublicId || finalImage.fileKey,
      resourceType: finalImage.resourceType || (finalImage.isPDF ? 'raw' : 'image'),
      mimeType: finalImage.mimeType,
      originalFormat: finalImage.originalFormat,
      originalBytes: finalImage.originalBytes,
      originalWidth: finalImage.originalWidth || finalImage.width,
      originalHeight: finalImage.originalHeight || finalImage.height,
      effectivePPI: finalImage.originalWidth && width ? Math.min(finalImage.originalWidth / width, (finalImage.originalHeight || finalImage.height) / height) : 0,
      pdfPageNumber: finalImage.pdfPageNumber || (finalImage.isPDF ? 1 : undefined),
      fitMode: 'contain',
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
        <div className="flex flex-col items-center justify-center py-6 px-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-200 border-t-orange-500 mb-3"></div>
          <p className="text-sm font-medium text-gray-700">Uploading your image...</p>
          <p className="text-xs text-gray-500 mt-1">Please wait</p>
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
