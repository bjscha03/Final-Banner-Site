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
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Compact Header with Banner Size Summary */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Mini Banner Preview with Material Texture and Grommets */}
          <div
            className="relative rounded overflow-hidden border border-slate-300 shadow-sm flex-shrink-0"
            style={{
              width: Math.min(80, (widthIn / heightIn) * 40),
              height: 40,
              minWidth: 50,
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

            {/* White banner area overlay */}
            <div
              className="absolute inset-[8%] bg-white/90 border border-slate-200 flex items-center justify-center"
              style={{ borderRadius: 2 }}
            >
              <p className="text-[6px] font-medium text-slate-400 text-center leading-tight px-0.5">
                Your Design
              </p>
            </div>

            {/* Mini grommets */}
            {grommets !== 'none' && grommetPositions.map((point, idx) => {
              const leftPercent = (point.x / widthIn) * 100;
              const topPercent = (point.y / heightIn) * 100;
              const grommetSize = Math.max(2, Math.min(4, (grommetR / heightIn) * 40 * 1.5));

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
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-slate-900">
                {widthIn}" × {heightIn}"
              </p>
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium text-white rounded"
                style={{ backgroundColor: BRAND_BLUE }}
              >
                {material}
              </span>
              {grommets !== 'none' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-200 text-slate-700 rounded">
                  {grommets}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Set options in sidebar →</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 text-[10px] font-semibold text-white rounded-full"
            style={{ backgroundColor: BRAND_ORANGE }}
          >
            Free Design
          </span>
          <button
            onClick={onSwitchToDesigner}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: BRAND_BLUE }}
          >
            DIY instead
          </button>
        </div>
      </div>

      {/* Main Content - Compact layout to fit without scrolling */}
      <div className="flex-1 p-3 space-y-2 overflow-auto">
        {/* Step 1: Description - Compact */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              1
            </div>
            <Label htmlFor="design-request" className="text-sm font-semibold text-slate-900">
              Describe Your Banner
            </Label>
            <span className={`ml-auto text-xs font-medium ${designRequestText.length >= 10 ? 'text-green-600' : 'text-slate-400'}`}>
              {designRequestText.length}/10
            </span>
          </div>
          <Textarea
            id="design-request"
            value={designRequestText}
            onChange={(e) => setDesignRequestText(e.target.value)}
            placeholder="Example: Grand opening banner for Joe's Auto Shop. Headline: 'GRAND OPENING' - red and black colors, bold text."
            className="min-h-[60px] resize-none border-slate-200 focus:border-slate-400 focus:ring-slate-400 text-sm"
            rows={2}
          />
        </div>

        {/* Step 2: File Upload - Compact */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              2
            </div>
            <Label className="text-sm font-semibold text-slate-900">
              Upload Assets
            </Label>
            <span className="text-xs text-slate-500">(optional)</span>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-3 text-center transition-all cursor-pointer ${
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
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                <p className="text-sm text-slate-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Upload className="w-4 h-4 text-slate-400" />
                <p className="text-sm text-slate-600">
                  Drop files or <span style={{ color: BRAND_BLUE }} className="font-medium">browse</span>
                </p>
                <span className="text-xs text-slate-400">• PNG, JPG, PDF, SVG</span>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-red-600 text-xs mt-2 p-2 bg-red-50 rounded border border-red-200">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Uploaded Files List - Compact */}
          {uploadedAssets.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {uploadedAssets.map((asset, index) => (
                <div key={index} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded border border-slate-200 text-xs">
                  {asset.type.includes('image') ? (
                    <Image className="w-3 h-3 text-slate-600" />
                  ) : (
                    <FileText className="w-3 h-3" style={{ color: BRAND_ORANGE }} />
                  )}
                  <span className="font-medium text-slate-700 truncate max-w-[100px]">{asset.name}</span>
                  <button
                    onClick={() => handleRemoveAsset(index)}
                    className="p-0.5 hover:bg-red-100 rounded transition-colors"
                  >
                    <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Contact Preference - Compact */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              3
            </div>
            <Label className="text-sm font-semibold text-slate-900">
              Contact for Drafts
            </Label>
          </div>

          <div className="flex gap-2">
            <RadioGroup
              value={draftPreference}
              onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
              className="flex gap-2"
            >
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border cursor-pointer transition-all ${
                  draftPreference === 'email'
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setDraftPreference('email')}
              >
                <RadioGroupItem value="email" id="email" className="sr-only" />
                <Mail className={`w-3.5 h-3.5 ${draftPreference === 'email' ? 'text-slate-700' : 'text-slate-400'}`} />
                <Label htmlFor="email" className="text-xs font-medium text-slate-900 cursor-pointer">Email</Label>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border cursor-pointer transition-all ${
                  draftPreference === 'text'
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setDraftPreference('text')}
              >
                <RadioGroupItem value="text" id="text" className="sr-only" />
                <Phone className={`w-3.5 h-3.5 ${draftPreference === 'text' ? 'text-slate-700' : 'text-slate-400'}`} />
                <Label htmlFor="text" className="text-xs font-medium text-slate-900 cursor-pointer">Text</Label>
              </div>
            </RadioGroup>

            <Input
              type={draftPreference === 'email' ? 'email' : 'tel'}
              placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
              value={draftContact}
              onChange={(e) => setDraftContact(e.target.value)}
              className={`flex-1 h-8 text-sm ${
                !draftContact || isValidContact
                  ? 'border-slate-200 focus:border-slate-400 focus:ring-slate-400'
                  : 'border-red-300 focus:border-red-500 focus:ring-red-500'
              }`}
            />
          </div>
          {draftContact && !isValidContact && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {draftPreference === 'email' ? 'Enter a valid email' : 'Enter a valid phone number'}
            </p>
          )}
        </div>

        {/* Validation Status - Compact */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
          isFormValid && isBannerConfigValid
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {isFormValid && isBannerConfigValid ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-xs font-medium text-green-800">Ready to add to cart</p>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                {!isBannerConfigValid && 'Set size & material. '}
                {designRequestText.length < 10 && 'Add description. '}
                {!draftContact && 'Enter contact.'}
                {draftContact && !isValidContact && 'Fix contact.'}
              </p>
            </>
          )}
        </div>

        {/* What Happens Next - Condensed to single line */}
        <p className="text-[11px] text-slate-500 text-center px-2">
          After ordering: We'll create your design → Send drafts via {draftPreference} → Revise until you approve → Print & ship!
        </p>
      </div>
    </div>
  );
};

export default DesignServicePanel;

