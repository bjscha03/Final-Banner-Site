import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Mail, Phone, FileText, Image, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface DesignServiceAsset {
  name: string;
  type: string;
  size: number;
  url: string;
  fileKey?: string;
}

interface DesignServicePanelProps {
  designRequestText: string;
  setDesignRequestText: (text: string) => void;
  draftPreference: 'email' | 'text';
  setDraftPreference: (pref: 'email' | 'text') => void;
  draftContact: string;
  setDraftContact: (contact: string) => void;
  uploadedAssets: DesignServiceAsset[];
  setUploadedAssets: (assets: DesignServiceAsset[]) => void;
  onSwitchToDesigner: () => void;
}

const DesignServicePanel: React.FC<DesignServicePanelProps> = ({
  designRequestText,
  setDesignRequestText,
  draftPreference,
  setDraftPreference,
  draftContact,
  setDraftContact,
  uploadedAssets,
  setUploadedAssets,
  onSwitchToDesigner,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB Cloudinary limit

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError('');

    const newAssets: DesignServiceAsset[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file type
      if (!acceptedTypes.includes(file.type)) {
        setUploadError(`${file.name}: Unsupported file type. Use PDF, JPG, PNG, or SVG.`);
        continue;
      }
      
      // Validate file size
      if (file.size > maxSizeBytes) {
        setUploadError(`${file.name}: File exceeds 10MB limit.`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/.netlify/functions/upload-file', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Upload failed`);
        }

        const result = await response.json();
        
        if (result.secureUrl) {
          newAssets.push({
            name: file.name,
            type: file.type,
            size: file.size,
            url: result.secureUrl,
            fileKey: result.fileKey || result.publicId,
          });
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadError(`${file.name}: Upload failed.`);
      }
    }

    if (newAssets.length > 0) {
      setUploadedAssets([...uploadedAssets, ...newAssets]);
    }
    setIsUploading(false);
  };

  const handleRemoveAsset = (index: number) => {
    setUploadedAssets(uploadedAssets.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  const isValidContact = draftPreference === 'email' 
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftContact)
    : /^[\d\s\-()+ ]{10,}$/.test(draftContact.replace(/\D/g, ''));

  const isFormValid = designRequestText.trim().length >= 10 && draftContact.trim() && isValidContact;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 to-indigo-50 overflow-auto">
      {/* Header */}
      <div className="p-6 border-b border-blue-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#18448D] rounded-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Let Our Team Design It</h2>
            <p className="text-sm text-gray-600">We'll create your perfect banner design</p>
          </div>
        </div>
        <button
          onClick={onSwitchToDesigner}
          className="text-sm text-[#18448D] hover:underline mt-2"
        >
          ← I'd rather design it myself
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="design-request" className="text-base font-semibold text-gray-900">
            Tell us what you want on your banner
          </Label>
          <p className="text-sm text-gray-600">
            Include text content, colors, layout preferences, and any other details.
          </p>
          <Textarea
            id="design-request"
            value={designRequestText}
            onChange={(e) => setDesignRequestText(e.target.value)}
            placeholder="Example: I need a 4x8 banner for my grand opening. I want it to say 'GRAND OPENING' at the top in bold red letters, with our business name 'Joe's Auto Shop' below. Please include our phone number (555-123-4567) and the date 'March 15, 2025'. Use red and black colors with a white background."
            className="min-h-[150px] resize-none"
            rows={6}
          />
          <p className="text-xs text-gray-500">
            {designRequestText.length < 10 ? `${10 - designRequestText.length} more characters needed` : `${designRequestText.length} characters`}
          </p>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <Label className="text-base font-semibold text-gray-900">
            Upload logos, images, or reference files <span className="text-gray-500 font-normal">(optional)</span>
          </Label>
          <p className="text-sm text-gray-600">
            Upload any logos, photos, or examples you'd like us to use. Accepts PNG, JPG, PDF, SVG.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragActive ? 'border-[#18448D] bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.svg"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-[#18448D] animate-spin" />
                <p className="text-sm text-gray-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm text-gray-600">
                  Drag & drop files here, or <span className="text-[#18448D] font-medium">browse</span>
                </p>
                <p className="text-xs text-gray-500">Max 10MB per file</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {uploadError}
            </div>
          )}

          {/* Uploaded Files List */}
          {uploadedAssets.length > 0 && (
            <div className="space-y-2 mt-3">
              {uploadedAssets.map((asset, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    {asset.type.includes('image') ? (
                      <Image className="w-5 h-5 text-gray-500" />
                    ) : (
                      <FileText className="w-5 h-5 text-gray-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{asset.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(asset.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAsset(index)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Draft Preference */}
        <div className="space-y-3">
          <Label className="text-base font-semibold text-gray-900">
            How should we send your design draft?
          </Label>

          <RadioGroup
            value={draftPreference}
            onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="email" id="email" />
              <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                <Mail className="w-4 h-4" />
                Email
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="text" id="text" />
              <Label htmlFor="text" className="flex items-center gap-2 cursor-pointer">
                <Phone className="w-4 h-4" />
                Text Message
              </Label>
            </div>
          </RadioGroup>

          <div className="mt-2">
            <Input
              type={draftPreference === 'email' ? 'email' : 'tel'}
              placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
              value={draftContact}
              onChange={(e) => setDraftContact(e.target.value)}
              className={!draftContact || isValidContact ? '' : 'border-red-300 focus:border-red-500'}
            />
            {draftContact && !isValidContact && (
              <p className="text-xs text-red-500 mt-1">
                {draftPreference === 'email' ? 'Please enter a valid email address' : 'Please enter a valid phone number'}
              </p>
            )}
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
          <ol className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-[#18448D] text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>You complete your order with size, material, and finishing options</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-[#18448D] text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>Our design team creates your custom banner design (1-2 business days)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-[#18448D] text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>We send you a draft via {draftPreference === 'email' ? 'email' : 'text message'} for approval</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-[#18448D] text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span>Once approved, we print and ship your banner</span>
            </li>
          </ol>
        </div>

        {/* Validation Status */}
        <div className={`flex items-center gap-2 p-3 rounded-lg ${isFormValid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {isFormValid ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Ready to add to cart!</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">Please complete the required fields above</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DesignServicePanel;

