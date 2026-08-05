import React, { useRef } from 'react';
import { Upload, Wand2, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuoteStore } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';

interface UploadHeroSectionProps {
  onOpenAIModal: () => void;
  onFileUploaded?: () => void;
}

const UploadHeroSection: React.FC<UploadHeroSectionProps> = ({ onOpenAIModal, onFileUploaded }) => {
  const { file, set } = useQuoteStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

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
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // CRITICAL FIX: Upload to Cloudinary instead of creating blob URL
      console.log('�� Uploading file to Cloudinary:', selectedFile.name);
      
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
      console.log('✅ File uploaded to Cloudinary:', result);

      if (result.secureUrl) {
        // For PDFs, use the original PDF URL - LivePreviewCard will handle rendering
        let displayUrl = result.secureUrl;
        const isPdf = selectedFile.type === 'application/pdf';
        
        console.log('📄 [UploadHeroSection] File uploaded:', {
          isPdf,
          url: displayUrl.substring(0, 100),
          fileKey: result.fileKey || result.publicId
        });

        // Get image dimensions (only for regular images, not PDFs)
        let artworkWidth, artworkHeight;
        if (selectedFile.type.startsWith('image/')) {
          // For regular images, load to get dimensions
          const img = new Image();
          const imgLoadPromise = new Promise((resolve, reject) => {
            img.onload = () => {
              artworkWidth = img.naturalWidth;
              artworkHeight = img.naturalHeight;
              console.log('✅ [UploadHeroSection] Image loaded successfully:', {
                url: displayUrl.substring(0, 100),
                dimensions: `${artworkWidth}x${artworkHeight}`
              });
              resolve(null);
            };
            img.onerror = (error) => {
              console.error('❌ [UploadHeroSection] Failed to load image:', {
                url: displayUrl.substring(0, 100),
                error,
                originalFileName: selectedFile.name
              });
              reject(new Error('Failed to load image preview'));
            };
          });
          
          // Add CORS handling for Cloudinary
          img.crossOrigin = 'anonymous';
          img.src = displayUrl;
          
          try {
            await imgLoadPromise;
          } catch (error) {
            console.error('❌ [UploadHeroSection] Image load failed:', error);
            // For images, this is a real error - show it to user
            throw error;
          }
        } else if (isPdf) {
          // For PDFs, don't try to load dimensions here
          // LivePreviewCard will handle PDF rendering with loadPdfToBitmap
          console.log('📄 [UploadHeroSection] PDF uploaded - will be rendered client-side');
        }

        set({
          file: {
            name: selectedFile.name,
            url: displayUrl,
            size: selectedFile.size,
            fileKey: result.fileKey || result.publicId,
            isPdf: isPdf,
            artworkWidth,
            artworkHeight,
          },
        });

        console.log('✅ File saved to quote store:', {
          url: displayUrl,
          fileKey: result.fileKey || result.publicId,
          isPdf: isPdf,
          dimensions: artworkWidth && artworkHeight ? `${artworkWidth}x${artworkHeight}` : 'N/A'
        });


        console.log('✅ File saved to quote store:', {
          url: result.secureUrl,
          fileKey: result.fileKey || result.publicId,
          isPdf: selectedFile.type === 'application/pdf',
          dimensions: artworkWidth && artworkHeight ? `${artworkWidth}x${artworkHeight}` : 'N/A'
        });

        toast({ 
          title: isPdf ? 'PDF uploaded successfully' : 'Image uploaded successfully', 
          description: 'Your artwork has been uploaded to the cloud and is ready to use.' 
        });
        
        if (onFileUploaded) {
          setTimeout(() => onFileUploaded(), 300);
        }
      } else {
        throw new Error(result.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    console.log('[UploadHeroSection] Upload button clicked');
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  if (file) {
    return null;
  }

  return (
    <div className="mb-8 border-2 border-dashed border-slate-300 bg-white p-8 transition-colors hover:border-[#FF6A00] md:p-12">
      <div className="text-center max-w-2xl mx-auto">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center bg-[#0B1F3A]">
          <Upload className="h-8 w-8 text-white" />
        </div>
        <h2 className="mb-3 font-display text-3xl font-bold text-[#0B1F3A] md:text-4xl">Start with your artwork</h2>
        <p className="mb-8 text-lg text-slate-600">Upload a print file, or open the optional AI tool if you need a starting concept.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <Button type="button" size="lg" className="bg-[#FF6A00] px-8 py-6 text-lg text-white hover:bg-[#E65F00] hover:text-white" onClick={handleUploadClick} disabled={isUploading}>
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
          <Button size="lg" variant="outline" className="border-2 border-[#0B1F3A] px-8 py-6 text-lg text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white" onClick={onOpenAIModal}>
            <Wand2 className="mr-2 h-5 w-5" />
            Optional AI concept
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Accepts PDF files</span>
          </div>
          <div className="hidden sm:block text-gray-300">•</div>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span>JPG, PNG, GIF, WebP, SVG</span>
          </div>
        </div>
      </div>
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*,.pdf" 
        onChange={handleFileInputChange} 
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        tabIndex={-1}
      />
    </div>
  );
};

export default UploadHeroSection;
