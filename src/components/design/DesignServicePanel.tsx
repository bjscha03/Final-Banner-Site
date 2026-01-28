import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Loader2, Mail, Phone, FileText, Image, AlertCircle, CheckCircle2, Sparkles, Ruler, Palette, Settings, ChevronDown, Minus, Plus } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import { useQuoteStore, type MaterialKey, type Grommets } from '@/store/quote';
import { PRICE_PER_SQFT, inchesToSqFt, calcTotals, usd } from '@/lib/pricing';

// Brand colors
const BRAND_BLUE = '#18448D';
const BRAND_ORANGE = '#ff6b35';
const BRAND_BLUE_LIGHT = '#e8f0ff';
const BRAND_ORANGE_LIGHT = '#fff5f0';

// Material texture images (from MaterialCard.tsx)
const MATERIAL_IMAGES: Record<string, string> = {
  '13oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png',
  '15oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png',
  '18oz': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png',
  'mesh': 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png',
};

// Size presets
const SIZE_PRESETS = [
  { w: 24, h: 12, label: '2×1 ft' },
  { w: 48, h: 24, label: '4×2 ft' },
  { w: 72, h: 36, label: '6×3 ft' },
  { w: 96, h: 48, label: '8×4 ft' },
];

// Material options
const MATERIAL_OPTIONS: { key: MaterialKey; name: string; price: number }[] = [
  { key: '13oz', name: '13oz Vinyl', price: PRICE_PER_SQFT['13oz'] },
  { key: '15oz', name: '15oz Vinyl', price: PRICE_PER_SQFT['15oz'] },
  { key: '18oz', name: '18oz Vinyl', price: PRICE_PER_SQFT['18oz'] },
  { key: 'mesh', name: 'Mesh Banner', price: PRICE_PER_SQFT['mesh'] },
];

// Grommet options
const GROMMET_OPTIONS: { id: Grommets; label: string }[] = [
  { id: 'none', label: 'No Grommets' },
  { id: '4-corners', label: '4 Corners' },
  { id: 'every-2-3ft', label: 'Every 2-3 ft' },
  { id: 'every-1-2ft', label: 'Every 1-2 ft' },
];

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
  // Get quote store for inline controls
  const { widthIn, heightIn, quantity, material, grommets, set } = useQuoteStore();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [showCustomSize, setShowCustomSize] = useState(false);
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

  // Calculate pricing
  const pricing = useMemo(() => {
    return calcTotals({
      widthIn,
      heightIn,
      qty: quantity,
      material: material as MaterialKey,
      addRope: false,
      polePockets: 'none',
    });
  }, [widthIn, heightIn, quantity, material]);

  const sqFt = useMemo(() => inchesToSqFt(widthIn, heightIn), [widthIn, heightIn]);

  // Check if current size matches a preset
  const isPresetSize = SIZE_PRESETS.some(p => p.w === widthIn && p.h === heightIn);

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
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${BRAND_BLUE_LIGHT} 0%, #ffffff 50%, ${BRAND_ORANGE_LIGHT} 100%)`,
      }}
    >
      {/* Hero Header */}
      <div
        className="px-4 py-3 border-b shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)`,
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Let Us Design It</h2>
              <p className="text-xs text-blue-100">Free professional design service</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 text-xs font-bold text-white rounded-full shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #f97316 100%)`,
                boxShadow: '0 2px 8px rgba(255,107,53,0.4)',
              }}
            >
              FREE
            </span>
            <button
              onClick={onSwitchToDesigner}
              className="px-3 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all"
            >
              DIY instead
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 p-3 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">

          {/* Left Column: Banner Configuration */}
          <div className="space-y-2">
            {/* Size Selection */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                borderColor: 'rgba(24, 68, 141, 0.15)',
                boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Ruler className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                <Label className="text-sm font-semibold text-slate-800">Banner Size</Label>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {SIZE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      set({ widthIn: preset.w, heightIn: preset.h });
                      setShowCustomSize(false);
                    }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      widthIn === preset.w && heightIn === preset.h
                        ? 'text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    style={widthIn === preset.w && heightIn === preset.h ? {
                      background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)`,
                    } : {}}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowCustomSize(!showCustomSize)}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showCustomSize ? 'rotate-180' : ''}`} />
                Custom size
              </button>
              {showCustomSize && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-xs text-slate-500">Width (in)</Label>
                    <Input
                      type="number"
                      value={widthIn}
                      onChange={(e) => set({ widthIn: parseInt(e.target.value) || 12 })}
                      className="h-8 text-sm"
                      min={12}
                      max={192}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Height (in)</Label>
                    <Input
                      type="number"
                      value={heightIn}
                      onChange={(e) => set({ heightIn: parseInt(e.target.value) || 12 })}
                      className="h-8 text-sm"
                      min={12}
                      max={120}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Material & Quantity Row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Material */}
              <div
                className="rounded-xl p-3 border"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderColor: 'rgba(24, 68, 141, 0.15)',
                  boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  <Label className="text-sm font-semibold text-slate-800">Material</Label>
                </div>
                <Select value={material} onValueChange={(value) => set({ material: value as MaterialKey })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_OPTIONS.map(mat => (
                      <SelectItem key={mat.key} value={mat.key}>
                        {mat.name} (${mat.price}/sqft)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div
                className="rounded-xl p-3 border"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderColor: 'rgba(24, 68, 141, 0.15)',
                  boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  <Label className="text-sm font-semibold text-slate-800">Quantity</Label>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => set({ quantity: Math.max(1, quantity - 1) })}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <Minus className="w-3 h-3 text-slate-600" />
                  </button>
                  <span className="text-lg font-bold text-slate-800 w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => set({ quantity: quantity + 1 })}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: BRAND_BLUE }}
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grommets */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                borderColor: 'rgba(24, 68, 141, 0.15)',
                boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                <Label className="text-sm font-semibold text-slate-800">Grommets</Label>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {GROMMET_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => set({ grommets: opt.id })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      grommets === opt.id
                        ? 'text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    style={grommets === opt.id ? {
                      background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)`,
                    } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing Summary */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: `linear-gradient(135deg, ${BRAND_ORANGE_LIGHT} 0%, #ffffff 100%)`,
                borderColor: 'rgba(255, 107, 53, 0.2)',
                boxShadow: '0 2px 8px rgba(255, 107, 53, 0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{sqFt.toFixed(1)} sq ft × {quantity}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{widthIn}" × {heightIn}" • {material}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold" style={{ color: BRAND_ORANGE }}>{usd(pricing.totalWithTax)}</p>
                  <p className="text-[10px] text-slate-400">incl. tax</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Design Details */}
          <div className="space-y-2">
            {/* Step 1: Description */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                borderColor: 'rgba(24, 68, 141, 0.15)',
                boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)` }}
                >
                  1
                </div>
                <Label htmlFor="design-request" className="text-sm font-semibold text-slate-800">
                  Describe Your Banner
                </Label>
                <span className={`ml-auto text-xs font-medium ${designRequestText.length >= 10 ? 'text-green-600' : 'text-slate-400'}`}>
                  {designRequestText.length}/10+
                </span>
              </div>
              <Textarea
                id="design-request"
                value={designRequestText}
                onChange={(e) => setDesignRequestText(e.target.value)}
                placeholder="Example: Grand opening banner for Joe's Auto Shop. 'GRAND OPENING' - red and black colors, bold text."
                className="min-h-[50px] resize-none border-slate-200 focus:border-blue-400 focus:ring-blue-400 text-sm"
                rows={2}
              />
            </div>

            {/* Step 2: File Upload */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                borderColor: 'rgba(24, 68, 141, 0.15)',
                boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)` }}
                >
                  2
                </div>
                <Label className="text-sm font-semibold text-slate-800">Upload Assets</Label>
                <span className="text-xs text-slate-400">(optional)</span>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-2 text-center transition-all cursor-pointer ${
                  dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
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
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: BRAND_BLUE }} />
                    <p className="text-sm text-slate-600">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                    <p className="text-sm text-slate-600">
                      Drop or <span style={{ color: BRAND_BLUE }} className="font-medium">browse</span>
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-red-600 text-xs mt-2 p-2 bg-red-50 rounded border border-red-200">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {uploadError}
                </div>
              )}

              {uploadedAssets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {uploadedAssets.map((asset, index) => (
                    <div key={index} className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded border border-blue-200 text-xs">
                      {asset.type.includes('image') ? (
                        <Image className="w-3 h-3" style={{ color: BRAND_BLUE }} />
                      ) : (
                        <FileText className="w-3 h-3" style={{ color: BRAND_ORANGE }} />
                      )}
                      <span className="font-medium text-slate-700 truncate max-w-[80px]">{asset.name}</span>
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

            {/* Step 3: Contact Preference */}
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                borderColor: 'rgba(24, 68, 141, 0.15)',
                boxShadow: '0 2px 8px rgba(24, 68, 141, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)` }}
                >
                  3
                </div>
                <Label className="text-sm font-semibold text-slate-800">Contact for Drafts</Label>
              </div>

              <div className="flex gap-2">
                <RadioGroup
                  value={draftPreference}
                  onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
                  className="flex gap-1.5"
                >
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${
                      draftPreference === 'email'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setDraftPreference('email')}
                  >
                    <RadioGroupItem value="email" id="email-ds" className="sr-only" />
                    <Mail className={`w-3.5 h-3.5 ${draftPreference === 'email' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <Label htmlFor="email-ds" className="text-xs font-medium cursor-pointer">Email</Label>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${
                      draftPreference === 'text'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setDraftPreference('text')}
                  >
                    <RadioGroupItem value="text" id="text-ds" className="sr-only" />
                    <Phone className={`w-3.5 h-3.5 ${draftPreference === 'text' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <Label htmlFor="text-ds" className="text-xs font-medium cursor-pointer">Text</Label>
                  </div>
                </RadioGroup>

                <Input
                  type={draftPreference === 'email' ? 'email' : 'tel'}
                  placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
                  value={draftContact}
                  onChange={(e) => setDraftContact(e.target.value)}
                  className={`flex-1 h-8 text-sm ${
                    !draftContact || isValidContact
                      ? 'border-slate-200 focus:border-blue-400 focus:ring-blue-400'
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

            {/* Validation Status */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                isFormValid && isBannerConfigValid
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300'
              }`}
              style={{
                boxShadow: isFormValid && isBannerConfigValid
                  ? '0 2px 8px rgba(34, 197, 94, 0.15)'
                  : '0 2px 8px rgba(245, 158, 11, 0.15)',
              }}
            >
              {isFormValid && isBannerConfigValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs font-medium text-green-800">Ready to add to cart!</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    {designRequestText.length < 10 && 'Add description (10+ chars). '}
                    {!draftContact && 'Enter contact. '}
                    {draftContact && !isValidContact && 'Fix contact.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignServicePanel;

