/**
 * Yard Sign Configurator (v2)
 * 
 * Clean, simplified yard sign ordering flow:
 * - Predefined corrugated-plastic sizes and whole-sheet quantities
 * - Sidedness: Single ($12) or Double ($14)
 * - Multi-design upload (up to 10 designs, per-design quantities)
 * - Optional step stakes ($1.50 each)
 * - Size-dependent order limits
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
import React, { forwardRef, useState, useRef, useCallback, useEffect, useLayoutEffect, useImperativeHandle } from 'react';
import { X, Plus, Minus, Loader2, AlertTriangle, CheckCircle, Move, Eye, Sparkles } from 'lucide-react';
import {
  type YardSignSidedness,
  type YardSignDesign,
  YARD_SIGN_MAX_DESIGNS,
  distributeYardSignCopies,
  yardSignQuantityRule,
  assignYardSignCopies,
  validateYardSignQuantity,
} from '@/lib/yard-sign-pricing';
import { DEFAULT_YARD_SIGN_SIZE, YARD_SIGN_SIZES, yardSignArtworkStep, yardSignOrientation, type YardSignSize } from '@/lib/yardSignSizes';
import { usd } from '@/lib/pricing';
import {
  buildCloudinaryPdfPreviewUrl,
  isPdfArtwork,
  uploadArtworkFile,
  MAX_ARTWORK_BYTES,
  getArtworkUploadMessage,
  prepareArtworkFile,
} from '@/utils/uploadArtworkFile';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import FileUploader, { type FileUploaderHandle } from '@/components/ui/FileUploader';
import CreateWithAIModal, { type CreateWithAIResult } from '@/components/design/CreateWithAIModal';
import AIArtworkFitDialog, { ArtworkFitButton } from './AIArtworkFitDialog';
import { artworkFitIdentity } from './ai/artworkFit';
import { applyYardSignFit, yardSignFitArtwork } from './ai/yardSignArtworkFit';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import type { NormalizedArtworkTransform } from '@/lib/previewLifecycle';
import { ENABLE_AI } from '@/lib/featureFlags';
import { base64ToFile } from '@/utils/base64ToFile';
import { requireSavedAIArtwork } from '@/lib/aiArtworkTransfer';
import ArtworkPreviewEditor, {
  type ArtworkPreviewEditorHandle,
  type ArtworkTransform,
} from '@/components/design/ArtworkPreviewEditor';
import ConfigCard from '@/components/design/layout/ConfigCard';
import YardSignStakeOptions from './YardSignStakeOptions';
import QuantityStepper from './QuantityStepper';
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
  if (design.fileUrl.includes('/artwork-original/')) return design.thumbnailUrl || design.fileUrl;
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
  size?: YardSignSize;
  onSizeChange?: (size: YardSignSize) => void;
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
  orderQuantity: number;
  onOrderQuantityChange: (quantity: number) => void;
  orderTotalCents: number;
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

export interface YardSignConfiguratorHandle {
  openFilePicker: () => boolean;
}

const YardSignConfigurator = forwardRef<YardSignConfiguratorHandle, YardSignConfiguratorProps>(({
  size = DEFAULT_YARD_SIGN_SIZE,
  onSizeChange,
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
  orderQuantity,
  onOrderQuantityChange,
  orderTotalCents,
  onUploadStatusChange,
  onPreviewDone,
  previewOpenTrigger,
  showCreateWithAI = false,
}, ref) => {
  // Each size owns its editor session. Discard work returned after that session closes.
  const activeSession = useRef(false);
  useLayoutEffect(() => {
    activeSession.current = true;
    return () => { activeSession.current = false; };
  }, []);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [fitDesignId, setFitDesignId] = useState<string | null>(null);
  const designsRef = useRef(designs); designsRef.current = designs;
  const orderQuantityRef = useRef(orderQuantity); orderQuantityRef.current = orderQuantity;
  const [fitUndo, setFitUndo] = useState<Record<string, { original: YardSignDesign; appliedFileKey: string; normalized: NormalizedArtworkTransform | null }>>({});
  const [restoredFitTransform, setRestoredFitTransform] = useState<NormalizedArtworkTransform | null>(null);
  const fitDesign = designs.find(design => design.id === fitDesignId);
  const fitArtwork = fitDesign ? yardSignFitArtwork(fitDesign) : null;
  const fileUploaderRef = useRef<FileUploaderHandle>(null);

  useImperativeHandle(ref, () => ({
    openFilePicker: () => fileUploaderRef.current?.openFilePicker() ?? false,
  }), []);

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

  const artworkStep = yardSignArtworkStep(size);
  const maxDesigns = Math.min(YARD_SIGN_MAX_DESIGNS, size.maxQuantity / artworkStep);
  const minForDesigns = Math.max(size.perSheet, designs.length * artworkStep);
  const quantityValidation = validateYardSignQuantity(orderQuantity, size);
  const canAddMoreDesigns = designs.length < maxDesigns && (designs.length + 1) * artworkStep <= orderQuantity;

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
    setRestoredFitTransform(null);
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

  const applyFittedArtwork = (artwork: UploadedArtworkFile, expectedIdentity: string) => {
    const current = designsRef.current.find(design => design.id === fitDesignId);
    if (!activeSession.current || !current || expectedIdentity !== artworkFitIdentity(yardSignFitArtwork(current), size.widthIn, size.heightIn, 'yard_sign')) {
      throw new Error('This design changed or was removed. Reopen AI fit for your current design.');
    }
    const previous = fitUndo[current.id];
    let normalized: NormalizedArtworkTransform | null = null;
    try { normalized = previewEditorRef.current?.getCompositionSnapshot().transform || null; } catch { /* Retain pixel placement below. */ }
    const original = previous?.appliedFileKey === current.fileKey ? previous.original : {
      ...current, imgPos: previewImgPos, imgScale: previewImgScale, imgScaleY: previewImgScaleY,
      imgConstrain: previewConstrain, previewThumbnailUrl: undefined, placementPreview: undefined,
    };
    setFitUndo(value => ({ ...value, [current.id]: {
      original, appliedFileKey: artwork.fileKey,
      normalized: previous?.appliedFileKey === current.fileKey ? previous.normalized : normalized,
    } }));
    const updated = designsRef.current.map(design => design.id === current.id ? applyYardSignFit(design, artwork) : design);
    designsRef.current = updated; onDesignsChange(updated);
    setPreviewImgPos({ x: 0, y: 0 }); setPreviewImgScale(1); setPreviewImgScaleY(1); setPreviewConstrain(true);
    setRestoredFitTransform(null); setPreviewSaveError(null);
  };

  const restoreArtworkBeforeFit = () => {
    const current = designsRef.current.find(design => design.id === previewDesignId);
    const undo = current && fitUndo[current.id];
    if (!current || !undo || undo.appliedFileKey !== current.fileKey) return;
    // Quantity may have changed since fitting; restore only artwork and placement.
    const restored = { ...undo.original, quantity: current.quantity };
    const updated = designsRef.current.map(design => design.id === current.id ? restored : design);
    designsRef.current = updated; onDesignsChange(updated);
    setPreviewImgPos(restored.imgPos || { x: 0, y: 0 }); setPreviewImgScale(restored.imgScale ?? 1);
    setPreviewImgScaleY(restored.imgScaleY ?? restored.imgScale ?? 1); setPreviewConstrain(restored.imgConstrain ?? true);
    setRestoredFitTransform(undo.normalized); setPreviewSaveError(null);
    setFitUndo(value => { const next = { ...value }; delete next[current.id]; return next; });
  };

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
          widthIn: size.widthIn,
          heightIn: size.heightIn,
          fitMode: 'fit',
          transform: snapshot.transform,
          revision: snapshot.revision,
        };
        const artifact = await createPermanentPlacementPreview(spec);
        if (!activeSession.current) return false;
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

        onDesignsChange(designsRef.current.map((design) => design.id === previewDesignId ? {
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
  }, [previewDesignId, previewConstrain, designs, onDesignsChange, size]);

  const closePreview = useCallback(() => {
    setPreviewDesignId(null);
  }, []);

  // (Drag/zoom handlers were removed — ArtworkPreviewEditor now owns the
  // pointer/touch interactions, including pinch-to-scale, drag, and
  // corner-handle resize.)

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    if (!canAddMoreDesigns) {
      setUploadError(`Maximum ${maxDesigns} designs per order.`);
      return;
    }
    setIsUploading(true);
    try {
      file = await prepareArtworkFile(file);
      const result = await uploadArtworkFile(file, {
        correlationId: `yard-sign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      if (!activeSession.current) return;
      const isPdf = isPdfArtwork(file);
      const thumbnailUrl = result.previewUrl || result.secureUrl;
      // The customer can change quantity or artwork while the file is uploading.
      const current = designsRef.current;
      if (current.length >= maxDesigns || (current.length + 1) * artworkStep > orderQuantityRef.current) {
        setUploadError(`Maximum ${maxDesigns} designs per order.`);
        return;
      }
      const newDesign: YardSignDesign = {
        id: createStableCartItemId('yard-design'),
        fileName: file.name,
        fileUrl: result.secureUrl,
        fileKey: result.fileKey,
        thumbnailUrl,
        isPdf,
        quantity: current.length ? 0 : orderQuantityRef.current,
        imgScale: 1,
        imgPos: { x: 0, y: 0 },
      };
      const next = current.length
        ? assignYardSignCopies([...current, newDesign], newDesign.id, artworkStep, artworkStep)
        : [newDesign];
      designsRef.current = next;
      onDesignsChange(next);
      setPreviewDesignId(newDesign.id);
      logUx('preview_opened', { source: 'yard_sign_after_upload', designId: newDesign.id });
      setPreviewImgPos({ x: 0, y: 0 });
      setPreviewImgScale(1);
      setUploadError('');
      return next[next.length - 1];
    } catch (error) {
      console.error('[YardSign] original upload failed', error);
      setUploadError(getArtworkUploadMessage(error));
      logUx('upload_error', {
        source: 'yard_sign',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsUploading(false);
    }
  }, [canAddMoreDesigns, onDesignsChange, artworkStep, maxDesigns]);

  const removeDesign = useCallback((id: string) => {
    const remaining = designs.filter(design => design.id !== id);
    const removed = designs.find(design => design.id === id);
    if (remaining.length && removed) {
      remaining[0] = { ...remaining[0], quantity: remaining[0].quantity + removed.quantity };
    }
    onDesignsChange(remaining);
  }, [designs, onDesignsChange]);

  function changeOrderQuantity(next: number) {
    if (next === orderQuantity || next < minForDesigns || !validateYardSignQuantity(next, size).valid) return;
    onOrderQuantityChange(next);
    if (designs.length) onDesignsChange(distributeYardSignCopies(designs, next, artworkStep));
  }

  function changeSize(next: YardSignSize) {
    if (!onSizeChange || next.id === size.id) return;
    const step = yardSignArtworkStep(next);
    const requested = orderQuantity === size.perSheet ? next.perSheet : orderQuantity;
    const nextQuantity = Math.min(next.maxQuantity, Math.max(next.perSheet, designs.length * step, Math.ceil(requested / next.perSheet) * next.perSheet));
    const originals = designs.map(design => {
      const undo = fitUndo[design.id];
      const original = undo?.appliedFileKey === design.fileKey ? undo.original : design;
      return { ...original, imgPos: { x: 0, y: 0 }, imgScale: 1, imgScaleY: 1, imgConstrain: true,
        previewThumbnailUrl: undefined, placementPreview: undefined };
    });
    onDesignsChange(distributeYardSignCopies(originals, nextQuantity, step));
    if (addStepStakes) onStepStakeQuantityChange(stepStakeQuantity === orderQuantity ? nextQuantity : Math.min(stepStakeQuantity, nextQuantity));
    onOrderQuantityChange(nextQuantity);
    onSizeChange(next);
  }

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <ConfigCard step={1} title="Yard Sign Size" id="yard-size-section">
        <label htmlFor="yard-sign-size" className="mb-2 block text-sm font-semibold text-slate-700">Finished sign size</label>
        <select id="yard-sign-size" value={size.id} disabled={isUploading || isSavingPreview}
          onChange={event => { const next = YARD_SIGN_SIZES.find(option => option.id === event.target.value); if (next) changeSize(next); }}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-800 focus:border-orange-500">
          {YARD_SIGN_SIZES.map(option => <option key={option.id} value={option.id} disabled={designs.length * yardSignArtworkStep(option) > option.maxQuantity}>
            {option.label} · {yardSignOrientation(option)}
          </option>)}
        </select>
        <p className="mt-2 text-xs text-slate-600">Corrugated plastic · {size.widthIn}″ wide × {size.heightIn}″ high</p>
        {designs.length > 9 && <p className="mt-1 text-xs text-slate-600">The other sizes fit up to nine different designs per order.</p>}
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
            <p className="text-xs text-gray-500 mt-0.5">{usd(size.singleCents / 100)}/sign</p>
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
            <p className="text-xs text-gray-500 mt-0.5">{usd(size.doubleCents / 100)}/sign</p>
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

      <ConfigCard step={3} title="Quantity" id="yard-quantity-section">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <QuantityStepper min={minForDesigns} max={size.maxQuantity}
            step={size.perSheet} value={orderQuantity} onChange={changeOrderQuantity} />
          <div aria-live="polite" className="min-w-0">
            <p className="text-xs font-semibold text-slate-600">Order total before tax</p>
            <strong data-yard-order-total className="text-2xl font-bold text-slate-900">{usd(orderTotalCents / 100)}</strong>
            <span className="ml-2 text-sm text-slate-600">for {orderQuantity} signs</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Choose {size.perSheet}–{size.maxQuantity} signs in increments of {size.perSheet}.
        </p>
        <div role="group" aria-label="Quick sign quantities" className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: (size.maxQuantity - size.perSheet) / size.perSheet + 1 },
            (_, index) => size.perSheet + index * size.perSheet).map(qty => (
            <button key={qty} type="button" aria-pressed={orderQuantity === qty} disabled={qty < minForDesigns} onClick={() => changeOrderQuantity(qty)}
              className={`min-h-10 min-w-11 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${orderQuantity === qty
                ? 'border-orange-500 bg-orange-500 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-orange-400'}`}>
              {qty}
            </button>
          ))}
        </div>
        {!quantityValidation.valid && <p role="alert" className="mt-2 text-sm text-red-700">{quantityValidation.message}</p>}
      </ConfigCard>

      <ConfigCard step={4} title="Upload your artwork" id="yard-upload-section" headerRight={<span className="text-xs font-normal text-gray-500">Up to {maxDesigns} designs</span>}>
        <p className="mb-3 text-sm text-slate-600">
          {artworkStep === 1 ? `Your ${orderQuantity} signs can share one design or be split across multiple designs.` : `Each artwork takes a full sheet of ${artworkStep} signs. Choose another sheet to add another design.`}
          {designs.length > 1 && ' Adjust copies below. Changing the order quantity splits it evenly across your designs.'}
        </p>

        {/* Design rows */}
        {designs.length > 0 && (
          <div className="space-y-3 mb-4 max-w-full overflow-hidden">
            {designs.map((design, idx) => (
              <div key={design.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 max-w-full overflow-hidden">
                {/* Thumbnail — fixed size, click to preview */}
                <button
                  onClick={() => openPreview(design.id)}
                  style={{ aspectRatio: size.widthIn / size.heightIn }}
                  className="w-14 min-w-[3.5rem] max-w-[3.5rem] rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-200 relative group cursor-pointer"
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
                {designs.length === 1 ? (
                  <span className="text-sm font-semibold text-slate-700">{orderQuantity} signs</span>
                ) : (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      disabled={design.quantity <= artworkStep}
                      onClick={() => onDesignsChange(assignYardSignCopies(designs, design.id, design.quantity - artworkStep, artworkStep))}
                      className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                      aria-label={`Decrease copies of ${design.fileName}`}
                    >
                      <Minus className="h-3 w-3 text-gray-600" />
                    </button>
                    <input
                      type="number"
                      min={artworkStep} step={artworkStep}
                      max={orderQuantity - (designs.length - 1) * artworkStep}
                      aria-label={`Copies of ${design.fileName}`}
                      value={design.quantity}
                      onChange={e => onDesignsChange(assignYardSignCopies(designs, design.id, Number(e.target.value), artworkStep))}
                      className="w-14 border rounded-lg px-2 py-1 text-sm text-center"
                    />
                    <button
                      disabled={design.quantity >= orderQuantity - (designs.length - 1) * artworkStep}
                      onClick={() => onDesignsChange(assignYardSignCopies(designs, design.id, design.quantity + artworkStep, artworkStep))}
                      className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                      aria-label={`Increase copies of ${design.fileName}`}
                    >
                      <Plus className="h-3 w-3 text-gray-600" />
                    </button>
                  </div>
                )}
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
          </div>
        )}

        {/* Upload dropzone */}
        {canAddMoreDesigns && (
          <>
            <FileUploader
              ref={fileUploaderRef}
              onUpload={handleFileUpload}
              acceptedTypes="image/png,image/jpeg,.pdf"
              maxSize={MAX_ARTWORK_BYTES}
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
      </ConfigCard>

      <YardSignStakeOptions
        size={size}
        totalQuantity={orderQuantity}
        enabled={addStepStakes}
        quantity={stepStakeQuantity}
        onEnabledChange={onStepStakesChange}
        onQuantityChange={onStepStakeQuantityChange}
        restorationKey={autoOpenDesignId}
      />

      {/* Helper text */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1.5">
        <p className="text-xs text-blue-700 font-medium">📋 Order Guidelines</p>
        <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
          <li>Selected yard sign size: {size.label}</li>
          <li>Upload up to {maxDesigns} different designs per order</li>
          <li>Assign a quantity to each uploaded design</li>
          <li className="font-semibold">{yardSignQuantityRule(size)}</li>
          <li>Maximum {size.maxQuantity} signs per order for 24-hour production</li>
          <li>Need more than {size.maxQuantity}? Place a second order.</li>
        </ul>
      </div>

      {/* Yard Sign Preview Modal */}
      {previewDesign && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Yard Sign Preview</h3>
                <p className="text-xs text-gray-400">{size.label} Corrugated Plastic — What you see is what you get</p>
              </div>
              <button onClick={closePreview} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                <Move className="w-4 h-4" /> Drag to reposition · Drag corners to resize · Pinch to scale
              </p>
              <div className="rounded-lg p-4 pt-24" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
                {/* Width wrapper — constrains max-width so padding-bottom produces correct height (cross-browser safe, fixes Safari aspect-ratio bug) */}
                <div className="mx-auto" style={{ width: '100%', maxWidth: `${Math.round(400 * (size.widthIn / size.heightIn))}px` }}>
                  <ArtworkPreviewEditor
                    enableCropping={false}
                    key={`${previewDesign.id}|${previewDesign.fileKey}`}
                    ref={previewEditorRef}
                    initialNormalizedTransform={restoredFitTransform}
                    compositionKey={`yard-sign|${previewDesign.id}|${previewDesign.fileKey}|${size.widthIn}x${size.heightIn}`}
                    src={getPreviewModalSrc(previewDesign)}
                    alt="Yard Sign preview"
                    paddingPct={`${(size.heightIn / size.widthIn) * 100}%`}
                    containerRef={previewCanvasRef}
                    mobileToolbarContainer={mobileToolbarEl}
                    fitAssistance={{
                      enabled: ENABLE_AI && !isUploading && !isSavingPreview && !aiModalOpen && Boolean(previewDesign.fileKey),
                      fitDialogOpen: Boolean(fitDesign),
                      onFit: () => setFitDesignId(previewDesign.id),
                      widthIn: size.widthIn, heightIn: size.heightIn, productLabel: 'yard sign',
                    }}
                    fitControls={ENABLE_AI ? <ArtworkFitButton
                      onClick={() => setFitDesignId(previewDesign.id)}
                      disabled={isUploading || isSavingPreview}
                      onRestore={fitUndo[previewDesign.id]?.appliedFileKey === previewDesign.fileKey ? restoreArtworkBeforeFit : undefined}
                    /> : undefined}
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
                Size: {size.label} · Corrugated Plastic · {previewDesign.fileName}
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

      <AIArtworkFitDialog
        open={ENABLE_AI && Boolean(fitDesign)} onOpenChange={open => { if (!open) setFitDesignId(null); }}
        artwork={fitArtwork} productType="yard_sign" widthIn={size.widthIn} heightIn={size.heightIn}
        onApply={applyFittedArtwork}
      />

      {ENABLE_AI && showCreateWithAI && (
        <CreateWithAIModal
          open={aiModalOpen}
          onOpenChange={setAiModalOpen}
          productType="yard_sign"
          widthIn={size.widthIn}
          heightIn={size.heightIn}
          material="corrugated_plastic"
          materialLabel="Corrugated Plastic"
          onGenerated={async (result: CreateWithAIResult) => {
            const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
            requireSavedAIArtwork(await handleFileUpload(file));
          }}
        />
      )}
    </div>
  );
});

YardSignConfigurator.displayName = 'YardSignConfigurator';

export default YardSignConfigurator;
