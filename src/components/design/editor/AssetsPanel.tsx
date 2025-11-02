import React, { useRef, useState } from 'react';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface UploadedImage {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  isPDF?: boolean;
}

const AssetsPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const { addObject } = useEditorStore();
  const { widthIn, heightIn } = useQuoteStore();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        // For PDFs, use a default size (will be adjusted when added to canvas)
        const newImage: UploadedImage = {
          id: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url,
          name: file.name,
          width: 816, // 8.5 inches at 96 DPI
          height: 1056, // 11 inches at 96 DPI
          isPDF: true,
        };
        
        setUploadedImages((prev) => [...prev, newImage]);
      } else {
        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          const newImage: UploadedImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url,
            name: file.name,
            width: img.width,
            height: img.height,
          };
          
          setUploadedImages((prev) => [...prev, newImage]);
        };
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

  const handleAddToCanvas = (image: UploadedImage) => {
    console.log('[IMAGE ADD] Clicked image:', image);
    console.log('[IMAGE ADD] Canvas dimensions (inches):', { widthIn, heightIn });
    
    // Calculate size to fit on canvas (max 50% of canvas width/height)
    const maxWidth = widthIn * 0.5;
    const maxHeight = heightIn * 0.5;
    const aspectRatio = image.width / image.height;
    
    let width = maxWidth;
    let height = width / aspectRatio;
    
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    const imageObject = {
      type: 'image' as const,
      url: image.url,
      x: widthIn / 2 - width / 2,
      y: heightIn / 2 - height / 2,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      isPDF: image.isPDF || false,
    };
    
    console.log('[IMAGE ADD] Adding image object to canvas:', imageObject);
    addObject(imageObject);
    console.log('[IMAGE ADD] Image added successfully');
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
      
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#18448D] transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 mb-1">
          Click to upload or drag and drop
        </p>
        <p className="text-xs text-gray-400">
          PNG, JPG, GIF, PDF up to 25MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {uploading && (
        <div className="text-center text-sm text-gray-500">
          Uploading...
        </div>
      )}

      {uploadedImages.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">Your Images</h4>
          <div className="grid grid-cols-2 gap-2">
            {uploadedImages.map((image) => (
              <Card key={image.id} className="relative group">
                <button
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <X className="h-3 w-3" />
                </button>
                <div
                  onClick={() => handleAddToCanvas(image)}
                  className="cursor-pointer"
                >
                  <div className="aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                    {image.isPDF ? (
                      <div className="text-center p-2">
                        <ImageIcon className="h-8 w-8 mx-auto text-gray-400 mb-1" />
                        <p className="text-xs text-gray-500">PDF</p>
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
              </Card>
            ))}
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
