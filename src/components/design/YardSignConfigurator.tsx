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
 *
 * Rendering pipeline:
 * - Preview modal always uses the HIGH-RES source (fileUrl / Cloudinary PDF preview).
 * - On save, a canvas-based thumbnail (previewThumbnailUrl) is generated at small size
 *   and stored alongside imgScale / imgPos.
 * - The row thumbnail, cart thumbnail, checkout preview, admin preview, email preview,
 *   and print file ALL read from the same saved { previewThumbnailUrl, imgScale, imgPos }.
 * - Re-opening the preview restores imgScale / imgPos but always renders from the
 *   original high-res source, never from the generated thumbnail.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Plus, Minus, Loader2, AlertTriangle, CheckCircle, Move, Eye, Sparkles } from 'lucide-react';
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
  YARD_SIGN_WIDTH_IN,
  YARD_SIGN_HEIGHT_IN,
  getTotalDesignQuantity,
  validateYardSignQuantity,
} from '@/lib/yard-sign-pricing';
import { usd } from '@/lib/pricing';
import {
  buildCloudinaryPdfPreviewUrl,
  isPdfArtwork,
  uploadArtworkFile,
  validateArtworkFile,
} from '@/utils/uploadArtworkFile';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import FileUploader from '@/components/ui/FileUploader';
import CreateWithAIModal, { type CreateWithAIResult } from '@/components/design/CreateWithAIModal';
import { ENABLE_AI } from '@/lib/featureFlags';
import { base64ToFile } from '@/utils/base64ToFile';
import ArtworkPreviewEditor, {
  type ArtworkPreviewEditorHandle,
  type ArtworkTransform,
} from '@/components/design/ArtworkPreviewEditor';
import ConfigCard from '@/components/design/layout/ConfigCard';
import { logUx } from '@/lib/uxAnalytics';
import { createStableCartItemId } from '@/lib/cartItemIdentity';
import {
  PREVIEW_ARTIFACT_VERSION,
  PreviewLifecycleError,
  buildCompositionSignature,
  explainPreviewLifecycleError,
  isReadyPlacementPreview,
  type ArtworkCompositionSpec,
} from '@/lib/previewLifecycle';
import { createPermanentPlacementPreview } from '@/lib/previewArtifactCoordinator';

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

// Higher-quality PDF preview URL for the editor modal (larger than thumbnail)
function getPdfPreviewUrl(pdfUrl: string): string {
  return buildCloudinaryPdfPreviewUrl(pdfUrl);
}

/**
 * Get the HIGH-RES image source for the preview modal.
 * IMPORTANT: This must ALWAYS return the original source file, never the generated
 * thumbnail data URL. The preview modal needs the full-res image so that:
 * 1. The user sees a sharp preview
 * 2. The canvas thumbnail generated on save is high quality
 * 3. Repeated edits don't degrade quality
 */
function getPreviewModalSrc(design: YardSignDesign): string {
  if (design.isPdf) {
    return getPdfPreviewUrl(design.fileUrl);
  }
  return design.fileUrl || design.thumbnailUrl;
}

/**
 * Get the thumbnail source for displaying in the design row.
 * Uses the canvas-generated preview thumbnail if available (matches what user saved),
 * otherwise falls back to the upload thumbnail.
 */
function getRowThumbnailSrc(design: YardSignDesign): string {
  return design.previewThumbnailUrl || design.thumbnailUrl;
}

function getRowThumbnailSources(design: YardSignDesign): string[] {
  if (isReadyPlacementPreview(design.placementPreview)) {
    return [design.placementPreview.previewUrl];
  }
  const values = [
    design.previewThumbnailUrl,
    design.thumbnailUrl,
    design.isPdf ? getPdfThumbnailUrl(design.fileUrl) : null,
    design.fileUrl,
  ];
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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
  /** When set, auto-opens the preview modal for this design ID on mount */
  autoOpenDesignId?: string | null;
  /** Optional quantity preset to apply to first uploaded design */
  initialDesignQuantity?: number;
  /** Optional callback fired whenever the internal upload state changes — lets the parent drive the mobile sticky CTA. */
  onUploadStatusChange?: (status: { isUploading: boolean; uploadError: string | null }) => void;
  /** Optional callback fired when the user taps "Done" in the preview modal — lets the parent log analytics / advance the sticky CTA. */
  onPreviewDone?: (designId: string) => void;
  /** Parent-provided admin gate for the visible Create With AI action. */
  showCreateWithAI?: boolean;
  /**
   * Optional ref-style trigger from the parent: incrementing this number
   * tells the configurator to programmatically open the preview modal for
   * the design at `previewOpenTrigger.designId`. Used by the "Review
   * Design" sticky CTA so users can re-confirm a design without scrolling
   * to find the row thumbnail.
   */
  previewOpenTrigger?: { designId: string; nonce: number } | null;
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
  autoOpenDesignId,
  initialDesignQuantity,
  onUploadStatusChange,
  onPreviewDone,
  previewOpenTrigger,
  showCreateWithAI = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Mirror upload status to the parent so the mobile sticky CTA can render
  // "Uploading…" / "Retry Upload" without duplicating state.
  useEffect(() => {
    onUploadStatusChange?.({ isUploading, uploadError: uploadError || null });
  }, [isUploading, uploadError, onUploadStatusChange]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[AI_VISIBILITY][YardSignConfigurator]', {
      userId: null,
      email: null,
      isAdmin: showCreateWithAI,
      shouldRenderCreateWithAI: ENABLE_AI && showCreateWithAI,
    });
  }, [showCreateWithAI]);

  const totalQuantity = getTotalDesignQuantity(designs);
  const quantityValidation = validateYardSignQuantity(totalQuantity);
  const canAddMoreDesigns = designs.length < YARD_SIGN_MAX_DESIGNS;

  // Preview modal state
  const [previewDesignId, setPreviewDesignId] = useState<string | null>(null);
  const [previewImgPos, setPreviewImgPos] = useState({ x: 0, y: 0 });
  const [previewImgScale, setPreviewImgScale] = useState(1);
  const [previewImgScaleY, setPreviewImgScaleY] = useState(1);
  const [previewConstrain, setPreviewConstrain] = useState(true);
  const [mobileToolbarEl, setMobileToolbarEl] = useState<HTMLDivElement | null>(null);
  const previewDesign = designs.find(d => d.id === previewDesignId);

  const openPreview = useCallback((designId: string) => {
    const design = designs.find(d => d.id === designId);
    setPreviewSaveError(null);
    setPreviewDesignId(designId);
    // Restore saved state if available, otherwise default
    setPreviewImgPos(design?.imgPos || { x: 0, y: 0 });
    setPreviewImgScale(design?.imgScale ?? 1);
    setPreviewImgScaleY(design?.imgScaleY ?? design?.imgScale ?? 1);
    setPreviewConstrain(design?.imgConstrain ?? true);
  }, [designs]);

  // Auto-open preview when editing from cart (autoOpenDesignId prop)
  const autoOpenHandledRef = useRef(false);
  useEffect(() => {
    if (!autoOpenDesignId || autoOpenHandledRef.current || designs.length === 0) return;
    const design = designs.find(d => d.id === autoOpenDesignId);
    if (design) {
      autoOpenHandledRef.current = true;
      openPreview(design.id);
    }
  }, [autoOpenDesignId, designs, openPreview]);

  // Programmatic open from the parent's "Review Design" sticky CTA. Each
  // increment of `previewOpenTrigger.nonce` re-opens the preview for the
  // requested design id (idempotent across renders).
  const lastTriggerNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!previewOpenTrigger) return;
    if (lastTriggerNonceRef.current === previewOpenTrigger.nonce) return;
    const design = designs.find(d => d.id === previewOpenTrigger.designId);
    if (!design) return;
    lastTriggerNonceRef.current = previewOpenTrigger.nonce;
    openPreview(design.id);
  }, [previewOpenTrigger, designs, openPreview]);

  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const previewEditorRef = useRef<ArtworkPreviewEditorHandle>(null);
  const [previewSaveError, setPreviewSaveError] = useState<string | null>(null);

  // Save preview state and generate thumbnail, then close
  const savePreviewAndClose = useCallback(async (): Promise<boolean> => {
    if (!previewDesignId) return false;

    const currentDesign = designs.find(d => d.id === previewDesignId);
    if (!currentDesign) return false;

    setIsSavingPreview(true);
    setPreviewSaveError(null);
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const editor = previewEditorRef.current;
        if (!editor) {
          throw new PreviewLifecycleError(
            'PREVIEW_GEOMETRY_NOT_READY',
            'The Yard Sign editor canvas is not mounted.',
          );
        }
        const snapshot = editor.getCompositionSnapshot();
        const spec: ArtworkCompositionSpec = {
          version: PREVIEW_ARTIFACT_VERSION,
          sourceUrl: getPreviewModalSrc(currentDesign),
          sourceIdentity: `${currentDesign.fileKey}@page-1`,
          productType: 'yard_sign',
          widthIn: YARD_SIGN_WIDTH_IN,
          heightIn: YARD_SIGN_HEIGHT_IN,
          fitMode: 'fit',
          transform: snapshot.transform,
          revision: snapshot.revision,
        };
        const artifact = await createPermanentPlacementPreview(spec);
        const latestSnapshot = previewEditorRef.current?.getCompositionSnapshot();
        if (!latestSnapshot) {
          throw new PreviewLifecycleError('COMPOSITION_CHANGED', 'The Yard Sign editor closed during preview preparation.');
        }
        const latestSpec = { ...spec, transform: latestSnapshot.transform, revision: latestSnapshot.revision };
        if (artifact.compositionSignature !== buildCompositionSignature(latestSpec)) {
          console.info('[yard_sign_preview_stale_discarded]', {
            attempt,
            completedSignature: artifact.compositionSignature,
            latestSignature: buildCompositionSignature(latestSpec),
          });
          continue;
        }

        onDesignsChange(designs.map((design) => design.id === previewDesignId ? {
          ...design,
          imgScale: artifact.scaleX,
          imgScaleY: artifact.scaleY,
          imgPos: {
            x: (artifact.positionPct.x / 100) * latestSnapshot.canvasWidthPx,
            y: (artifact.positionPct.y / 100) * latestSnapshot.canvasHeightPx,
          },
          imgConstrain: previewConstrain,
          previewThumbnailUrl: artifact.previewUrl,
          placementPreview: artifact,
        } : design));
        setPreviewDesignId(null);
        return true;
      }
      throw new PreviewLifecycleError(
        'COMPOSITION_CHANGED',
        'The Yard Sign composition changed during all bounded attempts.',
      );
    } catch (error) {
      const explained = explainPreviewLifecycleError(error);
      console.error('[yard_sign_preview_failed]', {
        code: explained.code,
        reason: explained.technicalReason,
        details: error instanceof PreviewLifecycleError ? error.details : undefined,
        designId: previewDesignId,
      });
      setPreviewSaveError(`${explained.code}: ${explained.description} Technical reason: ${explained.technicalReason}`);
      return false;
    } finally {
      setIsSavingPreview(false);
    }
  }, [previewDesignId, previewConstrain, designs, onDesignsChange]);

  const closePreview = useCallback(() => {
    setPreviewDesignId(null);
  }, []);

  // (Drag/zoom handlers were removed — ArtworkPreviewEditor now owns the
  // pointer/touch interactions, including pinch-to-scale, drag, and
  // corner-handle resize.)

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    if (!canAddMoreDesigns) {
      setUploadError(`Maximum ${YARD_SIGN_MAX_DESIGNS} designs per order.`);
      return;
    }
    const validationError = validateArtworkFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, {
        correlationId: `yard-sign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      const isPdf = isPdfArtwork(file);
      const thumbnailUrl = isPdf ? result.previewUrl : result.secureUrl;
      const presetFirstDesignQuantity = Math.max(
        YARD_SIGN_MIN_QUANTITY,
        Math.min(YARD_SIGN_MAX_QUANTITY, initialDesignQuantity || YARD_SIGN_MIN_QUANTITY),
      );
      const newDesign: YardSignDesign = {
        id: createStableCartItemId('yard-design'),
        fileName: file.name,
        fileUrl: result.secureUrl,
        fileKey: result.fileKey,
        thumbnailUrl,
        isPdf,
        quantity: designs.length === 0 ? presetFirstDesignQuantity : 1,
        imgScale: 1,
        imgPos: { x: 0, y: 0 },
      };
      onDesignsChange([...designs, newDesign]);
      setPreviewDesignId(newDesign.id);
      logUx('preview_opened', { source: 'yard_sign_after_upload', designId: newDesign.id });
      setPreviewImgPos({ x: 0, y: 0 });
      setPreviewImgScale(1);
      setUploadError('');
    } catch (error) {
      console.error('[YardSign] original upload failed', error);
      setUploadError('Upload failed after automatic retries. Your file was not added; please check your connection and try again.');
      logUx('upload_error', {
        source: 'yard_sign',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsUploading(false);
    }
  }, [canAddMoreDesigns, designs, onDesignsChange, initialDesignQuantity]);

  const removeDesign = useCallback((id: string) => {
    onDesignsChange(designs.filter(d => d.id !== id));
  }, [designs, onDesignsChange]);

  const updateDesignQuantity = useCallback((id: string, qty: number) => {
    const clamped = Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, qty));
    onDesignsChange(designs.map(d => d.id === id ? { ...d, quantity: clamped } : d));
  }, [designs, onDesignsChange]);

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Step 1 — Sign Size (fixed/locked) */}
      <ConfigCard step={1} title="Yard Sign Size" id="yard-size-section">
        <p className="text-xs text-gray-500 mb-2">Standard 24&quot; × 18&quot; corrugated plastic.</p>
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
      </ConfigCard>

      {/* Step 2 — Print Side (sidedness selector). Renamed from
          "Select material" to "Choose Print Side" — yard signs only ship on
          one substrate, so the choice is single- vs double-sided printing. */}
      <ConfigCard step={2} title="Choose Print Side" id="yard-print-side-section">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSidednessChange('single')}
            className={`border rounded-xl py-3 px-4 text-left transition-all ${
              sidedness === 'single'
                ? 'border-orange-500 bg-orange-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${sidedness === 'single' ? 'text-orange-700' : 'text-gray-800'}`}>
                Single-Sided
              </p>
              {sidedness === 'single' && <CheckCircle className="h-4 w-4 text-orange-600" aria-hidden="true" />}
            </div>
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
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${sidedness === 'double' ? 'text-orange-700' : 'text-gray-800'}`}>
                Double-Sided
              </p>
              {sidedness === 'double' && <CheckCircle className="h-4 w-4 text-orange-600" aria-hidden="true" />}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{usd(YARD_SIGN_DOUBLE_SIDED_CENTS / 100)}/sign</p>
          </button>
        </div>
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#18448D]" aria-hidden="true" />
          <span>
            <strong className="text-slate-800">{sidedness === 'single' ? 'Single-sided' : 'Double-sided'} printing is selected{sidedness === 'single' ? ' by default' : ''}.</strong>{' '}
            Leave it as-is or choose the other print style.
          </span>
        </p>
      </ConfigCard>

      {/* Step 3 — Add Designs (upload + per-design quantity) */}
      <ConfigCard step={3} title="Add Designs" id="yard-upload-section" headerRight={<span className="text-xs font-normal text-gray-400">Up to {YARD_SIGN_MAX_DESIGNS} designs per order</span>}>
        <p className="text-xs text-gray-500 mb-2">
          Upload up to {YARD_SIGN_MAX_DESIGNS} designs. Each will be printed at 24&quot; × 18&quot;. Assign a quantity to each design.
        </p>
        <div className="mt-4 mb-4 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" aria-hidden="true" />
            <div className="border-l-2 border-amber-400/90 pl-3">
              <p className="text-base sm:text-lg font-extrabold text-amber-900 leading-tight tracking-tight">
                Minimum order: {YARD_SIGN_MIN_QUANTITY} signs
              </p>
              <p className="mt-1 text-sm sm:text-[0.95rem] font-medium text-amber-800/95 leading-snug">
                Quantities must be ordered in increments of {YARD_SIGN_INCREMENT}.
              </p>
            </div>
          </div>
        </div>

        {/* Design rows */}
        {designs.length > 0 && (
          <div className="space-y-3 mb-4 max-w-full overflow-hidden">
            {designs.map((design, idx) => (
              <div key={design.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 max-w-full overflow-hidden">
                {/* Thumbnail — fixed size, click to preview */}
                <button
                  onClick={() => openPreview(design.id)}
                  className="w-14 aspect-[24/18] min-w-[3.5rem] max-w-[3.5rem] rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-200 relative group cursor-pointer"
                  aria-label={`Preview ${design.fileName}`}
                >
                  <StablePreviewImage
                    sources={getRowThumbnailSources(design)}
                    alt={`${design.fileName} thumbnail`}
                    className="absolute inset-0 block h-full w-full object-contain"
                    retainPreviousWhileLoading
                    loadTimeoutMs={25_000}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
                {/* File info — constrained width, truncated text */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium text-gray-800 truncate max-w-full">{design.fileName}</p>
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

            {/* Running total — anchor target for "Assign Quantities" / "Fix Quantity" sticky CTA. */}
            <div id="yard-quantity-section" className={`scroll-mt-32 flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
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
          <>
            <FileUploader
              onUpload={handleFileUpload}
              acceptedTypes="image/png,image/jpeg,.pdf"
              maxSize={50 * 1024 * 1024}
              label={designs.length === 0 ? 'Upload your artwork' : 'Add another design'}
              subText="PNG, JPG, or PDF • Max 50MB"
              isUploading={isUploading}
            />
            <div className="mt-3 flex justify-center">
              {ENABLE_AI && showCreateWithAI && (
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold shadow-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Create with AI
                </button>
              )}
            </div>
          </>
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
      </ConfigCard>

      {/* Step 4 — Add Stakes (optional). Renamed from "Finishing options" so
          the mobile sticky CTA can ask the user to review this step before
          Add to Cart. */}
      <ConfigCard step={4} title="Add Stakes" id="yard-finishing-section">
        <p className="text-xs text-gray-500 mb-3">Optional wire H-stakes for ground mounting.</p>
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
      </ConfigCard>

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
                <Move className="w-4 h-4" /> Drag to reposition · Drag corners to resize · Pinch to scale
              </p>
              <div className="rounded-lg p-4" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
                {/* Width wrapper — constrains max-width so padding-bottom produces correct height (cross-browser safe, fixes Safari aspect-ratio bug) */}
                <div className="mx-auto" style={{ width: '100%', maxWidth: `${Math.round(400 * (24 / 18))}px` }}>
                  <ArtworkPreviewEditor
                    ref={previewEditorRef}
                    compositionKey={`yard-sign|${previewDesign.id}|${YARD_SIGN_WIDTH_IN}x${YARD_SIGN_HEIGHT_IN}`}
                    src={getPreviewModalSrc(previewDesign)}
                    alt="Yard Sign preview"
                    paddingPct={`${(18 / 24) * 100}%`}
                    containerRef={previewCanvasRef}
                    mobileToolbarContainer={mobileToolbarEl}
                    value={{ x: previewImgPos.x, y: previewImgPos.y, scaleX: previewImgScale, scaleY: previewImgScaleY }}
                    onChange={(v: ArtworkTransform) => {
                      setPreviewImgPos({ x: v.x, y: v.y });
                      setPreviewImgScale(v.scaleX);
                      setPreviewImgScaleY(v.scaleY);
                    }}
                    constrain={previewConstrain}
                    onConstrainChange={setPreviewConstrain}
                    compactControls
                    imageCrossOrigin="anonymous"
                    canvasStyle={{
                      backgroundColor: '#fafafa',
                      borderRadius: 2,
                      border: '1px solid #e2e5ea',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.6)',
                    }}
                    overlay={
                      /* Safe zone border indicator */
                      <div className="absolute inset-1 border border-dashed border-gray-300/50 rounded-sm pointer-events-none" />
                    }
                  />
                </div>
              </div>
              {/* Toolbar slot — Fit/Fill/Reset/Locked render here BELOW
                  the canvas on every screen size via portal so they do
                  not cover the printable yard sign artwork. */}
              <div
                ref={setMobileToolbarEl}
                className="mt-2"
                data-mobile-artwork-toolbar="yard-sign"
              />
              <p className="text-xs text-gray-400 text-center mt-2 truncate max-w-full px-4">
                Size: 24&quot; × 18&quot; · Corrugated Plastic · {previewDesign.fileName}
              </p>
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">Your design will be printed based on this preview</p>
              {previewSaveError ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
                  {previewSaveError}
                </p>
              ) : null}
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={closePreview} disabled={isSavingPreview} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={async () => {
                const id = previewDesignId;
                const saved = await savePreviewAndClose();
                if (saved && id) {
                  logUx('preview_done', { source: 'yard_sign_preview', designId: id });
                  onPreviewDone?.(id);
                }
              }} disabled={isSavingPreview} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg disabled:opacity-70 flex items-center justify-center gap-2">
                {isSavingPreview ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ENABLE_AI && showCreateWithAI && (
        <CreateWithAIModal
          open={aiModalOpen}
          onOpenChange={setAiModalOpen}
          productType="yard_sign"
          widthIn={YARD_SIGN_WIDTH_IN}
          heightIn={YARD_SIGN_HEIGHT_IN}
          material="corrugated_plastic"
          materialLabel="Corrugated Plastic"
          onGenerated={async (result: CreateWithAIResult) => {
            const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
            await handleFileUpload(file);
          }}
        />
      )}
    </div>
  );
};

export default YardSignConfigurator;
