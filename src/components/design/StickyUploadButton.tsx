import React, { useState, useEffect, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuoteStore } from '@/store/quote';
import { useUIStore } from '@/store/ui';
import { useToast } from '@/components/ui/use-toast';

interface StickyUploadButtonProps {
  isAIModalOpen?: boolean;
}

const StickyUploadButton: React.FC<StickyUploadButtonProps> = ({ isAIModalOpen = false }) => {
  const { file, set } = useQuoteStore();
  const { isCartOpen } = useUIStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 300;
      const shouldShow = scrolled && !file && !isDismissed && !isCartOpen && !isAIModalOpen;
      setIsVisible(shouldShow);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [file, isDismissed, isCartOpen, isAIModalOpen]);

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile) return;
    const fileType = selectedFile.type;
    const fileName = selectedFile.name.toLowerCase();
    const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
    const isImage = fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
    
    if (!isPdf && !isImage) {
      toast({ 
        title: 'Invalid file type', 
        description: 'Please upload an image (JPG, PNG, GIF, WebP, SVG) or PDF file.', 
        variant: 'destructive' 
      });
      return;
    }
    
    setIsUploading(true);
    try {
      // CRITICAL FIX: Upload to Cloudinary instead of creating blob URL
      console.log('🚀 [StickyUploadButton] Uploading file to Cloudinary:', selectedFile.name);
      
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/.netlify/functions/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ [StickyUploadButton] File uploaded to Cloudinary:', result);

      if (result.secureUrl) {
        // Get image dimensions for non-PDF files
        let artworkWidth, artworkHeight;
        if (selectedFile.type.startsWith('image/')) {
          const img = new Image();
          const imgLoadPromise = new Promise((resolve) => {
            img.onload = () => {
              artworkWidth = img.naturalWidth;
              artworkHeight = img.naturalHeight;
              resolve(null);
            };
          });
          img.src = result.secureUrl;
          await imgLoadPromise;
        }

        set({
          file: {
            name: selectedFile.name,
            url: result.secureUrl,
            size: selectedFile.size,
            fileKey: result.fileKey || result.publicId,
            isPdf: selectedFile.type === 'application/pdf',
            artworkWidth,
            artworkHeight,
          },
        });

        console.log('✅ [StickyUploadButton] File saved to quote store:', {
          url: result.secureUrl,
          fileKey: result.fileKey || result.publicId,
          isPdf: selectedFile.type === 'application/pdf',
          dimensions: artworkWidth && artworkHeight ? `${artworkWidth}x${artworkHeight}` : 'N/A'
        });

        toast({ 
          title: isPdf ? 'PDF uploaded successfully' : 'Image uploaded successfully', 
          description: 'Your artwork has been uploaded to the cloud and is ready to use.' 
        });
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error(result.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('❌ [StickyUploadButton] Upload error:', error);
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Failed to upload file. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[StickyUploadButton] Button clicked, triggering file input');
    fileInputRef.current?.click();
  };
  
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    console.log('[StickyUploadButton] File input changed:', selectedFile?.name);
    if (selectedFile) handleFileSelect(selectedFile);
  };
  
  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[StickyUploadButton] Dismissed');
    setIsDismissed(true);
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[9999] pointer-events-auto">
        <div className="relative animate-bounce-slow">
          <button 
            onClick={handleDismiss} 
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg z-[10000]" 
            aria-label="Dismiss"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
          <Button 
            size="lg" 
            className="bg-[#18448D] hover:bg-[#0f2d5f] text-white shadow-2xl px-6 py-6 text-base font-semibold relative z-[9999]" 
            onClick={handleUploadClick} 
            disabled={isUploading}
            type="button"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-5 w-5" />
                Upload Artwork
              </>
            )}
          </Button>
          <div className="absolute inset-0 rounded-lg bg-blue-400 opacity-75 animate-ping pointer-events-none"></div>
        </div>
      </div>
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*,.pdf" 
        onChange={handleFileInputChange} 
        className="hidden" 
        tabIndex={-1}
      />
      <style>{`
        @keyframes bounce-slow { 
          0%, 100% { transform: translateY(0); } 
          50% { transform: translateY(-10px); } 
        } 
        .animate-bounce-slow { 
          animation: bounce-slow 2s ease-in-out infinite; 
        }
      `}</style>
    </>
  );
};

export default StickyUploadButton;
