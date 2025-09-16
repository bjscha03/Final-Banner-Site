import React, { useRef, useState } from 'react';
import { Upload, FileText, Image, X } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { Button } from '@/components/ui/button';

const UploadArtworkCard: React.FC = () => {
  const { file, set } = useQuoteStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');

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

    // Upload file metadata to server (simplified approach)
    try {
      const response = await fetch('/.netlify/functions/upload-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          contentType: file.type,
        }),
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
        }
      });
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      setUploadError('Failed to upload file. Please try again.');
      return;
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  const removeFile = () => {
    if (file?.url && !file.isPdf) {
      URL.revokeObjectURL(file.url);
    }
    set({ file: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Upload className="h-5 w-5 text-green-500" />
        <h3 className="text-lg font-bold text-gray-900">🖼️ Upload Artwork</h3>
      </div>

      {!file ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Click to upload or drag and drop
          </p>
          <p className="text-sm text-gray-500 mb-4">
            PDF, JPG, JPEG, PNG up to 100MB
          </p>
          <Button variant="outline" className="mx-auto">
            Choose File
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {file.isPdf ? (
                <FileText className="h-8 w-8 text-red-500" />
              ) : (
                <Image className="h-8 w-8 text-blue-500" />
              )}
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                {file.isPdf && (
                  <p className="text-xs text-gray-500 mt-1">
                    PDF uploaded — preview not rendered
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {file.url && !file.isPdf && (
            <div className="mt-4">
              <img
                src={file.url}
                alt="Uploaded artwork preview"
                className="max-w-full h-32 object-contain rounded border"
              />
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{uploadError}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>File requirements:</strong> High-resolution files (300 DPI) work best. 
          We'll review your artwork and contact you if any adjustments are needed.
        </p>
      </div>
    </div>
  );
};

export default UploadArtworkCard;
