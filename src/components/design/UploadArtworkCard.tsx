import React, { useRef, useState } from 'react';
import { Upload, FileText, Image, X, Loader2, AlertTriangle } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { Button } from '@/components/ui/button';

const UploadArtworkCard: React.FC = () => {
  const { file, set } = useQuoteStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const maxSizeBytes = 100 * 1024 * 1024; // 100MB theoretical limit
  const cloudinaryLimit = 10 * 1024 * 1024; // 10MB Cloudinary free tier limit
  const largeSizeThreshold = 15 * 1024 * 1024; // 15MB threshold for direct upload

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return 'Please upload a PDF, JPG, JPEG, or PNG file.';
    }
    if (file.size > maxSizeBytes) {
      return `File size must be less than ${maxSizeBytes / (1024 * 1024)}MB.`;
    }
    if (file.size > cloudinaryLimit) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit. Please compress your file or upgrade your plan.`;
    }
    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Function upload for small files (< 15MB)
  const handleFunctionUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/.netlify/functions/upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    return await response.json();
  };

  // Direct upload for large files (>= 15MB) - Currently disabled due to Cloudinary limits
  const handleDirectUpload = async (file: File) => {
    // Get signature from our function
    const signatureResponse = await fetch('/.netlify/functions/generate-upload-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        fileType: file.type
      })
    });

    if (!signatureResponse.ok) {
      const errorData = await signatureResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get upload signature');
    }

    const { uploadParams, uploadUrl } = await signatureResponse.json();

    // Upload directly to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    
    // Add all signature parameters
    Object.entries(uploadParams).forEach(([key, value]) => {
      formData.append(key, value as string);
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Direct upload failed with status ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();
    
    // Transform Cloudinary response to match our expected format
    return {
      success: true,
      url: result.secure_url,
      filename: file.name,
      size: file.size
    };
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError('');

    try {
      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      let result;
      
      // Route based on file size - but currently all files must be under 10MB
      if (file.size >= largeSizeThreshold) {
        // Large files would use direct upload, but Cloudinary free tier doesn't support this
        setUploadError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit. Please compress your file or upgrade your Cloudinary plan.`);
        return;
      } else {
        // Small files use function upload
        result = await handleFunctionUpload(file);
      }

      if (result.secureUrl) {
        // Get image dimensions for non-PDF files
        let artworkWidth, artworkHeight;
        if (file.type.startsWith('image/')) {
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
            name: file.name,
            url: result.secureUrl,
            size: file.size,
            fileKey: result.fileKey || result.publicId,
            isPdf: file.type === 'application/pdf',
            artworkWidth,
            artworkHeight,
          },
        });
        setUploadError('');
        console.log('✅ File uploaded successfully:', {
          url: result.secureUrl,
          fileKey: result.fileKey || result.publicId,
          isPdf: file.type === 'application/pdf',
          dimensions: artworkWidth && artworkHeight ? `${artworkWidth}x${artworkHeight}` : 'N/A'
        });
      } else {
        setUploadError(result.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileUpload(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileUpload(selectedFile);
    }
  };

  const removeFile = () => {
    set({ file: null });
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFileDialog = () => {
    console.log('[UploadArtworkCard] Opening file dialog');
    fileInputRef.current?.click();
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension === 'pdf' ? FileText : Image;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Artwork</h3>
      
      {/* File Size Limit Warning */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">File Size Limit: 10MB</p>
          <p>Large files may fail to upload. Consider compressing PDFs or upgrading your plan for larger files.</p>
        </div>
      </div>

      {!file ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-600">Uploading your file...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drop your file here or click to browse
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Supports PDF, JPG, JPEG, PNG files up to 10MB
              </p>
              <Button type="button" onClick={openFileDialog} disabled={isUploading}>
                Choose File
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {React.createElement(getFileIcon(file.name), {
                className: "h-8 w-8 text-blue-500"
              })}
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.size)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{uploadError}</p>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>
          <strong>Supported formats:</strong> PDF, JPG, JPEG, PNG
        </p>
        <p>
          <strong>Maximum file size:</strong> 10MB (due to current plan limitations)
        </p>
        <p>
          For larger files, please compress your PDF or contact support about upgrading your plan.
        </p>
      </div>
    </div>
  );
};

export default UploadArtworkCard;
