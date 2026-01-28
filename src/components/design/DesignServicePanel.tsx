import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Mail, Phone, FileText, Image, AlertCircle, CheckCircle2, Sparkles, MessageSquare, Palette, Clock, Send, ArrowRight } from 'lucide-react';
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
  // Banner dimensions for preview
  widthIn?: number;
  heightIn?: number;
  material?: string;
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
  widthIn = 48,
  heightIn = 24,
  material = '13oz',
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

  // Check if banner config is valid
  const hasBannerDimensions = widthIn > 0 && heightIn > 0;
  const hasMaterial = material && ['13oz', '15oz', '18oz', 'mesh'].includes(material);
  const isBannerConfigValid = hasBannerDimensions && hasMaterial;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50 overflow-auto">
      {/* Professional Header with gradient accent */}
      <div className="p-6 border-b-2 border-purple-200 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-4 mb-3">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-violet-600 rounded-xl shadow-lg">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-900 to-violet-800 bg-clip-text text-transparent">
              Let Our Team Design It
            </h2>
            <p className="text-sm text-purple-600 font-medium">Professional design service included at no extra cost</p>
          </div>
          <span className="hidden sm:flex px-3 py-1.5 text-sm font-bold bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-full shadow-md items-center gap-1.5">
            <Palette className="w-4 h-4" />
            Pro Design
          </span>
        </div>
        <button
          onClick={onSwitchToDesigner}
          className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          I'd rather design it myself
        </button>
      </div>

      {/* Banner Preview Placeholder */}
      <div className="px-6 py-4 bg-gradient-to-r from-purple-100 via-violet-100 to-fuchsia-100 border-b border-purple-200">
        <div className="flex items-center gap-4">
          {/* Mini Banner Preview */}
          <div
            className="relative bg-white border-2 border-purple-300 rounded-lg shadow-md flex items-center justify-center overflow-hidden"
            style={{
              width: Math.min(120, (widthIn / heightIn) * 60),
              height: 60,
              minWidth: 80,
            }}
          >
            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  #8b5cf6 0px,
                  #8b5cf6 1px,
                  transparent 1px,
                  transparent 10px
                )`
              }} />
            </div>
            <div className="text-center z-10 px-2">
              <Sparkles className="w-4 h-4 text-purple-500 mx-auto mb-0.5" />
              <p className="text-[8px] font-bold text-purple-700 leading-tight">YOUR DESIGN</p>
            </div>
          </div>

          {/* Banner Details */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">Your Banner</span>
              <span className="px-2 py-0.5 bg-purple-200 text-purple-700 text-xs font-semibold rounded-full">
                {material}
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {widthIn}" × {heightIn}"
            </p>
            <p className="text-xs text-gray-500">
              Configure size & material in the sidebar →
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Step 1: Description Card */}
        <div className="bg-white/80 backdrop-blur rounded-xl p-5 border-2 border-purple-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-purple-600 to-violet-600 rounded-full text-white text-sm font-bold shadow-md">
              1
            </div>
            <div>
              <Label htmlFor="design-request" className="text-lg font-bold text-gray-900">
                Describe Your Vision
              </Label>
              <p className="text-sm text-purple-600">Tell us what you want on your banner</p>
            </div>
            <MessageSquare className="ml-auto w-5 h-5 text-purple-400" />
          </div>
          <Textarea
            id="design-request"
            value={designRequestText}
            onChange={(e) => setDesignRequestText(e.target.value)}
            placeholder="Example: I need a banner for my grand opening. I want it to say 'GRAND OPENING' at the top in bold red letters, with our business name 'Joe's Auto Shop' below. Please include our phone number (555-123-4567) and the date 'March 15, 2025'. Use red and black colors with a white background."
            className="min-h-[140px] resize-none border-purple-200 focus:border-purple-400 focus:ring-purple-400"
            rows={6}
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-500">
              Include text, colors, layout preferences, and any other details
            </p>
            <span className={`text-xs font-medium ${designRequestText.length >= 10 ? 'text-green-600' : 'text-amber-600'}`}>
              {designRequestText.length >= 10 ? '✓ ' : ''}{designRequestText.length}/10 min
            </span>
          </div>
        </div>

        {/* Step 2: File Upload Card */}
        <div className="bg-white/80 backdrop-blur rounded-xl p-5 border-2 border-purple-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-purple-600 to-violet-600 rounded-full text-white text-sm font-bold shadow-md">
              2
            </div>
            <div>
              <Label className="text-lg font-bold text-gray-900">
                Upload Your Assets
              </Label>
              <p className="text-sm text-purple-600">Logos, photos, or reference files (optional)</p>
            </div>
            <Upload className="ml-auto w-5 h-5 text-purple-400" />
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-purple-500 bg-purple-50 scale-[1.02]'
                : 'border-purple-300 hover:border-purple-400 hover:bg-purple-50/50'
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
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-full">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                </div>
                <p className="text-sm font-medium text-purple-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-full">
                  <Upload className="w-8 h-8 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Drag & drop files here, or <span className="text-purple-600 font-semibold">browse</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG, PDF, SVG • Max 10MB each</p>
                </div>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-3 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Uploaded Files List */}
          {uploadedAssets.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Uploaded Files</p>
              {uploadedAssets.map((asset, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${asset.type.includes('image') ? 'bg-blue-100' : 'bg-orange-100'}`}>
                      {asset.type.includes('image') ? (
                        <Image className="w-4 h-4 text-blue-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{asset.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(asset.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAsset(index)}
                    className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
                  >
                    <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Draft Preference Card */}
        <div className="bg-white/80 backdrop-blur rounded-xl p-5 border-2 border-purple-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-purple-600 to-violet-600 rounded-full text-white text-sm font-bold shadow-md">
              3
            </div>
            <div>
              <Label className="text-lg font-bold text-gray-900">
                How Should We Contact You?
              </Label>
              <p className="text-sm text-purple-600">We'll send your design draft for approval</p>
            </div>
            <Send className="ml-auto w-5 h-5 text-purple-400" />
          </div>

          <RadioGroup
            value={draftPreference}
            onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
            className="grid grid-cols-2 gap-3 mb-4"
          >
            <div
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                draftPreference === 'email'
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
              onClick={() => setDraftPreference('email')}
            >
              <RadioGroupItem value="email" id="email" className="sr-only" />
              <div className={`p-2 rounded-lg ${draftPreference === 'email' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <Mail className={`w-5 h-5 ${draftPreference === 'email' ? 'text-purple-600' : 'text-gray-500'}`} />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold text-gray-900 cursor-pointer">Email</Label>
                <p className="text-xs text-gray-500">Get a detailed email</p>
              </div>
            </div>
            <div
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                draftPreference === 'text'
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
              onClick={() => setDraftPreference('text')}
            >
              <RadioGroupItem value="text" id="text" className="sr-only" />
              <div className={`p-2 rounded-lg ${draftPreference === 'text' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <Phone className={`w-5 h-5 ${draftPreference === 'text' ? 'text-purple-600' : 'text-gray-500'}`} />
              </div>
              <div>
                <Label htmlFor="text" className="text-sm font-semibold text-gray-900 cursor-pointer">Text</Label>
                <p className="text-xs text-gray-500">Quick text message</p>
              </div>
            </div>
          </RadioGroup>

          <div>
            <Input
              type={draftPreference === 'email' ? 'email' : 'tel'}
              placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
              value={draftContact}
              onChange={(e) => setDraftContact(e.target.value)}
              className={`h-12 text-base ${
                !draftContact || isValidContact
                  ? 'border-purple-200 focus:border-purple-400 focus:ring-purple-400'
                  : 'border-red-300 focus:border-red-500 focus:ring-red-500'
              }`}
            />
            {draftContact && !isValidContact && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {draftPreference === 'email' ? 'Please enter a valid email address' : 'Please enter a valid phone number'}
              </p>
            )}
            {draftContact && isValidContact && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Looks good!
              </p>
            )}
          </div>
        </div>

        {/* What Happens Next - Timeline */}
        <div className="bg-gradient-to-br from-purple-100 to-violet-100 rounded-xl p-5 border-2 border-purple-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-purple-900">What Happens Next?</h3>
          </div>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">1</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Complete your order</p>
                <p className="text-xs text-gray-600">Select size, material, and finishing options in the sidebar</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">2</span>
              <div>
                <p className="text-sm font-medium text-gray-900">We design your banner</p>
                <p className="text-xs text-gray-600">Our team creates your custom design (1-2 business days)</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">3</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Approve your design</p>
                <p className="text-xs text-gray-600">We'll send a draft via {draftPreference === 'email' ? 'email' : 'text'} for your approval</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">4</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Print & ship</p>
                <p className="text-xs text-gray-600">Once approved, we print and ship your banner</p>
              </div>
            </li>
          </ol>
        </div>

        {/* Validation Status - Sticky at bottom */}
        <div className={`sticky bottom-0 flex items-center gap-3 p-4 rounded-xl border-2 shadow-lg ${
          isFormValid && isBannerConfigValid
            ? 'bg-green-50 border-green-300 text-green-800'
            : 'bg-amber-50 border-amber-300 text-amber-800'
        }`}>
          {isFormValid && isBannerConfigValid ? (
            <>
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Ready to add to cart!</p>
                <p className="text-xs text-green-600">Click "Add to Cart" in the header to proceed</p>
              </div>
            </>
          ) : (
            <>
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Almost there!</p>
                <p className="text-xs text-amber-700">
                  {!isBannerConfigValid && '⚠️ Configure banner size & material in sidebar. '}
                  {designRequestText.length < 10 && 'Add a description (10+ characters). '}
                  {!draftContact && 'Enter your contact info.'}
                  {draftContact && !isValidContact && `Enter a valid ${draftPreference === 'email' ? 'email' : 'phone number'}.`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DesignServicePanel;

