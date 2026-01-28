import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Loader2, Mail, Phone, FileText, Image, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import type { Grommets } from '@/store/quote';

// Brand colors
const BRAND_BLUE = '#18448D';
const BRAND_ORANGE = '#ff6b35';

// Material texture images (from MaterialCard.tsx)
const MATERIAL_IMAGES: Record<string, string> = {
  '13oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png',
  '15oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png',
  '18oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png',
  'mesh': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png',
};

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
  grommets?: Grommets;
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
  grommets = 'none',
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB Cloudinary limit

  // Calculate grommet positions for mini preview
  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  const grommetR = useMemo(() => {
    return grommetRadius(widthIn, heightIn);
  }, [widthIn, heightIn]);

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
    <div className="flex flex-col h-full bg-slate-50 overflow-auto">
      {/* Clean Header */}
      <div className="p-6 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-slate-900">
            Let Our Team Design It
          </h2>
          <span
            className="px-3 py-1 text-xs font-semibold text-white rounded-full"
            style={{ backgroundColor: BRAND_ORANGE }}
          >
            Free Service
          </span>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Tell us what you need and we'll create a professional design for you.
        </p>
        <button
          onClick={onSwitchToDesigner}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:underline"
          style={{ color: BRAND_BLUE }}
        >
          <ArrowLeft className="w-4 h-4" />
          I'd rather design it myself
        </button>
      </div>

      {/* Banner Size Summary */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          {/* Mini Banner Preview with Material Texture and Grommets */}
          <div
            className="relative rounded overflow-hidden border border-slate-300 shadow-sm"
            style={{
              width: Math.min(100, (widthIn / heightIn) * 50),
              height: 50,
              minWidth: 60,
            }}
          >
            {/* Material texture background */}
            {MATERIAL_IMAGES[material] ? (
              <img
                src={MATERIAL_IMAGES[material]}
                alt={`${material} material`}
                className="absolute inset-0 w-full h-full object-cover opacity-40"
              />
            ) : (
              <div className="absolute inset-0 bg-slate-100" />
            )}

            {/* White banner area overlay with placeholder text */}
            <div
              className="absolute inset-[8%] bg-white/90 border border-slate-200 flex items-center justify-center"
              style={{ borderRadius: 2 }}
            >
              <p className="text-[7px] font-medium text-slate-400 text-center leading-tight px-1">
                Your Design
              </p>
            </div>

            {/* Mini grommets */}
            {grommets !== 'none' && grommetPositions.map((point, idx) => {
              const leftPercent = (point.x / widthIn) * 100;
              const topPercent = (point.y / heightIn) * 100;
              // Scale grommet size for 50px height preview
              const grommetSize = Math.max(3, Math.min(6, (grommetR / heightIn) * 50 * 1.5));

              return (
                <div
                  key={`mini-grommet-${idx}`}
                  className="absolute rounded-full"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    width: `${grommetSize}px`,
                    height: `${grommetSize}px`,
                    transform: 'translate(-50%, -50%)',
                    background: 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                >
                  <div
                    className="absolute rounded-full bg-slate-100"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: '40%',
                      height: '40%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Banner Details */}
          <div className="flex-1">
            <p className="text-lg font-bold text-slate-900">
              {widthIn}" × {heightIn}"
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="px-2 py-0.5 text-xs font-medium text-white rounded"
                style={{ backgroundColor: BRAND_BLUE }}
              >
                {material}
              </span>
              {grommets !== 'none' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 rounded">
                  {grommets}
                </span>
              )}
              <span className="text-xs text-slate-500">
                {material && grommets !== 'none' ? '' : 'Set options in sidebar'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-5 overflow-auto">
        {/* Step 1: Description */}
        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              1
            </div>
            <Label htmlFor="design-request" className="text-base font-semibold text-slate-900">
              Describe Your Banner
            </Label>
          </div>
          <Textarea
            id="design-request"
            value={designRequestText}
            onChange={(e) => setDesignRequestText(e.target.value)}
            placeholder="Example: I need a banner for a grand opening. Include the headline &quot;GRAND OPENING&quot; at the top and our business name &quot;Joe's Auto Shop.&quot; Use bold, easy-to-read lettering with red and black colors."
            className="min-h-[120px] resize-none border-slate-200 focus:border-slate-400 focus:ring-slate-400"
            rows={5}
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-slate-500">
              Include your message, colors, style, and any layout preferences. The more details you provide, the better we can design your banner.
            </p>
            <span className={`text-xs font-medium ${designRequestText.length >= 10 ? 'text-green-600' : 'text-slate-400'}`}>
              {designRequestText.length}/10 min
            </span>
          </div>
        </div>

        {/* Step 2: File Upload */}
        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              2
            </div>
            <div>
              <Label className="text-base font-semibold text-slate-900">
                Upload Assets
              </Label>
              <span className="text-xs text-slate-500 ml-2">(optional)</span>
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-slate-400 bg-slate-50'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
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
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                <p className="text-sm text-slate-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-6 h-6 text-slate-400" />
                <p className="text-sm text-slate-600">
                  Drop files here or <span style={{ color: BRAND_BLUE }} className="font-medium">browse</span>
                </p>
                <p className="text-xs text-slate-400">PNG, JPG, PDF, SVG • Max 10MB</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Uploaded Files List */}
          {uploadedAssets.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Uploaded Files</p>
              {uploadedAssets.map((asset, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded border border-slate-200">
                      {asset.type.includes('image') ? (
                        <Image className="w-4 h-4 text-slate-600" />
                      ) : (
                        <FileText className="w-4 h-4" style={{ color: BRAND_ORANGE }} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 truncate max-w-[180px]">{asset.name}</p>
                      <p className="text-xs text-slate-500">{formatFileSize(asset.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAsset(index)}
                    className="p-1.5 hover:bg-red-50 rounded transition-colors group"
                  >
                    <X className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Contact Preference */}
        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              3
            </div>
            <Label className="text-base font-semibold text-slate-900">
              How Should We Contact You?
            </Label>
          </div>

          <RadioGroup
            value={draftPreference}
            onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
            className="grid grid-cols-2 gap-3 mb-4"
          >
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                draftPreference === 'email'
                  ? 'border-slate-400 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setDraftPreference('email')}
            >
              <RadioGroupItem value="email" id="email" className="sr-only" />
              <Mail className={`w-5 h-5 ${draftPreference === 'email' ? 'text-slate-700' : 'text-slate-400'}`} />
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-slate-900 cursor-pointer">Email</Label>
              </div>
            </div>
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                draftPreference === 'text'
                  ? 'border-slate-400 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setDraftPreference('text')}
            >
              <RadioGroupItem value="text" id="text" className="sr-only" />
              <Phone className={`w-5 h-5 ${draftPreference === 'text' ? 'text-slate-700' : 'text-slate-400'}`} />
              <div>
                <Label htmlFor="text" className="text-sm font-medium text-slate-900 cursor-pointer">Text</Label>
              </div>
            </div>
          </RadioGroup>

          <div>
            <Input
              type={draftPreference === 'email' ? 'email' : 'tel'}
              placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
              value={draftContact}
              onChange={(e) => setDraftContact(e.target.value)}
              className={`h-11 ${
                !draftContact || isValidContact
                  ? 'border-slate-200 focus:border-slate-400 focus:ring-slate-400'
                  : 'border-red-300 focus:border-red-500 focus:ring-red-500'
              }`}
            />
            {draftContact && !isValidContact && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {draftPreference === 'email' ? 'Enter a valid email' : 'Enter a valid phone number'}
              </p>
            )}
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">What Happens Next</h3>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: BRAND_BLUE }}
              >1</span>
              <p className="text-sm text-slate-600">Complete your order with size and material options</p>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: BRAND_BLUE }}
              >2</span>
              <p className="text-sm text-slate-600">We create your design (1-2 business days)</p>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: BRAND_BLUE }}
              >3</span>
              <p className="text-sm text-slate-600">You approve the design via {draftPreference}</p>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: BRAND_BLUE }}
              >4</span>
              <p className="text-sm text-slate-600">We print and ship your banner</p>
            </li>
          </ol>
        </div>

        {/* Validation Status */}
        <div className={`sticky bottom-0 flex items-center gap-3 p-4 rounded-lg border shadow-sm ${
          isFormValid && isBannerConfigValid
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {isFormValid && isBannerConfigValid ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Ready to add to cart</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-amber-800">
                  {!isBannerConfigValid && 'Set banner size & material. '}
                  {designRequestText.length < 10 && 'Add description. '}
                  {!draftContact && 'Enter contact info.'}
                  {draftContact && !isValidContact && 'Fix contact info.'}
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

