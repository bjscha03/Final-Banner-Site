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
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Plus, Minus, Loader2, AlertTriangle, CheckCircle, Image as ImageIcon, ZoomIn, ZoomOut, Move, Eye } from 'lucide-react';
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

  // Preview modal state
  const [previewDesignId, setPreviewDesignId] = useState<string | null>(null);
  const [previewImgPos, setPreviewImgPos] = useState({ x: 0, y: 0 });
  const [previewImgScale, setPreviewImgScale] = useState(1);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [dragStartPt, setDragStartPt] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const previewDesign = designs.find(d => d.id === previewDesignId);

  const openPreview = useCallback((designId: string) => {
    const design = designs.find(d => d.id === designId);
    setPreviewDesignId(designId);
    // Restore saved state if available, otherwise default
    setPreviewImgPos(design?.imgPos || { x: 0, y: 0 });
    setPreviewImgScale(design?.imgScale || 1);
    setIsDraggingPreview(false);
  }, [designs]);

  const previewCanvasRef = useRef<HTMLDivElement>(null);

  // Save preview state and generate thumbnail, then close
  const savePreviewAndClose = useCallback(() => {
    if (!previewDesignId) { setPreviewDesignId(null); return; }
    
    // Generate a thumbnail from the preview canvas
    const container = previewCanvasRef.current;
    if (container) {
      try {
        // Use html2canvas-like approach: draw the preview onto a canvas
        const rect = container.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        const scale = 2; // 2x for retina quality
        canvas.width = rect.width * scale;
        canvas.height = rect.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(scale, scale);
          // Draw background
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(0, 0, rect.width, rect.height);
          
          // Find the image element inside the preview
          const imgEl = container.querySelector('img') as HTMLImageElement;
          if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, rect.width, rect.height);
            ctx.clip();
            ctx.translate(previewImgPos.x, previewImgPos.y);
            ctx.scale(previewImgScale, previewImgScale);
            // Draw image to fill the container
            ctx.drawImage(imgEl, 0, 0, rect.width, rect.height);
            ctx.restore();
          }
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          // Update design with preview state and rendered thumbnail
          onDesignsChange(designs.map(d => d.id === previewDesignId ? {
            ...d,
            imgScale: previewImgScale,
            imgPos: { ...previewImgPos },
            previewThumbnailUrl: dataUrl,
          } : d));
          setPreviewDesignId(null);
          setIsDraggingPreview(false);
          return;
        }
      } catch (err) {
        console.warn('[YardSign] Failed to generate preview thumbnail:', err);
      }
    }
    
    // Fallback: just save the state without thumbnail snapshot
    onDesignsChange(designs.map(d => d.id === previewDesignId ? {
      ...d,
      imgScale: previewImgScale,
      imgPos: { ...previewImgPos },
    } : d));
    setPreviewDesignId(null);
    setIsDraggingPreview(false);
  }, [previewDesignId, previewImgPos, previewImgScale, designs, onDesignsChange]);

  const closePreview = useCallback(() => {
    setPreviewDesignId(null);
    setIsDraggingPreview(false);
  }, []);

  // Preview drag handlers
  const onPreviewMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPreview(true);
    setDragStartPt({ x: e.clientX, y: e.clientY });
    setDragStartPos({ ...previewImgPos });
  }, [previewImgPos]);

  const onPreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingPreview) return;
    setPreviewImgPos({
      x: dragStartPos.x + (e.clientX - dragStartPt.x),
      y: dragStartPos.y + (e.clientY - dragStartPt.y),
    });
  }, [isDraggingPreview, dragStartPt, dragStartPos]);

  const onPreviewMouseUp = useCallback(() => {
    setIsDraggingPreview(false);
  }, []);

  const onPreviewTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setIsDraggingPreview(true);
      setDragStartPt({ x: t.clientX, y: t.clientY });
      setDragStartPos({ ...previewImgPos });
    }
  }, [previewImgPos]);

  const onPreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingPreview || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    setPreviewImgPos({
      x: dragStartPos.x + (t.clientX - dragStartPt.x),
      y: dragStartPos.y + (t.clientY - dragStartPt.y),
    });
  }, [isDraggingPreview, dragStartPt, dragStartPos]);

  const onPreviewTouchEnd = useCallback(() => {
    setIsDraggingPreview(false);
  }, []);

  const onPreviewWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setPreviewImgScale(s => Math.max(0.5, Math.min(3, s * delta)));
  }, []);

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
        imgScale: 1,
        imgPos: { x: 0, y: 0 },
      };
      onDesignsChange([...designs, newDesign]);
      // Auto-open preview modal immediately after upload
      setPreviewDesignId(newDesign.id);
      setPreviewImgPos({ x: 0, y: 0 });
      setPreviewImgScale(1);
      setIsDraggingPreview(false);
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
          Total order must be in increments of {YARD_SIGN_INCREMENT} signs (10, 20, 30, etc.).
        </p>

        {/* Design rows */}
        {designs.length > 0 && (
          <div className="space-y-3 mb-4">
            {designs.map((design, idx) => (
              <div key={design.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                {/* Thumbnail — click to preview */}
                <button
                  onClick={() => openPreview(design.id)}
                  className="w-14 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200 relative group cursor-pointer"
                  aria-label={`Preview ${design.fileName}`}
                >
                  <img
                    src={design.previewThumbnailUrl || design.thumbnailUrl}
                    alt={design.fileName}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
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
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(qty => (
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
          <li className="font-semibold">Yard signs must be ordered in increments of {YARD_SIGN_INCREMENT} (10, 20, 30, etc.)</li>
          <li>Maximum {YARD_SIGN_MAX_QUANTITY} signs per order for 24-hour production</li>
          <li>Need more than {YARD_SIGN_MAX_QUANTITY}? Place a second order.</li>
        </ul>
      </div>

      {/* Yard Sign Preview Modal */}
      {previewDesign && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Yard Sign Preview</h3>
                <p className="text-xs text-gray-400">24&quot; × 18&quot; Corrugated Plastic — What you see is what you get</p>
              </div>
              <button onClick={closePreview} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                <Move className="w-4 h-4" /> Drag to reposition · Use buttons or scroll to zoom
              </p>
              <div className="rounded-lg p-4" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
                <div
                  ref={previewCanvasRef}
                  className="relative w-full rounded-sm select-none overflow-hidden transition-all duration-300 ease-out"
                  style={{
                    aspectRatio: '24 / 18',
                    cursor: isDraggingPreview ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    backgroundColor: '#fafafa',
                    border: '1px solid #e2e5ea',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.6)',
                  }}
                  onMouseDown={onPreviewMouseDown}
                  onMouseMove={onPreviewMouseMove}
                  onMouseUp={onPreviewMouseUp}
                  onMouseLeave={onPreviewMouseUp}
                  onTouchStart={onPreviewTouchStart}
                  onTouchMove={onPreviewTouchMove}
                  onTouchEnd={onPreviewTouchEnd}
                  onWheel={onPreviewWheel}
                >
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{ transform: `translate(${previewImgPos.x}px, ${previewImgPos.y}px) scale(${previewImgScale})` }}
                  >
                    <img
                      src={previewDesign.fileUrl || previewDesign.thumbnailUrl}
                      alt="Yard Sign preview"
                      className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                      draggable={false}
                    />
                  </div>
                  {/* Safe zone border indicator */}
                  <div className="absolute inset-1 border border-dashed border-gray-300/50 rounded-sm pointer-events-none" />
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                Size: 24&quot; × 18&quot; · Corrugated Plastic · {previewDesign.fileName}
              </p>
              {/* Zoom controls */}
              <div className="flex items-center justify-center mt-3">
                <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm border border-gray-200/60">
                  <button onClick={() => setPreviewImgScale(s => Math.max(0.5, s - 0.1))} className="p-2 sm:p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom out">
                    <ZoomOut className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="text-sm font-medium text-gray-500 min-w-[3ch] text-center">{Math.round(previewImgScale * 100)}%</span>
                  <button onClick={() => setPreviewImgScale(s => Math.min(3, s + 0.1))} className="p-2 sm:p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom in">
                    <ZoomIn className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="w-px h-4 bg-gray-200" />
                  <button onClick={() => { setPreviewImgPos({ x: 0, y: 0 }); setPreviewImgScale(1); }} className="text-sm text-orange-600 hover:text-orange-700 font-medium px-2">Reset</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">Your design will be printed based on this preview</p>
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={closePreview} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={savePreviewAndClose} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YardSignConfigurator;
