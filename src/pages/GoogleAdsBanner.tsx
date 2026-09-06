import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Shield, Clock, CheckCircle, Truck, Users, FileCheck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock, Mail, Tag, Move, ZoomIn, ZoomOut, ShoppingCart, Ruler, Layers, Package, Sparkles, Monitor } from 'lucide-react';
import { useQuoteStore, type MaterialKey } from '@/store/quote';
import { useCartStore, type CartItem } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import { calcTotals, usd, PRICE_PER_SQFT } from '@/lib/pricing';
import { calculateBannerPricing, type RopePlacement } from '@/lib/bannerPricingEngine';
import { resolvePromo } from '@/lib/promoEngine';
import { SMALL_BANNER_PROMOTION_ID } from '@/lib/discount-resolver';
import { DESIGN_GROMMET_OPTIONS } from '@/lib/grommets';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import CartModal from '@/components/CartModal';

import { getQuantityDiscountRate } from '@/lib/quantity-discount';
import { generateFinalRenderFromHTML } from '@/utils/generateFinalRenderFromHTML';
import type { PdfPreviewResult } from '@/utils/pdf/renderPdfToDataUrl';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';

import type { ProductTypeSlug } from '@/lib/products';
import { getProductConfig, validateProductConfiguration } from '@/lib/products';
import YardSignConfigurator, { type YardSignConfiguratorHandle } from '@/components/design/YardSignConfigurator';
import YardSignPriceSummary from '@/components/design/YardSignPriceSummary';
import PriceBreakdown from '@/components/pricing/PriceBreakdown';
import SameDayHitServiceCard from '@/components/cart/SameDayHitServiceCard';
import DeliveryTimer from '@/components/delivery/DeliveryTimer';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import BannerDiscountOffer from '@/components/design/BannerDiscountOffer';
import MobileSubtotalBar from '@/components/design/MobileSubtotalBar';
import RealOrdersStrip from '@/components/design/RealOrdersStrip';
import FileUploader, { type FileUploaderHandle } from '@/components/ui/FileUploader';
import GrommetOverlay from '@/components/preview/GrommetOverlay';
import PreviewRulerFrame from '@/components/preview/PreviewRulerFrame';
import ArtworkPreviewEditor, { type ArtworkPreviewEditorHandle } from '@/components/design/ArtworkPreviewEditor';
import {
  calcYardSignPricing,
  getYardSignSizes,
  getYardSignMaterials,
  getYardSignQuantityDiscountRate,
  getTotalDesignQuantity,
  validateYardSignQuantity,
  type YardSignSidedness,
  type YardSignDesign,
  YARD_SIGN_WIDTH_IN,
  YARD_SIGN_HEIGHT_IN,
  YARD_SIGN_MAX_QUANTITY,
} from '@/lib/yard-sign-pricing';
import {
  CAR_MAGNET_SIZES,
  CAR_MAGNET_ROUNDED_CORNERS,
  calcCarMagnetPricing,
  getCarMagnetRoundedCornersLabel,
  type CarMagnetRoundedCorner,
} from '@/lib/car-magnet-pricing';
import { BANNER_MATERIALS as MATERIALS } from '@/lib/banner-materials';
import CreateWithAIModal, { type AIDesignSession, type CreateWithAIResult } from '@/components/design/CreateWithAIModal';
import EditWithAIModal from '@/components/design/EditWithAIModal';
import { useAIAdminAccess } from '@/hooks/useAIAdminAccess';
import { trackAIEvent } from '@/lib/aiAnalytics';
import { canUseAIAdminPreview } from '@/lib/aiAdminVisibility';
import { base64ToFile } from '@/utils/base64ToFile';
import {
  getArtworkUploadDiagnostic,
  uploadArtworkFile,
  validateArtworkFile,
} from '@/utils/uploadArtworkFile';
import { computeSameDayFeesCents } from '@/lib/sameDayService';
import ConfigCard from '@/components/design/layout/ConfigCard';
import TrustStrip from '@/components/design/layout/TrustStrip';
import FinishingOptionsCard, { type FinishingType } from '@/components/design/FinishingOptionsCard';
import {
  getNextStep,
  getProgress,
  getYardSignCtaState,
  getPostAddToCartCta,
  scrollToStepAnchor,
  STEP_ANCHOR_FOR,
  YARD_SIGN_ANCHORS,
  type BuilderStepKey,
} from '@/lib/builderSteps';
import { logUx } from '@/lib/uxAnalytics';
import { formatOptionValue, getDisplayPlacement } from '@/lib/product-display';
import type { ArtworkManifest } from '@/types/artwork';
import {
  PREVIEW_ARTIFACT_VERSION,
  PreviewLifecycleError,
  buildCompositionSignature,
  explainPreviewLifecycleError,
  isReadyPlacementPreview,
  toCheckoutTransform,
  type ArtworkCompositionSpec,
  type NormalizedArtworkTransform,
  type ReadyPlacementPreviewManifest,
} from '@/lib/previewLifecycle';
import { buildDesignerRecoveryFields } from '@/lib/abandonedCartCapture';
import { createPermanentPlacementPreview } from '@/lib/previewArtifactCoordinator';
import { trackViewItem } from '@/lib/analytics';
import { getProductLandingDefinition } from '@/lib/seo/productLandingData';
import { shouldAutoConfirmBannerSize } from '@/lib/bannerCheckoutReadiness';
import { buildArtworkCompositionKey } from '@/lib/artworkCompositionKey';
import { isPopularBannerPreset, POPULAR_BANNER_PRESET } from '@/lib/bannerDefaults';

type UploadedArtworkFile = {
  editorIdentity?: string;
  name: string;
  url: string;
  fileKey: string;
  size: number;
  isPdf: boolean;
  thumbnailUrl?: string;
  previewUrl?: string;
  productionUrl?: string;
  productionPublicId?: string;
  resourceType?: 'image' | 'raw' | string;
  mimeType?: string;
  originalFormat?: string;
  originalBytes?: number;
  originalWidth?: number | null;
  originalHeight?: number | null;
  pdfPageNumber?: number;
  artworkManifest?: ArtworkManifest;
};


const PRESET_SIZES = [
  { w: 48, h: 24 },
  { w: 72, h: 24 },
  { w: 72, h: 36 },
  { w: 96, h: 36 },
  { w: 96, h: 48 },
  { w: 120, h: 48 },
];

/**
 * Format a preset size label according to the user's selected display
 * unit. Pure UI helper â€” never affects pricing/cart/print.
 */
function formatPresetLabel(w: number, h: number, unit: 'in' | 'ft'): string {
  if (unit === 'ft') return `${w / 12}' Ã— ${h / 12}'`;
  return `${w}" Ã— ${h}"`;
}

const FastBannerAdHero: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <section data-google-ads-hero className="border-b border-slate-100 bg-white text-[#061A31]">
    <div className="mx-auto grid max-w-[1536px] gap-6 px-5 py-7 sm:px-8 sm:py-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-10 lg:px-10 lg:py-12">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF6A00] sm:text-sm">Custom vinyl banners</p>
        <h1 className="mt-3 font-sans text-[clamp(2.2rem,8.7vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.045em] lg:text-[clamp(2.5rem,4.25vw,4.5rem)]">
          <span className="block">Big impact.</span>
          <span className="block text-[#FF6A00]">Without the wait.</span>
        </h1>
        <p className="mt-5 text-base leading-relaxed text-[#243e5c] sm:text-xl">
          24-hour standard production.<br />Free next-day air after production.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#FF6A00] px-4 py-4 text-base font-bold text-[#061A31] transition-colors hover:bg-[#FF6A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#061A31] focus-visible:ring-offset-4 sm:max-w-[505px] sm:text-lg"
        >
          Build &amp; price my banner <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm">Upload your artwork Â· See your price Â· Preview instantly</p>
        <BannerDiscountOffer variant="light" className="mt-6 w-full" />
        <HeroDeliveryStatus variant="light" className="mt-6 w-full" />
      </div>
      <figure className="min-w-0">
        <picture>
          <source type="image/avif" srcSet="/images/google-ads/light-hero-640.avif 640w, /images/google-ads/light-hero-1200.avif 1200w" sizes="(min-width: 1536px) 760px, (min-width: 1024px) 52vw, 100vw" />
          <img
            src="/images/google-ads/light-hero-1200.webp"
            srcSet="/images/google-ads/light-hero-640.webp 640w, /images/google-ads/light-hero-1200.webp 1200w"
            sizes="(min-width: 1536px) 760px, (min-width: 1024px) 52vw, 100vw"
            alt="Cream and orange grand opening vinyl banner mounted with grommets outside a sunny coffee shop"
            width="1200" height="900" loading="eager" decoding="async" fetchPriority="high"
            className="aspect-[4/3] w-full rounded-xl object-cover"
          />
        </picture>
        <figcaption className="mt-2 text-center text-xs text-slate-600">Your artwork. Printed big. Ready to hang.</figcaption>
      </figure>
    </div>
  </section>
);


// Convert Cloudinary PDF URL to an image thumbnail (renders page 1)
function getPdfThumbnailUrl(pdfUrl: string): string {
  if (!pdfUrl || !pdfUrl.includes('cloudinary.com') || !pdfUrl.toLowerCase().endsWith('.pdf')) return pdfUrl;
  return pdfUrl.replace('/upload/', '/upload/pg_1,f_jpg,w_800/');
}

// Build a downscaled, format/quality-optimized Cloudinary URL for the live
// preview surface. The original full-resolution Cloudinary URL is preserved on
// the cart/order item for print/admin export â€” only the on-screen preview uses
// this transformed variant. This avoids decoding 10â€“50MB images in the browser
// (which causes Chrome to hang and Safari to lay out the page incorrectly).
function getImagePreviewUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  let host = '';
  try {
    host = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    return imageUrl;
  }
  if (host !== 'res.cloudinary.com' && !host.endsWith('.res.cloudinary.com')) return imageUrl;
  if (!imageUrl.includes('/upload/')) return imageUrl;
  if (/\/upload\/[a-z]_[^/]+\//.test(imageUrl)) return imageUrl;
  return imageUrl.replace('/upload/', '/upload/f_auto,q_auto:good,w_1600,c_limit/');
}
function hasPermanentArtwork(file: UploadedArtworkFile | null | undefined): file is UploadedArtworkFile {
  return Boolean(
    file
    && (file.productionUrl || (/^https?:\/\//i.test(file.url || '') ? file.url : null))
    && (file.productionPublicId || file.fileKey),
  );
}

function preloadPermanentArtwork(url: string, timeoutMs = 20_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const image = new Image();
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(Boolean(image.naturalWidth && image.naturalHeight));
    image.onerror = () => finish(false);
    image.src = url;
  });
}

function buildCartArtworkForEditor(item: CartItem): UploadedArtworkFile | null {
  const manifest = item.artwork_manifest;
  const originalUrl = manifest?.originalUrl
    || item.placement_preview?.sourceUrl
    || item.file_url
    || '';
  if (!originalUrl) return null;
  const isPdf = Boolean(item.is_pdf || manifest?.mimeType === 'application/pdf');
  const publicId = manifest?.publicId
    || item.file_key
    || String(item.placement_preview?.sourceIdentity || '').split('@')[0]
    || '';
  const browserPreviewUrl = isPdf
    ? getPdfThumbnailUrl(originalUrl)
    : getImagePreviewUrl(originalUrl);
  return {
    editorIdentity: [
      'cart-source',
      publicId || item.id,
      manifest?.version ?? '',
      item.placement_preview?.compositionRevision ?? item.composition_revision ?? '',
    ].join('@'),
    name: item.file_name || manifest?.originalFilename || 'artwork',
    url: originalUrl,
    fileKey: publicId,
    size: Number(manifest?.bytes || 0),
    isPdf,
    thumbnailUrl: browserPreviewUrl,
    previewUrl: browserPreviewUrl,
    productionUrl: originalUrl,
    productionPublicId: publicId,
    resourceType: manifest?.resourceType || 'image',
    mimeType: manifest?.mimeType || (isPdf ? 'application/pdf' : undefined),
    originalFormat: manifest?.format,
    originalBytes: manifest?.bytes,
    originalWidth: manifest?.width ?? null,
    originalHeight: manifest?.height ?? null,
    pdfPageNumber: isPdf ? 1 : undefined,
    artworkManifest: manifest || undefined,
  };
}

const GoogleAdsBanner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const getProductQuerySlug = useCallback((type: ProductTypeSlug) => {
    if (type === 'yard_sign') return 'yard-signs';
    if (type === 'car_magnet') return 'car-magnets';
    return 'banner';
  }, []);
  const orderRef = useRef<HTMLDivElement>(null);
  const builderStartRef = useRef<HTMLHeadingElement>(null);
  const yardSignConfiguratorRef = useRef<YardSignConfiguratorHandle>(null);
  const [hasEnteredBuilder, setHasEnteredBuilder] = useState(false);
  const [isBuilderInView, setIsBuilderInView] = useState(false);

  // Admin detection for yard signs visibility
  const { user } = useAuth();
  const aiAccess = useAIAdminAccess(Boolean(user));
  const showCreateWithAI = canUseAIAdminPreview(user);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[AI_VISIBILITY][GoogleAdsBanner]', {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      isAdmin: aiAccess.authorized,
      shouldRenderCreateWithAI: showCreateWithAI,
    });
  }, [user?.id, user?.email, aiAccess.authorized, showCreateWithAI]);

  // Product type state â€” public for both banners and yard signs
  // Read ?tab= (preferred) or ?product= (legacy) query param so "Add Another Yard Sign" links open the correct tab
  const initialProductType = (() => {
    const tab = searchParams.get('tab');
    const product = searchParams.get('product');
    const param = tab || product;
    if (param === 'yard-sign' || param === 'yard_sign' || param === 'yard-signs') return 'yard_sign' as ProductTypeSlug;
    if (param === 'car-magnet' || param === 'car-magnets' || param === 'car_magnet' || param === 'car_magnets') return 'car_magnet' as ProductTypeSlug;
    return 'banner' as ProductTypeSlug;
  })();
  const [productType, setProductType] = useState<ProductTypeSlug>(initialProductType);
  const isYardSign = productType === 'yard_sign';
  const isCarMagnet = productType === 'car_magnet';

  useEffect(() => {
    const slug = productType === 'yard_sign'
      ? 'yard-signs'
      : productType === 'car_magnet'
        ? 'car-magnets'
        : 'vinyl-banners';
    const product = getProductLandingDefinition(slug)!;
    trackViewItem({
      id: product.slug,
      name: product.plural,
      category: 'Google Ads product configurator',
      variant: productType,
      price: product.startingPriceCents,
    });
  }, [productType]);

  // Yard sign specific state (v2: simplified single-size, multi-design)
  const [yardSignDesigns, setYardSignDesigns] = useState<YardSignDesign[]>([]);
  const [yardSignSidedness, setYardSignSidedness] = useState<YardSignSidedness>('single');
  const [yardSignAddStepStakes, setYardSignAddStepStakes] = useState(false);
  const [yardSignStepStakeQty, setYardSignStepStakeQty] = useState(1);
  const [yardSignMaterial] = useState('corrugated');
  const [carMagnetSizeLabel, setCarMagnetSizeLabel] = useState(CAR_MAGNET_SIZES[0].label);
  const [carMagnetRoundedCorners, setCarMagnetRoundedCorners] = useState<CarMagnetRoundedCorner>('none');
  // Auto-open first design preview when editing yard sign from cart
  const [autoOpenDesignId, setAutoOpenDesignId] = useState<string | null>(null);

  // Use string state for dimension inputs so users can clear and retype freely
  const [widthFtStr, setWidthFtStr] = useState('6');
  const [widthInRStr, setWidthInRStr] = useState('0');
  const [heightFtStr, setHeightFtStr] = useState('3');
  const [heightInRStr, setHeightInRStr] = useState('0');
  // Raw string state for the inches-mode "Custom Size" inputs. See Design.tsx
  // for rationale: keeps user keystrokes literal so "3" never becomes "03".
  const [widthCustomInStr, setWidthCustomInStr] = useState('72');
  const [heightCustomInStr, setHeightCustomInStr] = useState('36');
  // Derived numeric values for calculations (treat empty as 0)
  const widthFt = parseInt(widthFtStr, 10) || 0;
  const widthInR = parseInt(widthInRStr, 10) || 0;
  const heightFt = parseInt(heightFtStr, 10) || 0;
  const heightInR = parseInt(heightInRStr, 10) || 0;
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement>(null);
  const [grommets, setGrommets] = useState('none');
  const [polePockets, setPolePockets] = useState('none');
  const [polePocketSize, setPolePocketSize] = useState('2');
  // Display unit for size inputs and the live preview ruler. Single source
  // of truth â€” both the Feet/Inches toggle and PreviewRulerFrame read this
  // state, so switching units updates the visible ruler immediately. Pure
  // UI state â€” does NOT affect pricing, cart, or print pipeline.
  // Initialise from localStorage so the user's previous choice survives a
  // hard refresh; fall back to 'ft' when no stored value exists (first load).
  const [unit, setUnit] = useState<'in' | 'ft'>(
    () => (localStorage.getItem('banner-unit-pref') as 'in' | 'ft' | null) ?? 'ft'
  );
  const [addRope, setAddRope] = useState(false);
  const [finishingType, setFinishingType] = useState<FinishingType>('none');
  const [ropePlacement, setRopePlacement] = useState<RopePlacement>('top');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedArtworkFile | null>(null);
  const fileUploaderRef = useRef<FileUploaderHandle>(null);
  const uploadedFileRef = useRef<UploadedArtworkFile | null>(null);
  const activeUploadFileRef = useRef<File | null>(null);
  const activeUploadPromiseRef = useRef<Promise<UploadedArtworkFile | null> | null>(null);
  const activeUploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadGenerationRef = useRef(0);
  const activeImagePreviewCleanupRef = useRef<(() => void) | null>(null);
  const activePdfPreviewCleanupRef = useRef<(() => void) | null>(null);
  const activePdfPreviewFileRef = useRef<File | null>(null);
  useEffect(() => {
    uploadedFileRef.current = uploadedFile;
  }, [uploadedFile]);
  useEffect(() => () => {
    activeUploadAbortControllerRef.current?.abort();
    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;
  }, []);
  const [uploadError, setUploadError] = useState('');
  // Fresh banner-page loads start with NO preset selected/highlighted and NO
  // committed size, so the order summary shows $0.00 until the customer
  // explicitly clicks a preset (e.g. 6â€² Ã— 3â€²) or confirms/changes a custom
  // size. The 6â€² Ã— 3â€² "MOST POPULAR" badge remains a recommendation only â€”
  // see ConfigCard / isPopularBannerPreset for the informational badge logic.
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(initialProductType === 'yard_sign' ? 10 : 1);
  const storedPromoAtLoad = useCartStore.getState().discountCode;
  const [promoCode, setPromoCode] = useState(storedPromoAtLoad?.code || '');
  const [promoApplied, setPromoApplied] = useState(Boolean(storedPromoAtLoad));

  const [hasConfirmedSize, setHasConfirmedSize] = useState(false);
  const [hasConfirmedMaterial, setHasConfirmedMaterial] = useState(false);
  const [hasConfirmedQuantity, setHasConfirmedQuantity] = useState(false);
  const [hasReviewedOptions, setHasReviewedOptions] = useState(false);

  // Yard-sign-specific confirmation flags + post-add-to-cart success state.
  // See Design.tsx for the full rationale; both pages share the same
  // sticky CTA state machine via @/lib/builderSteps.
  const [hasReviewedYardSignPrintSide, setHasReviewedYardSignPrintSide] = useState(false);
  const [hasReviewedYardSignStakes, setHasReviewedYardSignStakes] = useState(false);
  const [yardSignUploadStatus, setYardSignUploadStatus] = useState<{ isUploading: boolean; uploadError: string | null }>({ isUploading: false, uploadError: null });
  const [yardSignPreviewTrigger, setYardSignPreviewTrigger] = useState<{ designId: string; nonce: number } | null>(null);
  const [hasJustAddedToCart, setHasJustAddedToCart] = useState(false);
  const [showPostAddResetNotice, setShowPostAddResetNotice] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);
  // PR3: per-axis Y scale + constrain-proportions toggle (see Design.tsx).
  const [imgScaleY, setImgScaleY] = useState(1);
  const [constrainProps, setConstrainProps] = useState(true);
  const [restoredNormalizedTransform, setRestoredNormalizedTransform] = useState<NormalizedArtworkTransform | null>(null);
  const [restoredCompositionRevision, setRestoredCompositionRevision] = useState(0);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [dragStartPt, setDragStartPt] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartScale, setResizeStartScale] = useState(1);
  const [resizeStartDist, setResizeStartDist] = useState(0);
  const [resizeCenter, setResizeCenter] = useState({ x: 0, y: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const inlineEditorRef = useRef<ArtworkPreviewEditorHandle>(null);
  const modalEditorRef = useRef<ArtworkPreviewEditorHandle>(null);
  // Mount points for the Fit/Fill/Reset/Locked toolbar that
  // ArtworkPreviewEditor renders BELOW the preview canvas via portal on
  // every screen size so the controls never cover the printable artwork.
  const [inlineMobileToolbarEl, setInlineMobileToolbarEl] = useState<HTMLDivElement | null>(null);
  const [modalMobileToolbarEl, setModalMobileToolbarEl] = useState<HTMLDivElement | null>(null);

  // Drag hint auto-fade state
  const [showDragHint, setShowDragHint] = useState(false);

  // Upsell modal state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [isProcessingUpsell, setIsProcessingUpsell] = useState(false);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{pos: {x: number; y: number}; scale: number; scaleY?: number} | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'checkout' | 'cart'>('checkout');
  const [pendingPlacementPreview, setPendingPlacementPreview] = useState<ReadyPlacementPreviewManifest | null>(null);
  const preparedPlacementRef = useRef<{
    spec: ArtworkCompositionSpec;
    artifact: ReadyPlacementPreviewManifest;
  } | null>(null);
  const actionPreparationRef = useRef<Promise<void> | null>(null);

  // "Create with AI" modal state. Available for banner & car_magnet on this
  // page â€” yard signs use YardSignConfigurator which has its own button.
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [aiEditModalOpen, setAiEditModalOpen] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState<string | null>(null);
  const [aiDesignSession, setAiDesignSession] = useState<AIDesignSession | null>(null);

  const quoteStore = useQuoteStore();
  const cartStore = useCartStore();
  const activeCartPromo = promoApplied ? cartStore.discountCode : null;
  const { isCartOpen, setIsCartOpen } = useUIStore();
  const cartItemCount = useCartStore(s => s.getItemCount());
  const { toast } = useToast();

  // Dimensions: for banners, use ft+in inputs; for yard signs, fixed 24" Ã— 18"
  const selectedCarMagnetSize = CAR_MAGNET_SIZES.find((size) => size.label === carMagnetSizeLabel) || CAR_MAGNET_SIZES[0];
  const widthIn = isYardSign
    ? YARD_SIGN_WIDTH_IN
    : isCarMagnet
      ? selectedCarMagnetSize.widthIn
      : (widthFt * 12 + widthInR);
  const heightIn = isYardSign
    ? YARD_SIGN_HEIGHT_IN
    : isCarMagnet
      ? selectedCarMagnetSize.heightIn
      : (heightFt * 12 + heightInR);
  const sqft = (widthIn * heightIn) / 144;
  const latestPreviewConfigRef = useRef({ widthIn, heightIn, productType });
  latestPreviewConfigRef.current = { widthIn, heightIn, productType };

  // Artwork upload is a clear commitment to the dimensions currently shown.
  // Keep the paid path in parity with /design so a valid upload cannot leave
  // checkout disabled behind the stepper's internal confirmation flag.
  useEffect(() => {
    if (shouldAutoConfirmBannerSize({
      productType,
      widthIn,
      heightIn,
      hasArtwork: Boolean(uploadedFile),
    })) {
      setHasConfirmedSize(true);
    }
  }, [productType, widthIn, heightIn, uploadedFile]);

  // Mobile guided-flow auto-confirm watchers. See Design.tsx for full
  // rationale â€” the snapshot ref ensures defaults don't auto-confirm
  // and the productType prefix prevents tab-switch resets from firing.
  const sizeKeyRef = useRef<string>('');
  const materialKeyRef = useRef<string>('');
  const quantityKeyRef = useRef<string>('');
  const optionsKeyRef = useRef<string>('');

  useEffect(() => {
    const key = `${productType}|${widthIn}|${heightIn}|${carMagnetSizeLabel}`;
    const prev = sizeKeyRef.current;
    sizeKeyRef.current = key;
    if (prev === '') return;
    if (prev.split('|', 1)[0] === productType && prev !== key) {
      setHasConfirmedSize(true);
    }
  }, [productType, widthIn, heightIn, carMagnetSizeLabel]);

  useEffect(() => {
    const key = `${productType}|${material}`;
    const prev = materialKeyRef.current;
    materialKeyRef.current = key;
    if (prev === '') return;
    if (prev.split('|', 1)[0] === productType && prev !== key) {
      setHasConfirmedMaterial(true);
    }
  }, [productType, material]);

  useEffect(() => {
    const key = `${productType}|${quantity}`;
    const prev = quantityKeyRef.current;
    quantityKeyRef.current = key;
    if (prev === '') return;
    if (prev.split('|', 1)[0] === productType && prev !== key) {
      setHasConfirmedQuantity(true);
    }
  }, [productType, quantity]);

  useEffect(() => {
    const key = `${productType}|${finishingType}|${grommets}|${polePockets}|${addRope}|${ropePlacement}|${carMagnetRoundedCorners}`;
    const prev = optionsKeyRef.current;
    optionsKeyRef.current = key;
    if (prev === '') return;
    if (prev.split('|', 1)[0] === productType && prev !== key) {
      setHasReviewedOptions(true);
    }
  }, [productType, finishingType, grommets, polePockets, addRope, ropePlacement, carMagnetRoundedCorners]);

  // Yard sign pricing (computed reactively)
  const yardSignTotalQty = getTotalDesignQuantity(yardSignDesigns);
  const yardSignPromoRate = promoApplied
    ? Number(activeCartPromo?.discountPercentage || 0) / 100
    : 0;
  const yardSignPricing = useMemo(() => {
    if (!isYardSign) return null;
    return calcYardSignPricing(
      yardSignSidedness,
      yardSignTotalQty,
      yardSignAddStepStakes,
      yardSignStepStakeQty,
      yardSignPromoRate,
    );
  }, [isYardSign, yardSignSidedness, yardSignTotalQty, yardSignAddStepStakes, yardSignStepStakeQty, yardSignPromoRate]);

  // Yard sign quantity validation
  const yardSignQuantityValid = validateYardSignQuantity(yardSignTotalQty);
  const carMagnetPricing = useMemo(() => {
    if (!isCarMagnet) return null;
    return calcCarMagnetPricing(widthIn, heightIn, quantity);
  }, [isCarMagnet, widthIn, heightIn, quantity]);

  // Yard sign quantity discount rate (legacy compat â€” always 0 now)
  const yardSignDiscountRate = 0;

  // Reset image position/scale when dimensions change to prevent clipping
  useEffect(() => {
    const pendingRestore = cartRestoreTransformRef.current;
    if (pendingRestore) {
      if (
        pendingRestore.productType === productType
        && pendingRestore.widthIn === widthIn
        && pendingRestore.heightIn === heightIn
      ) {
        setImgPos({ x: 0, y: 0 });
        setImgScale(pendingRestore.scaleX);
        setImgScaleY(pendingRestore.scaleY);
        setConstrainProps(pendingRestore.constrain);
        setRestoredNormalizedTransform(pendingRestore.normalizedTransform);
        setRestoredCompositionRevision(pendingRestore.revision);
        cartRestoreTransformRef.current = null;
      }
      preparedPlacementRef.current = null;
      setPendingPlacementPreview(null);
      return;
    }
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    setRestoredNormalizedTransform(null);
    setRestoredCompositionRevision(0);
    preparedPlacementRef.current = null;
    setPendingPlacementPreview(null);
  }, [heightIn, productType, widthIn]);

  // Keep the inches-mode raw input strings in sync with widthIn/heightIn when
  // those change from outside the inches inputs (presets, feet-mode editing,
  // cart restore). Effect dep is [widthIn]/[heightIn], so this never fires
  // while the user is only typing into the inches input â€” typing-in-progress
  // (including empty/partial values) is preserved until blur.
  useEffect(() => {
    const n = parseInt(widthCustomInStr, 10);
    if (Number.isFinite(n) && n === widthIn) return;
    setWidthCustomInStr(String(widthIn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthIn]);
  useEffect(() => {
    const n = parseInt(heightCustomInStr, 10);
    if (Number.isFinite(n) && n === heightIn) return;
    setHeightCustomInStr(String(heightIn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightIn]);

  // Mirror the inches-mode raw strings into widthFtStr/widthInRStr so that
  // pricing (derived from widthIn = widthFt*12 + widthInR) updates reactively
  // while the user is typing in inches mode. Parsing happens here, not in
  // onChange, per the input handling spec.
  useEffect(() => {
    const n = parseInt(widthCustomInStr, 10);
    if (!Number.isFinite(n) || n < 1 || n > 600) return;
    const ft = String(Math.floor(n / 12));
    const inr = String(n % 12);
    if (ft !== widthFtStr || inr !== widthInRStr) {
      setWidthFtStr(ft);
      setWidthInRStr(inr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthCustomInStr]);
  useEffect(() => {
    const n = parseInt(heightCustomInStr, 10);
    if (!Number.isFinite(n) || n < 1 || n > 600) return;
    const ft = String(Math.floor(n / 12));
    const inr = String(n % 12);
    if (ft !== heightFtStr || inr !== heightInRStr) {
      setHeightFtStr(ft);
      setHeightInRStr(inr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightCustomInStr]);

  // Persist the user's unit preference so it survives hard refreshes.
  useEffect(() => {
    localStorage.setItem('banner-unit-pref', unit);
  }, [unit]);


  // Show drag hint briefly when artwork is first uploaded
  useEffect(() => {
    if (uploadedFile) {
      setShowDragHint(true);
      const timer = setTimeout(() => setShowDragHint(false), 2000);
      return () => clearTimeout(timer);
    }
    setShowDragHint(false);
  }, [uploadedFile]);

  // Close material dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(e.target as Node)) {
        setMaterialDropdownOpen(false);
      }
    };
    if (materialDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [materialDropdownOpen]);

  // Track desktop breakpoint (lg: 1024px) to enlarge preview area on desktop only
  const [isLgScreen, setIsLgScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => setIsLgScreen(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Compute responsive canvas style for a given max height, preserving banner aspect ratio
  // Uses width + maxWidth instead of min() for better Firefox/Safari mobile compatibility
  const getCanvasStyle = useCallback((maxH: number) => {
    const w = widthIn || 96;
    const h = heightIn || 48;
    const ar = w / h;
    return {
      aspectRatio: `${w} / ${h}`,
      width: '100%',
      maxWidth: `${Math.round(maxH * ar)}px`,
      maxHeight: `${maxH}px`,
    };
  }, [widthIn, heightIn]);

  const previewCanvasStyle = useMemo(() => getCanvasStyle(isLgScreen ? 480 : 280), [getCanvasStyle, isLgScreen]);
  const dimPreviewCanvasStyle = useMemo(() => getCanvasStyle(isLgScreen ? 200 : 140), [getCanvasStyle, isLgScreen]);

  // Cross-browser preview container styles using padding-bottom technique
  // (aspect-ratio CSS fails on mobile Safari/Firefox with absolute children + overflow:hidden)
  const getPreviewContainerStyles = useCallback((maxH: number) => {
    const w = widthIn || 96;
    const h = heightIn || 48;
    const ar = w / h;
    return {
      wrapperStyle: { width: '100%', maxWidth: `${Math.round(maxH * ar)}px` } as React.CSSProperties,
      paddingPct: `${(h / w) * 100}%`,
    };
  }, [widthIn, heightIn]);
  const { wrapperStyle: previewWrapperStyle, paddingPct: previewPaddingPct } = useMemo(() => getPreviewContainerStyles(isLgScreen ? 480 : 280), [getPreviewContainerStyles, isLgScreen]);
  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(() => getPreviewContainerStyles(isLgScreen ? 200 : 140), [getPreviewContainerStyles, isLgScreen]);
  const hasCommittedBannerSize =
    isYardSign || isCarMagnet || (hasConfirmedSize && widthIn > 0 && heightIn > 0);
  const showPopularBannerPriceNote = isPopularBannerPreset(
    productType,
    widthIn,
    heightIn,
    activePreset,
  );
  const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;
  const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;
  const totals = calcTotals({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
    qty: quantity,
    material,
    addRope,
    ropePlacement,
    polePockets,
  });
  const bannerPricing = calculateBannerPricing({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
    quantity,
    material,
    grommets,
    addRope,
    ropePlacement,
    polePockets,
  });

  const pricePerSqFt = PRICE_PER_SQFT[material];
  const selectedMaterial = MATERIALS.find(m => m.mapped === material) || MATERIALS[0];
  const materialLabel = isCarMagnet ? 'Premium Magnetic Material' : selectedMaterial.label;
  const grommetsLabel = DESIGN_GROMMET_OPTIONS.find(o => o.value === grommets)?.label || 'None';
  const widthDisplay = (isYardSign || isCarMagnet) ? `${widthIn}"` : (widthInR > 0 ? `${widthFt}'${widthInR}"` : `${widthFt}'`);
  const heightDisplay = (isYardSign || isCarMagnet) ? `${heightIn}"` : (heightInR > 0 ? `${heightFt}'${heightInR}"` : `${heightFt}'`);

  // Quantity discount info
  const quantityDiscountRate = getQuantityDiscountRate(quantity);

  // Banner promo math: route through promoEngine so /google-ads-banner uses the SAME
  // best-discount-wins logic as /design, cart and checkout.
  const effectivePromoCode = promoApplied ? promoCode : null;
  const bannerPromoResolution = useMemo(() => resolvePromo({
    subtotalCents: bannerPricing.subtotalBeforeDiscountCents,
    quantity,
    code: effectivePromoCode,
    validatedPromo: activeCartPromo ? {
      code: activeCartPromo.code,
      discountPercentage: activeCartPromo.discountPercentage,
      discountAmountCents: activeCartPromo.discountAmountCents || undefined,
      campaign: activeCartPromo.campaign,
      discountScope: activeCartPromo.discountScope,
      eligibleCartItemIds: activeCartPromo.eligibleCartItemIds,
      maxDiscountAmountCents: activeCartPromo.maxDiscountAmountCents,
    } : null,
    items: [{
      id: 'current-configurator-line',
      product_type: productType,
      width_in: widthIn,
      height_in: heightIn,
      line_total_cents: bannerPricing.subtotalBeforeDiscountCents,
    }],
  }), [
    bannerPricing.subtotalBeforeDiscountCents,
    quantity,
    effectivePromoCode,
    activeCartPromo,
    productType,
    widthIn,
    heightIn,
  ]);

  const bannerSubtotalAfterAllDiscountsCents = Math.max(
    0,
    bannerPricing.subtotalBeforeDiscountCents - bannerPromoResolution.appliedDiscountAmountCents,
  );
  const bannerTaxAfterAllDiscountsCents = Math.round(bannerSubtotalAfterAllDiscountsCents * 0.06);
  const bannerTotalAfterAllDiscountsCents = bannerSubtotalAfterAllDiscountsCents + bannerTaxAfterAllDiscountsCents;
  const discountedTotal = bannerSubtotalAfterAllDiscountsCents / 100;
  const bannerPromoActuallyApplied =
    bannerPromoResolution.appliedDiscountType === 'promo' &&
    bannerPromoResolution.appliedDiscountAmountCents > 0;

  // Same-Day Hit Service preview fee for product-page summary.
  const sameDayHitService = useCartStore(s => s.sameDayHitService);
  const previewSameDayFeeCents = useMemo(() => {
    if (!sameDayHitService) return 0;
    let previewSubtotal: number;
    if (isCarMagnet) {
      previewSubtotal = carMagnetPricing?.baseSubtotalCents ?? 0;
    } else if (isYardSign) {
      previewSubtotal = yardSignPricing?.totalCents ?? 0;
    } else {
      previewSubtotal = bannerPricing.subtotalBeforeDiscountCents;
    }
    return computeSameDayFeesCents(previewSubtotal, { sameDay: true, saturday: false }).sameDayFeeCents;
  }, [sameDayHitService, isCarMagnet, isYardSign, carMagnetPricing?.baseSubtotalCents, yardSignPricing?.totalCents, bannerPricing.subtotalBeforeDiscountCents]);

  useEffect(() => {
    // Flag this session as coming from Google Ads landing page
    sessionStorage.setItem('isGoogleAdsLanding', 'true');
    const gclid = searchParams.get('gclid');
    if (gclid) sessionStorage.setItem('gclid', gclid);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
      const v = searchParams.get(k);
      if (v) sessionStorage.setItem(k, v);
    });
  }, [searchParams]);

  // Restore cart item state when editing from cart (editItem query param)
  const editItemId = searchParams.get('editItem');
  const [editItemRestored, setEditItemRestored] = useState(false);
  const editCartItems = useCartStore((state) => state.items);
  const cartRestoreTransformRef = useRef<{
    productType: ProductTypeSlug;
    widthIn: number;
    heightIn: number;
    normalizedTransform: NormalizedArtworkTransform;
    scaleX: number;
    scaleY: number;
    constrain: boolean;
    revision: number;
  } | null>(null);
  useEffect(() => {
    if (!editItemId || editItemRestored) return;
    const item = editCartItems.find((i: CartItem) => i.id === editItemId);
    if (!item) return;
    setEditItemRestored(true);
    // Editing an existing cart item: every section is implicitly already
    // confirmed so the user doesn't have to re-confirm to update artwork.
    setHasConfirmedSize(true);
    setHasConfirmedMaterial(true);
    setHasConfirmedQuantity(true);
    setHasReviewedOptions(true);
    const designerRecovery = buildDesignerRecoveryFields(item);
    const normalizedTransform: NormalizedArtworkTransform = {
      xPct: designerRecovery.normalized_placement.x_pct,
      yPct: designerRecovery.normalized_placement.y_pct,
      scaleX: designerRecovery.normalized_placement.scale_x,
      scaleY: designerRecovery.normalized_placement.scale_y,
    };
    const recoveredRevision = Number(item.composition_revision || item.placement_preview?.compositionRevision || 0);
    setImgPos({ x: 0, y: 0 });
    setImgScale(normalizedTransform.scaleX);
    setImgScaleY(normalizedTransform.scaleY);
    setConstrainProps(designerRecovery.constrain_proportions);
    setRestoredNormalizedTransform(normalizedTransform);
    setRestoredCompositionRevision(recoveredRevision);

    if (item.product_type === 'yard_sign' && item.yard_sign_designs) {
      // Restore yard sign designs with saved preview state
      setProductType('yard_sign');
      const restoredDesigns: YardSignDesign[] = item.yard_sign_designs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileKey: d.fileKey,
        thumbnailUrl: d.thumbnailUrl,
        isPdf: d.isPdf,
        quantity: d.quantity,
        imgScale: d.imgScale,
        imgScaleY: d.imgScaleY,
        imgPos: d.imgPos,
        imgConstrain: d.imgConstrain,
        previewThumbnailUrl: d.previewThumbnailUrl,
        placementPreview: d.placementPreview,
      }));
      setYardSignDesigns(restoredDesigns);
      setYardSignSidedness(item.yard_sign_sidedness || 'single');
      setYardSignAddStepStakes(item.yard_sign_step_stakes_enabled || false);
      setYardSignStepStakeQty(item.yard_sign_step_stakes_qty || 1);
      // Auto-open the first design's preview so user can adjust immediately
      if (restoredDesigns.length > 0) {
        setAutoOpenDesignId(restoredDesigns[0].id);
      }
    } else if (item.product_type === 'car_magnet') {
      setProductType('car_magnet');
      const restoredArtwork = buildCartArtworkForEditor(item);
      if (restoredArtwork) {
        uploadedFileRef.current = restoredArtwork;
        setUploadedFile(restoredArtwork);
      }
      const matchedSize = CAR_MAGNET_SIZES.find((size) => size.widthIn === item.width_in && size.heightIn === item.height_in);
      setCarMagnetSizeLabel((matchedSize || CAR_MAGNET_SIZES[0]).label);
      setCarMagnetRoundedCorners(((item as any).rounded_corners || 'none') as CarMagnetRoundedCorner);
      cartRestoreTransformRef.current = {
        productType: 'car_magnet',
        widthIn: matchedSize?.widthIn || CAR_MAGNET_SIZES[0].widthIn,
        heightIn: matchedSize?.heightIn || CAR_MAGNET_SIZES[0].heightIn,
        normalizedTransform,
        scaleX: normalizedTransform.scaleX,
        scaleY: normalizedTransform.scaleY,
        constrain: designerRecovery.constrain_proportions,
        revision: recoveredRevision,
      };
      setQuantity(item.quantity || 1);
      setShowPreview(true);
    } else {
      // Restore banner state
      setProductType('banner');
      const restoredArtwork = buildCartArtworkForEditor(item);
      if (restoredArtwork) {
        uploadedFileRef.current = restoredArtwork;
        setUploadedFile(restoredArtwork);
      }
      const restoredWidth = Number(item.width_in) > 0 ? Number(item.width_in) : 48;
      const restoredHeight = Number(item.height_in) > 0 ? Number(item.height_in) : 24;
      setWidthFtStr(String(Math.floor(restoredWidth / 12)));
      setWidthInRStr(String(restoredWidth % 12));
      setHeightFtStr(String(Math.floor(restoredHeight / 12)));
      setHeightInRStr(String(restoredHeight % 12));
      setWidthCustomInStr(String(restoredWidth));
      setHeightCustomInStr(String(restoredHeight));
      const presetIndex = PRESET_SIZES.findIndex(({ w, h }) => w === restoredWidth && h === restoredHeight);
      setActivePreset(presetIndex >= 0 ? presetIndex : null);
      if (item.material) setMaterial(item.material as MaterialKey);
      cartRestoreTransformRef.current = {
        productType: 'banner',
        widthIn: restoredWidth,
        heightIn: restoredHeight,
        normalizedTransform,
        scaleX: normalizedTransform.scaleX,
        scaleY: normalizedTransform.scaleY,
        constrain: designerRecovery.constrain_proportions,
        revision: recoveredRevision,
      };
      if (item.grommets) setGrommets(item.grommets);
      if (item.pole_pockets) setPolePockets(item.pole_pockets);
      setPolePocketSize(item.pole_pocket_size || '2');
      setAddRope(!!item.rope_feet);
      if (item.rope_placement) setRopePlacement(item.rope_placement as RopePlacement);
      // Restore finishingType from cart item so the correct card appears selected
      if (item.grommets && item.grommets !== 'none') {
        setFinishingType('grommets');
      } else if (item.pole_pockets && item.pole_pockets !== 'none') {
        setFinishingType('pole_pockets');
      } else if (item.rope_feet) {
        setFinishingType('rope');
      } else {
        setFinishingType('none');
      }
      setQuantity(item.quantity || 1);

      // Auto-open preview modal so user can adjust
      setShowPreview(true);
    }

  }, [editCartItems, editItemId, editItemRestored]);

  const scrollToOrder = useCallback(() => {
    setHasEnteredBuilder(true);
    // Prefer the per-product builder start anchor (the "Build Your ..." heading)
    // so the user lands directly on the active builder.
    const target = builderStartRef.current ?? orderRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const section = orderRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setIsBuilderInView(inView);
        if (inView) setHasEnteredBuilder(true);
      },
      { threshold: 0.25 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Per-product design state stash. Each product tab keeps its own
  // uploaded artwork and image transform so switching tabs does NOT
  // leak design state between banner / car magnet (yard sign manages
  // its own multi-design array via `yardSignDesigns`).
  type DesignSnapshot = {
    uploadedFile: UploadedArtworkFile | null;
    imgPos: { x: number; y: number };
    imgScale: number;
    imgScaleY: number;
    constrainProps: boolean;
  };
  const productDesignStashRef = useRef<Record<string, DesignSnapshot>>({});
  const latestDesignRef = useRef<DesignSnapshot>({ uploadedFile: null, imgPos: { x: 0, y: 0 }, imgScale: 1, imgScaleY: 1, constrainProps: true });
  useEffect(() => {
    latestDesignRef.current = { uploadedFile, imgPos, imgScale, imgScaleY, constrainProps };
  }, [uploadedFile, imgPos, imgScale, imgScaleY, constrainProps]);

  // Handle product type switch â€” reset state
  const handleProductTypeChange = useCallback((newType: ProductTypeSlug) => {
    if (newType === productType) return;
    productDesignStashRef.current[productType] = { ...latestDesignRef.current };
    setProductType(newType);
    navigate(`/google-ads-banner?product=${getProductQuerySlug(newType)}`, { replace: true });
    const restored: DesignSnapshot = productDesignStashRef.current[newType] ?? {
      uploadedFile: null,
      imgPos: { x: 0, y: 0 },
      imgScale: 1,
      imgScaleY: 1,
      constrainProps: true,
    };
    setUploadedFile(restored.uploadedFile);
    setImgPos(restored.imgPos);
    setImgScale(restored.imgScale);
    setImgScaleY(restored.imgScaleY);
    setConstrainProps(restored.constrainProps);
    latestDesignRef.current = { ...restored };
    setQuantity(newType === 'yard_sign' ? 10 : 1);
    // A validated promotion belongs to the cart, so keep it when a customer
    // switches product context or returns through another paid-product URL.
    // Switching product tabs is otherwise a fresh start â€” clear confirmation flags so
    // the new product's mobile guided flow walks the user back through
    // size â†’ material â†’ quantity â†’ options â†’ upload from Step 1.
    setHasConfirmedSize(false);
    setHasConfirmedMaterial(false);
    setHasConfirmedQuantity(false);
    setHasReviewedOptions(false);
    setHasReviewedYardSignPrintSide(false);
    setHasReviewedYardSignStakes(false);
    setHasJustAddedToCart(false);
    // Tab switch must reset Same-Day Hit Service / Saturday Delivery so the
    // new product never starts with these auto-selected.
    useCartStore.getState().setSameDayHitService(false);
    useCartStore.getState().setSaturdayDelivery(false);
    // Reset yard sign state when switching
    if (newType === 'yard_sign') {
      setYardSignDesigns([]);
      setYardSignSidedness('single');
      setYardSignAddStepStakes(false);
      setYardSignStepStakeQty(1);
    } else if (newType === 'car_magnet') {
      setCarMagnetSizeLabel(CAR_MAGNET_SIZES[0].label);
      setCarMagnetRoundedCorners('none');
      setGrommets('none');
      setPolePockets('none');
      setAddRope(false);
      setFinishingType('none');
    }
  }, [productType, getProductQuerySlug, navigate]);

  const applyPreset = (idx: number) => {
    const p = PRESET_SIZES[idx];
    setWidthFtStr(String(Math.floor(p.w / 12)));
    setWidthInRStr(String(p.w % 12));
    setHeightFtStr(String(Math.floor(p.h / 12)));
    setHeightInRStr(String(p.h % 12));
    setActivePreset(idx);
    setHasConfirmedSize(true);
  };

  const handlePromoApply = async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode) {
      toast({ title: 'Enter a promo code', description: 'Add the code shown in the offer and try again.' });
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/validate-discount-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: normalizedCode,
          userId: user?.id || null,
          items: [{
            id: 'current-configurator-line',
            product_type: productType,
            width_in: widthIn,
            height_in: heightIn,
            line_total_cents: bannerPricing.subtotalBeforeDiscountCents,
          }],
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.valid || !result.discount) {
        setPromoApplied(false);
        toast({
          title: 'Promo not applied',
          description: result.error || 'This promotion is not available for this order.',
          variant: 'destructive',
        });
        return;
      }

      const selectedBannerQualifiesForAutomaticPrice = productType === 'banner'
        && hasConfirmedSize
        && Math.max(Number(widthIn), Number(heightIn)) >= 72
        && Math.min(Number(widthIn), Number(heightIn)) >= 36;
      const validatedPercentage = Number(result.discount.discountPercentage || 0);
      const isSmallBannerPromoCode = String(result.discount.code || '').trim().toUpperCase() === SMALL_BANNER_PROMOTION_ID;

      if (
        selectedBannerQualifiesForAutomaticPrice
        && validatedPercentage > 0
        && validatedPercentage <= 25
        && !isSmallBannerPromoCode
      ) {
        cartStore.removeDiscountCode();
        setPromoCode(normalizedCode);
        setPromoApplied(false);
        toast({
          title: 'Large Banner 25% Off already applied',
          description: `${normalizedCode} cannot be combined with the automatic 25% large-banner price.`,
        });
        return;
      }

      // 20OFF is saved to the cart even when the current banner already
      // qualifies for the larger automatic 25% off â€” the resolver picks the
      // best discount, and switching back to a smaller banner later will let
      // 20OFF apply again without having to re-enter it.
      cartStore.applyDiscountCode(result.discount);
      setPromoCode(result.discount.code);
      setPromoApplied(true);
      toast({
        title: 'Discount applied',
        description: isSmallBannerPromoCode && selectedBannerQualifiesForAutomaticPrice
          ? 'Your banner already qualifies for the automatic 25% off, which is larger than 20OFF. We saved 20OFF to your cart for smaller banners.'
          : validatedPercentage > 0
            ? `${validatedPercentage}% off is saved to your cart and will carry into checkout.`
            : 'Your promotion is saved to your cart and will carry into checkout.',
      });
    } catch {
      setPromoApplied(false);
      toast({
        title: 'Promo could not be verified',
        description: 'Your order is unchanged. Please try applying the code again.',
        variant: 'destructive',
      });
    }
  };

  const handlePromoRemove = () => {
    cartStore.removeDiscountCode();
    setPromoApplied(false);
    setPromoCode('');
  };


  const validatePdfPreviewImage = useCallback((preview: PdfPreviewResult, correlationId: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
    const validationImage = new Image();
    const timeoutId = window.setTimeout(() => {
      validationImage.onload = null;
      validationImage.onerror = null;
      console.warn('[artwork_upload]', { correlationId, stage: 'pdf_preview_validation_failed', reason: 'timeout', width: preview.width, height: preview.height, blobSize: preview.blobSize });
      reject(new Error('PDF preview validation timed out.'));
    }, 10_000);

    validationImage.onload = () => {
      window.clearTimeout(timeoutId);
      const width = validationImage.naturalWidth;
      const height = validationImage.naturalHeight;
      if (!width || !height) {
        console.warn('[artwork_upload]', { correlationId, stage: 'pdf_preview_validation_failed', reason: 'zero_dimensions', width, height, blobSize: preview.blobSize });
        reject(new Error('PDF preview loaded without valid image dimensions.'));
        return;
      }
      console.info('[artwork_upload]', { correlationId, stage: 'pdf_preview_validation_loaded', width, height, blobSize: preview.blobSize });
      resolve({ width, height });
    };

    validationImage.onerror = () => {
      window.clearTimeout(timeoutId);
      console.warn('[artwork_upload]', { correlationId, stage: 'pdf_preview_validation_failed', reason: 'image_error', width: preview.width, height: preview.height, blobSize: preview.blobSize });
      reject(new Error('PDF preview image could not be loaded.'));
    };

    validationImage.src = preview.previewUrl;
  }), []);

  const generateValidatedPdfPreview = useCallback(async (file: File, correlationId: string) => {
    // Keep the heavy PDF renderer out of the paid landing-page critical path.
    // It is needed only after a visitor explicitly uploads a PDF.
    const { renderPdfToDataUrl } = await import('@/utils/pdf/renderPdfToDataUrl');
    const preview = await renderPdfToDataUrl(file, {
      scale: 2,
      deviceScale: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      minWidth: 1200,
      minHeight: 1200,
    });
    console.info('[artwork_upload]', { correlationId, stage: 'pdf_preview_blob_created', width: preview.width, height: preview.height, blobSize: preview.blobSize, pageNumber: preview.pageNumber });
    const dimensions = await validatePdfPreviewImage(preview, correlationId);
    return { preview, dimensions };
  }, [validatePdfPreviewImage]);

  const handleRetryPdfPreview = useCallback(async () => {
    const file = activePdfPreviewFileRef.current;
    if (!file) return;
    const correlationId = `artwork-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const { preview, dimensions } = await generateValidatedPdfPreview(file, correlationId);
      activePdfPreviewCleanupRef.current?.();
      activePdfPreviewCleanupRef.current = preview.cleanup;
      setUploadedFile((current) => current && current.isPdf ? {
        ...current,
        previewUrl: preview.previewUrl,
        thumbnailUrl: preview.previewUrl,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        pdfPageNumber: preview.pageNumber,
      } : current);
    } catch (error) {
      console.error('[artwork_upload] PDF preview retry failed', { correlationId, error });
      setUploadError('We could not regenerate your PDF preview. Please retry the upload.');
    }
  }, [generateValidatedPdfPreview]);

  const persistArtworkUpload = useCallback(async (
    file: File,
    initialArtwork: UploadedArtworkFile,
    generation: number,
    correlationId: string,
  ): Promise<UploadedArtworkFile | null> => {
    const controller = new AbortController();
    activeUploadAbortControllerRef.current?.abort();
    activeUploadAbortControllerRef.current = controller;
    setIsUploading(true);
    setUploadError('');

    const promise = (async () => {
      const result = await uploadArtworkFile(file, {
        correlationId,
        signal: controller.signal,
        onAttempt: (attempt, maximum) => {
          console.info('[artwork_upload]', {
            correlationId,
            stage: 'direct_upload_attempt',
            attempt,
            maximum,
            size: file.size,
          });
        },
      });
      if (generation !== uploadGenerationRef.current) return null;

      let browserPreviewUrl = initialArtwork.previewUrl || initialArtwork.thumbnailUrl || initialArtwork.url;
      const permanentPreviewUrl = result.previewUrl || result.secureUrl;
      const permanentPreviewLoaded = await preloadPermanentArtwork(permanentPreviewUrl);
      if (permanentPreviewLoaded) browserPreviewUrl = permanentPreviewUrl;

      const completedArtwork: UploadedArtworkFile = {
        ...initialArtwork,
        url: result.secureUrl,
        fileKey: result.fileKey,
        thumbnailUrl: browserPreviewUrl,
        previewUrl: browserPreviewUrl,
        productionUrl: result.productionUrl,
        productionPublicId: result.productionPublicId,
        resourceType: result.resourceType,
        mimeType: result.mimeType,
        originalFormat: result.format || initialArtwork.originalFormat,
        originalBytes: result.bytes || file.size,
        originalWidth: result.width ?? initialArtwork.originalWidth ?? null,
        originalHeight: result.height ?? initialArtwork.originalHeight ?? null,
        pdfPageNumber: initialArtwork.isPdf ? 1 : undefined,
        artworkManifest: result.artworkManifest,
      };

      uploadedFileRef.current = completedArtwork;
      setUploadedFile(completedArtwork);
      setUploadError('');
      console.info('[artwork_upload]', {
        correlationId,
        stage: 'original_upload_succeeded',
        transport: result.transport,
        publicIdPresent: Boolean(result.fileKey),
      });
      const uploadDescriptor = getArtworkUploadDiagnostic(null, file);
      logUx('upload_success', {
        correlationId,
        transport: result.transport,
        sizeBucket: uploadDescriptor.sizeBucket,
        mimeType: uploadDescriptor.mimeType,
      });

      if (permanentPreviewLoaded) {
        window.setTimeout(() => {
          activeImagePreviewCleanupRef.current?.();
          activePdfPreviewCleanupRef.current?.();
          activeImagePreviewCleanupRef.current = null;
          activePdfPreviewCleanupRef.current = null;
        }, 0);
      }
      return completedArtwork;
    })();

    activeUploadPromiseRef.current = promise;
    try {
      return await promise;
    } catch (error) {
      if (generation !== uploadGenerationRef.current) return null;
      const cancelled = controller.signal.aborted;
      if (!cancelled) {
        const diagnostic = getArtworkUploadDiagnostic(error, file);
        console.error('[artwork_upload]', { correlationId, stage: 'original_upload_failed', error });
        logUx('upload_error', {
          correlationId,
          phase: diagnostic.phase,
          status: diagnostic.status ?? 'network',
          retryable: diagnostic.retryable,
          sizeBucket: diagnostic.sizeBucket,
          mimeType: diagnostic.mimeType,
        });
        setUploadError(
          'Artwork upload did not finish. Your file and choices are still here. Check your connection, then try again.',
        );
      }
      return null;
    } finally {
      if (activeUploadPromiseRef.current === promise) activeUploadPromiseRef.current = null;
      if (activeUploadAbortControllerRef.current === controller) activeUploadAbortControllerRef.current = null;
      if (generation === uploadGenerationRef.current) setIsUploading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    const validationError = validateArtworkFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    // A prepared preview is tied to one exact source identity. Never allow a
    // newly selected file to inherit the previous file's verified artifact.
    preparedPlacementRef.current = null;
    setPendingPlacementPreview(null);
    setRestoredNormalizedTransform(null);
    setRestoredCompositionRevision(0);

    const generation = uploadGenerationRef.current + 1;
    uploadGenerationRef.current = generation;
    activeUploadAbortControllerRef.current?.abort();
    activeUploadFileRef.current = file;
    setUploadError('');

    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;

    const correlationId = `artwork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const extension = file.name.split('.').pop()?.toLowerCase() || (isPdf ? 'pdf' : 'jpg');
    const mimeType = isPdf
      ? 'application/pdf'
      : (file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'));

    setIsUploading(true);
    const uploadDescriptor = getArtworkUploadDiagnostic(null, file);
    logUx('upload_start', {
      correlationId,
      sizeBucket: uploadDescriptor.sizeBucket,
      mimeType: uploadDescriptor.mimeType,
    });

    try {
      let previewUrl = '';
      let dimensions: { width: number; height: number } | null = null;
      if (isPdf) {
        activePdfPreviewFileRef.current = file;
        const pdfPreview = await generateValidatedPdfPreview(file, correlationId);
        previewUrl = pdfPreview.preview.previewUrl;
        activePdfPreviewCleanupRef.current = pdfPreview.preview.cleanup;
        dimensions = pdfPreview.dimensions;
      } else {
        activePdfPreviewFileRef.current = null;
        previewUrl = URL.createObjectURL(file);
        activeImagePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl);
        dimensions = await new Promise((resolve) => {
          const image = new Image();
          let settled = false;
          const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            image.onload = null;
            image.onerror = null;
            resolve(value);
          };
          const timeoutId = window.setTimeout(() => finish(null), 12_000);
          image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => finish(null);
          image.src = previewUrl;
        });
      }

      if (generation !== uploadGenerationRef.current) return;
      const initialArtwork: UploadedArtworkFile = {
        editorIdentity: correlationId,
        name: file.name,
        url: previewUrl,
        fileKey: '',
        size: file.size,
        isPdf,
        thumbnailUrl: previewUrl,
        previewUrl,
        resourceType: 'image',
        mimeType,
        originalFormat: extension,
        originalBytes: file.size,
        originalWidth: dimensions?.width ?? null,
        originalHeight: dimensions?.height ?? null,
        pdfPageNumber: isPdf ? 1 : undefined,
      };
      uploadedFileRef.current = initialArtwork;
      setUploadedFile(initialArtwork);
      console.info('[artwork_upload]', {
        correlationId,
        stage: 'local_preview_ready',
        previewUrlType: previewUrl.startsWith('data:') ? 'data' : previewUrl.startsWith('blob:') ? 'blob' : 'url',
      });

      await persistArtworkUpload(file, initialArtwork, generation, correlationId);
    } catch (error) {
      if (generation !== uploadGenerationRef.current) return;
      console.error('[artwork_upload]', { correlationId, stage: 'local_preview_failed', error });
      setUploadError('We could not open that artwork file. Please choose a PDF, PNG, JPG, or JPEG file.');
      setIsUploading(false);
    }
  }, [generateValidatedPdfPreview, persistArtworkUpload]);

  const retryActiveArtworkUpload = useCallback(async (): Promise<UploadedArtworkFile | null> => {
    const file = activeUploadFileRef.current;
    const current = uploadedFileRef.current;
    if (!file || !current) return null;
    if (hasPermanentArtwork(current)) return current;
    return persistArtworkUpload(
      file,
      current,
      uploadGenerationRef.current,
      `artwork-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
  }, [persistArtworkUpload]);

  const ensurePermanentArtworkUploaded = useCallback(async (): Promise<UploadedArtworkFile | null> => {
    let current = uploadedFileRef.current;
    if (hasPermanentArtwork(current)) return current;

    if (activeUploadPromiseRef.current) {
      toast({
        title: 'Finishing artwork upload',
        description: 'Your file is selected. We are completing the secure upload now.',
      });
      await activeUploadPromiseRef.current.catch(() => null);
      current = uploadedFileRef.current;
      if (hasPermanentArtwork(current)) return current;
    }

    if (activeUploadFileRef.current && current) {
      toast({
        title: 'Retrying artwork upload',
        description: 'You do not need to select the file again. We are retrying it now.',
      });
      current = await retryActiveArtworkUpload();
      if (hasPermanentArtwork(current)) return current;
    }

    toast({
      title: 'Artwork upload did not finish',
      description: 'Your file and choices are still here. Check your connection and try Add to cart again.',
      variant: 'destructive',
    });
    return null;
  }, [retryActiveArtworkUpload, toast]);

  // Handle a successful "Create with AI" generation: convert the returned
  // base64 PNG into a File and run it through the SAME upload pipeline used
  // for user-uploaded artwork.
  const handleAIGenerated = useCallback(
    async (result: CreateWithAIResult) => {
      const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
      setAiPrompt(result.prompt);
      setAiEditPrompt(null);
      setAiDesignSession(result.session);
      setImgPos({ x: 0, y: 0 });
      setImgScale(1);
      setImgScaleY(1);
      await handleFileUpload(file);
    },
    [handleFileUpload],
  );

  // Handle a successful "Edit with AI" update.
  const handleAIEdited = useCallback(
    async (result: CreateWithAIResult & { editPrompt: string }) => {
      const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
      setAiEditPrompt(result.editPrompt);
      setAiDesignSession(result.session);
      setImgPos({ x: 0, y: 0 });
      setImgScale(1);
      setImgScaleY(1);
      await handleFileUpload(file);
    },
    [handleFileUpload],
  );

  // Reset the preview/builder state after a successful "Add to Cart" so the
  // user can immediately start building another product.
  const resetPreview = useCallback(() => {
    uploadGenerationRef.current += 1;
    activeUploadAbortControllerRef.current?.abort();
    activeUploadAbortControllerRef.current = null;
    activeUploadPromiseRef.current = null;
    activeUploadFileRef.current = null;
    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;
    uploadedFileRef.current = null;
    preparedPlacementRef.current = null;
    setPendingPlacementPreview(null);
    setUploadedFile(null);
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    setRestoredNormalizedTransform(null);
    setRestoredCompositionRevision(0);
    setPolePocketSize('2');
    setUploadError('');
    setAiPrompt(null);
    setAiEditPrompt(null);
    setAiDesignSession(null);
    setHasJustAddedToCart(false);
    setShowPostAddResetNotice(false);
    setHasReviewedYardSignStakes(false);
    setHasReviewedYardSignPrintSide(false);
    setHasConfirmedSize(false);
    setHasConfirmedMaterial(false);
    setHasConfirmedQuantity(false);
    setHasReviewedOptions(false);
    if (isYardSign) {
      setYardSignDesigns([]);
    }
  }, [isYardSign]);
  const resetAfterSuccessfulAdd = useCallback(() => {
    resetPreview();
    // Keep the page in a distinct success state until the shopper explicitly
    // opens the cart or chooses to build another product. This prevents the
    // sticky bar from falling back to a stale "Use [size]" prompt.
    setHasJustAddedToCart(true);
    setShowPostAddResetNotice(true);
    setIsCartOpen(true);
  }, [resetPreview, setIsCartOpen]);

  // Shared post-add-to-cart UX:
  //  - 'checkout' -> navigate directly to /checkout (no cart drawer hop)
  //  - 'cart'     -> stay on page, show toast confirmation, flip to "View Cart"
  const finishAddToCart = useCallback((
    actionType: 'checkout' | 'cart',
    navigateUrl?: string,
  ) => {
    setPendingCheckoutData(null);
    if (aiDesignSession) {
      trackAIEvent('ai_added_to_cart', { product_type: 'banner' });
      if (actionType === 'checkout') trackAIEvent('ai_checkout_started', { product_type: 'banner' });
    }
    if (actionType === 'checkout') {
      if (navigateUrl) {
        window.history.replaceState(null, '', navigateUrl);
      }
      navigate('/checkout');
    } else {
      toast({
        title: 'Added to cart âœ“',
      });
      resetAfterSuccessfulAdd();
      logUx('add_to_cart_completed', { source: 'finish_add_to_cart' });
    }
  }, [aiDesignSession, navigate, toast, resetAfterSuccessfulAdd]);

  const prepareCurrentPlacementPreview = useCallback(async (
    editorSource: 'inline' | 'modal',
  ): Promise<{ spec: ArtworkCompositionSpec; artifact: ReadyPlacementPreviewManifest }> => {
    let artwork = await ensurePermanentArtworkUploaded();
    if (!artwork) {
      throw new PreviewLifecycleError('ORIGINAL_UPLOAD_INCOMPLETE', 'The direct original-artwork upload did not complete.');
    }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const editor = editorSource === 'modal'
        ? (modalEditorRef.current || inlineEditorRef.current)
        : (inlineEditorRef.current || modalEditorRef.current);
      if (!editor) {
        throw new PreviewLifecycleError('PREVIEW_GEOMETRY_NOT_READY', 'The visible artwork editor is not mounted.', { editorSource });
      }
      const snapshot = editor.getCompositionSnapshot();
      const config = latestPreviewConfigRef.current;
      artwork = uploadedFileRef.current || artwork;
      const manifest = artwork.artworkManifest;
      const originalUrl = manifest?.originalUrl || artwork.productionUrl || artwork.url;
      const sourceUrl = artwork.isPdf
        ? (artwork.previewUrl && /^https?:\/\//i.test(artwork.previewUrl) ? artwork.previewUrl : getPdfThumbnailUrl(originalUrl))
        : originalUrl;
      const spec: ArtworkCompositionSpec = {
        version: PREVIEW_ARTIFACT_VERSION,
        sourceUrl,
        sourceIdentity: [manifest?.publicId || artwork.productionPublicId || artwork.fileKey, manifest?.version ?? '', artwork.pdfPageNumber || 1].join('@'),
        productType: config.productType,
        widthIn: config.widthIn,
        heightIn: config.heightIn,
        fitMode: 'fit',
        transform: snapshot.transform,
        revision: snapshot.revision,
      };
      const artifact = await createPermanentPlacementPreview(spec);
      const latestEditor = editorSource === 'modal'
        ? (modalEditorRef.current || inlineEditorRef.current)
        : (inlineEditorRef.current || modalEditorRef.current);
      const latestArtwork = uploadedFileRef.current;
      const latestConfig = latestPreviewConfigRef.current;
      if (!latestEditor || !latestArtwork) {
        throw new PreviewLifecycleError('COMPOSITION_CHANGED', 'The artwork editor closed during preview preparation.');
      }
      const latestSnapshot = latestEditor.getCompositionSnapshot();
      const latestManifest = latestArtwork.artworkManifest;
      const latestOriginalUrl = latestManifest?.originalUrl || latestArtwork.productionUrl || latestArtwork.url;
      const latestSpec: ArtworkCompositionSpec = {
        version: PREVIEW_ARTIFACT_VERSION,
        sourceUrl: latestArtwork.isPdf
          ? (latestArtwork.previewUrl && /^https?:\/\//i.test(latestArtwork.previewUrl) ? latestArtwork.previewUrl : getPdfThumbnailUrl(latestOriginalUrl))
          : latestOriginalUrl,
        sourceIdentity: [latestManifest?.publicId || latestArtwork.productionPublicId || latestArtwork.fileKey, latestManifest?.version ?? '', latestArtwork.pdfPageNumber || 1].join('@'),
        productType: latestConfig.productType,
        widthIn: latestConfig.widthIn,
        heightIn: latestConfig.heightIn,
        fitMode: 'fit',
        transform: latestSnapshot.transform,
        revision: latestSnapshot.revision,
      };
      if (artifact.compositionSignature === buildCompositionSignature(latestSpec)) {
        preparedPlacementRef.current = { spec: latestSpec, artifact };
        setPendingPlacementPreview(artifact);
        setPendingCheckoutData(toCheckoutTransform(latestSpec));
        return { spec: latestSpec, artifact };
      }
      console.info('[gab_placement_preview_stale_discarded]', {
        attempt,
        completedSignature: artifact.compositionSignature,
        latestSignature: buildCompositionSignature(latestSpec),
      });
    }
    throw new PreviewLifecycleError('COMPOSITION_CHANGED', 'The composition changed during all bounded preparation attempts.');
  }, [ensurePermanentArtworkUploaded]);

  // Actually perform checkout after upsell decision
  const performCheckout = useCallback(async (
    selectedOptions: UpsellOption[],
    directData?: { pos: { x: number; y: number }, scale: number, scaleY?: number },
    actionType: 'checkout' | 'cart' = 'checkout',
  ) => {
    const checkoutData = directData || pendingCheckoutData;
    const configurationValidation = validateProductConfiguration({
      productType,
      widthIn,
      heightIn,
      grommets: productType === 'banner' ? grommets : null,
    });
    if (!configurationValidation.valid) {
      toast({
        title: 'Review product size',
        description: configurationValidation.message,
        variant: 'destructive',
      });
      return;
    }
    let checkoutArtwork = uploadedFileRef.current;
    const preparedPlacement = preparedPlacementRef.current;
    
    // For yard signs, we use the multi-design flow
    if (isYardSign && yardSignPricing) {
      if (yardSignDesigns.length === 0 || yardSignTotalQty === 0) return;
      if (!yardSignQuantityValid.valid) return;
      const missingExactDesign = yardSignDesigns.find((design) => !isReadyPlacementPreview(design.placementPreview));
      if (missingExactDesign) {
        toast({
          title: 'YARD_SIGN_PREVIEW_NOT_READY',
          description: `Review and save the exact preview for ${missingExactDesign.fileName} before continuing. No cart item was created.`,
          variant: 'destructive',
        });
        return;
      }

      // Use first design as the primary file for cart/order display
      const primaryDesign = yardSignDesigns[0];
      const primaryPlacement = primaryDesign.placementPreview!;

      // Build yard sign metadata for order
      const yardSignMetadata = {
        sidedness: yardSignSidedness,
        addStepStakes: yardSignAddStepStakes,
        stepStakeQty: yardSignAddStepStakes ? yardSignStepStakeQty : 0,
        stepStakeQuantity: yardSignAddStepStakes ? yardSignStepStakeQty : 0,
        totalSignQuantity: yardSignTotalQty,
        designCount: yardSignDesigns.length,
        signSubtotalCents: yardSignPricing.signSubtotalCents,
        stakeSubtotalCents: yardSignPricing.stepStakeTotalCents,
        designs: yardSignDesigns.map(d => ({
          id: d.id,
          fileName: d.fileName,
          fileUrl: d.fileUrl,
          fileKey: d.fileKey,
          thumbnailUrl: d.previewThumbnailUrl || d.thumbnailUrl,
          isPdf: d.isPdf,
          quantity: d.quantity,
          imgScale: d.imgScale,
          imgScaleY: d.imgScaleY,
          imgPos: d.imgPos,
          imgConstrain: d.imgConstrain,
          previewThumbnailUrl: d.previewThumbnailUrl,
          placementPreview: d.placementPreview,
          compositionSignature: d.placementPreview?.compositionSignature,
        })),
      };

      const canvasStateJson = JSON.stringify({
        source: 'yard-sign',
        version: 3,
        originalImageUrl: primaryDesign.fileUrl,
        originalImageFileKey: primaryDesign.fileKey,
        isPdf: primaryDesign.isPdf,
        widthIn: YARD_SIGN_WIDTH_IN,
        heightIn: YARD_SIGN_HEIGHT_IN,
        orientation: YARD_SIGN_WIDTH_IN === YARD_SIGN_HEIGHT_IN ? 'square' : YARD_SIGN_WIDTH_IN > YARD_SIGN_HEIGHT_IN ? 'landscape' : 'portrait',
        imgPos: primaryDesign.imgPos || { x: 0, y: 0 },
        imgScale: primaryDesign.imgScale || 1,
        imgScaleY: primaryDesign.imgScaleY ?? primaryDesign.imgScale ?? 1,
        constrainProportions: primaryDesign.imgConstrain ?? true,
        normalizedPlacement: {
          x_pct: primaryPlacement.positionPct.x,
          y_pct: primaryPlacement.positionPct.y,
          scale_x: primaryPlacement.scaleX,
          scale_y: primaryPlacement.scaleY,
          fit_mode: primaryPlacement.fitMode,
        },
        containerCssWidth: null,
        containerCssHeight: null,
        bgColor: '#fafafa',
        productType: 'yard_sign',
        canonicalComposition: primaryPlacement,
        yardSignMetadata,
      });

      quoteStore.set({
        widthIn: YARD_SIGN_WIDTH_IN,
        heightIn: YARD_SIGN_HEIGHT_IN,
        quantity: yardSignTotalQty,
        material: 'corrugated' as MaterialKey,
        grommets: 'none' as any,
        polePockets: 'none',
        polePocketSize: '2' as any,
        addRope: false,
        imagePosition: primaryDesign.imgPos || { x: 0, y: 0 },
        imageScale: primaryDesign.imgScale || 1,
        fitMode: 'fit',
        thumbnailUrl: primaryPlacement.previewUrl || primaryPlacement.url,
        webPreviewUrl: primaryPlacement.previewUrl || primaryPlacement.url,
        placementPreview: primaryPlacement,
        file: {
          name: primaryDesign.fileName,
          url: primaryDesign.fileUrl,
          fileKey: primaryDesign.fileKey,
          size: 0,
          isPdf: primaryDesign.isPdf,
          thumbnailUrl: primaryPlacement.previewUrl || primaryPlacement.url,
          type: primaryDesign.isPdf ? 'application/pdf' : 'image/*',
        } as any,
        finalRenderUrl: null,
        finalRenderFileKey: null,
        finalRenderWidthPx: null,
        finalRenderHeightPx: null,
        finalRenderDpi: null,
        canvasStateJson,
      });

      const pricing = {
        unit_price_cents: yardSignPricing.unitPriceCents,
        rope_cost_cents: 0,
        pole_pocket_cost_cents: 0,
        line_total_cents: yardSignPricing.totalCents,
      };
      const quoteState = useQuoteStore.getState();
      (quoteState as any).product_type = 'yard_sign';
      (quoteState as any).yard_sign_metadata = yardSignMetadata;
      if (editItemId) cartStore.updateCartItem(editItemId, quoteState, undefined, pricing);
      else cartStore.addFromQuote(quoteState, undefined, pricing);

      console.log('[YARD_SIGN] âœ… Cart item created with yard sign metadata');
      finishAddToCart(actionType, '/google-ads-banner?product=yard-signs');
      return;
    }

    if (!preparedPlacement || !isReadyPlacementPreview(preparedPlacement.artifact)) {
      toast({
        title: 'PERMANENT_PREVIEW_UNAVAILABLE',
        description: 'The exact permanent composition was not ready, so no cart item was created.',
        variant: 'destructive',
      });
      return;
    }

    if (isCarMagnet && carMagnetPricing) {
      if (!checkoutArtwork || !checkoutData) return;
      checkoutArtwork = await ensurePermanentArtworkUploaded();
      if (!checkoutArtwork) return;

      const container = previewContainerRef.current;
      const canvasStateJson = JSON.stringify({
        source: 'google-ads-banner',
        version: 2,
        originalImageUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
        originalImageFileKey: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
        isPdf: checkoutArtwork.isPdf,
        previewUrl: checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || null,
        productionUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
        productionPublicId: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
        resourceType: checkoutArtwork.resourceType,
        mimeType: checkoutArtwork.mimeType,
        originalFormat: checkoutArtwork.originalFormat,
        originalBytes: checkoutArtwork.originalBytes,
        originalWidth: checkoutArtwork.originalWidth,
        originalHeight: checkoutArtwork.originalHeight,
        pdfPageNumber: checkoutArtwork.pdfPageNumber,
        widthIn,
        heightIn,
        orientation: widthIn === heightIn ? 'square' : widthIn > heightIn ? 'landscape' : 'portrait',
        imgPos: checkoutData.pos,
        imgScale: checkoutData.scale,
        ...(checkoutData.scaleY != null && checkoutData.scaleY !== checkoutData.scale ? { imgScaleY: checkoutData.scaleY } : {}),
        constrainProportions: constrainProps,
        normalizedPlacement: {
          x_pct: checkoutData.pos.x,
          y_pct: checkoutData.pos.y,
          scale_x: checkoutData.scale,
          scale_y: checkoutData.scaleY ?? checkoutData.scale,
          fit_mode: 'fit',
        },
        containerCssWidth: container?.offsetWidth || null,
        containerCssHeight: container?.offsetHeight || null,
        bgColor: '#fafafa',
        productType: 'car_magnet',
        roundedCorners: carMagnetRoundedCorners,
        canonicalComposition: preparedPlacement.spec,
        placementPreview: preparedPlacement.artifact,
        ...(aiPrompt ? { aiPrompt } : {}),
        ...(aiEditPrompt ? { aiEditPrompt } : {}),
      });

      const approvedThumbnailUrl = preparedPlacement.artifact.previewUrl;

      quoteStore.set({
        widthIn,
        heightIn,
        quantity,
        material: 'magnetic' as MaterialKey,
        grommets: 'none' as any,
        polePockets: 'none',
        polePocketSize: '2' as any,
        addRope: false,
        imagePosition: checkoutData.pos,
        imageScale: checkoutData.scale,
        imageScaleY: checkoutData.scaleY ?? checkoutData.scale,
        fitMode: 'fit',
        thumbnailUrl: approvedThumbnailUrl,
        webPreviewUrl: approvedThumbnailUrl,
        artworkManifest: checkoutArtwork.artworkManifest,
        placementPreview: preparedPlacement.artifact,
        file: { name: checkoutArtwork.name, url: checkoutArtwork.url, fileKey: checkoutArtwork.fileKey, size: checkoutArtwork.size, isPdf: checkoutArtwork.isPdf, thumbnailUrl: checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl,
              previewUrl: checkoutArtwork.previewUrl,
              productionUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
              productionPublicId: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
              resourceType: checkoutArtwork.resourceType,
              mimeType: checkoutArtwork.mimeType,
              originalFormat: checkoutArtwork.originalFormat,
              originalBytes: checkoutArtwork.originalBytes,
              originalWidth: checkoutArtwork.originalWidth,
              originalHeight: checkoutArtwork.originalHeight,
              pdfPageNumber: checkoutArtwork.pdfPageNumber, type: checkoutArtwork.isPdf ? 'application/pdf' : 'image/*' } as any,
        finalRenderUrl: null,
        finalRenderFileKey: null,
        finalRenderWidthPx: null,
        finalRenderHeightPx: null,
        finalRenderDpi: null,
        canvasStateJson,
      } as any);

      const magnetQuoteState = useQuoteStore.getState();
      (magnetQuoteState as any).product_type = 'car_magnet';
      (magnetQuoteState as any).rounded_corners = carMagnetRoundedCorners;
      const magnetPricing = {
        unit_price_cents: carMagnetPricing.unitPriceCents,
        rope_cost_cents: 0,
        pole_pocket_cost_cents: 0,
        // Store RAW (pre-discount) line total so the cart's resolver can
        // apply the quantity-discount tier uniformly across all magnet/banner items.
        line_total_cents: carMagnetPricing.baseSubtotalCents,
      };
      if (editItemId) cartStore.updateCartItem(editItemId, magnetQuoteState, undefined, magnetPricing);
      else cartStore.addFromQuote(magnetQuoteState, undefined, magnetPricing);

      finishAddToCart(actionType, '/google-ads-banner?product=car-magnets');
      return;
    }

    // Banner flow
    if (!checkoutArtwork || !checkoutData) return;
    
    let finalGrommets = grommets;
    let finalRope = addRope;
    let finalPolePockets = polePockets;
    let finalPolePocketSize = polePocketSize;

    selectedOptions.forEach(opt => {
      if (opt.selected) {
        if (opt.id === 'grommets' && opt.grommetSelection) {
          finalGrommets = opt.grommetSelection;
        }
        if (opt.id === 'rope') {
          finalRope = true;
        }
        if (opt.id === 'polePockets' && opt.polePocketSelection) {
          finalPolePockets = opt.polePocketSelection;
          finalPolePocketSize = opt.polePocketSize || '2';
        }
      }
    });

    // FINAL_RENDER: Generate a pixel-perfect snapshot of the banner as designed.
    const container = previewContainerRef.current;
    
    // SKIP client-side final render - server uses design state for better quality render
    const finalRenderResult: { url: string; fileKey: string; widthPx: number; heightPx: number; dpi: number } | null = null;
    console.log('[FINAL_RENDER_HTML] Skipped - using server-side design state rendering');

    // DESIGN STATE: Save the exact approved design state for server-side re-rendering.
    const canvasStateJson = JSON.stringify({
      source: 'google-ads-banner',
      version: 2,
      originalImageUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
      originalImageFileKey: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
      isPdf: checkoutArtwork.isPdf,
      previewUrl: checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || null,
      productionUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
      productionPublicId: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
      resourceType: checkoutArtwork.resourceType,
      mimeType: checkoutArtwork.mimeType,
      originalFormat: checkoutArtwork.originalFormat,
      originalBytes: checkoutArtwork.originalBytes,
      originalWidth: checkoutArtwork.originalWidth,
      originalHeight: checkoutArtwork.originalHeight,
      pdfPageNumber: checkoutArtwork.pdfPageNumber,
      widthIn,
      heightIn,
      orientation: widthIn === heightIn ? 'square' : widthIn > heightIn ? 'landscape' : 'portrait',
      imgPos: checkoutData.pos,
      imgScale: checkoutData.scale,
      ...(checkoutData.scaleY != null && checkoutData.scaleY !== checkoutData.scale ? { imgScaleY: checkoutData.scaleY } : {}),
      constrainProportions: constrainProps,
      normalizedPlacement: {
        x_pct: checkoutData.pos.x,
        y_pct: checkoutData.pos.y,
        scale_x: checkoutData.scale,
        scale_y: checkoutData.scaleY ?? checkoutData.scale,
        fit_mode: 'fit',
      },
      polePocketSize: finalPolePocketSize,
      containerCssWidth: container?.offsetWidth || null,
      containerCssHeight: container?.offsetHeight || null,
      bgColor: '#fafafa',
      productType: 'banner',
      canonicalComposition: preparedPlacement.spec,
      placementPreview: preparedPlacement.artifact,
      ...(aiPrompt ? { aiPrompt } : {}),
      ...(aiEditPrompt ? { aiEditPrompt } : {}),
    });
    console.log('[DESIGN_STATE] Saved design state:', canvasStateJson.length, 'chars');

    const approvedThumbnailUrl = preparedPlacement.artifact.previewUrl;

    // Banner pricing â€” per sqft (existing logic)
    const updatedTotals = calcTotals({ 
      widthIn, heightIn, qty: quantity, material, 
      addRope: finalRope,
      ropePlacement,
      polePockets: finalPolePockets,
    });
    
    quoteStore.set({
      widthIn, heightIn, quantity, material,
      grommets: finalGrommets as any, 
      polePockets: finalPolePockets, 
      polePocketSize: finalPolePocketSize as any,
      addRope: finalRope,
      ropePlacement,
      imagePosition: checkoutData.pos,
      imageScale: checkoutData.scale,
      imageScaleY: checkoutData.scaleY ?? checkoutData.scale,
      fitMode: 'fit',
      thumbnailUrl: approvedThumbnailUrl,
      webPreviewUrl: approvedThumbnailUrl,
      file: { name: checkoutArtwork.name, url: checkoutArtwork.url, fileKey: checkoutArtwork.fileKey, size: checkoutArtwork.size, isPdf: checkoutArtwork.isPdf, thumbnailUrl: checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl,
              previewUrl: checkoutArtwork.previewUrl,
              productionUrl: checkoutArtwork.productionUrl || checkoutArtwork.url,
              productionPublicId: checkoutArtwork.productionPublicId || checkoutArtwork.fileKey,
              resourceType: checkoutArtwork.resourceType,
              mimeType: checkoutArtwork.mimeType,
              originalFormat: checkoutArtwork.originalFormat,
              originalBytes: checkoutArtwork.originalBytes,
              originalWidth: checkoutArtwork.originalWidth,
              originalHeight: checkoutArtwork.originalHeight,
              pdfPageNumber: checkoutArtwork.pdfPageNumber, type: checkoutArtwork.isPdf ? 'application/pdf' : 'image/*' } as any,
      artworkManifest: checkoutArtwork.artworkManifest,
      placementPreview: preparedPlacement.artifact,
      finalRenderUrl: finalRenderResult?.url || null,
      finalRenderFileKey: finalRenderResult?.fileKey || null,
      finalRenderWidthPx: finalRenderResult?.widthPx || null,
      finalRenderHeightPx: finalRenderResult?.heightPx || null,
      finalRenderDpi: finalRenderResult?.dpi || null,
      canvasStateJson: canvasStateJson,
    });
    const pricing = {
      unit_price_cents: Math.round(updatedTotals.unit * 100),
      rope_cost_cents: Math.round(updatedTotals.rope * 100),
      pole_pocket_cost_cents: Math.round(updatedTotals.polePocket * 100),
      line_total_cents: Math.round(updatedTotals.materialTotal * 100),
    };
    // CRITICAL: Explicitly set product_type on quote state so cart item is correctly tagged.
    // Without this, a stale product_type from a prior yard-sign add leaks into the banner item.
    const bannerQuoteState = useQuoteStore.getState();
    (bannerQuoteState as any).product_type = 'banner';
    if (editItemId) cartStore.updateCartItem(editItemId, bannerQuoteState, undefined, pricing);
    else cartStore.addFromQuote(bannerQuoteState, undefined, pricing);

    console.log('[FINAL_RENDER_HTML] âœ… Cart item created with verified permanent placement preview');
    finishAddToCart(actionType, '/google-ads-banner?product=banner');
  }, [ensurePermanentArtworkUploaded, pendingCheckoutData, grommets, addRope, polePockets, polePocketSize, widthIn, heightIn, quantity, material, quoteStore, cartStore, isYardSign, isCarMagnet, carMagnetPricing, carMagnetRoundedCorners, yardSignMaterial, yardSignPricing, productType, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, yardSignSidedness, yardSignAddStepStakes, yardSignStepStakeQty, finishAddToCart, toast, editItemId, aiPrompt, aiEditPrompt, ropePlacement, constrainProps]);

  const prepareAndRoutePlacement = useCallback((
    actionType: 'checkout' | 'cart',
    editorSource: 'inline' | 'modal',
  ): Promise<void> => {
    if (!isYardSign && !isCarMagnet && !hasCommittedBannerSize) {
      toast({
        title: 'Choose a banner size',
        description: 'Select a standard size or enter custom dimensions before continuing.',
        variant: 'destructive',
      });
      return Promise.resolve();
    }
    if (actionPreparationRef.current) return actionPreparationRef.current;
    const promise = (async () => {
      setIsProcessingUpsell(true);
      try {
        const prepared = await prepareCurrentPlacementPreview(editorSource);
        if (
          prepared.spec.productType !== productType
          || prepared.spec.widthIn !== widthIn
          || prepared.spec.heightIn !== heightIn
        ) {
          throw new PreviewLifecycleError(
            'COMPOSITION_CHANGED',
            'The product configuration changed while the action was being prepared; the stale action was discarded.',
            {
              actionProductType: productType,
              actionWidthIn: widthIn,
              actionHeightIn: heightIn,
              preparedProductType: prepared.spec.productType,
              preparedWidthIn: prepared.spec.widthIn,
              preparedHeightIn: prepared.spec.heightIn,
            },
          );
        }
        const transform = toCheckoutTransform(prepared.spec);
        setPendingActionType(actionType);
        if (isCarMagnet || finishingType !== 'none' || hasReviewedOptions) {
          await performCheckout([], transform, actionType);
          if (editorSource === 'modal') setShowPreview(false);
        } else {
          if (editorSource === 'modal') setShowPreview(false);
          logUx('upsell_opened', {
            source: actionType,
            compositionSignature: prepared.artifact.compositionSignature,
          });
          setShowUpsellModal(true);
        }
      } catch (error) {
        const explained = explainPreviewLifecycleError(error);
        console.error('[gab_placement_preview_failed]', {
          code: explained.code,
          reason: explained.technicalReason,
          details: error instanceof PreviewLifecycleError ? error.details : undefined,
          actionType,
          editorSource,
        });
        toast({
          title: explained.code,
          description: `${explained.description} Technical reason: ${explained.technicalReason}`,
          variant: 'destructive',
        });
      } finally {
        setIsProcessingUpsell(false);
        if (actionPreparationRef.current === promise) actionPreparationRef.current = null;
      }
    })();
    actionPreparationRef.current = promise;
    return promise;
  }, [finishingType, hasCommittedBannerSize, hasReviewedOptions, heightIn, isCarMagnet, isYardSign, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);

  // Proceed directly to checkout only after the actual editor canvas is finalized.
  const handleCheckout = useCallback(() => {
    // Yard signs: use multi-design flow (no single uploadedFile needed)
    if (isYardSign) {
      if (yardSignDesigns.length === 0 || yardSignTotalQty === 0) return;
      if (!yardSignQuantityValid.valid) return;
      void performCheckout([], { pos: { x: 0, y: 0 }, scale: 1 }).catch((error) => {
        const explained = explainPreviewLifecycleError(error);
        toast({ title: explained.code, description: `${explained.description} Technical reason: ${explained.technicalReason}`, variant: 'destructive' });
      });
      return;
    }
    if (!uploadedFile) return;
    void prepareAndRoutePlacement('checkout', 'inline');
  }, [uploadedFile, performCheckout, isYardSign, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, prepareAndRoutePlacement, toast]);

  const handleAddToCart = useCallback(() => {
    if (isYardSign) {
      if (yardSignDesigns.length === 0 || yardSignTotalQty === 0) return;
      if (!yardSignQuantityValid.valid) return;
      void performCheckout([], { pos: { x: 0, y: 0 }, scale: 1 }, 'cart').catch((error) => {
        const explained = explainPreviewLifecycleError(error);
        toast({ title: explained.code, description: `${explained.description} Technical reason: ${explained.technicalReason}`, variant: 'destructive' });
      });
      return;
    }

    if (!uploadedFile) return;
    void prepareAndRoutePlacement('cart', 'inline');
  }, [uploadedFile, performCheckout, isYardSign, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, prepareAndRoutePlacement, toast]);


// Trigger upsell modal after confirming position
  const handleConfirmPosition = useCallback((_pos: { x: number; y: number }, _scale: number, _scaleY?: number) => {
    if (!uploadedFile) return;
    void prepareAndRoutePlacement('checkout', 'modal');
  }, [uploadedFile, prepareAndRoutePlacement]);

  // Handle upsell modal continue
  const handleUpsellContinue = useCallback(async (selectedOptions: UpsellOption[], dontAskAgain: boolean) => {
    setIsProcessingUpsell(true);
    setShowUpsellModal(false);
    if (dontAskAgain) {
      sessionStorage.setItem('upsell-dont-show-again', 'true');
    }
    selecteg­ıöÚ$z{-®éÜj×à¥Ñ•µÌµÍÑ…ÉĞ…À´ÈÉ½Õ¹‘•µá°‰½É‘•È‰½É‘•ÈµlİÍÑt‰œµlÑátÁà´ÌÁä´È¸ÔÑ•áĞµÍ´Ñ•áĞµÍ±…Ñ”´ÜÀÀˆø(€€€€€€€€€€€€€€€€€€€€€€ñ¡•­¥É±”±…ÍÍ9…µ”ô‰µĞ´À¸Ô ´ĞÜ´Ğ™±•àµÍ¡É¥¹¬´ÀÑ•áĞµlŒÄàĞĞátˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñÀøñÍÑÉ½¹œ±…ÍÍ9…µ”ô‰Ñ•áĞµlŒÁÅÍtˆùAÉ•µ¥Õ´µ…¹•Ñ¥Œµ…Ñ•É¥…°¥Ì¥¹±Õ‘•¸ğ½ÍÑÉ½¹œøQ¡•É”¥Ì¹¼µ…Ñ•É¥…°¡½¥”™½È…Èµ…¹•ÑÌ¸ğ½Àø(€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ìˆø(€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ…É¥„µ±…‰•°ô‰•É•…Í”ÅÕ…¹Ñ¥Ñäˆ½¹±¥¬õì ¤€ôøÍ•ÑEÕ…¹Ñ¥Ñä¡Ä€ôø5…Ñ ¹µ…à Ä°Ä€´€Ä¤¥ô±…ÍÍ9…µ”ô‰Ü´ÄÄ ´ÄÄ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀÉ½Õ¹‘•µá°¡½Ù•Èé‰½É‘•ÈµÉ…ä´ĞÀÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆø(€€€€€€€€€€€€€€€€€€€€€€ñ5¥¹ÕÌ±…ÍÍ9…µ”ô‰ ´ĞÜ´ĞÑ•áĞµÉ…ä´ØÀÀˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÅôµ…àõìääåôÙ…±Õ”õíÅÕ…¹Ñ¥Ñåô…É¥„µ±…‰•°ô‰EÕ…¹Ñ¥Ñäˆ½¹¡…¹”õí”€ôøÍ•ÑEÕ…¹Ñ¥Ñä¡5…Ñ ¹µ…à Ä°€­”¹Ñ…É•Ğ¹Ù…±Õ”ñğ€Ä¤¥ô±…ÍÍ9…µ”ô‰ ´ÄÄÜ´ÈÀ‰½É‘•ÈÉ½Õ¹‘•µá°Áà´ÌÁä´Ä¸ÔÑ•áĞµ‰…Í”Ñ•áĞµ•¹Ñ•Èˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ…É¥„µ±…‰•°ô‰%¹É•…Í”ÅÕ…¹Ñ¥Ñäˆ½¹±¥¬õì ¤€ôøÍ•ÑEÕ…¹Ñ¥Ñä¡Ä€ôø5…Ñ ¹µ¥¸ äää°Ä€¬€Ä¤¥ô±…ÍÍ9…µ”ô‰Ü´ÄÄ ´ÄÄ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀÉ½Õ¹‘•µá°¡½Ù•Èé‰½É‘•ÈµÉ…ä´ĞÀÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆø(€€€€€€€€€€€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰ ´ĞÜ´ĞÑ•áĞµÉ…ä´ØÀÀˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€ì…¥Í…É5…¹•Ğ€˜˜‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹ÑQåÁ”€ôôô€ÅÕ…¹Ñ¥Ñäœ€˜˜ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”€ø€À€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ••¸´ØÀÀ™½¹Ğµµ•‘¥Õ´µĞ´Ä¸Ôˆø(€€€€€€€€€€€€€€€€€€€€€ƒÂ~:$í5…Ñ ¹É½Õ¹¡ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”€¨€ÄÀÀ¥ô”‰Õ±¬‘¥Í½Õ¹Ğ…ÁÁ±¥•…Ğ¡•­½ÕĞ(€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€ì…¥Í…É5…¹•Ğ€˜˜‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½Ñ¥½¹%€ôôô€1I}	99I|ÈÔœ€˜˜ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”€ø€À€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µĞ´Ä¸ÔÑ•áĞµáÌ™½¹Ğµµ•‘¥Õ´Ñ•áĞµ•µ•É…±´ÜÀÀˆø(€€€€€€€€€€€€€€€€€€€€€1…É”	…¹¹•È€ÈÔ”=™˜…ÁÁ±¥•…ÕÑ½µ…Ñ¥…±±ä¸EÕ…¹Ñ¥Ñä‘¥Í½Õ¹ÑÌ…¹¹½Ğ‰”½µ‰¥¹•¸(€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€ì…¥Í…É5…¹•Ğ€˜˜ÅÕ…¹Ñ¥Ñä€ôôô€Ä€˜˜‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½Ñ¥½¹%€„ôô€1I}	99I|ÈÔœ€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Ä¸Ôˆù=É‘•È€È¬™½ÈÕÀÑ¼€ÄÌ”½™˜ğ½Àø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€ğ½½¹™¥…Éø¤ì(€½¹ÍĞÍ¥é•…É€ô€ ñ½¹™¥…É(€€€€€€€€€€€€€€€€€ÍÑ•ÀõìÅô(€€€€€€€€€€€€€€€€€Ñ¥Ñ±”õí¥Í…É5…¹•Ğ€ü€‰¡½½Í”å½ÕÈÍ¥é”ˆ€è€‰M¥é”€˜ÅÕ…¹Ñ¥Ñä‰ô(€€€€€€€€€€€€€€€€€¥ô‰Í¥é”µÍ•Ñ¥½¸ˆ(€€€€€€€€€€€€€€€€€¡•…‘•ÉI¥¡Ğõì…¥Í…É5…¹•Ğ€ü€ (€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•ÈÉ½Õ¹‘•µ±œ‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀ‰œµİ¡¥Ñ”À´À¸ÔÑ•áĞµáÌˆÉ½±”ô‰É½ÕÀˆ…É¥„µ±…‰•°ô‰¥ÍÁ±…äÕ¹¥Ğˆø(€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€€€€€…É¥„µÁÉ•ÍÍ•õíÕ¹¥Ğ€ôôô€¥¸ô(€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑU¹¥Ğ ¥¸œ¥ô(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÁà´È¸ÔÁä´ÄÉ½Õ¹‘•µµÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ€‘íÕ¹¥Ğ€ôôô€¥¸œ€ü€‰œµ½É…¹”´ÔÀÀÑ•áĞµİ¡¥Ñ”™½¹ĞµÍ•µ¥‰½±œ€è€Ñ•áĞµÉ…ä´ØÀÀ¡½Ù•ÈéÑ•áĞµÉ…ä´àÀÀõô(€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€%¹¡•Ì(€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€€€€€…É¥„µÁÉ•ÍÍ•õíÕ¹¥Ğ€ôôô€™Ğô(€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑU¹¥Ğ ™Ğœ¥ô(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÁà´È¸ÔÁä´ÄÉ½Õ¹‘•µµÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ€‘íÕ¹¥Ğ€ôôô€™Ğœ€ü€‰œµ½É…¹”´ÔÀÀÑ•áĞµİ¡¥Ñ”™½¹ĞµÍ•µ¥‰½±œ€è€Ñ•áĞµÉ…ä´ØÀÀ¡½Ù•ÈéÑ•áĞµÉ…ä´àÀÀõô(€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€••Ğ(€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€¤€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”õí¥Í…É5…¹•Ğ€ü€œœ€è€É¥±œéÉ¥µ½±Ì´È±œé…À´Øôø(€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰‰±½¬Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ…ä´ÜÀÀµˆ´ÈˆùA½ÁÕ±…ÈM¥é•Ìğ½±…‰•°ø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´Ì…À´Èˆø(€€€€€€€€€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ(€€€€€€€€€€€€€€€€€€€€€€€€€€üI}59Q}M%iL¹µ…À ¡À¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸­•äõíÀ¹±…‰•±ô½¹±¥¬õì ¤€ôøÍ•Ñ…É5…¹•ÑM¥é•1…‰•°¡À¹±…‰•°¥ô±…ÍÍ9…µ”õí‰½É‘•ÈÉ½Õ¹‘•µá°Áä´È¸ÔÁà´ÌÑ•áĞµÍ´™½¹Ğµµ•‘¥Õ´ÑÉ…¹Í¥Ñ¥½¸µ…±°€‘í…É5…¹•ÑM¥é•1…‰•°€ôôôÀ¹±…‰•°€ü€‰½É‘•Èµ½É…¹”´ÔÀÀ‰œµ½É…¹”´ÔÀÑ•áĞµ½É…¹”´ÜÀÀÍ¡…‘½ÜµÍ´œ€è€‰½É‘•ÈµÉ…ä´ÈÀÀ¡½Ù•Èé‰½É‘•ÈµÉ…ä´ĞÀÀÑ•áĞµÉ…ä´ÜÀÀõôø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€íÀ¹±…‰•±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€¤¤(€€€€€€€€€€€€€€€€€€€€€€€€€€èAIMQ}M%iL¹µ…À ¡À°¤¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸­•äõí¥ô½¹±¥¬õì ¤€ôø…ÁÁ±åAÉ•Í•Ğ¡¤¥ô±…ÍÍ9…µ”õí‰½É‘•ÈÉ½Õ¹‘•µá°Áä´È¸ÔÁà´ÌÑ•áĞµÍ´™½¹Ğµµ•‘¥Õ´ÑÉ…¹Í¥Ñ¥½¸µ…±°€‘í…Ñ¥Ù•AÉ•Í•Ğ€ôôô¤€ü€‰½É‘•Èµ½É…¹”´ÔÀÀ‰œµ½É…¹”´ÔÀÑ•áĞµ½É…¹”´ÜÀÀÍ¡…‘½ÜµÍ´œ€è€‰½É‘•ÈµÉ…ä´ÈÀÀ¡½Ù•Èé‰½É‘•ÈµÉ…ä´ĞÀÀÑ•áĞµÉ…ä´ÜÀÀõôø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€í™½Éµ…ÑAÉ•Í•Ñ1…‰•°¡À¹Ü°À¹ °Õ¹¥Ğ¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€ì…¥Í…É5…¹•Ğ€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ø±œéµĞ´Àˆø(€€€€€€€€€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰‰±½¬Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ…ä´ÜÀÀµˆ´ÈˆùÕÍÑ½´M¥é”ğ½±…‰•°ø(€€€€€€€€€€€€€€€€€€€€€íÕ¹¥Ğ€ôôô€¥¸œ€ü€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´È…À´Ğˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù]¥‘Ñ ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÄµĞ´Äˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰Ñ•áĞˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥Œˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…ÑÑ•É¸ô‰lÀ´åt¨ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíİ¥‘Ñ¡ÕÍÑ½µ%¹MÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•Èİ¥‘Ñ ¥¸¥¹¡•Ìˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¡…¹”õí”€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ]¥‘Ñ¡ÕÍÑ½µ%¹MÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹	±ÕÈõì ¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡İ¥‘Ñ¡ÕÍÑ½µ%¹MÑÈ°€ÄÀ¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍĞ±…µÁ•€ô5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ ØÀÀ°9Õµ‰•È¹¥Í¥¹¥Ñ”¡¸¤€ü¸€è€Ä¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ]¥‘Ñ¡ÕÍÑ½µ%¹MÑÈ¡MÑÉ¥¹œ¡±…µÁ•¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ]¥‘Ñ¡ÑMÑÈ¡MÑÉ¥¹œ¡5…Ñ ¹™±½½È¡±…µÁ•€¼€ÄÈ¤¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ]¥‘Ñ¡%¹IMÑÈ¡MÑÉ¥¹œ¡±…µÁ•€”€ÄÈ¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÈÀ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù¥¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù!•¥¡Ğğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÄµĞ´Äˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰Ñ•áĞˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥Œˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…ÑÑ•É¸ô‰lÀ´åt¨ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õí¡•¥¡ÑÕÍÑ½µ%¹MÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•È¡•¥¡Ğ¥¸¥¹¡•Ìˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¡…¹”õí”€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ!•¥¡ÑÕÍÑ½µ%¹MÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹	±ÕÈõì ¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡¡•¥¡ÑÕÍÑ½µ%¹MÑÈ°€ÄÀ¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍĞ±…µÁ•€ô5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ ØÀÀ°9Õµ‰•È¹¥Í¥¹¥Ñ”¡¸¤€ü¸€è€Ä¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ!•¥¡ÑÕÍÑ½µ%¹MÑÈ¡MÑÉ¥¹œ¡±…µÁ•¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ!•¥¡ÑÑMÑÈ¡MÑÉ¥¹œ¡5…Ñ ¹™±½½È¡±…µÁ•€¼€ÄÈ¤¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ!•¥¡Ñ%¹IMÑÈ¡MÑÉ¥¹œ¡±…µÁ•€”€ÄÈ¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÈÀ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù¥¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´È…À´Ğˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù]¥‘Ñ ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÄµĞ´Äˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞÑåÁ”ô‰Ñ•áĞˆ¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆÙ…±Õ”õíİ¥‘Ñ¡ÑMÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•Èİ¥‘Ñ ™••Ğˆ½¹¡…¹”õí”€ôøìÍ•Ñ]¥‘Ñ¡ÑMÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ìÍ•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ìõô½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô½¹	±ÕÈõì ¤€ôøì½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡İ¥‘Ñ¡ÑMÑÈ°€ÄÀ¤ìÍ•Ñ]¥‘Ñ¡ÑMÑÈ¡MÑÉ¥¹œ¡¥Í9…8¡¸¤€ü€Ä€è5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ ÔÀ°¸¤¤¤¤ìõô±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÄØ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù™Ğğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞÑåÁ”ô‰Ñ•áĞˆ¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆÙ…±Õ”õíİ¥‘Ñ¡%¹IMÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•Èİ¥‘Ñ É•µ…¥¹¥¹œ¥¹¡•Ìˆ½¹¡…¹”õí”€ôøìÍ•Ñ]¥‘Ñ¡%¹IMÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ìÍ•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ìõô½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô½¹	±ÕÈõì ¤€ôøì½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡İ¥‘Ñ¡%¹IMÑÈ°€ÄÀ¤ìÍ•Ñ]¥‘Ñ¡%¹IMÑÈ¡MÑÉ¥¹œ¡¥Í9…8¡¸¤€ü€À€è5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÄÄ°¸¤¤¤¤ìõô±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÄØ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù¥¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù!•¥¡Ğğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÄµĞ´Äˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞÑåÁ”ô‰Ñ•áĞˆ¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆÙ…±Õ”õí¡•¥¡ÑÑMÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•È¡•¥¡Ğ™••Ğˆ½¹¡…¹”õí”€ôøìÍ•Ñ!•¥¡ÑÑMÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ìÍ•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ìõô½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô½¹	±ÕÈõì ¤€ôøì½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡¡•¥¡ÑÑMÑÈ°€ÄÀ¤ìÍ•Ñ!•¥¡ÑÑMÑÈ¡MÑÉ¥¹œ¡¥Í9…8¡¸¤€ü€Ä€è5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ ÔÀ°¸¤¤¤¤ìõô±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÄØ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù™Ğğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞÑåÁ”ô‰Ñ•áĞˆ¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆÙ…±Õ”õí¡•¥¡Ñ%¹IMÑÉô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰	…¹¹•È¡•¥¡ĞÉ•µ…¥¹¥¹œ¥¹¡•Ìˆ½¹¡…¹”õí”€ôøìÍ•Ñ!•¥¡Ñ%¹IMÑÈ¡”¹Ñ…É•Ğ¹Ù…±Õ”¤ìÍ•ÑÑ¥Ù•AÉ•Í•Ğ¡¹Õ±°¤ìõô½¹½ÕÌõí”€ôø”¹Ñ…É•Ğ¹Í•±•Ğ ¥ô½¹	±ÕÈõì ¤€ôøì½¹ÍĞ¸€ôÁ…ÉÍ•%¹Ğ¡¡•¥¡Ñ%¹IMÑÈ°€ÄÀ¤ìÍ•Ñ!•¥¡Ñ%¹IMÑÈ¡MÑÉ¥¹œ¡¥Í9…8¡¸¤€ü€À€è5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÄÄ°¸¤¤¤¤ìõô±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÜµ™Õ±°µ…àµÜ´ÄØ‰½É‘•ÈÉ½Õ¹‘•µ±œÁà´ÈÁä´Ä¸ÔÑ•áĞµ‰…Í”ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Í•±˜µ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆù¥¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀµĞ´ÄˆùíÍÅ™Ğ¹Ñ½¥á• Ä¥ôÍÄ™Ğğ½Àø(€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀµĞ´À¸Ôˆø(€€€€€€€€€€€€€€€€€€€€€€€íÕ¹¥Ğ€ôôô€¥¸œ(€€€€€€€€€€€€€€€€€€€€€€€€€€üƒŠ& €‘íİ¥‘Ñ¡Ñô‘íİ¥‘Ñ¡%¹H€ø€À€ü€™Ğ€‘íİ¥‘Ñ¡%¹Iô¥¹€€è€œ™Ğôƒ\€‘í¡•¥¡ÑÑô‘í¡•¥¡Ñ%¹H€ø€À€ü€™Ğ€‘í¡•¥¡Ñ%¹Iô¥¹€€è€œ™Ğõ€(€€€€€€€€€€€€€€€€€€€€€€€€€€èƒŠ& €‘íİ¥‘Ñ¡%¹ô¥¸ƒ\€‘í¡•¥¡Ñ%¹ô¥¹ô(€€€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€ì…¥Í…É5…¹•Ğ€˜˜€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´ÔÉ¥…À´Ğ‰½É‘•ÈµĞ‰½É‘•ÈµÍ±…Ñ”´ÈÀÀÁĞ´ĞÍ´éÉ¥µ½±Ìµmµ¥¹µ…à À°Å™È¥}…ÕÑ½tˆùíµ…Ñ•É¥…±…É‘õíÅÕ…¹Ñ¥Ñå…É‘ôğ½‘¥Øùô(€€€€€€€€€€€€€€€€ğ½½¹™¥…Éø¤ì(€½¹ÍĞ™¥¹¥Í¡¥¹…É€ô€ ñ½¹™¥…ÉÍÑ•ÀõìÍôÑ¥Ñ±”õí¥Í…É5…¹•Ğ€ü€I½Õ¹‘•½É¹•ÉÌœ€è€¥¹¥Í¡¥¹œ½ÁÑ¥½¹Ìô¥ô‰½ÁÑ¥½¹ÌµÍ•Ñ¥½¸ˆø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ìˆø(€€€€€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€ü€ (€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍ•±•ĞÙ…±Õ”õí…É5…¹•ÑI½Õ¹‘•‘½É¹•ÉÍô½¹¡…¹”õí”€ôøÍ•Ñ…É5…¹•ÑI½Õ¹‘•‘½É¹•ÉÌ¡”¹Ñ…É•Ğ¹Ù…±Õ”…Ì…É5…¹•ÑI½Õ¹‘•‘½É¹•È¥ô±…ÍÍ9…µ”ô‰Üµ™Õ±°‰½É‘•ÈÉ½Õ¹‘•µá°Áà´ÌÁä´Ä¸ÔÑ•áĞµ‰…Í”µĞ´Ä‰œµİ¡¥Ñ”ˆø(€€€€€€€€€€€€€€€€€€€€€€€€€íI}59Q}I=U9}=I9IL¹µ…À¡½ÁÑ¥½¸€ôø€ñ½ÁÑ¥½¸­•äõí½ÁÑ¥½¸¹Ù…±Õ•ôÙ…±Õ”õí½ÁÑ¥½¸¹Ù…±Õ•ôùí½ÁÑ¥½¸¹±…‰•±ôğ½½ÁÑ¥½¸ø¥ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€€€€€€€ñ¥¹¥Í¡¥¹=ÁÑ¥½¹Í…É(€€€€€€€€€€€€€€€€€€€€€€€½µÁ…Ğ(€€€€€€€€€€€€€€€€€€€€€€€™¥¹¥Í¡¥¹QåÁ”õí™¥¹¥Í¡¥¹QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ¥¹¥Í¡¥¹QåÁ”õíÍ•Ñ¥¹¥Í¡¥¹QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€É½µµ•ÑÌõíÉ½µµ•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€Í•ÑÉ½µµ•ÑÌõíÍ•ÑÉ½µµ•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€Á½±•A½­•ÑÌõíÁ½±•A½­•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€Í•ÑA½±•A½­•ÑÌõíÍ•ÑA½±•A½­•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€…‘‘I½Á”õí…‘‘I½Á•ô(€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ‘‘I½Á”õíÍ•Ñ‘‘I½Á•ô(€€€€€€€€€€€€€€€€€€€€€€€É½Á•A±…•µ•¹ĞõíÉ½Á•A±…•µ•¹Ñô(€€€€€€€€€€€€€€€€€€€€€€€Í•ÑI½Á•A±…•µ•¹ĞõíÍ•ÑI½Á•A±…•µ•¹Ñô(€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ğ½½¹™¥…Éø¤ì(€½¹ÍĞÕÁ±½…‘…É€ô€ ñ½¹™¥…ÉÍÑ•Àõí¥Í…É5…¹•Ğ€ü€Ğ€è€ÉôÑ¥Ñ±”ô‰UÁ±½…å½ÕÈ…ÉÑİ½É¬ˆ¥ô‰ÕÁ±½…µÍ•Ñ¥½¸ˆø(€€€€€€€€€€€€€€€€€ì¼¨!•±Á•È‰…¹¹•ÈèÍ¡½İ¸İ¡•¸Ñ¡”ÕÍ•ÈÉ•…¡•ÌÑ¡”ÕÁ±½……É‰•™½É”(€€€€€€€€€€€€€€€€€€€€€½µÁ±•Ñ¥¹œÉ•ÅÕ¥É•¡½¥•Ì¸½•Í¸Ğ‰±½¬ÕÁ±½…ƒŠP©ÕÍĞÍÕÉ™…•Ì(€€€€€€€€€€€€€€€€€€€€€İ¡…ĞÍÑ¥±°¹••‘ÌÑ¼¡…ÁÁ•¸‰•™½É”€‰‘Ñ¼…ÉĞˆİ½É­Ì¸€¨½ô(€€€€€€€€€€€€€€€€€ì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€˜˜€…ÕÁ±½…‘•‘¥±”€˜˜€  ¤€ôøì(€€€€€€€€€€€€€€€€€€€½¹ÍĞµ¥ÍÍ¥¹œèÍÑÉ¥¹mt€ômtì(€€€€€€€€€€€€€€€€€€€¥˜€ …¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”¤µ¥ÍÍ¥¹œ¹ÁÕÍ  Í¥é”œ¤ì(€€€€€€€€€€€€€€€€€€€¥˜€ …µ…Ñ•É¥…°¤µ¥ÍÍ¥¹œ¹ÁÕÍ  µ…Ñ•É¥…°œ¤ì(€€€€€€€€€€€€€€€€€€€¥˜€¡µ¥ÍÍ¥¹œ¹±•¹Ñ €ôôô€À¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µˆ´ÌÑ•áĞµáÌÑ•áĞµ…µ‰•È´ÜÀÀ‰œµ…µ‰•È´ÔÀ‰½É‘•È‰½É‘•Èµ…µ‰•È´ÈÀÀÉ½Õ¹‘•µ±œÁà´ÌÁä´Èˆø(€€€€€€€€€€€€€€€€€€€€€€€¡½½Í”íµ¥ÍÍ¥¹œ¹©½¥¸ œ…¹€œ¥ô‰•™½É”…‘‘¥¹œÑ¼…ÉĞ¸(€€€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€€€€€ô¤ ¥ô(€€€€€€€€€€€€€€€€€ì…ÕÁ±½…‘•‘¥±”€ü€ (€€€€€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€€€€€€ñ¥±•UÁ±½…‘•È(€€€€€€€€€€€€€€€€€€€€€€€É•˜õí™¥±•UÁ±½…‘•ÉI•™ô(€€€€€€€€€€€€€€€€€€€€€€€½¹UÁ±½…õí¡…¹‘±•¥±•UÁ±½…‘ô(€€€€€€€€€€€€€€€€€€€€€€€…•ÁÑ•‘QåÁ•Ìô‰¥µ…”½Á¹œ±¥µ…”½©Á•œ±…ÁÁ±¥…Ñ¥½¸½Á‘˜°¹Á¹œ°¹©Áœ°¹©Á•œ°¹Á‘˜ˆ(€€€€€€€€€€€€€€€€€€€€€€€µ…áM¥é”õìÔÀ€¨€ÄÀÈĞ€¨€ÄÀÈÑô(€€€€€€€€€€€€€€€€€€€€€€€±…‰•°ô‰UÁ±½…å½ÕÈ…ÉÑİ½É¬ˆ(€€€€€€€€€€€€€€€€€€€€€€€ÍÕ‰Q•áĞõíA9°)A°½ÈAƒŠˆ5…à€ÔÁ5ƒŠˆ€‘íİ¥‘Ñ¡¥ÍÁ±…åôƒ\€‘í¡•¥¡Ñ¥ÍÁ±…åõô(€€€€€€€€€€€€€€€€€€€€€€€¥ÍUÁ±½…‘¥¹œõí¥ÍUÁ±½…‘¥¹ô(€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíÁÉ•Ù¥•İ…¹Ù…ÍMÑå±•ô(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼ˆ(€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€ì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€˜˜Í¡½İÉ•…Ñ•]¥Ñ¡$€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ì™±•à™±•àµ½°¥Ñ•µÌµ•¹Ñ•È…À´Äˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ¥5½‘…±=Á•¸¡ÑÉÕ”¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì…¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”ñğ€…µ…Ñ•É¥…°ñğ¥ÍUÁ±½…‘¥¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÁà´ĞÁä´ÈÉ½Õ¹‘•µ™Õ±°‰œµ½É…¹”´ÔÀÀÑ•áĞµİ¡¥Ñ”Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Í¡…‘½ÜµÍ´¡½Ù•Èé‰œµ½É…¹”´ØÀÀ‘¥Í…‰±•é½Á…¥Ñä´ÔÀ‘¥Í…‰±•éÕÉÍ½Èµ¹½Ğµ…±±½İ•ÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñMÁ…É­±•Ì±…ÍÍ9…µ”ô‰Ü´Ğ ´Ğˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€É•…Ñ”İ¥Ñ $(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€ì …İ¥‘Ñ¡%¸ñğ€…¡•¥¡Ñ%¸ñğ€…µ…Ñ•É¥…°¤€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€M•±•ĞÍ¥é”…¹µ…Ñ•É¥…°™¥ÉÍĞÍ¼$…¸™¥Ğå½ÕÈ‘•Í¥¸Á•É™•Ñ±ä¸(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€€ì¼¨AÉ•Ù¥•Ü±…‰•±¥¹œ€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´Èˆø(€€€€€€€€€€€€€€€€€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹Ğµ‰½±Ñ•áĞµÉ…ä´àÀÀˆùí¥Íe…É‘M¥¸€ü€1¥Ù”e…ÉM¥¸AÉ•Ù¥•Üœ€è¥Í…É5…¹•Ğ€ü€1¥Ù”…È5…¹•ĞAÉ•Ù¥•Üœ€è€1¥Ù”	…¹¹•ÈAÉ•Ù¥•Üôğ½ Ìø(€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀˆù¥¹…°ÁÉ¥¹ĞÁÉ•Ù¥•ÜƒŠPİ¡…Ğå½ÔÍ•”¥Ìİ¡…Ğå½Ô•Ğğ½Àø(€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€ì¼¨	…¹¹•ÈÁÉ•Ù¥•Üİ¥Ñ ‘•ÁÑ ‰…­É½Õ¹€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘•µá°À´ĞµéÀ´Øµ…àµÜµ™Õ±°½Ù•É™±½Üµ¡¥‘‘•¸‰œµÍ±…Ñ”´ÌÀÀ‰½É‘•È‰½É‘•ÈµÍ±…Ñ”´ĞÀÀ¼ÜÀÍ¡…‘½Üµ¥¹¹•Èˆø(€€€€€€€€€€€€€€€€€€€€€€€ì¼¨]¥‘Ñ İÉ…ÁÁ•ÈƒŠP½¹ÍÑÉ…¥¹Ìµ…àµİ¥‘Ñ Í¼Á…‘‘¥¹œµ‰½ÑÑ½´ÁÉ½‘Õ•Ì½ÉÉ•Ğ¡•¥¡Ğ€¨½ô(€€€€€€€€€€€€€€€€€€€€€€€€ñAÉ•Ù¥•İIÕ±•ÉÉ…µ”(€€€€€€€€€€€€€€€€€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€Õ¹¥Ğõí¥Í…É5…¹•Ğ€ü€¥¸œ€èÕ¹¥Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€‘•‰Õœõí¥µÁ½ÉĞ¹µ•Ñ„¹•¹Ø¹Yô(€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µ…àµÜµ™Õ±°ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíÁÉ•Ù¥•İ]É…ÁÁ•ÉMÑå±•ô(€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€ì¼¨AHÌè5½‘•É¸…¹Ù„µÍÑå±”…ÉÑİ½É¬•‘¥Ñ½È€¡‘É…œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É•Í¥é”¡…¹‘±•Ì°™¥Ğ½™¥±°½É•Í•Ğ½½¹ÍÑÉ…¥¸¤¸€¨½ô(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÉÑİ½É­AÉ•Ù¥•İ‘¥Ñ½È(€€€€€€€€€€€€€€€€€€€€€€€€€€€É•˜õí¥¹±¥¹•‘¥Ñ½ÉI•™ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½µÁ½Í¥Ñ¥½¹-•äõí‰Õ¥±‘ÉÑİ½É­½µÁ½Í¥Ñ¥½¹-•ä¡ÕÁ±½…‘•‘¥±”°ÁÉ½‘ÕÑQåÁ”¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€¥¹¥Ñ¥…±9½Éµ…±¥é•‘QÉ…¹Í™½É´õíÉ•ÍÑ½É•‘9½Éµ…±¥é•‘QÉ…¹Í™½Éµô(€€€€€€€€€€€€€€€€€€€€€€€€€€€¥¹¥Ñ¥…±½µÁ½Í¥Ñ¥½¹I•Ù¥Í¥½¸õíÉ•ÍÑ½É•‘½µÁ½Í¥Ñ¥½¹I•Ù¥Í¥½¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÍÉŒõíÕÁ±½…‘•‘¥±”¹ÁÉ•Ù¥•İUÉ°ñğÕÁ±½…‘•‘¥±”¹Ñ¡Õµ‰¹…¥±UÉ°ñğÕÁ±½…‘•‘¥±”¹ÕÉ±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İUÉ°õíÕÁ±½…‘•‘¥±”¹ÁÉ•Ù¥•İUÉ°ñğÕÁ±½…‘•‘¥±”¹Ñ¡Õµ‰¹…¥±UÉ°ñğ¹Õ±±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ½‘ÕÑ¥½¹UÉ°õíÕÁ±½…‘•‘¥±”¹ÁÉ½‘ÕÑ¥½¹UÉ°ñğÕÁ±½…‘•‘¥±”¹ÕÉ±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€É•Í½ÕÉ•QåÁ”õíÕÁ±½…‘•‘¥±”¹É•Í½ÕÉ•QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€µ¥µ•QåÁ”õíÕÁ±½…‘•‘¥±”¹µ¥µ•QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•ÑÉåAÉ•Ù¥•ÜõíÕÁ±½…‘•‘¥±”¹¥ÍA‘˜€ü¡…¹‘±•I•ÑÉåA‘™AÉ•Ù¥•Ü€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€…±Ğô‰UÁ±½…‘•…ÉÑİ½É¬ÁÉ•Ù¥•Üˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…‘‘¥¹AĞõíÁÉ•Ù¥•İA…‘‘¥¹AÑô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Ñ…¥¹•ÉI•˜õíÁÉ•Ù¥•İ½¹Ñ…¥¹•ÉI•™ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€µ½‰¥±•Q½½±‰…É½¹Ñ…¥¹•Èõí¥¹±¥¹•5½‰¥±•Q½½±‰…É±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíìàè¥µA½Ì¹à°äè¥µA½Ì¹ä°Í…±•`è¥µM…±”°Í…±•dè¥µM…±•dõô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡Ø¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µA½Ì¡ìàèØ¹à°äèØ¹äô¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µM…±”¡Ø¹Í…±•`¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µM…±•d¡Ø¹Í…±•d¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍÑÉ…¥¸õí½¹ÍÑÉ…¥¹AÉ½ÁÍô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½¹ÍÑÉ…¥¹¡…¹”õíÍ•Ñ½¹ÍÑÉ…¥¹AÉ½ÁÍô(€€€€€€€€€€€€€€€€€€€€€€€€€€€Í¡½İÉ…!¥¹ĞõíÍ¡½İÉ…!¥¹Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€€€…¹Ù…ÍMÑå±”õíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹‘½±½Èè€œ™™™™™˜œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€È°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰½É‘•Èè€œÅÁàÍ½±¥€ŒäÑ„Íˆàœ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰½áM¡…‘½Üè€œÀ€ÄÑÁà€ÈáÁà€´ÄÁÁàÉ‰„ ÄÔ°€ÈÌ°€ĞÈ°€À¸Èà¤°€À€ÑÁà€áÁàÉ‰„ ÄÔ°€ÈÌ°€ĞÈ°€À¸ÄÀ¤°¥¹Í•Ğ€À€À€À€ÅÁàÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°À¸Ø¤œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½Ù•É±…äõì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É½µµ•ÑÌ€„ôô€¹½¹”œ€ü€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÙœ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ğ´ÀÜµ™Õ±° µ™Õ±°Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù¥•İ	½àõí€À€À€‘íİ¥‘Ñ¡%¹ô€‘í¡•¥¡Ñ%¹õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ•Í•ÉÙ•ÍÁ•ÑI…Ñ¥¼ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíìé%¹‘•àè€ÄÀõô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÉ½µµ•Ñ=Ù•É±…ä(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½ÁÑ¥½¸õíÉ½µµ•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥‘MÕ™™¥àô‰„µ¥¹±¥¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½ÍÙœø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¤€è¹Õ±°(€€€€€€€€€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½AÉ•Ù¥•İIÕ±•ÉÉ…µ”ùì¼¨±½Í”ÉÕ±•È™É…µ”€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€ì¼¨Q½½±‰…ÈÍ±½Ğè¥Ğ½¥±°½I•Í•Ğ½1½­•É•¹‘•È¡•É”(€€€€€€€€€€€€€€€€€€€€€€€€€	1=\Ñ¡”…¹Ù…Ì½¸•Ù•ÉäÍÉ••¸Í¥é”Í¼Ñ¡•ä(€€€€€€€€€€€€€€€€€€€€€€€€€‘¼¹½Ğ½Ù•ÈÑ¡”ÁÉ¥¹Ñ…‰±”…ÉÑİ½É¬¸€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€€€€€€€€€É•˜õíÍ•Ñ%¹±¥¹•5½‰¥±•Q½½±‰…É±ô(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µĞ´Èˆ(€€€€€€€€€€€€€€€€€€€€€€€‘…Ñ„µµ½‰¥±”µ…ÉÑİ½É¬µÑ½½±‰…Èô‰„µ¥¹±¥¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€ì¼¨M¥é”‘¥µ•¹Í¥½¹Ì‰•±½ÜÁÉ•Ù¥•Ü€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀÑ•áĞµ•¹Ñ•ÈµĞ´Èˆø(€€€€€€€€€€€€€€€€€€€€€€€M¥é”èí¥Í…É5…¹•Ğ€ü€‘íİ¥‘Ñ¡%¹ôˆƒ\€‘í¡•¥¡Ñ%¹ô‰€€è€‘íİ¥‘Ñ¡Ñô™Ğ‘íİ¥‘Ñ¡%¹H€ø€À€ü€€‘íİ¥‘Ñ¡%¹Iô¥¹€€è€œôƒ\€‘í¡•¥¡ÑÑô™Ğ‘í¡•¥¡Ñ%¹H€ø€À€ü€€‘í¡•¥¡Ñ%¹Iô¥¹€€è€œõô€¡íÍÅ™Ğ¹Ñ½¥á• Ä¥ôÍÄ™Ğ¤(€€€€€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€€€€€€ì¼¨½¹™¥‘•¹”Ñ•áĞ€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀÑ•áĞµ•¹Ñ•ÈµĞ´Ä™½¹Ğµµ•‘¥Õ´ˆùe½ÕÈ‘•Í¥¸İ¥±°‰”ÁÉ¥¹Ñ•‰…Í•½¸Ñ¡¥ÌÁÉ•Ù¥•Üğ½Àø(€€€€€€€€€€€€€€€€€€€€€ì¼¨¥±”¥¹™¼‰…È€¨½ô(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´ÈÀ´Ì™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸‰œµÉ••¸´ÔÀ‰½É‘•È‰½É‘•ÈµÉ••¸´ÈÀÀÉ½Õ¹‘•µ±œˆø(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èµ¥¸µÜ´Àˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ¡•­¥É±”±…ÍÍ9…µ”ô‰ ´ÔÜ´ÔÑ•áĞµÉ••¸´ØÀÀ™±•àµÍ¡É¥¹¬´Àˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ••¸´àÀÀÑÉÕ¹…Ñ”ˆùíÕÁ±½…‘•‘¥±”¹¹…µ•ôğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ…É¥„µ±…‰•°ô‰I•µ½Ù”ÕÁ±½…‘•…ÉÑİ½É¬ˆ½¹±¥¬õì ¤€ôøìÍ•ÑUÁ±½…‘•‘¥±”¡¹Õ±°¤ìÍ•Ñ%µA½Ì¡ìàè€À°äè€Àô¤ìÍ•Ñ%µM…±” Ä¤ìÍ•Ñ%µM…±•d Ä¤ìÍ•Ñ¥AÉ½µÁĞ¡¹Õ±°¤ìÍ•Ñ¥‘¥ÑAÉ½µÁĞ¡¹Õ±°¤ìÍ•Ñ¥•Í¥¹M•ÍÍ¥½¸¡¹Õ±°¤ìõô±…ÍÍ9…µ”ô‰µ°´È™±•àµÍ¡É¥¹¬´ÀÀ´È¸ÔÉ½Õ¹‘•µ™Õ±°¡½Ù•Èé‰œµÉ••¸´ÄÀÀÑ•áĞµÉ…ä´ÔÀÀ¡½Ù•ÈéÑ•áĞµÉ…ä´ÜÀÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆøñ`±…ÍÍ9…µ”ô‰ ´ĞÜ´Ğˆ€¼øğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€í…¥AÉ½µÁĞ€˜˜€…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€˜˜Í¡½İÉ•…Ñ•]¥Ñ¡$€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´È™±•à©ÕÍÑ¥™äµ•¹Ñ•Èˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ¥‘¥Ñ5½‘…±=Á•¸¡ÑÉÕ”¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì…¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”ñğ€…µ…Ñ•É¥…°ñğ¥ÍUÁ±½…‘¥¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÁà´ĞÁä´ÈÉ½Õ¹‘•µ™Õ±°‰œµlŒÁˆÅ˜Í…tÑ•áĞµİ¡¥Ñ”Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Í¡…‘½ÜµÍ´¡½Ù•Èé‰œµlŒÄÈÌĞÕ‘t‘¥Í…‰±•é½Á…¥Ñä´ÔÀ‘¥Í…‰±•éÕÉÍ½Èµ¹½Ğµ…±±½İ•ÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñMÁ…É­±•Ì±…ÍÍ9…µ”ô‰Ü´Ğ ´Ğˆ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€‘¥Ğİ¥Ñ $(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€íÕÁ±½…‘ÉÉ½È€˜˜€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ•´ØÀÀµĞ´ÈˆùíÕÁ±½…‘ÉÉ½Éôğ½Àùô(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´ÈÑ•áĞµ•¹Ñ•ÈˆùÙ•Éä™¥±”É•Ù¥•İ•‰ä„É•…°‘•Í¥¹•È‰•™½É”ÁÉ¥¹Ñ¥¹œ¸ğ½Àø(€€€€€€€€€€€€€€€€ğ½½¹™¥…Éø¤ì(€½¹ÍĞ¡•É½½¹Ñ•¹Ğ€ô¥Íe…É‘M¥¸(€€€€üì(€€€€€€€•å•‰É½Üè€œÈÓŠÌƒ\€ÄãŠÌeIM%9Lƒ
Ü9Q%=9]%M!%AA%9œ°(€€€€€€€¡•…‘±¥¹”è€ÕÍÑ½´å…ÉÍ¥¹Ì°ÁÉ½‘Õ•™…ÍĞ¸œ°(€€€€€€€¥¹ÑÉ¼è€UÁ±½…ÕÀÑ¼€ÄÀ‘•Í¥¹Ì°É•Ù¥•Ü•Ù•Éä½¸µÍÉ••¸ÁÉ¥¹ĞÁÉ•Ù¥•Ü°…¹Í•”Ñ¡”•á…Ğ½É‘•ÈÍÕ‰Ñ½Ñ…°‰•™½É”¡•­½ÕĞ¸œ°(€€€€€€€ÁÉ¥•1…‰•°è€œÄÀÍ¥¹±”µÍ¥‘•Í¥¹Ìœ°(€€€€€€€ÁÉ¥”è€œÄÈÀœ°(€€€€€€€½™™•Èè€UÀÑ¼€ÄÀ‘•Í¥¹ÌÁ•È½É‘•Èœ°(€€€€€€€Ñ„è€	Õ¥±µäå…ÉµÍ¥¸½É‘•Èœ°(€€€€€ô(€€€€è¥Í…É5…¹•Ğ(€€€€€€üì(€€€€€€€€€•å•‰É½Üè€UMQ=4H59QLƒ
Ü9Q%=9]%M!%AA%9œ°(€€€€€€€€€¡•…‘±¥¹”è€ÕÍÑ½´…Èµ…¹•ÑÌ°µ…‘”™…ÍĞ¸œ°(€€€€€€€€€¥¹ÑÉ¼è€¡½½Í”„ÍÕÁÁ½ÉÑ•Í¥é”…¹½É¹•ÈÍÑå±”°ÕÁ±½……ÉÑİ½É¬°…¹É•Ù¥•ÜÑ¡”½¸µÍÉ••¸ÁÉ¥¹ĞÁÉ•Ù¥•Ü‰•™½É”½É‘•É¥¹œ¸œ°(€€€€€€€€€ÁÉ¥•1…‰•°è€œÄãŠÌƒ\€ÄËŠÌ…Èµ…¹•Ğœ°(€€€€€€€€€ÁÉ¥”è€œÈäœ°(€€€€€€€€€½™™•Èè€½ÕÈÍ¥é•Ìƒ
ÜQİ¼½É¹•ÈÍÑå±•Ìœ°(€€€€€€€€€Ñ„è€	Õ¥±€˜ÁÉ¥”µä…Èµ…¹•Ğœ°(€€€€€€€ô(€€€€€€èì(€€€€€€€€€•å•‰É½Üè€UMQ=4Y%9e0	99ILƒ
Ü9Q%=9]%M!%AA%9œ°(€€€€€€€€€¡•…‘±¥¹”è€ÕÍÑ½´Ù¥¹å°‰…¹¹•ÉÌ°ÁÉ½‘Õ•™…ÍĞ¸œ°(€€€€€€€€€¥¹ÑÉ¼è€¡½½Í”„Í¥é”…¹µ…Ñ•É¥…°°ÕÁ±½……ÉÑİ½É¬°…¹É•Ù¥•ÜÑ¡”½¸µÍÉ••¸ÁÉ¥¹ĞÁÉ•Ù¥•Ü‰•™½É”½É‘•É¥¹œ¸œ°(€€€€€€€€€ÁÉ¥•1…‰•°è€A½ÁÕ±…È€ÓŠÈƒ\€ËŠÈ‰…¹¹•Èœ°(€€€€€€€€€ÁÉ¥”è€œÌØœ°(€€€€€€€€€½™™•Èè€1…É”‰…¹¹•ÉÌ€ÛŠÈƒ\€ÏŠÈ…¹ÕÀè€ÈÔ”½™˜…ÕÑ½µ…Ñ¥…±±äœ°(€€€€€€€€€Ñ„è€	Õ¥±€˜ÁÉ¥”µä‰…¹¹•Èœ°(€€€€€€€ôì((€É•ÑÕÉ¸€ (€€€€ğø(€€€€€€ñ!•±µ•Ğø(€€€€€€€€ñÑ¥Ñ±”ùí¥Íe…É‘M¥¸€ü€ÕÍÑ½´e…ÉM¥¹Ìœ€è¥Í…É5…¹•Ğ€ü€…È5…¹•ÑÌœ€è€ÕÍÑ½´	…¹¹•ÈAÉ¥¹Ñ¥¹œô€´€ÈĞ!½ÕÈAÉ½‘ÕÑ¥½¸ğ	…¹¹•ÉÌ=¸Q¡”±äğ½Ñ¥Ñ±”ø(€€€€€€€€ñµ•Ñ„¹…µ”ô‰‘•ÍÉ¥ÁÑ¥½¸ˆ½¹Ñ•¹Ğõí¥Íe…É‘M¥¸€ü€‰UÁ±½…å…ÉµÍ¥¸…ÉÑİ½É¬°É•Ù¥•ÜÑ¡”ÍÕÁÁ½ÉÑ•Í¥é”…¹ÕÉÉ•¹ĞÁÉ¥”°…¹Í•”ÁÉ½‘ÕÑ¥½¸…¹Í¡¥ÁÁ¥¹œ‘•Ñ…¥±Ì‰•™½É”¡•­½ÕĞ¸ˆ€è¥Í…É5…¹•Ğ€ü€‰½¹™¥ÕÉ”„ÍÕÁÁ½ÉÑ•…Èµµ…¹•ĞÍ¥é”°ÕÁ±½……ÉÑİ½É¬°ÁÉ•Ù¥•ÜÑ¡”ÁÉ¥¹Ğ°…¹É•Ù¥•ÜÁÉ½‘ÕÑ¥½¸…¹Í¡¥ÁÁ¥¹œ‰•™½É”¡•­½ÕĞ¸ˆ€è€‰UÁ±½…‰…¹¹•È…ÉÑİ½É¬°¡½½Í”Í¥é”…¹µ…Ñ•É¥…°°ÁÉ•Ù¥•ÜÑ¡”ÁÉ¥¹Ğ°…¹É•Ù¥•ÜÁÉ½‘ÕÑ¥½¸…¹Í¡¥ÁÁ¥¹œ‰•™½É”¡•­½ÕĞ¸‰ô€¼ø(€€€€€€€€ñµ•Ñ„¹…µ”ô‰É½‰½ÑÌˆ½¹Ñ•¹Ğô‰¹½¥¹‘•à°¹½™½±±½Üˆ€¼ø(€€€€€€ğ½!•±µ•Ğø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¸µ µÍÉ••¸‰œµİ¡¥Ñ”Ñ•áĞµÉ…ä´äÀÀˆø(€€€€€€€€ñ¡•…‘•È‘…Ñ„µÍ¥Ñ”µ¡•…‘•È±…ÍÍ9…µ”ô‰Üµ™Õ±°‰½É‘•Èµˆ‰½É‘•ÈµÉ…ä´ÄÀÀ‰œµİ¡¥Ñ”Áä´ÌÁà´ĞÍÑ¥­äÑ½À´Àè´ÔÀˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…àµÜ´Õá°µàµ…ÕÑ¼™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ü´ÄÀˆ€¼ø(€€€€€€€€€€€€ñ¥µœÍÉŒôˆ½¥µ…•Ì½¡•…‘•Èµ±½¼¹Á¹œˆ…±Ğô‰	…¹¹•ÉÌ=¸Q¡”±äˆİ¥‘Ñ ôˆÈĞàˆ¡•¥¡ĞôˆÜÀˆ±…ÍÍ9…µ”ô‰ ´ÄÀ½‰©•Ğµ½¹Ñ…¥¸ˆ±½…‘¥¹œô‰•…•Èˆ€¼ø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ%Í…ÉÑ=Á•¸¡ÑÉÕ”¥ô(€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰M¡½ÁÁ¥¹œ…ÉĞˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”À´ÈÑ•áĞµ½É…¹”´ÔÀÀ¡½Ù•ÈéÑ•áĞµ½É…¹”´ØÀÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñM¡½ÁÁ¥¹…ÉĞ±…ÍÍ9…µ”ô‰ ´ÔÜ´Ôˆ€¼ø(€€€€€€€€€€€€€í…ÉÑ%Ñ•µ½Õ¹Ğ€ø€À€˜˜€ (€€€€€€€€€€€€€€€€ñÍÁ…¸(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”€µÑ½À´À¸Ô€µÉ¥¡Ğ´À¸Ô‰œµÉ••¸´ÔÀÀÑ•áĞµİ¡¥Ñ”Ñ•áĞµlÄÁÁátÉ½Õ¹‘•µ™Õ±° ´ĞÜ´Ğ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È™½¹Ğµ‰½±ˆ(€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°õí€‘í…ÉÑ%Ñ•µ½Õ¹Ñô¥Ñ•µÌ¥¸…ÉÑô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€í…ÉÑ%Ñ•µ½Õ¹Ñô(€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½¡•…‘•Èø((€€€€€€€ì¼¨!I<€¨½ô(€€€€€€€ì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€ü€ (€€€€€€€€€€ñ…ÍÑ	…¹¹•É‘!•É¼½¹MÑ…ÉĞõíÍÉ½±±Q½=É‘•Éô€¼ø(€€€€€€€€¤€è€ (€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”½Ù•É™±½Üµ¡¥‘‘•¸‰½É‘•Èµˆ´Ğ‰½É‘•ÈµlÙÀÁt‰œµlŒÁÅÍtÁà´ĞÁä´ÄÀÍ´éÁä´ÄÈ±œéÁä´ÄØˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”µàµ…ÕÑ¼É¥µ…àµÜ´Ùá°¥Ñ•µÌµ•¹Ñ•È…À´ÄÀ±œéÉ¥µ½±Ìµmµ¥¹µ…à À°Ä¸ÄÕ™È¥}µ¥¹µ…à ÌØÁÁà°À¸àÕ™È¥t±œé…À´ÄĞˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ•áĞµ•¹Ñ•È±œéÑ•áĞµ±•™Ğˆø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌ™½¹Ğµ‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµlÀ¸É•µtÑ•áĞµláÍtˆùí¡•É½½¹Ñ•¹Ğ¹•å•‰É½İôğ½Àø(€€€€€€€€€€€€€€ñ Ä±…ÍÍ9…µ”ô‰µĞ´Ğµ…àµÜ´Íá°™½¹Ğµ‘¥ÍÁ±…äÑ•áĞ´Ñá°™½¹Ğµ‰±…¬±•…‘¥¹œµlÄ¸ÀÑtÑÉ…­¥¹œµl´À¸ÀÑ•µtÑ•áĞµİ¡¥Ñ”Í´éÑ•áĞ´Õá°±œéÑ•áĞ´Ùá°ˆø(€€€€€€€€€€€€€€€í¡•É½½¹Ñ•¹Ğ¹¡•…‘±¥¹•ô(€€€€€€€€€€€€€€ğ½ Äø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µĞ´Ôµ…àµÜ´Éá°Ñ•áĞµ‰…Í”±•…‘¥¹œ´ÜÑ•áĞµÍ±…Ñ”´ÈÀÀÍ´éÑ•áĞµ±œ±œéµà´Àˆø(€€€€€€€€€€€€€€€í¡•É½½¹Ñ•¹Ğ¹¥¹ÑÉ½ô(€€€€€€€€€€€€€€ğ½Àø((€€€€€€€€€€€€€€ñ‘¥Ø‘…Ñ„µµ½‰¥±”µ‘•±¥Ù•ÉäµÑ¥µ•È±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µĞ´Ôµ…àµÜµá°Ñ•áĞµ±•™Ğµé¡¥‘‘•¸ˆø(€€€€€€€€€€€€€€€€ñ•±¥Ù•ÉåQ¥µ•ÈÙ…É¥…¹Ğô‰½µÁ…Ğˆ±…ÍÍ9…µ”ô‰Í¡…‘½Üµ±œˆ€¼ø(€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ø™±•à™±•àµİÉ…À©ÕÍÑ¥™äµ•¹Ñ•È…Àµà´Ô…Àµä´ÌÑ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµİ¡¥Ñ”±œé©ÕÍÑ¥™äµÍÑ…ÉĞˆø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆøñ±½¬±…ÍÍ9…µ”ô‰ ´ĞÜ´ĞÑ•áĞµláÍtˆ€¼ù5½ÍĞÍÑ…¹‘…É½É‘•ÉÌè€ÈĞµ¡½ÕÈÁÉ½‘ÕÑ¥½¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈˆøñQÉÕ¬±…ÍÍ9…µ”ô‰ ´ĞÜ´ĞÑ•áĞµláÍtˆ€¼ùÉ•”¹•áĞµ‘…ä…¥È…¹åİ¡•É”¥¸Ñ¡”T¹L¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆøñ¥±•¡•¬±…ÍÍ9…µ”ô‰ ´ĞÜ´ĞÑ•áĞµláÍtˆ€¼ùÙ•Éä™¥±”É•Ù¥•İ•‰•™½É”ÁÉ¥¹Ğğ½ÍÁ…¸ø(€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ü™±•à™±•àµ½°¥Ñ•µÌµ•¹Ñ•È…À´ÌÍ´é™±•àµÉ½ÜÍ´é©ÕÍÑ¥™äµ•¹Ñ•È±œé©ÕÍÑ¥™äµÍÑ…ÉĞˆø(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€½¹±¥¬õíÍÉ½±±Q½=É‘•Éô(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•àµ¥¸µ ´ÄÈÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´È‰œµläÑÀÁtÁà´ÜÁä´Ì¸ÔÑ•áĞµ‰…Í”™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”Í¡…‘½ÜµlÁ|ÄÁÁá|ÈáÁá}É‰„ ÈÔÔ°ÄÀØ°À°À¸ÈĞ¥tÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ¡½Ù•Èé‰œµlàĞÌÀÁt™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ¹½¹”™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œ´È™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œµİ¡¥Ñ”™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œµ½™™Í•Ğ´È™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œµ½™™Í•ĞµlŒÁÅÍtÍ´éÜµ…ÕÑ¼ˆ(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€í¡•É½½¹Ñ•¹Ğ¹Ñ…ô(€€€€€€€€€€€€€€€€€€ñÉÉ½İI¥¡Ğ±…ÍÍ9…µ”ô‰ ´ĞÜ´Ğˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ€¼ø(€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµlÈİtˆùí¡•É½½¹Ñ•¹Ğ¹½™™•Éôğ½Àø(€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ü™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Ì‰½É‘•ÈµĞ‰½É‘•Èµİ¡¥Ñ”¼ÄÔÁĞ´Ô±œé©ÕÍÑ¥™äµÍÑ…ÉĞˆø(€€€€€€€€€€€€€€€€ñ¥µœ(€€€€€€€€€€€€€€€€€ÍÉŒô‰¡ÑÑÁÌè¼½É•Ì¹±½Õ‘¥¹…Éä¹½´½‘ÑÉá°ÄÈÁÔ½¥µ…”½ÕÁ±½…½İ|ÄÈà±¡|ÄÈà±}™¥±°±™}…ÕÑ¼±Å}…ÕÑ¼½ØÄÜÔäÜääÄÔÄ½‘…¸µ½±¥Ù•É|ÄÈÀÁáàÌÄØÌ´ÌÄÜÀ´ÄÀĞà´Á}éÁ¡éÜ¹©Áœˆ(€€€€€€€€€€€€€€€€€…±Ğô‰…¸=±¥Ù•È½˜…¸µ<ÌM•…Í½¹¥¹œˆ(€€€€€€€€€€€€€€€€€İ¥‘Ñ ôˆĞàˆ(€€€€€€€€€€€€€€€€€¡•¥¡ĞôˆĞàˆ(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÄÈÜ´ÄÈÉ½Õ¹‘•µ™Õ±°‰½É‘•È´È‰½É‘•Èµİ¡¥Ñ”¼ÜÀ½‰©•Ğµ½Ù•Èˆ(€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ•áĞµ±•™Ğˆø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµláÍtˆÉ½±”ô‰¥µœˆ…É¥„µ±…‰•°ô‰¥Ù”µÍÑ…ÈÕÍÑ½µ•È™••‘‰…¬ˆûŠbŠbŠbŠbŠbğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌ™½¹ĞµÍ•µ¥‰½±Ñ•áĞµİ¡¥Ñ”ˆùQÉÕÍÑ•‰ä…¸µ<™ÉÍÅÕ¼íÌM•…Í½¹¥¹œğ½Àø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€ñ…Í¥‘”±…ÍÍ9…µ”ô‰‰½É‘•È‰½É‘•Èµİ¡¥Ñ”¼ÄÔ‰œµİ¡¥Ñ”Ñ•áĞµlŒÁÅÍtÍ¡…‘½ÜµlÁ|ÈÑÁá|ØÁÁá}É‰„ À°À°À°À¸ÈĞ¥tˆ…É¥„µ±…‰•°ô‰A½ÁÕ±…È½É‘•È•á…µÁ±”ˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰½É‘•ÈµĞ´Ğ‰½É‘•ÈµlÙÀÁtÀ´ØÍ´éÀ´Üˆø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌ™½¹Ğµ‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµlÀ¸Äá•µtÑ•áĞµÍ±…Ñ”´ÔÀÀˆùA½ÁÕ±…ÈÍÑ…ÉÑ¥¹œÁ½¥¹Ğğ½Àø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ì™±•à¥Ñ•µÌµ•¹©ÕÍÑ¥™äµ‰•Ñİ••¸…À´Ô‰½É‘•Èµˆ‰½É‘•ÈµÍ±…Ñ”´ÈÀÀÁˆ´Ôˆø(€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½¹Ğµ‘¥ÍÁ±…äÑ•áĞµá°™½¹Ğµ‰½±ˆùí¡•É½½¹Ñ•¹Ğ¹ÁÉ¥•1…‰•±ôğ½Àø(€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµÍ´Ñ•áĞµÍ±…Ñ”´ÔÀÀˆù	•™½É”‘•ÍÑ¥¹…Ñ¥½¸µ‰…Í•Ñ…àğ½Àø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½¹Ğµ‘¥ÍÁ±…äÑ•áĞ´Íá°™½¹Ğµ‰±…¬Ñ•áĞµlŒÁÅÍtˆùí¡•É½½¹Ñ•¹Ğ¹ÁÉ¥•ôğ½Àø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ½°±…ÍÍ9…µ”ô‰µĞ´ÔÉ¥…À´ÌÑ•áĞµÍ´ˆø(€€€€€€€€€€€€€€€€€€ñ±¤±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à ´ÜÜ´Ü¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµlŒÁÅÍtÑ•áĞµáÌ™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”ˆøÄğ½ÍÁ…¸ù¡½½Í”å½ÕÈ½¹™¥ÕÉ…Ñ¥½¸ğ½±¤ø(€€€€€€€€€€€€€€€€€€ñ±¤±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à ´ÜÜ´Ü¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµlŒÁÅÍtÑ•áĞµáÌ™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”ˆøÈğ½ÍÁ…¸ùUÁ±½…å½ÕÈ…ÉÑİ½É¬ğ½±¤ø(€€€€€€€€€€€€€€€€€€ñ±¤±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à ´ÜÜ´Ü¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµlŒÁÅÍtÑ•áĞµáÌ™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”ˆøÌğ½ÍÁ…¸ùI•Ù¥•ÜÑ¡”½¸µÍÉ••¸ÁÉ•Ù¥•Üğ½±¤ø(€€€€€€€€€€€€€€€€€€ñ±¤±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à ´ÜÜ´Ü¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµlŒÁÅÍtÑ•áĞµáÌ™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”ˆøĞğ½ÍÁ…¸ù½¹Ñ¥¹Õ”Ñ¼Í•ÕÉ”¡•­½ÕĞğ½±¤ø(€€€€€€€€€€€€€€€€ğ½½°ø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ô‰½É‘•Èµ°´Ğ‰½É‘•ÈµlÙÀÁt‰œµlİÅtÁà´ĞÁä´ÌÑ•áĞµÍ´±•…‘¥¹œ´ØÑ•áĞµÍ±…Ñ”´ÜÀÀˆø(€€€€€€€€€€€€€€€€€É•”¹•áĞµ‘…ä…¥È…¹åİ¡•É”¥¸Ñ¡”U¹¥Ñ•MÑ…Ñ•Ì¥Ì¥¹±Õ‘•…™Ñ•ÈÁÉ½‘ÕÑ¥½¸¸AÉ½‘ÕÑ¥½¸Ñ¥µ”…¹…ÉÉ¥•ÈÑÉ…¹Í¥Ğ…É”Í¡½İ¸Í•Á…É…Ñ•±ä¸(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ğ½…Í¥‘”ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½Í•Ñ¥½¸ø(€€€€€€€€¥ô((€€€€€€€€ñI•…±=É‘•ÉÍMÑÉ¥À•áÁ…¹‘•€¼ø((€€€€€€€€ñÍ•Ñ¥½¸É•˜õí½É‘•ÉI•™ô¥ô‰½É‘•Èµ‰Õ¥±‘•Èˆ±…ÍÍ9…µ”ô‰Áä´ÄÈÁà´Ğ‰œµÉ…ä´ÔÀˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…àµÜ´Ñá°±œéµ…àµÜ´İá°µàµ…ÕÑ¼ˆø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µˆ´ÌÑ•áĞµ•¹Ñ•ÈÑ•áĞµáÌ™½¹Ğµ‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµlÀ¸Äá•µtÑ•áĞµlÙÀÁtˆø(€€€€€€€€€€€€€í¥Íe…É‘M¥¸€ü€œÈÓŠÌƒ\€ÄãŠÌå…ÉÍ¥¹Ìœ€è¥Í…É5…¹•Ğ€ü€ÕÍÑ½´…Èµ…¹•ÑÌœ€è€ÕÍÑ½´Ù¥¹å°‰…¹¹•ÉÌô(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€ñ È(€€€€€€€€€€€€€É•˜õí‰Õ¥±‘•ÉMÑ…ÉÑI•™ô(€€€€€€€€€€€€€¥ô‰‰Õ¥±‘•ÈµÍÑ…ÉĞˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Ñ•áĞ´Éá°µéÑ•áĞ´Íá°™½¹Ğµ‰½±Ñ•áĞµ•¹Ñ•Èµˆ´ÄÀÍÉ½±°µµĞµlÄĞÁÁátµéÍÉ½±°µµĞ´ÈĞˆ(€€€€€€€€€€€€ø(€€€€€€€€€€€€€í¥Íe…É‘M¥¸€ü€	Õ¥±e½ÕÈe…ÉM¥¸=É‘•Èœ€è¥Í…É5…¹•Ğ€ü€•Í¥¸e½ÕÈÕÍÑ½´…È5…¹•ÑÌœ€è€	Õ¥±e½ÕÈ	…¹¹•Èô(€€€€€€€€€€€€ğ½ Èø(€€€€€€€€€€€íÍ¡½İA½ÍÑ‘‘I•Í•Ñ9½Ñ¥”€˜˜€ (€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€É½±”ô‰ÍÑ…ÑÕÌˆ(€€€€€€€€€€€€€€€…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µˆ´Ø™±•à™±•àµ½°…À´Ğ‰½É‘•È‰½É‘•Èµ•µ•É…±´ÈÀÀ‰œµ•µ•É…±´ÔÀÀ´ĞÑ•áĞµ±•™ĞÍ´é™±•àµÉ½ÜÍ´é¥Ñ•µÌµ•¹Ñ•ÈÍ´é©ÕÍÑ¥™äµ‰•Ñİ••¸ˆ(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•àµ¥¸µÜ´À¥Ñ•µÌµÍÑ…ÉĞ…À´Ìˆø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à ´äÜ´ä™±•àµ¹½¹”¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµ•µ•É…±´ØÀÀÑ•áĞµİ¡¥Ñ”ˆø(€€€€€€€€€€€€€€€€€€€€ñ¡•­¥É±”±…ÍÍ9…µ”ô‰ ´ÔÜ´Ôˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ€¼ø(€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½¹Ğµ‰½±Ñ•áĞµ•µ•É…±´äÔÀˆù‘‘•Ñ¼å½ÕÈ…ÉĞğ½Àø(€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µĞ´À¸ÔÑ•áĞµÍ´Ñ•áĞµ•µ•É…±´àÀÀˆùe½ÕÈÍ…Ù•¥Ñ•´¥ÌÉ•…‘ä¸Y¥•ÜÑ¡”…ÉĞ½ÈÍÑ…ÉĞ…¹½Ñ¡•ÈÁÉ½‘ÕĞ¸ğ½Àø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•àµİÉ…À…À´Èˆø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½Á•¹…ÉÑÉ…İ•Éô±…ÍÍ9…µ”ô‰µ¥¸µ ´ÄÄ‰œµlŒÁÅÍtÁà´ĞÁä´ÈÑ•áĞµÍ´™½¹Ğµ‰½±Ñ•áĞµİ¡¥Ñ”¡½Ù•Èé‰œµlŒÄÌÌÌÕ‘tˆø(€€€€€€€€€€€€€€€€€€€Y¥•Ü…ÉÑí…ÉÑ%Ñ•µ½Õ¹Ğ€ø€À€ü€€ ‘í…ÉÑ%Ñ•µ½Õ¹Ñô¥€€è€œô(€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí¡…¹‘±•MÑ…ÉÑ¹½Ñ¡•Éô±…ÍÍ9…µ”ô‰µ¥¸µ ´ÄÄ‰½É‘•È‰½É‘•Èµ•µ•É…±´ÜÀÀ‰œµİ¡¥Ñ”Áà´ĞÁä´ÈÑ•áĞµÍ´™½¹Ğµ‰½±Ñ•áĞµ•µ•É…±´äÀÀ¡½Ù•Èé‰œµ•µ•É…±´ÄÀÀˆø(€€€€€€€€€€€€€€€€€€€MÑ…ÉĞ…¹½Ñ¡•È(€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€¥ô(€€€€€€€€€€€í¥Íe…É‘M¥¸€ü€ (€€€€€€€€€€€€€€¼¨€ôôôôôôôôôôeIM%8=IH	U%1H€¡ØÈ¤€ôôôôôôôôôô€¨¼(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥µéÉ¥µ½±Ì´È±œéÉ¥µ½±Ìµmµ¥¹µ…à À°Ä¸Ñ™È¥}µ¥¹µ…à À°Å™È¥t…À´ÄÀµ…àµÜµ™Õ±°ˆø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´àµ¥¸µÜ´Àµ…àµÜµ™Õ±°ˆø(€€€€€€€€€€€€€€€€€€ñe…É‘M¥¹½¹™¥ÕÉ…Ñ½È(€€€€€€€€€€€€€€€€€€€É•˜õíå…É‘M¥¹½¹™¥ÕÉ…Ñ½ÉI•™ô(€€€€€€€€€€€€€€€€€€€‘•Í¥¹Ìõíå…É‘M¥¹•Í¥¹Íô(€€€€€€€€€€€€€€€€€€€½¹•Í¥¹Í¡…¹”õíÍ•Ñe…É‘M¥¹•Í¥¹Íô(€€€€€€€€€€€€€€€€€€€Í¥‘•‘¹•ÍÌõíå…É‘M¥¹M¥‘•‘¹•ÍÍô(€€€€€€€€€€€€€€€€€€€½¹M¥‘•‘¹•ÍÍ¡…¹”õì¡Ì¤€ôøìÍ•Ñe…É‘M¥¹M¥‘•‘¹•ÍÌ¡Ì¤ìÍ•Ñ!…ÍI•Ù¥•İ•‘e…É‘M¥¹AÉ¥¹ÑM¥‘”¡ÑÉÕ”¤ìõô(€€€€€€€€€€€€€€€€€€€…‘‘MÑ•ÁMÑ…­•Ìõíå…É‘M¥¹‘‘MÑ•ÁMÑ…­•Íô(€€€€€€€€€€€€€€€€€€€½¹MÑ•ÁMÑ…­•Í¡…¹”õì¡Ø¤€ôøìÍ•Ñe…É‘M¥¹‘‘MÑ•ÁMÑ…­•Ì¡Ø¤ìÍ•Ñ!…ÍI•Ù¥•İ•‘e…É‘M¥¹MÑ…­•Ì¡ÑÉÕ”¤ìõô(€€€€€€€€€€€€€€€€€€€ÍÑ•ÁMÑ…­•EÕ…¹Ñ¥Ñäõíå…É‘M¥¹MÑ•ÁMÑ…­•EÑåô(€€€€€€€€€€€€€€€€€€€½¹MÑ•ÁMÑ…­•EÕ…¹Ñ¥Ñå¡…¹”õíÍ•Ñe…É‘M¥¹MÑ•ÁMÑ…­•EÑåô(€€€€€€€€€€€€€€€€€€€ÁÉ½µ½½‘”õíÁÉ½µ½½‘•ô(€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½½‘•¡…¹”õíÍ•ÑAÉ½µ½½‘•ô(€€€€€€€€€€€€€€€€€€€ÁÉ½µ½ÁÁ±¥•õíÁÉ½µ½ÁÁ±¥•‘ô(€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½ÁÁ±äõí¡…¹‘±•AÉ½µ½ÁÁ±åô(€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½I•µ½Ù”õí¡…¹‘±•AÉ½µ½I•µ½Ù•ô(€€€€€€€€€€€€€€€€€€€…ÕÑ½=Á•¹•Í¥¹%õí…ÕÑ½=Á•¹•Í¥¹%‘ô(€€€€€€€€€€€€€€€€€€€½¹UÁ±½…‘MÑ…ÑÕÍ¡…¹”õíÍ•Ñe…É‘M¥¹UÁ±½…‘MÑ…ÑÕÍô(€€€€€€€€€€€€€€€€€€€Í¡½İÉ•…Ñ•]¥Ñ¡$õí™…±Í•ô(€€€€€€€€€€€€€€€€€€€½¹AÉ•Ù¥•İ½¹”õì¡¥¤€ôø±½Uà ÁÉ•Ù¥•İ}‘½¹”œ°ì‘•Í¥¹%è¥°ÁÉ½‘ÕÑQåÁ”è€å…É‘}Í¥¸œô¥ô(€€€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İ=Á•¹QÉ¥•Èõíå…É‘M¥¹AÉ•Ù¥•İQÉ¥•Éô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Øµ¥¸µÜ´Àµ…àµÜµ™Õ±°ˆø(€€€€€€€€€€€€€€€€€íå…É‘M¥¹AÉ¥¥¹œ€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñe…É‘M¥¹AÉ¥•MÕµµ…Éä(€€€€€€€€€€€€€€€€€€€€€ÁÉ¥¥¹œõíå…É‘M¥¹AÉ¥¥¹ô(€€€€€€€€€€€€€€€€€€€€€‘•Í¥¹Ìõíå…É‘M¥¹•Í¥¹Íô(€€€€€€€€€€€€€€€€€€€€€ÁÉ½µ½½‘”õíÁÉ½µ½½‘•ô(€€€€€€€€€€€€€€€€€€€€€ÁÉ½µ½ÁÁ±¥•õíÁÉ½µ½ÁÁ±¥•‘ô(€€€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½½‘•¡…¹”õíÍ•ÑAÉ½µ½½‘•ô(€€€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½ÁÁ±äõí¡…¹‘±•AÉ½µ½ÁÁ±åô(€€€€€€€€€€€€€€€€€€€€€½¹AÉ½µ½I•µ½Ù”õí¡…¹‘±•AÉ½µ½I•µ½Ù•ô(€€€€€€€€€€€€€€€€€€€€€Í…µ•…å!¥ÑM•ÉÙ¥••¹ÑÌõíÁÉ•Ù¥•İM…µ•…å•••¹ÑÍô(€€€€€€€€€€€€€€€€€€€€€Ñ…á…±Õ±…Ñ•‘Ñ¡•­½ÕĞ(€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€¥ô((€€€€€€€€€€€€€€€€€ì¼¨M…µ”µ…ä!¥ĞM•ÉÙ¥”ÕÁÍ•±°ƒŠPÁÉ½‘ÕÑ¥½¸ÁÉ¥½É¥Ñä€¡9=PÍ¡¥ÁÁ¥¹œ¤¸€¨½ô(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡¥‘‘•¸µé‰±½¬ˆø(€€€€€€€€€€€€€€€€€€€€ñ•±¥Ù•ÉåQ¥µ•ÈÙ…É¥…¹Ğô‰½µÁ…Ğˆ€¼ø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€ñM…µ•…å!¥ÑM•ÉÙ¥•…É(€€€€€€€€€€€€€€€€€€€Ù…É¥…¹Ğô‰½µÁ…Ğˆ(€€€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İ!…ÍAÉ¥”õì„…å…É‘M¥¹AÉ¥¥¹œ€˜˜å…É‘M¥¹Q½Ñ…±EÑä€ø€À€˜˜å…É‘M¥¹EÕ…¹Ñ¥ÑåY…±¥¹Ù…±¥‘ô(€€€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İMÕ‰Ñ½Ñ…±•¹ÑÌõíå…É‘M¥¹AÉ¥¥¹œü¹Ñ½Ñ…±•¹ÑÍô(€€€€€€€€€€€€€€€€€€¼ø((€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€½¹±¥¬õí¡…¹‘±•¡•­½ÕÑô(€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•õíå…É‘M¥¹•Í¥¹Ì¹±•¹Ñ €ôôô€Àñğå…É‘M¥¹Q½Ñ…±EÑä€ôôô€Àñğ€…å…É‘M¥¹EÕ…¹Ñ¥ÑåY…±¥¹Ù…±¥‘ô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÉ½ÕÀÜµ™Õ±°™½¹Ğµ‰½±Ñ•áĞµ±œÁä´ÔÉ½Õ¹‘•µá°Í¡…‘½Üµ±œÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´È€‘ì(€€€€€€€€€€€€€€€€€€€€€å…É‘M¥¹•Í¥¹Ì¹±•¹Ñ €ø€À€˜˜å…É‘M¥¹Q½Ñ…±EÑä€ø€À€˜˜å…É‘M¥¹EÕ…¹Ñ¥ÑåY…±¥¹Ù…±¥(€€€€€€€€€€€€€€€€€€€€€€€€ü€‰œµ½É…¹”´ÔÀÀ¡½Ù•Èé‰œµ½É…¹”´ØÀÀ…Ñ¥Ù”éÍ…±”µlÀ¸äátÑ•áĞµİ¡¥Ñ”ÕÉÍ½ÈµÁ½¥¹Ñ•ÈÍ¡…‘½Üµ½É…¹”´ÔÀÀ¼ÌÀœ(€€€€€€€€€€€€€€€€€€€€€€€€è€‰œµ½É…¹”´ÌÀÀÑ•áĞµİ¡¥Ñ”¼àÀÕÉÍ½Èµ¹½Ğµ…±±½İ•œ(€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€I•Ù¥•Ü…¹½¹Ñ¥¹Õ”(€€€€€€€€€€€€€€€€€€€€ñÉÉ½İI¥¡Ğ±…ÍÍ9…µ”ô‰ ´ÔÜ´ÔÑÉ…¹Í¥Ñ¥½¸µÑÉ…¹Í™½É´É½ÕÀµ¡½Ù•ÈéÑÉ…¹Í±…Ñ”µà´À¸Ôˆ€¼ø(€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€½¹±¥¬õí¡…¹‘±•‘‘Q½…ÉÑô(€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•õíå…É‘M¥¹•Í¥¹Ì¹±•¹Ñ €ôôô€Àñğå…É‘M¥¹Q½Ñ…±EÑä€ôôô€Àñğ€…å…É‘M¥¹EÕ…¹Ñ¥ÑåY…±¥¹Ù…±¥‘ô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÜµ™Õ±°™½¹ĞµÍ•µ¥‰½±Ñ•áĞµ‰…Í”Áä´ĞÉ½Õ¹‘•µá°‰½É‘•È´ÈÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀ€‘ì(€€€€€€€€€€€€€€€€€€€€€å…É‘M¥¹•Í¥¹Ì¹±•¹Ñ €ø€À€˜˜å…É‘M¥¹Q½Ñ…±EÑä€ø€À€˜˜å…É‘M¥¹EÕ…¹Ñ¥ÑåY…±¥¹Ù…±¥(€€€€€€€€€€€€€€€€€€€€€€€€ü€‰½É‘•ÈµÍ±…Ñ”´ÌÀÀÑ•áĞµÍ±…Ñ”´àÀÀ¡½Ù•Èé‰œµÍ±…Ñ”´ÔÀœ(€€€€€€€€€€€€€€€€€€€€€€€€è€‰½É‘•ÈµÍ±…Ñ”´ÈÀÀÑ•áĞµÍ±…Ñ”´ĞÀÀÕÉÍ½Èµ¹½Ğµ…±±½İ•œ(€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€‘Ñ¼…ÉĞ(€€€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø((€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Ä¸ÔÑ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Äˆø(€€€€€€€€€€€€€€€€€€€€ñ1½¬±…ÍÍ9…µ”ô‰ ´ÌÜ´Ìˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùM•ÕÉ”¡•­½ÕĞ¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Ä¸ÔÑ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Èˆø(€€€€€€€€€€€€€€€€€€€€ñ5…¥°±…ÍÍ9…µ”ô‰ ´ÌÜ´Ìˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùEÕ•ÍÑ¥½¹ÌüÍÕÁÁ½ÉÑ‰…¹¹•ÉÍ½¹Ñ¡•™±ä¹½´ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€€íå…É‘M¥¹•Í¥¹Ì¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµ•¹Ñ•ÈÑ•áĞµÉ…ä´ĞÀÀˆùUÁ±½…å½ÕÈ…ÉÑİ½É¬Ñ¼½¹Ñ¥¹Õ”ğ½Àùô(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€¼¨½µÁ…Ğ‰…¹¹•È‰Õ¥±‘•Èì•á¥ÍÑ¥¹œÁÉ½‘ÕĞ¡…¹‘±•ÉÌÉ•µ…¥¸Í¡…É•¸€¨¼(€€€€€€€€€€€€ñ‘¥Ø‘…Ñ„µ½µÁ…Ğµ‰…¹¹•Èµ‰Õ¥±‘•Èõì…¥Í…É5…¹•ĞñğÕ¹‘•™¥¹•‘ô±…ÍÍ9…µ”õí¥Í…É5…¹•Ğ€ü€‰É¥µéÉ¥µ½±Ì´È±œéÉ¥µ½±Ìµmµ¥¹µ…à À°Ä¸Ñ™È¥}µ¥¹µ…à À°Å™È¥t…À´ÄÀµ…àµÜµ™Õ±°ˆ€è€‰É¥…À´Ø±œéÉ¥µ½±Ìµmµ¥¹µ…à À°Ä¸ØÕ™È¥}µ¥¹µ…à À°Å™È¥t‰ôø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ôµ¥¸µÜ´Àµ…àµÜµ™Õ±°ˆø(€€€€€€€€€€€€€€€íÍ¥é•…É‘ô(€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€˜˜ÅÕ…¹Ñ¥Ñå…É‘ô(€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€ü€ğùí™¥¹¥Í¡¥¹…É‘õíÕÁ±½…‘…É‘ôğ¼ø€è€ğùíÕÁ±½…‘…É‘õí™¥¹¥Í¡¥¹…É‘ôğ¼ùô((€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”õí¥Í…É5…¹•Ğ€ü€‰ÍÁ…”µä´Øµ¥¸µÜ´Àµ…àµÜµ™Õ±°±œéÍÑ¥­ä±œéÑ½À´ÈĞÍ•±˜µÍÑ…ÉĞˆ€è€‰ÍÁ…”µä´Ğµ¥¸µÜ´Àµ…àµÜµ™Õ±°Í•±˜µÍÑ…ÉĞÉ½Õ¹‘•µá°‰½É‘•È‰½É‘•ÈµÍ±…Ñ”´ÈÀÀ‰œµİ¡¥Ñ”À´ĞÍ¡…‘½ÜµÍ´±œéÍÑ¥­ä±œéÑ½À´ÈĞ±œéÀ´Ô‰ôø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”õí¥Í…É5…¹•Ğ€ü€‰Ñ•áĞµÍ´Ñ•áĞµ•µ•É…±´ÜÀÀ€µµĞ´Ä™½¹Ğµµ•‘¥Õ´ˆ€è€‰ÍÈµ½¹±ä‰ôø(€€€€€€€€€€€€€€€€€5½ÍĞÍÑ…¹‘…É½É‘•ÉÌ…É”ÁÉ½‘Õ•İ¥Ñ¡¥¸€ÈĞ¡½ÕÉÌì€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµ•µ•É…±´ÜÀÀ™½¹ĞµÍ•µ¥‰½±ˆù…ÉÉ¥•ÈÑÉ…¹Í¥Ğ™½±±½İÌÁÉ½‘ÕÑ¥½¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€˜˜…É5…¹•ÑAÉ¥¥¹œ€ü€ (€€€€€€€€€€€€€€€€€€ñAÉ¥•	É•…­‘½İ¸(€€€€€€€€€€€€€€€€€€€Ñ½Á1¥¹”õí€‘íİ¥‘Ñ¡¥ÍÁ±…åôƒ\€‘í¡•¥¡Ñ¥ÍÁ±…åô…È5…¹•ÑÌƒŠˆ€‘íÕÍ¡…É5…¹•ÑAÉ¥¥¹œ¹Õ¹¥ÑAÉ¥••¹ÑÌ€¼€ÄÀÀ¥ô½µ…¹•Ñô(€€€€€€€€€€€€€€€€€€€Í•½¹‘…Éå1¥¹”õí™½È€‘íÅÕ…¹Ñ¥Ñåô€‘íÅÕ…¹Ñ¥Ñä€ôôô€Ä€ü€µ…¹•Ğœ€è€µ…¹•ÑÌõô(€€€€€€€€€€€€€€€€€€€‘•Ñ…¥±I½İÌõíl(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€5…Ñ•É¥…°œ°Ù…±Õ”èµ…Ñ•É¥…±1…‰•°ô°(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€AÉ¥¹Ğœ°Ù…±Õ”è€M¥¹±”µM¥‘•œô°(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€I½Õ¹‘•½É¹•ÉÌœ°Ù…±Õ”è€‘í•Ñ…É5…¹•ÑI½Õ¹‘•‘½É¹•ÉÍ1…‰•°¡…É5…¹•ÑI½Õ¹‘•‘½É¹•ÉÌ¥ôƒŠˆ%¹±Õ‘•É••€ô°(€€€€€€€€€€€€€€€€€€€uô(€€€€€€€€€€€€€€€€€€€‰…Í•MÕ‰Ñ½Ñ…±•¹ÑÌõí…É5…¹•ÑAÉ¥¥¹œ¹‰…Í•MÕ‰Ñ½Ñ…±•¹ÑÍô(€€€€€€€€€€€€€€€€€€€‰…Í•MÕ‰Ñ½Ñ…±1…‰•°ô‰	…Í”ÁÉ¥”ˆ(€€€€€€€€€€€€€€€€€€€ÅÕ…¹Ñ¥Ñå¥Í½Õ¹Ñ•¹ÑÌõí…É5…¹•ÑAÉ¥¥¹œ¹ÅÕ…¹Ñ¥Ñå¥Í½Õ¹Ñ•¹ÑÍô(€€€€€€€€€€€€€€€€€€€ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”õí…É5…¹•ÑAÉ¥¥¹œ¹ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ•ô(€€€€€€€€€€€€€€€€€€€Í…µ•…å!¥ÑM•ÉÙ¥••¹ÑÌõíÁÉ•Ù¥•İM…µ•…å•••¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ…á•¹ÑÌõìÁô(€€€€€€€€€€€€€€€€€€€Ñ…áI…Ñ”õìÀ¸ÀÙô(€€€€€€€€€€€€€€€€€€€…‘©ÕÍÑ•‘MÕ‰Ñ½Ñ…±•¹ÑÌõí…É5…¹•ÑAÉ¥¥¹œ¹ÍÕ‰Ñ½Ñ…±•¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ½Ñ…±•¹ÑÌõí…É5…¹•ÑAÉ¥¥¹œ¹ÍÕ‰Ñ½Ñ…±•¹ÑÌ€¬ÁÉ•Ù¥•İM…µ•…å•••¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ…á…±Õ±…Ñ•‘Ñ¡•­½ÕĞ(€€€€€€€€€€€€€€€€€€€™½½Ñ•É9½Ñ”ô‰•ÍÑ¥¹…Ñ¥½¸µ‰…Í•Ñ…à…±Õ±…Ñ•…Ğ¡•­½ÕĞˆ(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€€€ñAÉ¥•	É•…­‘½İ¸(€€€€€€€€€€€€€€€€€€€Ù…É¥…¹Ğô‰½µÁ…Ğˆ(€€€€€€€€€€€€€€€€€€€¡•…‘¥¹œô‰e½ÕÈ‰…¹¹•Èˆ(€€€€€€€€€€€€€€€€€€€Ñ½Á1¥¹”õí€‘íÍÅ™Ğ¹Ñ½¥á• È¥ôÍÄ™ĞƒŠˆ€‘íÕÍ¡ÁÉ¥•A•ÉMÅĞ¥ôÁ•ÈÍÄ™Ñô(€€€€€€€€€€€€€€€€€€€Í•½¹‘…Éå1¥¹”õí™½È€‘íÅÕ…¹Ñ¥Ñåô€‘íÅÕ…¹Ñ¥Ñä€ôôô€Ä€ü€‰…¹¹•Èœ€è€‰…¹¹•ÉÌôƒŠˆ€‘íİ¥‘Ñ¡¥ÍÁ±…åôƒ\€‘í¡•¥¡Ñ¥ÍÁ±…åôƒŠˆ€‘íµ…Ñ•É¥…±1…‰•±õô(€€€€€€€€€€€€€€€€€€€Í¡½İQ½ÁMÕµµ…Éäõí™…±Í•ô(€€€€€€€€€€€€€€€€€€€‘•Ñ…¥±I½İÌõíl(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€É½µµ•ÑÌœ°Ù…±Õ”è™½Éµ…Ñ=ÁÑ¥½¹Y…±Õ”¡É½µµ•ÑÍ1…‰•°¤ô°(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€A½±”A½­•ÑÌœ°Ù…±Õ”è™½Éµ…Ñ=ÁÑ¥½¹Y…±Õ”¡•Ñ¥ÍÁ±…åA±…•µ•¹Ğ¡Á½±•A½­•ÑÌ¤¤ô°(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€I½Á”!•µµ¥¹œœ°Ù…±Õ”è™½Éµ…Ñ=ÁÑ¥½¹Y…±Õ”¡…‘‘I½Á”€ü•Ñ¥ÍÁ±…åA±…•µ•¹Ğ¡É½Á•A±…•µ•¹Ğ¤€è€œœ¤ô°(€€€€€€€€€€€€€€€€€€€€€ì±…‰•°è€!•µµ¥¹œœ°Ù…±Õ”è€±İ…åÌ%¹±Õ‘•œô°(€€€€€€€€€€€€€€€€€€€uô(€€€€€€€€€€€€€€€€€€€‰…Í•MÕ‰Ñ½Ñ…±•¹ÑÌõí‰…¹¹•ÉAÉ¥¥¹œ¹‰…Í•	…¹¹•ÉAÉ¥••¹ÑÍô(€€€€€€€€€€€€€€€€€€€‰…Í•MÕ‰Ñ½Ñ…±1…‰•°ô‰	…Í”‰…¹¹•Èˆ(€€€€€€€€€€€€€€€€€€€…‘‘=¹Ìõíl(€€€€€€€€€€€€€€€€€€€€€€¸¸¸¡‰…¹¹•ÉAÉ¥¥¹œ¹Á½±•A½­•Ñ½ÍÑ•¹ÑÌ€ø€À(€€€€€€€€€€€€€€€€€€€€€€€€ümì±…‰•°è€A½±”Á½­•ÑÌœ°…µ½Õ¹Ñ•¹ÑÌè‰…¹¹•ÉAÉ¥¥¹œ¹Á½±•A½­•Ñ½ÍÑ•¹ÑÌõt(€€€€€€€€€€€€€€€€€€€€€€€€èmt¤°(€€€€€€€€€€€€€€€€€€€€€€¸¸¸¡‰…¹¹•ÉAÉ¥¥¹œ¹É½Á•½ÍÑ•¹ÑÌ€ø€À(€€€€€€€€€€€€€€€€€€€€€€€€ümì±…‰•°è€I½Á”œ°…µ½Õ¹Ñ•¹ÑÌè‰…¹¹•ÉAÉ¥¥¹œ¹É½Á•½ÍÑ•¹ÑÌõt(€€€€€€€€€€€€€€€€€€€€€€€€èmt¤°(€€€€€€€€€€€€€€€€€€€uô(€€€€€€€€€€€€€€€€€€€ÅÕ…¹Ñ¥Ñå¥Í½Õ¹Ñ•¹ÑÌõì(€€€€€€€€€€€€€€€€€€€€€‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹ÑQåÁ”€ôôô€ÅÕ…¹Ñ¥Ñäœ(€€€€€€€€€€€€€€€€€€€€€€€€ü‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹Ñµ½Õ¹Ñ•¹ÑÌ(€€€€€€€€€€€€€€€€€€€€€€€€è€À(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”õì(€€€€€€€€€€€€€€€€€€€€€‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹ÑQåÁ”€ôôô€ÅÕ…¹Ñ¥Ñäœ(€€€€€€€€€€€€€€€€€€€€€€€€ü‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÅÕ…¹Ñ¥Ñå¥Í½Õ¹ÑI…Ñ”(€€€€€€€€€€€€€€€€€€€€€€€€èÕ¹‘•™¥¹•(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€ÁÉ½µ½¥Í½Õ¹Ñ•¹ÑÌõì(€€€€€€€€€€€€€€€€€€€€€‰…¹¹•ÉAÉ½µ½ÑÕ…±±åÁÁ±¥•(€€€€€€€€€€€€€€€€€€€€€€€€ü‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹Ñµ½Õ¹Ñ•¹ÑÌ(€€€€€€€€€€€€€€€€€€€€€€€€è€À(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€ÁÉ½µ½¥Í½Õ¹ÑI…Ñ”õì(€€€€€€€€€€€€€€€€€€€€€‰…¹¹•ÉAÉ½µ½ÑÕ…±±åÁÁ±¥•(€€€€€€€€€€€€€€€€€€€€€€€€ü‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½¥Í½Õ¹ÑI…Ñ”(€€€€€€€€€€€€€€€€€€€€€€€€èÕ¹‘•™¥¹•(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€ÁÉ½µ½¥Í½Õ¹Ñ½‘”õì(€€€€€€€€€€€€€€€€€€€€€‰…¹¹•ÉAÉ½µ½ÑÕ…±±åÁÁ±¥•(€€€€€€€€€€€€€€€€€€€€€€€€ü‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½¥Í½Õ¹Ñ½‘”(€€€€€€€€€€€€€€€€€€€€€€€€èÕ¹‘•™¥¹•(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€Í…µ•…å!¥ÑM•ÉÙ¥••¹ÑÌõíÁÉ•Ù¥•İM…µ•…å•••¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ…á•¹ÑÌõìÁô(€€€€€€€€€€€€€€€€€€€Ñ…áI…Ñ”õìÀ¸ÀÙô(€€€€€€€€€€€€€€€€€€€…‘©ÕÍÑ•‘MÕ‰Ñ½Ñ…±•¹ÑÌõí‰…¹¹•ÉMÕ‰Ñ½Ñ…±™Ñ•É±±¥Í½Õ¹ÑÍ•¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ½Ñ…±•¹ÑÌõí‰…¹¹•ÉMÕ‰Ñ½Ñ…±™Ñ•É±±¥Í½Õ¹ÑÍ•¹ÑÌ€¬ÁÉ•Ù¥•İM…µ•…å•••¹ÑÍô(€€€€€€€€€€€€€€€€€€€Ñ…á…±Õ±…Ñ•‘Ñ¡•­½ÕĞ(€€€€€€€€€€€€€€€€€€€ÁÉ½µ¼õíì(€€€€€€€€€€€€€€€€€€€€€½‘”èÁÉ½µ½½‘”°(€€€€€€€€€€€€€€€€€€€€€…ÁÁ±¥•èÁÉ½µ½ÁÁ±¥•°(€€€€€€€€€€€€€€€€€€€€€½¹½‘•¡…¹”èÍ•ÑAÉ½µ½½‘”°(€€€€€€€€€€€€€€€€€€€€€½¹ÁÁ±äè¡…¹‘±•AÉ½µ½ÁÁ±ä°(€€€€€€€€€€€€€€€€€€€€€½¹I•µ½Ù”è¡…¹‘±•AÉ½µ½I•µ½Ù”°(€€€€€€€€€€€€€€€€€€€€€…ÁÁ±¥•‘1…‰•°è‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½Ñ¥½¹%€ôôô€1I}	99I|ÈÔœ(€€€€€€€€€€€€€€€€€€€€€€€€ü€¡ÁÉ½µ½½‘”¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤€ôôôM511}	99I}AI=5=Q%=9}%(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ü€1…É”	…¹¹•È€ÈÔ”=™˜…ÁÁ±¥•…ÕÑ½µ…Ñ¥…±±äƒŠP€ÈÁ=¥ÌÍ…Ù•™½ÈÍµ…±±•È‰…¹¹•ÉÌœ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€è€1…É”	…¹¹•È€ÈÔ”=™˜…ÁÁ±¥•…ÕÑ½µ…Ñ¥…±±äœ¤(€€€€€€€€€€€€€€€€€€€€€€€€è‰…¹¹•ÉAÉ½µ½ÑÕ…±±åÁÁ±¥•(€€€€€€€€€€€€€€€€€€€€€€€€€€ü€‘íÁÉ½µ½½‘•ôƒŠP€‘í5…Ñ ¹É½Õ¹¡‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹ÁÉ½µ½¥Í½Õ¹ÑI…Ñ”€¨€ÄÀÀ¥ô”½™˜…ÁÁ±¥•‘€(€€€€€€€€€€€€€€€€€€€€€€€€€€è‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹ÑQåÁ”€ôôô€ÅÕ…¹Ñ¥Ñäœ(€€€€€€€€€€€€€€€€€€€€€€€€€€ü€‘íÁÉ½µ½½‘•ô•¹Ñ•É•ƒŠPÅÕ…¹Ñ¥Ñä‘¥Í½Õ¹Ğ¥Ì±…É•È°Í¼İ”­•ÁĞÑ¡…Ñ€(€€€€€€€€€€€€€€€€€€€€€€€€€€è€‘íÁÉ½µ½½‘•ôÍ…Ù•ƒŠPÍ•±•Ğ…¸•±¥¥‰±”Í¥é”Ñ¼Í•”å½ÕÈ‘¥Í½Õ¹Ñ€°(€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€™½½Ñ•É9½Ñ”ô‰•ÍÑ¥¹…Ñ¥½¸µ‰…Í•Ñ…à…±Õ±…Ñ•…Ğ¡•­½ÕĞˆ(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¥ô((€€€€€€€€€€€€€€€ì¼¨M…µ”µ…ä!¥ĞM•ÉÙ¥”ÕÁÍ•±°ƒŠPÁÉ½‘ÕÑ¥½¸ÁÉ¥½É¥Ñä€¡9=PÍ¡¥ÁÁ¥¹œ¤¸€¨½ô(€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡¥‘‘•¸µé‰±½¬ˆøñ•±¥Ù•ÉåQ¥µ•ÈÙ…É¥…¹Ğô‰½µÁ…Ğˆ€¼øğ½‘¥Øø€è€ñ!•É½•±¥Ù•ÉåMÑ…ÑÕÌÙ…É¥…¹Ğô‰±¥¡Ğˆ€¼ùô(€€€€€€€€€€€€€€€€ñM…µ•…å!¥ÑM•ÉÙ¥•…É(€€€€€€€€€€€€€€€€€Ù…É¥…¹Ğô‰½µÁ…Ğˆ(€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İ!…ÍAÉ¥”õì(€€€€€€€€€€€€€€€€€€€¥Í…É5…¹•Ğ(€€€€€€€€€€€€€€€€€€€€€€ü€„……É5…¹•ÑAÉ¥¥¹œ€˜˜€„…ÕÁ±½…‘•‘¥±”(€€€€€€€€€€€€€€€€€€€€€€è€„…ÕÁ±½…‘•‘¥±”€˜˜‰…¹¹•ÉAÉ¥¥¹œ¹ÍÕ‰Ñ½Ñ…±	•™½É•¥Í½Õ¹Ñ•¹ÑÌ€ø€À(€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İMÕ‰Ñ½Ñ…±•¹ÑÌõì(€€€€€€€€€€€€€€€€€€€¥Í…É5…¹•Ğ(€€€€€€€€€€€€€€€€€€€€€€ü…É5…¹•ÑAÉ¥¥¹œü¹‰…Í•MÕ‰Ñ½Ñ…±•¹ÑÌ(€€€€€€€€€€€€€€€€€€€€€€è‰…¹¹•ÉAÉ¥¥¹œ¹ÍÕ‰Ñ½Ñ…±	•™½É•¥Í½Õ¹Ñ•¹ÑÌ(€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€¼ø((€€€€€€€€€€€€€€€í¥Í…É5…¹•Ğ€ü€ğø(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí¡…¹‘±•¡•­½ÕÑô‘¥Í…‰±•õì…ÕÁ±½…‘•‘¥±”ñğ€…¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”ñğ¥ÍUÁ±½…‘¥¹œñğ¥ÍAÉ½•ÍÍ¥¹UÁÍ•±±ô±…ÍÍ9…µ”õíÉ½ÕÀÜµ™Õ±°™½¹Ğµ‰½±Ñ•áĞµ±œÁä´ÔÉ½Õ¹‘•µá°Í¡…‘½Üµ±œÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´È€‘íÕÁ±½…‘•‘¥±”€˜˜¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”€˜˜€…¥ÍUÁ±½…‘¥¹œ€˜˜€…¥ÍAÉ½•ÍÍ¥¹UÁÍ•±°€ü€‰œµ½É…¹”´ÔÀÀ¡½Ù•Èé‰œµ½É…¹”´ØÀÀ…Ñ¥Ù”éÍ…±”µlÀ¸äátÑ•áĞµİ¡¥Ñ”ÕÉÍ½ÈµÁ½¥¹Ñ•ÈÍ¡…‘½Üµ½É…¹”´ÔÀÀ¼ÌÀœ€è€‰œµ½É…¹”´ÌÀÀÑ•áĞµİ¡¥Ñ”¼àÀÕÉÍ½Èµ¹½Ğµ…±±½İ•õôø(€€€€€€€€€€€€€€€€€€ñ1½¬±…ÍÍ9…µ”ô‰ ´ĞÜ´Ğˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ€¼ø(€€€€€€€€€€€€€€€€€í¥ÍAÉ½•ÍÍ¥¹UÁÍ•±°€ü€AÉ•Á…É¥¹œ•á…ĞÁÉ•Ù¥•ßŠ˜œ€è€I•Ù¥•Ü…¹½¹Ñ¥¹Õ”ô(€€€€€€€€€€€€€€€€€€ñÉÉ½İI¥¡Ğ±…ÍÍ9…µ”ô‰ ´ÔÜ´ÔÑÉ…¹Í¥Ñ¥½¸µÑÉ…¹Í™½É´É½ÕÀµ¡½Ù•ÈéÑÉ…¹Í±…Ñ”µà´À¸Ôˆ€¼ø(€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€½¹±¥¬õí¡…¹‘±•‘‘Q½…ÉÑô(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì…ÕÁ±½…‘•‘¥±”ñğ€…¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”ñğ¥ÍUÁ±½…‘¥¹œñğ¥ÍAÉ½•ÍÍ¥¹UÁÍ•±±ô(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÜµ™Õ±°™½¹ĞµÍ•µ¥‰½±Ñ•áĞµ‰…Í”Áä´ĞÉ½Õ¹‘•µá°‰½É‘•È´ÈÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀ€‘ì(€€€€€€€€€€€€€€€€€€€ÕÁ±½…‘•‘¥±”€˜˜¡…Í½µµ¥ÑÑ•‘	…¹¹•ÉM¥é”€˜˜€…¥ÍUÁ±½…‘¥¹œ€˜˜€…¥ÍAÉ½•ÍÍ¥¹UÁÍ•±°(€€€€€€€€€€€€€€€€€€€€€€ü€‰½É‘•ÈµÍ±…Ñ”´ÌÀÀÑ•áĞµÍ±…Ñ”´àÀÀ¡½Ù•Èé‰œµÍ±…Ñ”´ÔÀœ(€€€€€€€€€€€€€€€€€€€€€€è€‰½É‘•ÈµÍ±…Ñ”´ÈÀÀÑ•áĞµÍ±…Ñ”´ĞÀÀÕÉÍ½Èµ¹½Ğµ…±±½İ•œ(€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€í¥ÍAÉ½•ÍÍ¥¹UÁÍ•±°€ü€AÉ•Á…É¥¹œ•á…ĞÁÉ•Ù¥•ßŠ˜œ€è€‘Ñ¼…ÉĞô(€€€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø((€€€€€€€€€€€€€€€€ğ¼ø€è€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ‰…¹¹•ÈµÁÉ¥µ…Éäµ…Ñ¥½¸½¹±¥¬õí‰…¹¹•ÉÑ¥½¸¹½¹±¥­ô‘¥Í…‰±•õí‰…¹¹•ÉÑ¥½¸¹‘¥Í…‰±•‘ô±…ÍÍ9…µ”ô‰¡¥‘‘•¸µ¥¸µ ´ÄÈÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´ÈÉ½Õ¹‘•µ±œ‰œµlÙÀÁtÁà´ĞÁä´ÌÑ•áĞµ‰…Í”™½¹Ğµ‰½±Ñ•áĞµlŒÀØÅÌÅt¡½Ù•Èé‰œµlÙÀÁt™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ¹½¹”™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œ´È™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œµlŒÀØÅÌÅt™½ÕÌµÙ¥Í¥‰±”éÉ¥¹œµ½™™Í•Ğ´È‘¥Í…‰±•é½Á…¥Ñä´ØÀ±œé™±•àˆùí‰…¹¹•ÉÑ¥½¸¹±…‰•±ôñÉÉ½İI¥¡Ğ±…ÍÍ9…µ”ô‰ ´ÔÜ´Ôˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ€¼øğ½‰ÕÑÑ½¸ùô((€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Ä¸ÔÑ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Äˆø(€€€€€€€€€€€€€€€€€€ñ1½¬±…ÍÍ9…µ”ô‰ ´ÌÜ´Ìˆ€¼ø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùM•ÕÉ”¡•­½ÕĞ¸ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´Ä¸ÔÑ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Èˆø(€€€€€€€€€€€€€€€€€€ñ5…¥°±…ÍÍ9…µ”ô‰ ´ÌÜ´Ìˆ€¼ø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùEÕ•ÍÑ¥½¹ÌüÍÕÁÁ½ÉÑ‰…¹¹•ÉÍ½¹Ñ¡•™±ä¹½´ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€ì…ÕÁ±½…‘•‘¥±”€˜˜€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµ•¹Ñ•ÈÑ•áĞµÉ…ä´ĞÀÀˆùUÁ±½…å½ÕÈ…ÉÑİ½É¬Ñ¼½¹Ñ¥¹Õ”ğ½Àùô(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€¥ô(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½Í•Ñ¥½¸ø((€€€€€€€€ñQÉÕÍÑMÑÉ¥À€¼ø((€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Áä´ĞÁˆ´ÈĞµéÁˆ´ĞÑ•áĞµ•¹Ñ•ÈÑ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀ‰½É‘•ÈµĞ‰½É‘•ÈµÉ…ä´ÄÀÀˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´Èˆø(€€€€€€€€€€€€ñ1¥¹¬Ñ¼ôˆ½Ñ•ÉµÌˆ±…ÍÍ9…µ”ô‰¡½Ù•ÈéÑ•áĞµÉ…ä´ØÀÀˆùQ•ÉµÌğ½1¥¹¬ø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µà´Èˆø™µ¥‘‘½Ğìğ½ÍÁ…¸ø(€€€€€€€€€€€€ñ1¥¹¬Ñ¼ôˆ½ÁÉ¥Ù…äˆ±…ÍÍ9…µ”ô‰¡½Ù•ÈéÑ•áĞµÉ…ä´ØÀÀˆùAÉ¥Ù…äğ½1¥¹¬ø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µà´Èˆø™µ¥‘‘½Ğìğ½ÍÁ…¸ø(€€€€€€€€€€€€ñ1¥¹¬Ñ¼ôˆ½Í¡¥ÁÁ¥¹œˆ±…ÍÍ9…µ”ô‰¡½Ù•ÈéÑ•áĞµÉ…ä´ØÀÀˆùM¡¥ÁÁ¥¹œğ½1¥¹¬ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€™½Áäìí¹•Ü…Ñ” ¤¹•ÑÕ±±e•…È ¥ô	…¹¹•ÉÌ=¸Q¡”±ä¸±°É¥¡ÑÌÉ•Í•ÉÙ•¸(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½‘¥Øø((€€€€€€€€ñ5½‰¥±•MÕ‰Ñ½Ñ…±	…È(€€€€€€€€€ÁÉ¥µ…ÉåÑ¥½¸õì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€ü‰…¹¹•ÉÑ¥½¸€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€…ÉÑ%Ñ•µ½Õ¹Ğõí…ÉÑ%Ñ•µ½Õ¹Ñô(€€€€€€€€€½¹Y¥•İ…ÉĞõí½Á•¹…ÉÑÉ…İ•Éô(€€€€€€€€€ÁÉ¥•9½Ñ”õíÍ¡½İA½ÁÕ±…É	…¹¹•ÉAÉ¥•9½Ñ”€üA=AU1I}	99I}AIMP¹µ½‰¥±•AÉ¥•9½Ñ”€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€ÍÕ‰Ñ½Ñ…°õì(€€€€€€€€€€€€…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€ü€ (€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€í‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹Ñµ½Õ¹Ñ•¹ÑÌ€ø€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÍ±…Ñ”´ÔÀÀ±¥¹”µÑ¡É½Õ ˆùíÕÍ ¡‰…¹¹•ÉMÕ‰Ñ½Ñ…±™Ñ•É±±¥Í½Õ¹ÑÍ•¹ÑÌ€¬ÁÉ•Ù¥•İM…µ•…å•••¹ÑÌ€¬‰…¹¹•ÉAÉ½µ½I•Í½±ÕÑ¥½¸¹…ÁÁ±¥•‘¥Í½Õ¹Ñµ½Õ¹Ñ•¹ÑÌ¤€¼€ÄÀÀ¥ôğ½Àùô(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµá°™½¹Ğµ‰½±Ñ•áĞµlŒÀØÅÌÅtˆùíÕÍ ¡‰…¹¹•ÉMÕ‰Ñ½Ñ…±™Ñ•É±±¥Í½Õ¹ÑÍ•¹ÑÌ€¬ÁÉ•Ù¥•İM…µ•…å•••¹ÑÌ¤€¼€ÄÀÀ¥ôğ½Àø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€¤€è¥Íe…É‘M¥¸€˜˜å…É‘M¥¹AÉ¥¥¹œ€ü€ (€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµá°™½¹Ğµ‰½±Ñ•áĞµÉ…ä´äÀÀˆø(€€€€€€€€€€€€€€€íå…É‘M¥¹Q½Ñ…±EÑä€ø€À€üÕÍ¡å…É‘M¥¹AÉ¥¥¹œ¹Ñ½Ñ…±•¹ÑÌ€¼€ÄÀÀ¤€è€ŸŠPô(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€¤€è‰…¹¹•ÉAÉ½µ½ÑÕ…±±åÁÁ±¥•€ü€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´Ñ•áĞµÉ…ä´ĞÀÀ±¥¹”µÑ¡É½Õ ˆùíÕÍ¡Ñ½Ñ…±Ì¹µ…Ñ•É¥…±Q½Ñ…°¥ôğ½Àø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµá°™½¹Ğµ‰½±Ñ•áĞµlŒÁÅÍtˆùíÕÍ¡‘¥Í½Õ¹Ñ•‘Q½Ñ…°¥ôğ½Àø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµá°™½¹Ğµ‰½±Ñ•áĞµÉ…ä´äÀÀˆùíÕÍ¡Ñ½Ñ…±Ì¹µ…Ñ•É¥…±Q½Ñ…°¥ôğ½Àø(€€€€€€€€€€€€¤(€€€€€€€€€ô(€€€€€€€€¼ø((€€€€€ì¼¨AÉ•Ù¥•Ü5½‘…°€¨½ô(€€€€€íÍ¡½İAÉ•Ù¥•Ü€˜˜ÕÁ±½…‘•‘¥±”€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ğ´Àè´ÔÀ™±•à¥Ñ•µÌµ•¹Í´é¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È‰œµ‰±…¬¼ØÀ‰…­‘É½Àµ‰±ÕÈµÍ´Í´éÀ´Ğˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµİ¡¥Ñ”É½Õ¹‘•µĞ´Éá°Í´éÉ½Õ¹‘•´Éá°Í¡…‘½Ü´Éá°µ…àµÜ´Íá°Üµ™Õ±°µ…àµ µläÕÙ¡tÍ´éµ…àµ µläÁÙ¡t™±•à™±•àµ½°µ½‘…°µ‘Ù µ™¥àˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸À´Ğ‰½É‘•Èµˆˆø(€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áĞµ±œ™½¹Ğµ‰½±Ñ•áĞµÉ…ä´äÀÀˆùí¥Íe…É‘M¥¸€ü€1¥Ù”e…ÉM¥¸AÉ•Ù¥•Üœ€è¥Í…É5…¹•Ğ€ü€1¥Ù”…È5…¹•ĞAÉ•Ù¥•Üœ€è€1¥Ù”	…¹¹•ÈAÉ•Ù¥•Üôğ½ Ìø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀˆù¥¹…°ÁÉ¥¹ĞÁÉ•Ù¥•ÜƒŠPİ¡…Ğå½ÔÍ•”¥Ìİ¡…Ğå½Ô•Ğğ½Àø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ…É¥„µ±…‰•°ô‰±½Í”ÁÉ•Ù¥•Üˆ½¹±¥¬õì ¤€ôøÍ•ÑM¡½İAÉ•Ù¥•Ü¡™…±Í”¥ô±…ÍÍ9…µ”ô‰À´È¸Ô¡½Ù•Èé‰œµÉ…ä´ÄÀÀÉ½Õ¹‘•µ™Õ±°ˆø(€€€€€€€€€€€€€€€€ñ`±…ÍÍ9…µ”ô‰Ü´Ô ´Ôˆ€¼ø(€€€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰À´Ğ™±•à´Ä½Ù•É™±½Üµ…ÕÑ¼ˆø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´Ñ•áĞµÉ…ä´ÔÀÀµˆ´Ì™±•à¥Ñ•µÌµ•¹Ñ•È…À´Äˆøñ5½Ù”±…ÍÍ9…µ”ô‰Ü´Ğ ´Ğˆ€¼øÉ…œÑ¼É•Á½Í¥Ñ¥½¸ƒ
ÜÉ…œ½É¹•ÉÌÑ¼É•Í¥é”ğ½Àø(€€€€€€€€€€€€€ì¼¨	…¹¹•ÈÍÕÉ™…”€¨½ô(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘•µ±œÀ´Ì‰½É‘•È‰½É‘•ÈµÍ±…Ñ”´ÌÀÀˆÍÑå±”õíì‰…­É½Õ¹è€±¥¹•…ÈµÉ…‘¥•¹Ğ ÄàÁ‘•œ°€”É”á˜À€À”°€‰Õ”Ä€ÄÀÀ”¤œõôø(€€€€€€€€€€€€€€€€ñAÉ•Ù¥•İIÕ±•ÉÉ…µ”(€€€€€€€€€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¹ô(€€€€€€€€€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¹ô(€€€€€€€€€€€€€€€€€Õ¹¥Ğõí¥Í…É5…¹•Ğ€ü€¥¸œ€èÕ¹¥Ñô(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µ…àµÜµ™Õ±°ˆ(€€€€€€€€€€€€€€€€€ÍÑå±”õíÁÉ•Ù¥•İ]É…ÁÁ•ÉMÑå±•ô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€ñÉÑİ½É­AÉ•Ù¥•İ‘¥Ñ½È(€€€€€€€€€€€€€€€€€€€É•˜õíµ½‘…±‘¥Ñ½ÉI•™ô(€€€€€€€€€€€€€€€€€€€½µÁ½Í¥Ñ¥½¹-•äõí‰Õ¥±‘ÉÑİ½É­½µÁ½Í¥Ñ¥½¹-•ä¡ÕÁ±½…‘•‘¥±”°ÁÉ½‘ÕÑQåÁ”¥ô(€€€€€€€€€€€€€€€€€€€¥¹¥Ñ¥…±9½Éµ…±¥é•‘QÉ…¹Í™½É´õíÉ•ÍÑ½É•‘9½Éµ…±¥é•‘QÉ…¹Í™½Éµô(€€€€€€€€€€€€€€€€€€€¥¹¥Ñ¥…±½µÁ½Í¥Ñ¥½¹I•Ù¥Í¥½¸õíÉ•ÍÑ½É•‘½µÁ½Í¥Ñ¥½¹I•Ù¥Í¥½¹ô(€€€€€€€€€€€€€€€€€€€ÍÉŒõíÕÁ±½…‘•‘¥±”¹ÁÉ•Ù¥•İUÉ°ñğÕÁ±½…‘•‘¥±”¹Ñ¡Õµ‰¹…¥±UÉ°ñğÕÁ±½…‘•‘¥±”¹ÕÉ±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ•Ù¥•İUÉ°õíÕÁ±½…‘•‘¥±”¹ÁÉ•Ù¥•İUÉ°ñğÕÁ±½…‘•‘¥±”¹Ñ¡Õµ‰¹…¥±UÉ°ñğ¹Õ±±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ½‘ÕÑ¥½¹UÉ°õíÕÁ±½…‘•‘¥±”¹ÁÉ½‘ÕÑ¥½¹UÉ°ñğÕÁ±½…‘•‘¥±”¹ÕÉ±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€É•Í½ÕÉ•QåÁ”õíÕÁ±½…‘•‘¥±”¹É•Í½ÕÉ•QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€µ¥µ•QåÁ”õíÕÁ±½…‘•‘¥±”¹µ¥µ•QåÁ•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•ÑÉåAÉ•Ù¥•ÜõíÕÁ±½…‘•‘¥±”¹¥ÍA‘˜€ü¡…¹‘±•I•ÑÉåA‘™AÉ•Ù¥•Ü€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€€€€€…±Ğô‰	…¹¹•ÈÁÉ•Ù¥•Üˆ(€€€€€€€€€€€€€€€€€€€Á…‘‘¥¹AĞõíÁÉ•Ù¥•İA…‘‘¥¹AÑô(€€€€€€€€€€€€€€€€€€€½¹Ñ…¥¹•ÉI•˜õíÁÉ•Ù¥•İ½¹Ñ…¥¹•ÉI•™ô(€€€€€€€€€€€€€€€€€€€µ½‰¥±•Q½½±‰…É½¹Ñ…¥¹•Èõíµ½‘…±5½‰¥±•Q½½±‰…É±ô(€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíìàè¥µA½Ì¹à°äè¥µA½Ì¹ä°Í…±•`è¥µM…±”°Í…±•dè¥µM…±•dõô(€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡Ø¤€ôøì(€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µA½Ì¡ìàèØ¹à°äèØ¹äô¤ì(€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µM…±”¡Ø¹Í…±•`¤ì(€€€€€€€€€€€€€€€€€€€€€Í•Ñ%µM…±•d¡Ø¹Í…±•d¤ì(€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€½¹ÍÑÉ…¥¸õí½¹ÍÑÉ…¥¹AÉ½ÁÍô(€€€€€€€€€€€€€€€€€€€½¹½¹ÍÑÉ…¥¹¡…¹”õíÍ•Ñ½¹ÍÑÉ…¥¹AÉ½ÁÍô(€€€€€€€€€€€€€€€€€€€½µÁ…Ñ½¹ÑÉ½±Ì(€€€€€€€€€€€€€€€€€€€…¹Ù…ÍMÑå±”õíì(€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹‘½±½Èè€œ™™™™™˜œ°(€€€€€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€È°(€€€€€€€€€€€€€€€€€€€€€‰½É‘•Èè€œÅÁàÍ½±¥€ŒäÑ„Íˆàœ°(€€€€€€€€€€€€€€€€€€€€€‰½áM¡…‘½Üè€œÀ€ÄÑÁà€ÈáÁà€´ÄÁÁàÉ‰„ ÄÔ°€ÈÌ°€ĞÈ°€À¸Èà¤°€À€ÑÁà€áÁàÉ‰„ ÄÔ°€ÈÌ°€ĞÈ°€À¸ÄÀ¤°¥¹Í•Ğ€À€À€À€ÅÁàÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°À¸Ø¤œ°(€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€½Ù•É±…äõì(€€€€€€€€€€€€€€€€€€€€€É½µµ•ÑÌ€„ôô€¹½¹”œ€ü€ (€€€€€€€€€€€€€€€€€€€€€€€€ñÍÙœ(€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ğ´ÀÜµ™Õ±° µ™Õ±°Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€Ù¥•İ	½àõí€À€À€‘íİ¥‘Ñ¡%¹ô€‘í¡•¥¡Ñ%¹õô(€€€€€€€€€€€€€€€€€€€€€€€€€ÁÉ•Í•ÉÙ•ÍÁ•ÑI…Ñ¥¼ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíìé%¹‘•àè€ÄÀõô(€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÉ½µµ•Ñ=Ù•É±…ä(€€€€€€€€€€€€€€€€€€€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€½ÁÑ¥½¸õíÉ½µµ•ÑÍô(€€€€€€€€€€€€€€€€€€€€€€€€€€€¥‘MÕ™™¥àô‰„µµ½‘…°ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€ğ½ÍÙœø(€€€€€€€€€€€€€€€€€€€€€€¤€è¹Õ±°(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€ğ½AÉ•Ù¥•İIÕ±•ÉÉ…µ”ø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€ì¼¨Q½½±‰…ÈÍ±½Ğ™½ÈÑ¡”µ½‘…°ÁÉ•Ù¥•ÜƒŠPÉ•¹‘•É•‰•±½ÜÑ¡”(€€€€€€€€€€€€€€€€€…¹Ù…Ì½¸…±°ÍÉ••¸Í¥é•Ì¸€¨½ô(€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€É•˜õíÍ•Ñ5½‘…±5½‰¥±•Q½½±‰…É±ô(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µĞ´Èˆ(€€€€€€€€€€€€€€€‘…Ñ„µµ½‰¥±”µ…ÉÑİ½É¬µÑ½½±‰…Èô‰„µµ½‘…°ˆ(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€ì¼¨M¥é”‰•±½ÜÁÉ•Ù¥•Ü€¨½ô(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀÑ•áĞµ•¹Ñ•ÈµĞ´Èˆø(€€€€€€€€€€€€€€€M¥é”èíİ¥‘Ñ¡Ñô™Ñíİ¥‘Ñ¡%¹H€ø€À€ü€€‘íİ¥‘Ñ¡%¹Iô¥¹€€è€œôƒ\í¡•¥¡ÑÑô™Ñí¡•¥¡Ñ%¹H€ø€À€ü€€‘í¡•¥¡Ñ%¹Iô¥¹€€è€œô€¡íÍÅ™Ğ¹Ñ½¥á• Ä¥ôÍÄ™Ğ¤(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€ì¼¨½¹™¥‘•¹”Ñ•áĞ€¨½ô(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ÔÀÀÑ•áĞµ•¹Ñ•ÈµĞ´È™½¹Ğµµ•‘¥Õ´ˆùe½ÕÈ‘•Í¥¸İ¥±°‰”ÁÉ¥¹Ñ•‰…Í•½¸Ñ¡¥ÌÁÉ•Ù¥•Üğ½Àø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÌÀ´Ğ‰½É‘•ÈµĞˆø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑM¡½İAÉ•Ù¥•Ü¡™…±Í”¥ô±…ÍÍ9…µ”ô‰™±•à´ÄÁä´Ì¸ÔÍ´éÁä´ÌÉ½Õ¹‘•µá°‰½É‘•È‰½É‘•ÈµÉ…ä´ÌÀÀÑ•áĞµÉ…ä´ÜÀÀ™½¹ĞµÍ•µ¥‰½±¡½Ù•Èé‰œµÉ…ä´ÔÀˆù…¹•°ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôø¡…¹‘±•½¹™¥ÉµA½Í¥Ñ¥½¸¡¥µA½Ì°¥µM…±”°¥µM…±•d¥ô±…ÍÍ9…µ”ô‰™±•à´ÄÁä´Ì¸ÔÍ´éÁä´ÌÉ½Õ¹‘•µá°‰œµ½É…¹”´ÔÀÀ¡½Ù•Èé‰œµ½É…¹”´ØÀÀÑ•áĞµİ¡¥Ñ”™½¹ĞµÍ•µ¥‰½±Í¡…‘½Üµ±œˆù½¹™¥É´€˜¡•­½ÕĞğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€¥ô(€€€€€ì¼¨UÁÍ•±°5½‘…°€¨½ô(€€€€€€ñUÁÍ•±±5½‘…°(€€€€€€€¥Í=Á•¸õíÍ¡½İUÁÍ•±±5½‘…±ô(€€€€€€€½¹±½Í”õì ¤€ôøÍ•ÑM¡½İUÁÍ•±±5½‘…°¡™…±Í”¥ô(€€€€€€€½¹½¹Ñ¥¹Õ”õí¡…¹‘±•UÁÍ•±±½¹Ñ¥¹Õ•ô(€€€€€€€ÅÕ½Ñ”õíì(€€€€€€€€€İ¥‘Ñ¡%¸°(€€€€€€€€€¡•¥¡Ñ%¸°(€€€€€€€€€ÅÕ…¹Ñ¥Ñä°(€€€€€€€€€µ…Ñ•É¥…°°(€€€€€€€€€É½µµ•ÑÌèÉ½µµ•ÑÌ…Ì…¹ä°(€€€€€€€€€Á½±•A½­•ÑÌ°(€€€€€€€€€Á½±•A½­•ÑM¥é”°(€€€€€€€€€…‘‘I½Á”°(€€€€€€€€€Ñ¡Õµ‰¹…¥±UÉ°èÁ•¹‘¥¹A±…•µ•¹ÑAÉ•Ù¥•Üü¹ÁÉ•Ù¥•İUÉ°°(€€€€€€€€€™¥±”èÕÁ±½…‘•‘¥±”€üì¹…µ”èÕÁ±½…‘•‘¥±”¹¹…µ”°ÕÉ°èÕÁ±½…‘•‘¥±”¹ÕÉ°ô€èÕ¹‘•™¥¹•°(€€€€€€€€€¥µ…•A½Í¥Ñ¥½¸èÁ•¹‘¥¹¡•­½ÕÑ…Ñ„ü¹Á½Ì°(€€€€€€€€€¥µ…•M…±”èÁ•¹‘¥¹¡•­½ÕÑ…Ñ„ü¹Í…±”°(€€€€€€€€€¥µ…•M…±•dèÁ•¹‘¥¹¡•­½ÕÑ…Ñ„ü¹Í…±•d€üüÁ•¹‘¥¹¡•­½ÕÑ…Ñ„ü¹Í…±”°(€€€€€€€ô…Ì…¹åô(€€€€€€€Ñ¡Õµ‰¹…¥±UÉ°õíÁ•¹‘¥¹A±…•µ•¹ÑAÉ•Ù¥•Üü¹ÁÉ•Ù¥•İUÉ±ô(€€€€€€€Ñ¡Õµ‰¹…¥±%Íá…Ñ½µÁ½Í¥Ñ¥½¸õí¥ÍI•…‘åA±…•µ•¹ÑAÉ•Ù¥•Ü¡Á•¹‘¥¹A±…•µ•¹ÑAÉ•Ù¥•Ü¥ô(€€€€€€€Ñ¡Õµ‰¹…¥±½µÁ½Í¥Ñ¥½¹M¥¹…ÑÕÉ”õíÁ•¹‘¥¹A±…•µ•¹ÑAÉ•Ù¥•Üü¹½µÁ½Í¥Ñ¥½¹M¥¹…ÑÕÉ•ô(€€€€€€€…Ñ¥½¹QåÁ”õíÁ•¹‘¥¹Ñ¥½¹QåÁ”€ôôô€¡•­½ÕĞœ€ü€¡•­½ÕĞœ€è€…ÉĞô(€€€€€€€¥ÍAÉ½•ÍÍ¥¹œõí¥ÍAÉ½•ÍÍ¥¹UÁÍ•±±ô(€€€€€€€ÁÉ½‘ÕÑQåÁ”õíÁÉ½‘ÕÑQåÁ•ô(€€€€€€¼ø(€€€€€ì¼¨…ÉĞ5½‘…°€¨½ô(€€€€€€ñ…ÉÑ5½‘…°(€€€€€€€¥Í=Á•¸õí¥Í…ÉÑ=Á•¹ô(€€€€€€€½¹±½Í”õí±½Í•…ÉÑÉ…İ•Éô(€€€€€€¼ø(€€€€€ì¼¨É•…Ñ”İ¥Ñ $5½‘…°€¨½ô(€€€€€ì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€˜˜Í¡½İÉ•…Ñ•]¥Ñ¡$€˜˜€ (€€€€€€€€ñÉ•…Ñ•]¥Ñ¡%5½‘…°(€€€€€€€€€½Á•¸õí…¥5½‘…±=Á•¹ô(€€€€€€€€€½¹=Á•¹¡…¹”õíÍ•Ñ¥5½‘…±=Á•¹ô(€€€€€€€€€ÁÉ½‘ÕÑQåÁ”õí¥Í…É5…¹•Ğ€ü€…É}µ…¹•Ğœ€è€‰…¹¹•Èô(€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¸ñğ¹Õ±±ô(€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¸ñğ¹Õ±±ô(€€€€€€€€€µ…Ñ•É¥…°õíµ…Ñ•É¥…°ñğ¹Õ±±ô(€€€€€€€€€µ…Ñ•É¥…±1…‰•°õíµ…Ñ•É¥…±1…‰•±ô(€€€€€€€€€ÅÕ…¹Ñ¥ÑäõíÅÕ…¹Ñ¥Ñåô(€€€€€€€€€½¹•¹•É…Ñ•õí¡…¹‘±•%•¹•É…Ñ•‘ô(€€€€€€€€¼ø(€€€€€€¥ô(€€€€€ì¼¨‘¥Ğİ¥Ñ $5½‘…°€¨½ô(€€€€€ì…¥Íe…É‘M¥¸€˜˜€…¥Í…É5…¹•Ğ€˜˜Í¡½İÉ•…Ñ•]¥Ñ¡$€˜˜€ (€€€€€€€€ñ‘¥Ñ]¥Ñ¡%5½‘…°(€€€€€€€€€½Á•¸õí…¥‘¥Ñ5½‘…±=Á•¹ô(€€€€€€€€€½¹=Á•¹¡…¹”õíÍ•Ñ¥‘¥Ñ5½‘…±=Á•¹ô(€€€€€€€€€ÁÉ½‘ÕÑQåÁ”õí¥Í…É5…¹•Ğ€ü€…É}µ…¹•Ğœ€è€‰…¹¹•Èô(€€€€€€€€€İ¥‘Ñ¡%¸õíİ¥‘Ñ¡%¸ñğ¹Õ±±ô(€€€€€€€€€¡•¥¡Ñ%¸õí¡•¥¡Ñ%¸ñğ¹Õ±±ô(€€€€€€€€€µ…Ñ•É¥…°õíµ…Ñ•É¥…°ñğ¹Õ±±ô(€€€€€€€€€µ…Ñ•É¥…±1…‰•°õíµ…Ñ•É¥…±1…‰•±ô(€€€€€€€€€½É¥¥¹…±AÉ½µÁĞõí…¥AÉ½µÁÑô(€€€€€€€€€ÕÉÉ•¹Ñ%µ…•UÉ°õíÕÁ±½…‘•‘¥±”ü¹Ñ¡Õµ‰¹…¥±UÉ°ñğÕÁ±½…‘•‘¥±”ü¹ÕÉ°ñğ¹Õ±±ô(€€€€€€€€€Í•ÍÍ¥½¸õí…¥•Í¥¹M•ÍÍ¥½¹ô(€€€€€€€€€½¹‘¥Ñ•õí¡…¹‘±•%‘¥Ñ•‘ô(€€€€€€€€¼ø(€€€€€€¥ô(€€€€ğ¼ø(€€¤ì)ôì()•áÁ½ÉĞ‘•™…Õ±Ğ½½±•‘Í	…¹¹•Èì