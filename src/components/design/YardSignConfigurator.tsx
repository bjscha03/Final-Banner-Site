/**
 * Yard Sign Configurator (v2)
 * 
 * Clean, simplified yard sign ordering flow:
 * - Fixed size: 24" × 18" corrugated plastic
 * - Sidedness: Single ($12) or Double ($14)
 * - Multi-design upload (up to 10 designs, per-design quantities)
 * - Optional step stakes ($1.50 each)
 * - Max 90 signs per order
 * - Live price summary
 */
import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Plus, Minus, Loader2, AlertTriangle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import {
  type YardSignSidedness,
  type YardSignDesign,
  YARD_SIGN_MAX_QUANTITY,
  YARD_SIGN_MAX_DESIGNS,
  YARD_SIGN_MIN_QUANTITY,
  YARD_SIGN_INCREMENT,
  YARD_SIGN_SINGLE_SIDED_CENTS,
  YARD_SIGN_DOUBLE_SIDED_CENTS,
  YARD_SIGN_STEP_STAKE_CENTS,
  getTotalDesignQuantity,
  validateYardSignQuantity,
} from '@/lib/yard-sign-pricing';
import { usd } from '@/lib/pricing';

// Helper to generate PDF thumbnail URL from Cloudinary
function getPdfThumbnailUrl(pdfUrl: string): string {
  try {
    const url = new URL(pdfUrl);
    if (!url.hostname.endsWith('.cloudinary.com') || !pdfUrl.toLowerCase().endsWith('.pdf')) return pdfUrl;
    return pdfUrl.replace('/upload/', '/upload/pg_1,f_jpg,w_400/');
  } catch {
    return pdfUrl;
  }
}

interface YardSignConfiguratorProps {
  designs: YardSignDesign[];
  onDesignsChange: (designs: YardSignDesign[]) => void;
  sidedness: YardSignSidedness;
  onSidednessChange: (s: YardSignSidedness) => void;
  addStepStakes: boolean;
  onStepStakesChange: (v: boolean) => void;
  stepStakeQuantity: number;
  onStepStakeQuantityChange: (q: number) => void;
  promoCode: string;
  onPromoCodeChange: (c: string) => void;
  promoApplied: boolean;
  onPromoApply: () => void;
  onPromoRemove: () => void;
}

const YardSignConfigurator: React.FC<YardSignConfiguratorProps> = ({
  designs,
  onDesignsChange,
  sidedness,
  onSidednessChange,
  addStepStakes,
  onStepStakesChange,
  stepStakeQuantity,
  onStepStakeQuantityChange,
  promoCode,
  onPromoCodeChange,
  promoApplied,
  onPromoApply,
  onPromoRemove,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const totalQuantity = getTotalDesignQuantity(designs);
  const quantityValidation = validateYardSignQuantity(totalQuantity);
  const canAddMoreDesigns = designs.length < YARD_SIGN_MAX_DESIGNS;

  // Compress images client-side to stay under Netlify's 6 MB function limit
  const compressImage = useCallback(async (file: File): Promise<File> => {
    if (file.type === 'application/pdf' || file.size <= 4.5 * 1024 * 1024) return file;
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 4000;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/.png$/i, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    if (!canAddMoreDesigns) {
      setUploadError(`Maximum ${YARD_SIGN_MAX_DESIGNS} designs per order.`);
      return;
    }
    const accepted = ['application/pdf', 'image/jpeg', 'image/png'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!accepted.includes(file.type) && !['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      setUploadError('Please upload a PDF, PNG, JPG, or JPEG file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File too large. Please upload a file under 50MB.');
      return;
    }
    setIsUploading(true);
    try {
      const uploadFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const isPdf = file.type === 'application/pdf';
      const thumbnailUrl = isPdf ? getPdfThumbnailUrl(data.secureUrl) : data.secureUrl;
      const newDesign: YardSignDesign = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        fileName: file.name,
        fileUrl: data.secureUrl,
        fileKey: data.fileKey || data.publicId,
        thumbnailUrl,
        isPdf,
        quantity: 1,
      };
      onDesignsChange([...designs, newDesign]);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [canAddMoreDesigns, compressImage, designs, onDesignsChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (e.target) e.target.value = '';
  }, [handleFileUpload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const removeDesign = useCallback((id: string) => {
    onDesignsChange(designs.filter(d => d.id !== id));
  }, [designs, onDesignsChange]);

  const updateDesignQuantity = useCallback((id: string, qty: number) => {
    const clamped = Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, qty));
    onDesignsChange(designs.map(d => d.id === id ? { ...d, quantity: clamped } : d));
  }, [designs, onDesignsChange]);

  return (
    <div className="space-y-8">
      {/* Fixed Size Display */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Sign Size</label>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
          <div className="w-12 h-9 bg-white rounded border border-gray-300 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-gray-500">24×18</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">24&quot; × 18&quot;</p>
            <p className="text-xs text-gray-500">Corrugated Plastic</p>
          </div>
          <CheckCircle className="ml-auto h-5 w-5 text-green-500 flex-shrink-0" />
        </div>
      </div>

      {/* Sidedness Selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Print Side</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSidednessChange('single')}
            className={`border rounded-xl py-3 px-4 text-left transition-all ${
              sidedness === 'single'
                ? 'border-orange-500 bg-orange-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <p className={`text-sm font-semibold ${sidedness === 'single' ? 'text-orange-700' : 'text-gray-800'}`}>
              Single-Sided
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{usd(YARD_SIGN_SINGLE_SIDED_CENTS / 100)}/sign</p>
          </button>
          <button
            onClick={() => onSidednessChange('double')}
            className={`border rounded-xl py-3 px-4 text-left transition-all ${
              sidedness === 'double'
                ? 'border-orange-500 bg-orange-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <p className={`text-sm font-semibold ${sidedness === 'double' ? 'text-orange-700' : 'text-gray-800'}`}>
              Double-Sided
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{usd(YARD_SIGN_DOUBLE_SIDED_CENTS / 100)}/sign</p>
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Upload Artwork
          <span className="text-xs font-normal text-gray-400 ml-2">
            Up to {YARD_SIGN_MAX_DESIGNS} designs per order
          </span>
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Each uploaded design will be printed at 24&quot; × 18&quot;. Assign a quantity to each design.
        </p>
        <p className="text-xs text-orange-600 font-medium mb-3">
          Total order must be in increments of 10 signs (10, 20, 30, etc.).
        </p>

        {/* Design rows */}
        {designs.length > 0 && (
          <div className="space-y-3 mb-4">
            {designs.map((design, idx) => (
              <div key={design.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                {/* Thumbnail */}
                <div className="w-14 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                  <img
                    src={design.thumbnailUrl}
                    alt={design.fileName}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{design.fileName}</p>
                  <p className="text-xs text-gray-400">Design {idx + 1}</p>
                </div>
                {/* Quantity control */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => updateDesignQuantity(design.id, design.quantity - 1)}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={YARD_SIGN_MAX_QUANTITY}
                    value={design.quantity}
                    onChange={e => updateDesignQuantity(design.id, Math.max(1, +e.target.value || 1))}
                    className="w-14 border rounded-lg px-2 py-1 text-sm text-center"
                  />
                  <button
                    onClick={() => updateDesignQuantity(design.id, design.quantity + 1)}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3 text-gray-600" />
                  </button>
                </div>
                {/* Remove */}
                <button
                  onClick={() => removeDesign(design.id)}
                  className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label={`Remove ${design.fileName}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {/* Running total */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              !quantityValidation.valid && totalQuantity > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
            }`}>
              <span className={!quantityValidation.valid && totalQuantity > 0 ? 'text-red-700 font-semibold' : 'text-gray-600 font-medium'}>
                Total Signs: {totalQuantity}
              </span>
              {quantityValidation.valid && totalQuantity > 0 && (
                <span className="text-green-600 text-xs flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Valid order
                </span>
              )}
              {!quantityValidation.valid && totalQuantity > 0 && (
                <span className="text-red-600 text-xs flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {totalQuantity > YARD_SIGN_MAX_QUANTITY ? `Max ${YARD_SIGN_MAX_QUANTITY}` : `Must be multiple of ${YARD_SIGN_INCREMENT}`}
                </span>
              )}
              {totalQuantity === 0 && (
                <span className="text-gray-400 text-xs">Min {YARD_SIGN_MIN_QUANTITY} signs</span>
              )}
            </div>

            {/* Quick-select total quantity buttons */}
            {designs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 font-medium">Quick select total:</p>
                <div className="flex flex-wrap gap-2">
                  {[10, 20, 30, 50, 70, 90].map(qty => (
                    <button
                      key={qty}
                      onClick={() => {
                        // Distribute quantity evenly across designs, remainder goes to first
                        const perDesign = Math.floor(qty / designs.length);
                        const remainder = qty % designs.length;
                        const updated = designs.map((d, i) => ({
                          ...d,
                          quantity: perDesign + (i < remainder ? 1 : 0),
                        }));
                        onDesignsChange(updated);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        totalQuantity === qty
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-orange-400 hover:bg-orange-50'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload dropzone */}
        {canAddMoreDesigns && (
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              dragActive ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-400 bg-white'
            }`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,.pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                <p className="text-sm text-gray-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
                  <Upload className="h-5 w-5 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  {designs.length === 0 ? 'Upload your yard sign artwork' : 'Add another design'}
                </p>
                <p className="text-xs text-gray-400">PNG, JPG, or PDF · Max 50MB</p>
              </div>
            )}
          </div>
        )}

        {uploadError && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {uploadError}
          </p>
        )}

        {/* 90-sign cap exceeded error */}
        {!quantityValidation.valid && quantityValidation.message && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {quantityValidation.message}
            </p>
          </div>
        )}
      </div>

      {/* Step Stakes Option */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Add-ons</label>
        <div
          className={`border rounded-xl p-4 transition-all cursor-pointer ${
            addStepStakes
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 hover:border-gray-400'
          }`}
          onClick={() => {
            const next = !addStepStakes;
            onStepStakesChange(next);
            if (next && totalQuantity > 0) {
              onStepStakeQuantityChange(totalQuantity);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={addStepStakes}
              onChange={() => {}}
              className="accent-orange-500 w-4 h-4 flex-shrink-0"
            />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${addStepStakes ? 'text-orange-700' : 'text-gray-800'}`}>
                Step Stakes
              </p>
              <p className="text-xs text-gray-500">
                Wire H-stakes for ground mounting · {usd(YARD_SIGN_STEP_STAKE_CENTS / 100)} each
              </p>
            </div>
          </div>
          {addStepStakes && (
            <div className="mt-3 ml-7" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Qty:</span>
                <button
                  onClick={() => onStepStakeQuantityChange(Math.max(1, stepStakeQuantity - 1))}
                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                >
                  <Minus className="h-3 w-3 text-gray-600" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={YARD_SIGN_MAX_QUANTITY}
                  value={stepStakeQuantity}
                  onChange={e => onStepStakeQuantityChange(Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, +e.target.value || 1)))}
                  className="w-14 border rounded-lg px-2 py-1 text-sm text-center"
                />
                <button
                  onClick={() => onStepStakeQuantityChange(Math.min(YARD_SIGN_MAX_QUANTITY, stepStakeQuantity + 1))}
                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                >
                  <Plus className="h-3 w-3 text-gray-600" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Typically 1 stake per sign</p>
            </div>
          )}
        </div>
      </div>

      {/* Helper text */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1.5">
        <p className="text-xs text-blue-700 font-medium">📋 Order Guidelines</p>
        <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
          <li>Standard yard sign size: 24&quot; × 18&quot;</li>
          <li>Upload up to {YARD_SIGN_MAX_DESIGNS} different designs per order</li>
          <li>Assign a quantity to each uploaded design</li>
          <li className="font-semibold">Yard signs must be ordered in increments of 10 (10, 20, 30, etc.)</li>
          <li>Maximum {YARD_SIGN_MAX_QUANTITY} signs per order for 24-hour production</li>
          <li>Need more than {YARD_SIGN_MAX_QUANTITY}? Place a second order.</li>
        </ul>
      </div>
    </div>
  );
};

export default YardSignConfigurator;
