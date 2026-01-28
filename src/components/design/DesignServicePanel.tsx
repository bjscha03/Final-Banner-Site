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
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50/30">
      {/* Hero Header - More impactful */}
      <div
        className="px-5 py-4 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #1e40af 50%, #3b82f6 100%)`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Let Us Design It</h2>
              <p className="text-sm text-blue-200">Free professional design service</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="px-4 py-1.5 text-sm font-black text-white rounded-full shadow-xl animate-pulse"
              style={{
                background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #ea580c 100%)`,
                boxShadow: '0 4px 15px rgba(255,107,53,0.5)',
              }}
            >
              FREE
            </span>
            <button
              onClick={onSwitchToDesigner}
              className="px-4 py-2 text-sm font-semibold text-white bg-white/15 hover:bg-white/25 rounded-xl transition-all border border-white/20"
            >
              DIY instead
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 p-4 lg:p-5 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">

          {/* Left Column: Banner Configuration */}
          <div className="space-y-4">
            {/* Size Selection Card */}
            <div
              className="rounded-2xl p-4 bg-white border-2 border-slate-100"
              style={{
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
              }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                  <Ruler className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                </div>
                <span className="text-sm font-bold text-slate-800">Banner Size</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SIZE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      set({ widthIn: preset.w, heightIn: preset.h });
                      setShowCustomSize(false);
                    }}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      widthIn === preset.w && heightIn === preset.h
                        ? 'text-white shadow-lg scale-[1.02]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-[1.02]'
                    }`}
                    style={widthIn === preset.w && heightIn === preset.h ? {
                      background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)`,
                      boxShadow: '0 4px 12px rgba(24, 68, 141, 0.35)',
                    } : {}}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowCustomSize(!showCustomSize)}
                className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCustomSize ? 'rotate-180' : ''}`} />
                Custom size
              </button>
              {showCustomSize && (
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
                  <div>
                    <Label className="text-xs font-medium text-slate-500 mb-1 block">Width (inches)</Label>
                    <Input
                      type="number"
                      value={widthIn}
                      onChange={(e) => set({ widthIn: parseInt(e.target.value) || 12 })}
                      className="h-10 text-sm font-medium"
                      min={12}
                      max={192}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-500 mb-1 block">Height (inches)</Label>
                    <Input
                      type="number"
                      value={heightIn}
                      onChange={(e) => set({ heightIn: parseInt(e.target.value) || 12 })}
                      className="h-10 text-sm font-medium"
                      min={12}
                      max={120}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Material & Quantity Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Material */}
              <div
                className="rounded-2xl p-4 bg-white border-2 border-slate-100"
                style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                    <Palette className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Material</span>
                </div>
                <Select value={material} onValueChange={(value) => set({ material: value as MaterialKey })}>
                  <SelectTrigger className="h-10 text-sm font-medium border-2 border-slate-200 hover:border-slate-300 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_OPTIONS.map(mat => (
                      <SelectItem key={mat.key} value={mat.key} className="font-medium">
                        {mat.name} (${mat.price}/sqft)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div
                className="rounded-2xl p-4 bg-white border-2 border-slate-100"
                style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                    <Settings className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Quantity</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => set({ quantity: Math.max(1, quantity - 1) })}
                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-all hover:scale-105 active:scale-95"
                  >
                    <Minus className="w-4 h-4 text-slate-600" />
                  </button>
                  <span className="text-2xl font-bold text-slate-800 w-10 text-center">{quantity}</span>
                  <button
                    onClick={() => set({ quantity: quantity + 1 })}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #ea580c 100%)`,
                      boxShadow: '0 4px 12px rgba(255, 107, 53, 0.35)',
                    }}
                  >
                    <Plus className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grommets */}
            <div
              className="rounded-2xl p-4 bg-white border-2 border-slate-100"
              style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                  <Settings className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                </div>
                <span className="text-sm font-bold text-slate-800">Grommets</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {GROMMET_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => set({ grommets: opt.id })}
                    className={`py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      grommets === opt.id
                        ? 'text-white shadow-lg scale-[1.02]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-[1.02]'
                    }`}
                    style={grommets === opt.id ? {
                      background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #2563eb 100%)`,
                      boxShadow: '0 4px 12px rgba(24, 68, 141, 0.35)',
                    } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing Summary - Make it POP */}
            <div
              className="rounded-2xl p-4 border-2"
              style={{
                background: `linear-gradient(135deg, ${BRAND_ORANGE}08 0%, ${BRAND_ORANGE}15 100%)`,
                borderColor: `${BRAND_ORANGE}30`,
                boxShadow: '0 4px 20px rgba(255, 107, 53, 0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">{sqFt.toFixed(1)} sq ft × {quantity}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{widthIn}" × {heightIn}" • {material}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black" style={{ color: BRAND_ORANGE }}>{usd(pricing.totalWithTax)}</p>
                  <p className="text-xs font-medium text-slate-400">incl. tax</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Design Details */}
          <div className="space-y-4">
            {/* Step 1: Description */}
            <div
              className="rounded-2xl p-4 bg-white border-2 border-slate-100"
              style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #ea580c 100%)`,
                    boxShadow: '0 2px 8px rgba(255, 107, 53, 0.4)',
                  }}
                >
                  1
                </div>
                <span className="text-sm font-bold text-slate-800">Describe Your Banner</span>
                <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                  designRequestText.length >= 10
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {designRequestText.length}/10+
                </span>
              </div>
              <Textarea
                id="design-request"
                value={designRequestText}
                onChange={(e) => setDesignRequestText(e.target.value)}
                placeholder="Example: Grand opening banner for Joe's Auto Shop. 'GRAND OPENING' - red and black colors, bold text."
                className="min-h-[70px] resize-none border-2 border-slate-200 focus:border-blue-400 focus:ring-blue-400 text-sm rounded-xl"
                rows={3}
              />
            </div>

            {/* Step 2: File Upload */}
            <div
              className="rounded-2xl p-4 bg-white border-2 border-slate-100"
              style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #ea580c 100%)`,
                    boxShadow: '0 2px 8px rgba(255, 107, 53, 0.4)',
                  }}
                >
                  2
                </div>
                <span className="text-sm font-bold text-slate-800">Upload Assets</span>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">(optional)</span>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                  dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
                style={{
                  background: dragActive ? undefined : 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                }}
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
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND_BLUE }} />
                    <p className="text-sm font-medium text-slate-600">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${BRAND_BLUE}15` }}>
                      <Upload className="w-5 h-5" style={{ color: BRAND_BLUE }} />
                    </div>
                    <p className="text-sm text-slate-600">
                      Drop files or <span style={{ color: BRAND_BLUE }} className="font-semibold">browse</span>
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-red-600 text-xs mt-3 p-3 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">{uploadError}</span>
                </div>
              )}

              {uploadedAssets.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {uploadedAssets.map((asset, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs transition-all hover:scale-[1.02]"
                      style={{
                        background: asset.type.includes('image') ? `${BRAND_BLUE}08` : `${BRAND_ORANGE}08`,
                        borderColor: asset.type.includes('image') ? `${BRAND_BLUE}25` : `${BRAND_ORANGE}25`,
                      }}
                    >
                      {asset.type.includes('image') ? (
                        <Image className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                      ) : (
                        <FileText className="w-4 h-4" style={{ color: BRAND_ORANGE }} />
                      )}
                      <span className="font-semibold text-slate-700 truncate max-w-[100px]">{asset.name}</span>
                      <button
                        onClick={() => handleRemoveAsset(index)}
                        className="p-1 hover:bg-red-100 rounded-lg transition-all hover:scale-110"
                      >
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Contact Preference */}
            <div
              className="rounded-2xl p-4 bg-white border-2 border-slate-100"
              style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)' }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #ea580c 100%)`,
                    boxShadow: '0 2px 8px rgba(255, 107, 53, 0.4)',
                  }}
                >
                  3
                </div>
                <span className="text-sm font-bold text-slate-800">Contact for Drafts</span>
              </div>

              <div className="flex gap-3">
                <RadioGroup
                  value={draftPreference}
                  onValueChange={(value) => setDraftPreference(value as 'email' | 'text')}
                  className="flex gap-2"
                >
                  <div
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      draftPreference === 'email'
                        ? 'border-blue-400 bg-blue-50 shadow-md scale-[1.02]'
                        : 'border-slate-200 hover:border-slate-300 hover:scale-[1.02]'
                    }`}
                    onClick={() => setDraftPreference('email')}
                  >
                    <RadioGroupItem value="email" id="email-ds" className="sr-only" />
                    <Mail className={`w-4 h-4 ${draftPreference === 'email' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <Label htmlFor="email-ds" className="text-sm font-semibold cursor-pointer">Email</Label>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      draftPreference === 'text'
                        ? 'border-blue-400 bg-blue-50 shadow-md scale-[1.02]'
                        : 'border-slate-200 hover:border-slate-300 hover:scale-[1.02]'
                    }`}
                    onClick={() => setDraftPreference('text')}
                  >
                    <RadioGroupItem value="text" id="text-ds" className="sr-only" />
                    <Phone className={`w-4 h-4 ${draftPreference === 'text' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <Label htmlFor="text-ds" className="text-sm font-semibold cursor-pointer">Text</Label>
                  </div>
                </RadioGroup>

                <Input
                  type={draftPreference === 'email' ? 'email' : 'tel'}
                  placeholder={draftPreference === 'email' ? 'your@email.com' : '(555) 123-4567'}
                  value={draftContact}
                  onChange={(e) => setDraftContact(e.target.value)}
                  className={`flex-1 h-11 text-sm font-medium border-2 rounded-xl ${
                    !draftContact || isValidContact
                      ? 'border-slate-200 focus:border-blue-400 focus:ring-blue-400'
                      : 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  }`}
                />
              </div>
              {draftContact && !isValidContact && (
                <div className="flex items-center gap-2 text-red-600 text-xs mt-3 p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="font-medium">{draftPreference === 'email' ? 'Enter a valid email address' : 'Enter a valid phone number'}</span>
                </div>
              )}
            </div>

            {/* Validation Status - Make it POP */}
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${
                isFormValid && isBannerConfigValid
                  ? 'border-green-300'
                  : 'border-amber-300'
              }`}
              style={{
                background: isFormValid && isBannerConfigValid
                  ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                  : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                boxShadow: isFormValid && isBannerConfigValid
                  ? '0 4px 15px rgba(34, 197, 94, 0.25)'
                  : '0 4px 15px rgba(245, 158, 11, 0.25)',
              }}
            >
              {isFormValid && isBannerConfigValid ? (
                <>
                  <div className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-green-800">Ready to add to cart!</p>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-amber-800">
                    {designRequestText.length < 10 && 'Add description (10+ chars). '}
                    {!draftContact && 'Enter contact info. '}
                    {draftContact && !isValidContact && 'Fix contact info.'}
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

