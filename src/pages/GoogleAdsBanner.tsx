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
 * unit. Pure UI helper — never affects pricing/cart/print.
 */
function formatPresetLabel(w: number, h: number, unit: 'in' | 'ft'): string {
  if (unit === 'ft') return `${w / 12}' × ${h / 12}'`;
  return `${w}" × ${h}"`;
}

const FastBannerAdHero: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <section
    data-google-ads-hero
    className="relative isolate overflow-hidden border-b-4 border-[#FF6A00] bg-[#F86408] text-[#071C35]"
  >
    <div
      className="pointer-events-none absolute inset-0 z-0 opacity-45"
      style={{
        backgroundImage: 'radial-gradient(circle at 13% 18%, rgba(255,188,74,.72), transparent 35%), radial-gradient(circle at 39% 76%, rgba(146,48,0,.24), transparent 38%)',
      }}
      aria-hidden="true"
    />

    <div className="relative z-10 mx-auto flex max-w-[1855px] items-center px-5 py-10 sm:px-8 sm:py-12 xl:min-h-[700px] xl:px-16 xl:py-16 2xl:min-h-[748px]">
      <div className="w-full xl:max-w-[760px]">
        <h1 className="homepage-condensed max-w-[760px] [--homepage-mobile-size:clamp(3.8rem,17vw,5.1rem)] text-[5.1rem] font-black uppercase leading-[0.86] tracking-[-0.015em] text-[#071C35] sm:text-[6.6rem] xl:text-[7.5rem]">
          Custom banners.<br />Without the wait.
        </h1>

        <button
          type="button"
          onClick={onStart}
          className="mt-7 inline-flex min-h-14 w-full max-w-[505px] items-center justify-center gap-4 rounded-md bg-[#071C35] px-6 py-4 text-base font-black uppercase tracking-[0.035em] text-white shadow-[0_12px_30px_rgba(7,28,53,.2)] transition-colors hover:bg-[#10375f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#F86408] sm:w-auto sm:min-w-[440px] sm:text-lg"
        >
          Build &amp; price my banner <ArrowRight className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="mt-5 grid w-full max-w-[505px] grid-cols-[auto_1fr] items-center gap-4 rounded-md border border-white/70 bg-white px-5 py-4 text-[#071C35] shadow-[0_9px_20px_rgba(57,20,0,.2)] sm:gap-5 sm:px-6">
          <p className="homepage-condensed whitespace-nowrap [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-none text-[#E95413] sm:text-[4rem]">25% off</p>
          <div className="border-l-2 border-[#E95413] pl-4 text-sm font-bold uppercase leading-5 tracking-[0.04em] sm:text-base sm:leading-6">
            6′ × 3′ &amp; larger<br />Applied automatically
          </div>
        </div>
        <HeroDeliveryStatus className="mt-5 w-full max-w-[505px]" />
      </div>
    </div>

    <picture className="relative z-[5] block w-full overflow-hidden bg-[#15283e] xl:absolute xl:bottom-[82px] xl:right-0 xl:top-0 xl:w-[57%]">
      <source
        type="image/avif"
        srcSet="/images/google-ads/banner-collage-520.avif 520w, /images/google-ads/banner-collage-800.avif 800w, /images/google-ads/banner-collage-1040.avif 1040w"
        sizes="(min-width: 1280px) 57vw, 100vw"
      />
      <source
        type="image/webp"
        srcSet="/images/google-ads/banner-collage-520.webp 520w, /images/google-ads/banner-collage-800.webp 800w, /images/google-ads/banner-collage-1040.webp 1040w"
        sizes="(min-width: 1280px) 57vw, 100vw"
      />
      <img
        src="/images/google-ads/banner-collage-1040.webp"
        alt="Custom vinyl and mesh banners installed at a storefront, sports field, and market event"
        width="1040"
        height="748"
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        className="aspect-[1040/748] h-auto w-full object-cover xl:h-full xl:object-cover xl:object-center"
      />
    </picture>

    <div className="pointer-events-none absolute inset-y-0 left-0 z-[6] hidden w-[58%] bg-[linear-gradient(90deg,#F86408_0%,rgba(248,100,8,.99)_64%,rgba(248,100,8,.86)_82%,transparent_100%)] xl:block" aria-hidden="true" />

    <div className="relative z-20 border-t border-[#FF6A00] bg-[#101820]/95 text-white">
      <ul className="mx-auto grid max-w-[1600px] grid-cols-3 divide-x divide-[#FF6900]/80 px-2 py-3 sm:px-7 sm:py-4 xl:py-5" aria-label="Banner ordering benefits">
        <li className="flex items-center justify-center gap-2 px-2 sm:gap-4 sm:px-6">
          <Clock className="h-5 w-5 flex-none text-[#FF6900] sm:h-9 sm:w-9" aria-hidden="true" />
          <span className="text-[9px] font-bold uppercase leading-3 sm:text-sm xl:text-base">24-hour standard production</span>
        </li>
        <li className="flex items-center justify-center gap-2 px-2 sm:gap-4 sm:px-6">
          <Truck className="h-5 w-5 flex-none text-[#FF6900] sm:h-9 sm:w-9" aria-hidden="true" />
          <span className="text-[9px] font-bold uppercase leading-3 sm:text-sm xl:text-base">Free next-day air after production</span>
        </li>
        <li className="flex items-center justify-center gap-2 px-2 sm:gap-4 sm:px-6">
          <Monitor className="h-5 w-5 flex-none text-[#FF6900] sm:h-9 sm:w-9" aria-hidden="true" />
          <span className="text-[9px] font-bold uppercase leading-3 sm:text-sm xl:text-base">Live print preview</span>
        </li>
      </ul>
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
// the cart/order item for print/admin export — only the on-screen preview uses
// this transformed variant. This avoids decoding 10–50MB images in the browser
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

  // Product type state — public for both banners and yard signs
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
  // of truth — both the Feet/Inches toggle and PreviewRulerFrame read this
  // state, so switching units updates the visible ruler immediately. Pure
  // UI state — does NOT affect pricing, cart, or print pipeline.
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
  const [activePreset, setActivePreset] = useState<number | null>(
    initialProductType === 'banner' ? POPULAR_BANNER_PRESET.presetIndex : null,
  );
  const [quantity, setQuantity] = useState(initialProductType === 'yard_sign' ? 10 : 1);
  const storedPromoAtLoad = useCartStore.getState().discountCode;
  const [promoCode, setPromoCode] = useState(storedPromoAtLoad?.code || '');
  const [promoApplied, setPromoApplied] = useState(Boolean(storedPromoAtLoad));

  // Start banner visitors with the 6′ × 3′ popular preset fully selected so
  // its automatic 25%-off price is visible immediately on first load.
  const [hasConfirmedSize, setHasConfirmedSize] = useState(initialProductType === 'banner');
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
  // page — yard signs use YardSignConfigurator which has its own button.
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

  // Dimensions: for banners, use ft+in inputs; for yard signs, fixed 24" × 18"
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
  // rationale — the snapshot ref ensures defaults don't auto-confirm
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

  // Yard sign quantity discount rate (legacy compat — always 0 now)
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
  // while the user is only typing into the inches input — typing-in-progress
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
  useEffect(() => {
    if (!showPostAddResetNotice) return;
    const t = window.setTimeout(() => setShowPostAddResetNotice(false), 4000);
    return () => window.clearTimeout(t);
  }, [showPostAddResetNotice]);

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

  // Handle product type switch — reset state
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
    // Switching product tabs is otherwise a fresh start — clear confirmation flags so
    // the new product's mobile guided flow walks the user back through
    // size → material → quantity → options → upload from Step 1.
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

      if (
        selectedBannerQualifiesForAutomaticPrice
        && validatedPercentage > 0
        && validatedPercentage <= 25
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

      cartStore.applyDiscountCode(result.discount);
      setPromoCode(result.discount.code);
      setPromoApplied(true);
      toast({
        title: 'Discount applied',
        description: validatedPercentage > 0
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
    const scrollProductPageToTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const scrollRoots = document.querySelectorAll<HTMLElement>('main, [data-product-scroll-root], [data-scroll-root]');
      scrollRoots.forEach((el) => {
        if (el.scrollHeight > el.clientHeight) {
          el.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 180);
    };

    resetPreview();
    // Keep the page in a distinct success state until the shopper explicitly
    // opens the cart or chooses to build another product. This prevents the
    // sticky bar from falling back to a stale "Use [size]" prompt.
    setHasJustAddedToCart(true);
    setShowPostAddResetNotice(true);
    scrollProductPageToTop();
  }, [resetPreview]);

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
        title: 'Added to cart ✓',
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

      console.log('[YARD_SIGN] ✅ Cart item created with yard sign metadata');
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

    // Banner pricing — per sqft (existing logic)
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

    console.log('[FINAL_RENDER_HTML] ✅ Cart item created with verified permanent placement preview');
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
    selectedOptions.forEach((option) => {
      if (option.selected && option.id === 'polePockets' && option.polePocketSelection) {
        setPolePockets(option.polePocketSelection);
        setPolePocketSize(option.polePocketSize || '2');
        setFinishingType('pole_pockets');
      }
    });
    try {
      await performCheckout(selectedOptions, undefined, pendingActionType);
    } catch (error) {
      const explained = explainPreviewLifecycleError(error);
      setShowUpsellModal(true);
      toast({ title: explained.code, description: `${explained.description} Technical reason: ${explained.technicalReason}`, variant: 'destructive' });
    } finally {
      setIsProcessingUpsell(false);
    }
  }, [pendingActionType, performCheckout, toast]);
  // Preview drag handlers
  const onPreviewMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPreview(true);
    setDragStartPt({ x: e.clientX, y: e.clientY });
    setDragStartPos({ ...imgPos });
  }, [imgPos]);

  const onPreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingPreview) return;
    const dx = (e.clientX - dragStartPt.x) * 1.5;
    const dy = (e.clientY - dragStartPt.y) * 1.5;
    setImgPos({ x: dragStartPos.x + dx, y: dragStartPos.y + dy });
  }, [isDraggingPreview, dragStartPt, dragStartPos]);

  const onPreviewMouseUp = useCallback(() => {
    setIsDraggingPreview(false);
  }, []);

  // Corner resize handlers
  const onCornerMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const container = previewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    setResizeStartDist(Math.sqrt(dx * dx + dy * dy));
    setResizeStartScale(imgScale);
    setResizeCenter({ x: centerX, y: centerY });
    setIsResizing(true);
  }, [imgScale]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeCenter.x;
      const dy = e.clientY - resizeCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scaleFactor = dist / (resizeStartDist || 1);
      setImgScale(Math.max(0.5, Math.min(3, resizeStartScale * scaleFactor)));
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeCenter, resizeStartDist, resizeStartScale]);

  const onPreviewTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastPinchDist(Math.sqrt(dx * dx + dy * dy));
      setIsDraggingPreview(false);
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setIsDraggingPreview(true);
    setDragStartPt({ x: t.clientX, y: t.clientY });
    setDragStartPos({ ...imgPos });
  }, [imgPos]);

  const onPreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = dist / lastPinchDist;
      setImgScale(s => Math.min(3, Math.max(0.5, s * delta)));
      setLastPinchDist(dist);
      return;
    }
    if (!isDraggingPreview || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx2 = (t.clientX - dragStartPt.x) * 1.5;
    const dy2 = (t.clientY - dragStartPt.y) * 1.5;
    setImgPos({ x: dragStartPos.x + dx2, y: dragStartPos.y + dy2 });
  }, [isDraggingPreview, dragStartPt, dragStartPos, lastPinchDist]);

  const onPreviewTouchEnd = useCallback(() => {
    setIsDraggingPreview(false);
    setLastPinchDist(null);
  }, []);

  const showEntryCta = !hasEnteredBuilder;

  // Open the native picker directly from the sticky CTA's user gesture. iOS
  // Safari can reject delayed/programmatic file-dialog requests, so scrolling
  // to the upload card is only the fallback when the input is unavailable.
  const openOrScrollToUpload = useCallback(() => {
    setHasEnteredBuilder(true);
    const opened = fileUploaderRef.current?.openFilePicker() ?? false;
    logUx('upload_picker_requested', { source: 'sticky_cta', opened });
    if (opened) return;
    const el = typeof document !== 'undefined' ? document.getElementById('upload-section') : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const target = builderStartRef.current ?? orderRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const openOrScrollToYardSignUpload = useCallback(() => {
    setHasEnteredBuilder(true);
    const opened = yardSignConfiguratorRef.current?.openFilePicker() ?? false;
    logUx('upload_picker_requested', { source: 'sticky_cta', productType: 'yard_sign', opened });
    if (!opened) scrollToStepAnchor(YARD_SIGN_ANCHORS.upload);
  }, []);

  // Shared step-machine state — drives both the mobile sticky CTA and the
  // mobile step-progress indicator so they can never disagree.
  const builderState = useMemo(() => ({
    showEntryCta,
    widthIn,
    heightIn,
    material,
    materialRequired: !isCarMagnet,
    quantity,
    isUploading,
    uploadError: uploadError || null,
    hasUpload: Boolean(uploadedFile),
    optionsRequired: true,
    // The paid landing page is a single scrolling configurator, not a wizard.
    // Valid visible defaults count as selected so mobile shoppers are never
    // forced through redundant "Use…" confirmation taps.
    sizeConfirmed: widthIn > 0 && heightIn > 0,
    materialConfirmed: isCarMagnet || Boolean(material),
    quantityConfirmed: quantity > 0,
    optionsReviewed: true,
    sizeLabel: `${widthIn}" × ${heightIn}"`,
    materialLabel: material === '13oz' ? '13oz Vinyl' : material === '15oz' ? '15oz Vinyl' : material,
    quantityLabel: `Qty ${quantity}`,
    optionsLabel: isCarMagnet
      ? getCarMagnetRoundedCornersLabel(carMagnetRoundedCorners)
      : finishingType === 'none'
        ? 'No finishing'
        : 'Selected finishing',
  }), [showEntryCta, widthIn, heightIn, material, isCarMagnet, carMagnetRoundedCorners, quantity, isUploading, uploadError, uploadedFile, hasConfirmedSize, hasConfirmedMaterial, hasConfirmedQuantity, hasReviewedOptions, finishingType]);

  const builderProgress = useMemo(() => getProgress(builderState), [builderState]);

  const confirmStep = useCallback((step: BuilderStepKey) => {
    if (step === 'size') setHasConfirmedSize(true);
    else if (step === 'material') setHasConfirmedMaterial(true);
    else if (step === 'quantity') setHasConfirmedQuantity(true);
    else if (step === 'options') setHasReviewedOptions(true);
  }, []);

  const yardSignUnconfirmedDesignId = useMemo(() => {
    if (!isYardSign) return null;
    const pending = yardSignDesigns.find(d => !d.previewThumbnailUrl);
    return pending?.id ?? null;
  }, [isYardSign, yardSignDesigns]);

  const openCartDrawer = useCallback(() => {
    logUx('cart_opened', { source: 'sticky_view_cart' });
    setIsCartOpen(true);
  }, [setIsCartOpen]);
  const closeCartDrawer = useCallback(() => setIsCartOpen(false), [setIsCartOpen]);

  const handleStartAnother = useCallback(() => {
    resetPreview();
    setHasEnteredBuilder(true);
    scrollToStepAnchor('order-builder');
  }, [resetPreview]);

  // Single contextual mobile CTA — replaces the old "Continue Building" /
  // dual-button design so the sticky bar always shows ONE clear primary
  // action whose label matches what tapping it will do. When disabled, a
  // helper line explains exactly what is missing.
  const mobileCta: {
    label: string;
    onClick: (() => void) | undefined;
    disabled: boolean;
    loading: boolean;
    helper: string | null;
  } = (() => {
    if (isProcessingUpsell) {
      return {
        label: 'Preparing exact preview…',
        onClick: undefined,
        disabled: true,
        loading: true,
        helper: 'Verifying the permanent customer-approved composition.',
      };
    }
    if (hasJustAddedToCart) {
      const post = getPostAddToCartCta(cartItemCount);
      return { label: post.label, onClick: openCartDrawer, disabled: false, loading: false, helper: null };
    }

    if (isYardSign) {
      const desc = getYardSignCtaState({
        showEntryCta,
        printSideSelected: Boolean(yardSignSidedness),
        designCount: yardSignDesigns.length,
        unconfirmedDesignId: yardSignUnconfirmedDesignId,
        totalQuantity: yardSignTotalQty,
        quantityValid: yardSignQuantityValid.valid,
        quantityValidationMessage: yardSignQuantityValid.message ?? null,
        isUploading: yardSignUploadStatus.isUploading,
        uploadError: yardSignUploadStatus.uploadError,
        hasJustAddedToCart: false,
        stakesReviewed: hasReviewedYardSignStakes,
        cartItemCount,
      });
      const wrap = (fn?: () => void) => fn ? () => {
        logUx('cta_click', { step: desc.step, label: desc.label, productType: 'yard_sign' });
        fn();
      } : undefined;
      switch (desc.step) {
        case 'entry':
          return { label: desc.label, onClick: wrap(scrollToOrder), disabled: false, loading: false, helper: desc.helper };
        case 'uploading':
          return { label: desc.label, onClick: undefined, disabled: true, loading: true, helper: desc.helper };
        case 'upload_error':
          return { label: desc.label, onClick: wrap(openOrScrollToYardSignUpload), disabled: false, loading: false, helper: desc.helper };
        case 'print_side':
          return { label: desc.label, onClick: wrap(() => { setHasEnteredBuilder(true); setHasReviewedYardSignPrintSide(true); scrollToStepAnchor(YARD_SIGN_ANCHORS.printSide); }), disabled: false, loading: false, helper: desc.helper };
        case 'add_design':
          return { label: desc.label, onClick: wrap(openOrScrollToYardSignUpload), disabled: false, loading: false, helper: desc.helper };
        case 'review_design':
          return { label: desc.label, onClick: wrap(() => { if (desc.designId) { setYardSignPreviewTrigger({ designId: desc.designId, nonce: Date.now() }); logUx('preview_opened', { source: 'sticky_review_design', designId: desc.designId }); } scrollToStepAnchor(YARD_SIGN_ANCHORS.upload); }), disabled: false, loading: false, helper: desc.helper };
        case 'assign_quantities':
          return { label: desc.label, onClick: wrap(() => scrollToStepAnchor(YARD_SIGN_ANCHORS.quantity)), disabled: false, loading: false, helper: desc.helper };
        case 'fix_quantity':
          return { label: desc.label, onClick: wrap(() => { logUx('quantity_invalid', { total: yardSignTotalQty }); scrollToStepAnchor(YARD_SIGN_ANCHORS.quantity); }), disabled: false, loading: false, helper: desc.helper };
        case 'review_stakes':
          return { label: desc.label, onClick: wrap(() => { setHasReviewedYardSignStakes(true); logUx('finishing_reviewed', { productType: 'yard_sign' }); scrollToStepAnchor(YARD_SIGN_ANCHORS.finishing); }), disabled: false, loading: false, helper: desc.helper };
        case 'add_to_cart':
          return { label: desc.label, onClick: wrap(() => { logUx('add_to_cart_attempted', { productType: 'yard_sign' }); handleAddToCart(); }), disabled: false, loading: false, helper: null };
        default:
          return { label: desc.label, onClick: undefined, disabled: true, loading: false, helper: desc.helper };
      }
    }

    const desc = getNextStep(builderState);
    const wrap = (fn?: () => void) => fn ? () => {
      logUx('cta_click', { step: desc.step, label: desc.label });
      fn();
    } : undefined;

    switch (desc.step) {
      case 'entry':
        return { label: desc.label, onClick: wrap(scrollToOrder), disabled: false, loading: false, helper: null };
      case 'uploading':
        return { label: desc.label, onClick: undefined, disabled: true, loading: true, helper: desc.helper };
      case 'upload_error':
        return { label: desc.label, onClick: wrap(openOrScrollToUpload), disabled: false, loading: false, helper: desc.helper };
      case 'add_to_cart':
        return { label: desc.label, onClick: wrap(() => { logUx('add_to_cart_attempted', { productType }); handleAddToCart(); }), disabled: false, loading: false, helper: null };
      case 'size':
      case 'material':
      case 'quantity':
      case 'options':
      case 'upload': {
        const targetId = desc.scrollTargetId;
        const stepKey = desc.step;
        const onClick = wrap(() => {
          setHasEnteredBuilder(true);
          logUx('step_scrolled', { step: stepKey, source: 'sticky_cta' });
          if (stepKey === 'upload') {
            openOrScrollToUpload();
            return;
          }
          // Accept the visible default/value, then move to the next incomplete
          // applicable step instead of making the shopper tap twice.
          const currentIndex = builderProgress.steps.indexOf(stepKey as BuilderStepKey);
          const nextIncomplete = builderProgress.steps
            .slice(currentIndex + 1)
            .find((key) => !builderProgress.completed[key]);
          confirmStep(stepKey as BuilderStepKey);
          scrollToStepAnchor(nextIncomplete ? STEP_ANCHOR_FOR(nextIncomplete) : targetId);
        });
        return { label: desc.label, onClick, disabled: false, loading: false, helper: desc.helper };
      }
      default:
        return { label: desc.label, onClick: undefined, disabled: true, loading: false, helper: desc.helper };
    }
  })();

  // Emit sticky_cta_rendered every time the visible label changes.
  const lastCtaLabelRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastCtaLabelRef.current === mobileCta.label) return;
    lastCtaLabelRef.current = mobileCta.label;
    logUx('sticky_cta_rendered', {
      label: mobileCta.label,
      productType,
      disabled: mobileCta.disabled,
    });
  }, [mobileCta.label, mobileCta.disabled, productType]);

  const heroContent = isYardSign
    ? {
        eyebrow: '24″ × 18″ YARD SIGNS · NATIONWIDE SHIPPING',
        headline: 'Custom yard signs, produced fast.',
        intro: 'Upload up to 10 designs, review every on-screen print preview, and see the exact order subtotal before checkout.',
        priceLabel: '10 single-sided signs',
        price: '$120',
        offer: 'Up to 10 designs per order',
        cta: 'Build my yard-sign order',
      }
    : isCarMagnet
      ? {
          eyebrow: 'CUSTOM CAR MAGNETS · NATIONWIDE SHIPPING',
          headline: 'Custom car magnets, made fast.',
          intro: 'Choose a supported size and corner style, upload artwork, and review the on-screen print preview before ordering.',
          priceLabel: '18″ × 12″ car magnet',
          price: '$29',
          offer: 'Four sizes · Two corner styles',
          cta: 'Build & price my car magnet',
        }
      : {
          eyebrow: 'CUSTOM VINYL BANNERS · NATIONWIDE SHIPPING',
          headline: 'Custom vinyl banners, produced fast.',
          intro: 'Choose a size and material, upload artwork, and review the on-screen print preview before ordering.',
          priceLabel: 'Popular 4′ × 2′ banner',
          price: '$36',
          offer: 'Large banners 6′ × 3′ and up: 25% off automatically',
          cta: 'Build & price my banner',
        };

  return (
    <>
      <Helmet>
        <title>{isYardSign ? 'Custom Yard Signs' : isCarMagnet ? 'Car Magnets' : 'Custom Banner Printing'} - 24 Hour Production | Banners On The Fly</title>
        <meta name="description" content={isYardSign ? "Upload yard-sign artwork, review the supported size and current price, and see production and shipping details before checkout." : isCarMagnet ? "Configure a supported car-magnet size, upload artwork, preview the print, and review production and shipping before checkout." : "Upload banner artwork, choose size and material, preview the print, and review production and shipping before checkout."} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-white text-gray-900">
        <header data-site-header className="w-full border-b border-gray-100 bg-white py-3 px-4 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="w-10" />
            <img src="/images/header-logo.png" alt="Banners On The Fly" width="248" height="70" className="h-10 object-contain" loading="eager" />
            <button
              onClick={() => setIsCartOpen(true)}
              aria-label="Shopping cart"
              className="relative p-2 text-orange-500 hover:text-orange-600 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold"
                  aria-label={`${cartItemCount} items in cart`}
                >
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* HERO */}
        {!isYardSign && !isCarMagnet ? (
          <FastBannerAdHero onStart={scrollToOrder} />
        ) : (
        <section className="relative overflow-hidden border-b-4 border-[#FF6A00] bg-[#0B1F3A] px-4 py-10 sm:py-12 lg:py-16">
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:gap-14">
            <div className="text-center lg:text-left">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF8A3D]">{heroContent.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-black leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                {heroContent.headline}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg lg:mx-0">
                {heroContent.intro}
              </p>

              <div data-mobile-delivery-timer className="mx-auto mt-5 max-w-xl text-left md:hidden">
                <DeliveryTimer variant="compact" className="shadow-lg" />
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm font-semibold text-white lg:justify-start">
                <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-[#FF8A3D]" />Most standard orders: 24-hour production</span>
                <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4 text-[#FF8A3D]" />Free next-day air anywhere in the U.S.</span>
                <span className="inline-flex items-center gap-2"><FileCheck className="h-4 w-4 text-[#FF8A3D]" />Every file reviewed before print</span>
              </div>

              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={scrollToOrder}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#C94E00] px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(255,106,0,0.24)] transition-colors hover:bg-[#B84300] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A] sm:w-auto"
                >
                  {heroContent.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <p className="text-sm font-semibold text-[#FFB27D]">{heroContent.offer}</p>
              </div>

              <div className="mt-7 flex items-center justify-center gap-3 border-t border-white/15 pt-5 lg:justify-start">
                <img
                  src="https://res.cloudinary.com/dtrxl120u/image/upload/w_128,h_128,c_fill,f_auto,q_auto/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
                  alt="Dan Oliver of Dan-O's Seasoning"
                  width="48"
                  height="48"
                  className="h-12 w-12 rounded-full border-2 border-white/70 object-cover"
                />
                <div className="text-left">
                  <span className="text-[#FF8A3D]" role="img" aria-label="Five-star customer feedback">★★★★★</span>
                  <p className="text-xs font-semibold text-white">Trusted by Dan-O&rsquo;s Seasoning</p>
                </div>
              </div>
            </div>

            <aside className="border border-white/15 bg-white text-[#0B1F3A] shadow-[0_24px_60px_rgba(0,0,0,0.24)]" aria-label="Popular order example">
              <div className="border-t-4 border-[#FF6A00] p-6 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Popular starting point</p>
                <div className="mt-3 flex items-end justify-between gap-5 border-b border-slate-200 pb-5">
                  <div>
                    <p className="font-display text-xl font-bold">{heroContent.priceLabel}</p>
                    <p className="mt-1 text-sm text-slate-500">Before destination-based tax</p>
                  </div>
                  <p className="font-display text-3xl font-black text-[#0B1F3A]">{heroContent.price}</p>
                </div>
                <ol className="mt-5 grid gap-3 text-sm">
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-white">1</span>Choose your configuration</li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-white">2</span>Upload your artwork</li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-white">3</span>Review the on-screen preview</li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-white">4</span>Continue to secure checkout</li>
                </ol>
                <div className="mt-5 border-l-4 border-[#FF6A00] bg-[#FFF7F1] px-4 py-3 text-sm leading-6 text-slate-700">
                  Free next-day air anywhere in the United States is included after production. Production time and carrier transit are shown separately.
                </div>
              </div>
            </aside>
          </div>
        </section>
        )}

        <RealOrdersStrip />

        <section ref={orderRef} id="order-builder" className="mt-8 py-12 px-4 bg-gray-50">
          <div className="max-w-4xl lg:max-w-7xl mx-auto">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A00]">
              {isYardSign ? '24″ × 18″ yard signs' : isCarMagnet ? 'Custom car magnets' : 'Custom vinyl banners'}
            </p>
            <h2
              ref={builderStartRef}
              id="builder-start"
              className="text-2xl md:text-3xl font-bold text-center mb-10 scroll-mt-[140px] md:scroll-mt-24"
            >
              {isYardSign ? 'Build Your Yard Sign Order' : isCarMagnet ? 'Design Your Custom Car Magnets' : 'Build Your Banner'}
            </h2>
            {showPostAddResetNotice && (
              <div
                role="status"
                aria-live="polite"
                className="mb-6 flex flex-col gap-4 border border-emerald-200 bg-emerald-50 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-600 text-white">
                    <CheckCircle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-bold text-emerald-950">Added to your cart</p>
                    <p className="mt-0.5 text-sm text-emerald-800">Your saved item is ready. View the cart or start another product.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openCartDrawer} className="min-h-11 bg-[#0B1F3A] px-4 py-2 text-sm font-bold text-white hover:bg-[#13335d]">
                    View cart{cartItemCount > 0 ? ` (${cartItemCount})` : ''}
                  </button>
                  <button type="button" onClick={handleStartAnother} className="min-h-11 border border-emerald-700 bg-white px-4 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
                    Start another
                  </button>
                </div>
              </div>
            )}
            {isYardSign ? (
              /* ========== YARD SIGN ORDER BUILDER (v2) ========== */
              <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10 max-w-full">
                <div className="space-y-8 min-w-0 max-w-full">
                  <YardSignConfigurator
                    ref={yardSignConfiguratorRef}
                    designs={yardSignDesigns}
                    onDesignsChange={setYardSignDesigns}
                    sidedness={yardSignSidedness}
                    onSidednessChange={(s) => { setYardSignSidedness(s); setHasReviewedYardSignPrintSide(true); }}
                    addStepStakes={yardSignAddStepStakes}
                    onStepStakesChange={(v) => { setYardSignAddStepStakes(v); setHasReviewedYardSignStakes(true); }}
                    stepStakeQuantity={yardSignStepStakeQty}
                    onStepStakeQuantityChange={setYardSignStepStakeQty}
                    promoCode={promoCode}
                    onPromoCodeChange={setPromoCode}
                    promoApplied={promoApplied}
                    onPromoApply={handlePromoApply}
                    onPromoRemove={handlePromoRemove}
                    autoOpenDesignId={autoOpenDesignId}
                    onUploadStatusChange={setYardSignUploadStatus}
                    showCreateWithAI={false}
                    onPreviewDone={(id) => logUx('preview_done', { designId: id, productType: 'yard_sign' })}
                    previewOpenTrigger={yardSignPreviewTrigger}
                  />
                </div>

                <div className="space-y-6 min-w-0 max-w-full">
                  {yardSignPricing && (
                    <YardSignPriceSummary
                      pricing={yardSignPricing}
                      designs={yardSignDesigns}
                      promoCode={promoCode}
                      promoApplied={promoApplied}
                      onPromoCodeChange={setPromoCode}
                      onPromoApply={handlePromoApply}
                      onPromoRemove={handlePromoRemove}
                      sameDayHitServiceCents={previewSameDayFeeCents}
                      taxCalculatedAtCheckout
                    />
                  )}

                  {/* Same-Day Hit Service upsell — production priority (NOT shipping). */}
                  <div className="hidden md:block">
                    <DeliveryTimer variant="compact" />
                  </div>
                  <SameDayHitServiceCard
                    variant="compact"
                    previewHasPrice={!!yardSignPricing && yardSignTotalQty > 0 && yardSignQuantityValid.valid}
                    previewSubtotalCents={yardSignPricing?.totalCents}
                  />

                  <button
                    onClick={handleCheckout}
                    disabled={yardSignDesigns.length === 0 || yardSignTotalQty === 0 || !yardSignQuantityValid.valid}
                    className={`group w-full font-bold text-lg py-5 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                      yardSignDesigns.length > 0 && yardSignTotalQty > 0 && yardSignQuantityValid.valid
                        ? 'bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white cursor-pointer shadow-orange-500/30'
                        : 'bg-orange-300 text-white/80 cursor-not-allowed'
                    }`}
                  >
                    Review and continue
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    onClick={handleAddToCart}
                    disabled={yardSignDesigns.length === 0 || yardSignTotalQty === 0 || !yardSignQuantityValid.valid}
                    className={`w-full font-semibold text-base py-4 rounded-xl border-2 transition-all duration-200 ${
                      yardSignDesigns.length > 0 && yardSignTotalQty > 0 && yardSignQuantityValid.valid
                        ? 'border-slate-300 text-slate-800 hover:bg-slate-50'
                        : 'border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Add to Cart
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1">
                    <Lock className="h-3 w-3" />
                    <span>Secure checkout.</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-2">
                    <Mail className="h-3 w-3" />
                    <span>Questions? support@bannersonthefly.com</span>
                  </div>
                  {yardSignDesigns.length === 0 && <p className="text-xs text-center text-gray-400">Upload your artwork to continue</p>}
                </div>
              </div>
            ) : (
            /* ========== BANNER ORDER BUILDER (existing) ========== */
            <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10 max-w-full">
              <div className="space-y-6 min-w-0 max-w-full">
                {false ? (
                  null /* placeholder — yard sign path handled above */
                ) : (
                  <>
                {/* Step 1 — Choose your size. Wraps the in/ft toggle (header right slot, banner only),
                    popular sizes, and custom size inputs. */}
                <ConfigCard
                  step={1}
                  title="Choose your size"
                  id="size-section"
                  headerRight={!isCarMagnet ? (
                    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 text-xs" role="group" aria-label="Display unit">
                      <button
                        type="button"
                        aria-pressed={unit === 'in'}
                        onClick={() => setUnit('in')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${unit === 'in' ? 'bg-orange-500 text-white font-semibold' : 'text-gray-600 hover:text-gray-800'}`}
                      >
                        Inches
                      </button>
                      <button
                        type="button"
                        aria-pressed={unit === 'ft'}
                        onClick={() => setUnit('ft')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${unit === 'ft' ? 'bg-orange-500 text-white font-semibold' : 'text-gray-600 hover:text-gray-800'}`}
                      >
                        Feet
                      </button>
                    </div>
                  ) : undefined}
                >
                  <div className={isCarMagnet ? '' : 'grid lg:grid-cols-2 lg:gap-6'}>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Popular Sizes</label>
                      <div className="grid grid-cols-3 gap-2">
                        {isCarMagnet
                          ? CAR_MAGNET_SIZES.map((p) => (
                              <button key={p.label} onClick={() => setCarMagnetSizeLabel(p.label)} className={`border rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${carMagnetSizeLabel === p.label ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                                {p.label}
                              </button>
                            ))
                          : PRESET_SIZES.map((p, i) => (
                              <button key={i} onClick={() => applyPreset(i)} className={`border rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${activePreset === i ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                                {formatPresetLabel(p.w, p.h, unit)}
                              </button>
                            ))}
                      </div>
                    </div>
                    {!isCarMagnet && (
                    <div className="mt-6 lg:mt-0">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Size</label>
                      {unit === 'in' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-gray-500">Width</span>
                            <div className="flex gap-1 mt-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={widthCustomInStr}
                                aria-label="Banner width in inches"
                                onChange={e => {
                                  setWidthCustomInStr(e.target.value);
                                  setActivePreset(null);
                                }}
                                onFocus={e => e.target.select()}
                                onBlur={() => {
                                  const n = parseInt(widthCustomInStr, 10);
                                  const clamped = Math.max(1, Math.min(600, Number.isFinite(n) ? n : 1));
                                  setWidthCustomInStr(String(clamped));
                                  setWidthFtStr(String(Math.floor(clamped / 12)));
                                  setWidthInRStr(String(clamped % 12));
                                }}
                                className="w-20 border rounded-lg px-2 py-1.5 text-base"
                              />
                              <span className="self-center text-xs text-gray-500">in</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500">Height</span>
                            <div className="flex gap-1 mt-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={heightCustomInStr}
                                aria-label="Banner height in inches"
                                onChange={e => {
                                  setHeightCustomInStr(e.target.value);
                                  setActivePreset(null);
                                }}
                                onFocus={e => e.target.select()}
                                onBlur={() => {
                                  const n = parseInt(heightCustomInStr, 10);
                                  const clamped = Math.max(1, Math.min(600, Number.isFinite(n) ? n : 1));
                                  setHeightCustomInStr(String(clamped));
                                  setHeightFtStr(String(Math.floor(clamped / 12)));
                                  setHeightInRStr(String(clamped % 12));
                                }}
                                className="w-20 border rounded-lg px-2 py-1.5 text-base"
                              />
                              <span className="self-center text-xs text-gray-500">in</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-gray-500">Width</span>
                            <div className="flex gap-1 mt-1">
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthFtStr}
                                aria-label="Banner width feet" onChange={e => { setWidthFtStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(widthFtStr, 10); setWidthFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                              <span className="self-center text-xs text-gray-500">ft</span>
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthInRStr}
                                aria-label="Banner width remaining inches" onChange={e => { setWidthInRStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(widthInRStr, 10); setWidthInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                              <span className="self-center text-xs text-gray-500">in</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500">Height</span>
                            <div className="flex gap-1 mt-1">
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightFtStr}
                                aria-label="Banner height feet" onChange={e => { setHeightFtStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(heightFtStr, 10); setHeightFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                              <span className="self-center text-xs text-gray-500">ft</span>
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightInRStr}
                                aria-label="Banner height remaining inches" onChange={e => { setHeightInRStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(heightInRStr, 10); setHeightInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                              <span className="self-center text-xs text-gray-500">in</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{sqft.toFixed(1)} sq ft</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {unit === 'in'
                          ? `≈ ${widthFt}${widthInR > 0 ? ` ft ${widthInR} in` : ' ft'} × ${heightFt}${heightInR > 0 ? ` ft ${heightInR} in` : ' ft'}`
                          : `≈ ${widthIn} in × ${heightIn} in`}
                      </p>
                    </div>
                    )}
                  </div>
                </ConfigCard>
                {!isCarMagnet && (
                  <ConfigCard step={2} title="Select material" id="material-section">
                    <div ref={materialDropdownRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setMaterialDropdownOpen(prev => !prev)}
                        aria-expanded={materialDropdownOpen}
                        aria-haspopup="listbox"
                        className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base transition-colors hover:border-[#18448D]"
                      >
                        <img
                          src={selectedMaterial.image}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded bg-gray-100 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="min-w-0 flex-1 text-left font-semibold text-gray-800">{selectedMaterial.label}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF1FB] px-2 py-1 text-[11px] font-bold text-[#18448D]">
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Selected
                        </span>
                        <svg className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${materialDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#18448D]" aria-hidden="true" />
                        <span><strong className="text-slate-800">{selectedMaterial.label}</strong> is {hasConfirmedMaterial ? 'selected' : 'selected by default'}. Leave it as-is or open the menu to choose another banner material.</span>
                      </p>
                      {materialDropdownOpen && (
                        <div role="listbox" aria-label="Banner material" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {MATERIALS.map(m => (
                            <button
                              key={m.key}
                              type="button"
                              role="option"
                              aria-selected={m.mapped === material}
                              onClick={() => { setMaterial(m.mapped); setMaterialDropdownOpen(false); }}
                              className={`flex w-full cursor-pointer items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors ${m.mapped === material ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:bg-gray-50'}`}
                            >
                              <img
                                src={m.image}
                                alt=""
                                className="h-10 w-10 flex-shrink-0 rounded bg-gray-100 object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="min-w-0">
                                <div className={`text-sm font-medium ${m.mapped === material ? 'text-orange-700' : 'text-gray-800'}`}>{m.label}</div>
                                <div className="text-xs text-gray-500">{m.desc}</div>
                              </div>
                              {m.mapped === material && (
                                <CheckCircle className="ml-auto h-4 w-4 flex-shrink-0 text-orange-500" aria-hidden="true" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </ConfigCard>
                )}
                  </>
                )}
                {/* Banner-only: Quantity + Finishing Options (yard signs include these in their config panel) */}
                {!isYardSign && (
                  <>
                <ConfigCard step={isCarMagnet ? 2 : 3} title="Quantity" id="quantity-section">
                  {isCarMagnet && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#D7E3F4] bg-[#F4F8FD] px-3 py-2.5 text-sm text-slate-700">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#18448D]" aria-hidden="true" />
                      <p><strong className="text-[#0B1F3A]">Premium magnetic material is included.</strong> There is no material choice for car magnets.</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                      <Minus className="h-4 w-4 text-gray-600" />
                    </button>
                    <input type="number" min={1} max={999} value={quantity} aria-label="Quantity" onChange={e => setQuantity(Math.max(1, +e.target.value || 1))} className="h-11 w-20 border rounded-xl px-3 py-1.5 text-base text-center" />
                    <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(q => Math.min(999, q + 1))} className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                      <Plus className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                  {!isCarMagnet && bannerPromoResolution.appliedDiscountType === 'quantity' && quantityDiscountRate > 0 && (
                    <p className="text-xs text-green-600 font-medium mt-1.5">
                      🎉 {Math.round(quantityDiscountRate * 100)}% bulk discount applied at checkout
                    </p>
                  )}
                  {!isCarMagnet && bannerPromoResolution.promotionId === 'LARGE_BANNER_25' && quantityDiscountRate > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-700">
                      Large Banner 25% Off applied automatically. Quantity discounts cannot be combined.
                    </p>
                  )}
                  {!isCarMagnet && quantity === 1 && bannerPromoResolution.promotionId !== 'LARGE_BANNER_25' && (
                    <p className="text-xs text-gray-400 mt-1.5">Order 2+ for up to 13% off</p>
                  )}
                </ConfigCard>
                <ConfigCard step={isCarMagnet ? 3 : 4} title={isCarMagnet ? 'Rounded Corners' : 'Finishing options'} id="options-section">
                  <div className="space-y-3">
                    {isCarMagnet ? (
                      <div>
                        <select value={carMagnetRoundedCorners} onChange={e => setCarMagnetRoundedCorners(e.target.value as CarMagnetRoundedCorner)} className="w-full border rounded-xl px-3 py-1.5 text-base mt-1 bg-white">
                          {CAR_MAGNET_ROUNDED_CORNERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    ) : (
                      <FinishingOptionsCard
                        finishingType={finishingType}
                        setFinishingType={setFinishingType}
                        grommets={grommets}
                        setGrommets={setGrommets}
                        polePockets={polePockets}
                        setPolePockets={setPolePockets}
                        addRope={addRope}
                        setAddRope={setAddRope}
                        ropePlacement={ropePlacement}
                        setRopePlacement={setRopePlacement}
                      />
                    )}
                  </div>
                </ConfigCard>
                  </>
                )}
                {/* ========== SHARED: Upload Section ========== */}
                <ConfigCard step={isCarMagnet ? 4 : 5} title="Upload your artwork" id="upload-section">
                  {/* Helper banner: shown when the user reaches the upload card before
                      completing required choices. Doesn't block upload — just surfaces
                      what still needs to happen before "Add to Cart" works. */}
                  {!isYardSign && !isCarMagnet && !uploadedFile && (() => {
                    const missing: string[] = [];
                    if (!hasCommittedBannerSize) missing.push('size');
                    if (!material) missing.push('material');
                    if (missing.length === 0) return null;
                    return (
                      <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Choose {missing.join(' and ')} before adding to cart.
                      </p>
                    );
                  })()}
                  {!uploadedFile ? (
                    <>
                      <FileUploader
                        ref={fileUploaderRef}
                        onUpload={handleFileUpload}
                        acceptedTypes="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
                        maxSize={50 * 1024 * 1024}
                        label="Upload your artwork"
                        subText={`PNG, JPG, or PDF • Max 50MB • ${widthDisplay} × ${heightDisplay}`}
                        isUploading={isUploading}
                        style={previewCanvasStyle}
                        className="mx-auto"
                      />
                      {!isYardSign && !isCarMagnet && showCreateWithAI && (
                        <div className="mt-3 flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setAiModalOpen(true)}
                            disabled={!hasCommittedBannerSize || !material || isUploading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold shadow-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Sparkles className="w-4 h-4" />
                            Create with AI
                          </button>
                          {(!widthIn || !heightIn || !material) && (
                            <p className="text-xs text-gray-500">
                              Select size and material first so AI can fit your design perfectly.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      {/* Preview labeling */}
                      <div className="mb-2">
                        <h3 className="text-sm font-bold text-gray-800">{isYardSign ? 'Live Yard Sign Preview' : isCarMagnet ? 'Live Car Magnet Preview' : 'Live Banner Preview'}</h3>
                        <p className="text-xs text-gray-400">Final print preview — what you see is what you get</p>
                      </div>
                      {/* Banner preview with depth background */}
                      <div className="rounded-xl p-4 md:p-6 max-w-full overflow-hidden bg-slate-300 border border-slate-400/70 shadow-inner">
                        {/* Width wrapper — constrains max-width so padding-bottom produces correct height */}
                        <PreviewRulerFrame
                          widthIn={widthIn}
                          heightIn={heightIn}
                          unit={isCarMagnet ? 'in' : unit}
                          debug={import.meta.env.DEV}
                          className="mx-auto max-w-full"
                          style={previewWrapperStyle}
                        >
                          {/* PR3: Modern Canva-style artwork editor (drag,
                              resize handles, fit/fill/reset/constrain). */}
                          <ArtworkPreviewEditor
                            ref={inlineEditorRef}
                            compositionKey={buildArtworkCompositionKey(uploadedFile, productType)}
                            initialNormalizedTransform={restoredNormalizedTransform}
                            initialCompositionRevision={restoredCompositionRevision}
                            src={uploadedFile.previewUrl || uploadedFile.thumbnailUrl || uploadedFile.url}
                            previewUrl={uploadedFile.previewUrl || uploadedFile.thumbnailUrl || null}
                            productionUrl={uploadedFile.productionUrl || uploadedFile.url}
                            resourceType={uploadedFile.resourceType}
                            mimeType={uploadedFile.mimeType}
                            onRetryPreview={uploadedFile.isPdf ? handleRetryPdfPreview : undefined}
                            alt="Uploaded artwork preview"
                            paddingPct={previewPaddingPct}
                            containerRef={previewContainerRef}
                            mobileToolbarContainer={inlineMobileToolbarEl}
                            value={{ x: imgPos.x, y: imgPos.y, scaleX: imgScale, scaleY: imgScaleY }}
                            onChange={(v) => {
                              setImgPos({ x: v.x, y: v.y });
                              setImgScale(v.scaleX);
                              setImgScaleY(v.scaleY);
                            }}
                            constrain={constrainProps}
                            onConstrainChange={setConstrainProps}
                            showDragHint={showDragHint}
                            canvasStyle={{
                              backgroundColor: '#ffffff',
                              borderRadius: 2,
                              border: '1px solid #94a3b8',
                              boxShadow: '0 14px 28px -10px rgba(15, 23, 42, 0.28), 0 4px 8px rgba(15, 23, 42, 0.10), inset 0 0 0 1px rgba(255,255,255,0.6)',
                            }}
                            overlay={
                              grommets !== 'none' ? (
                                <svg
                                  className="absolute inset-0 w-full h-full pointer-events-none"
                                  viewBox={`0 0 ${widthIn} ${heightIn}`}
                                  preserveAspectRatio="none"
                                  style={{ zIndex: 10 }}
                                  aria-hidden="true"
                                >
                                  <GrommetOverlay
                                    widthIn={widthIn}
                                    heightIn={heightIn}
                                    option={grommets}
                                    idSuffix="ga-inline"
                                  />
                                </svg>
                              ) : null
                            }
                          />
                        </PreviewRulerFrame>{/* close ruler frame */}
                      </div>
                      {/* Toolbar slot: Fit/Fill/Reset/Locked render here
                          BELOW the canvas on every screen size so they
                          do not cover the printable artwork. */}
                      <div
                        ref={setInlineMobileToolbarEl}
                        className="mt-2"
                        data-mobile-artwork-toolbar="ga-inline"
                      />
                      {/* Size dimensions below preview */}
                      <p className="text-xs text-gray-400 text-center mt-2">
                        Size: {isCarMagnet ? `${widthIn}" × ${heightIn}"` : `${widthFt} ft${widthInR > 0 ? ` ${widthInR} in` : ''} × ${heightFt} ft${heightInR > 0 ? ` ${heightInR} in` : ''}`} ({sqft.toFixed(1)} sq ft)
                      </p>
                      {/* Confidence text */}
                      <p className="text-xs text-gray-500 text-center mt-1 font-medium">Your design will be printed based on this preview</p>
                      {/* File info bar */}
                      <div className="mt-2 p-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <span className="text-sm font-semibold text-green-800 truncate">{uploadedFile.name}</span>
                        </div>
                        <button type="button" aria-label="Remove uploaded artwork" onClick={() => { setUploadedFile(null); setImgPos({ x: 0, y: 0 }); setImgScale(1); setImgScaleY(1); setAiPrompt(null); setAiEditPrompt(null); setAiDesignSession(null); }} className="ml-2 flex-shrink-0 p-2.5 rounded-full hover:bg-green-100 text-gray-500 hover:text-gray-700 transition-colors"><X className="h-4 w-4" /></button>
                      </div>
                      {aiPrompt && !isYardSign && !isCarMagnet && showCreateWithAI && (
                        <div className="mt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setAiEditModalOpen(true)}
                            disabled={!hasCommittedBannerSize || !material || isUploading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0b1f3a] text-white text-sm font-semibold shadow-sm hover:bg-[#12345d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Sparkles className="w-4 h-4" />
                            Edit with AI
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
                  <p className="text-xs text-gray-400 mt-2 text-center">Every file reviewed by a real designer before printing.</p>
                </ConfigCard>
              </div>

              <div className="space-y-6 min-w-0 max-w-full lg:sticky lg:top-24 self-start">
                <p className="text-sm text-emerald-700 -mt-1 font-medium">
                  Most standard orders are produced within 24 hours; <span className="text-emerald-700 font-semibold">carrier transit follows production</span>
                </p>
                {isCarMagnet && carMagnetPricing ? (
                  <PriceBreakdown
                    topLine={`${widthDisplay} × ${heightDisplay} Car Magnets • ${usd(carMagnetPricing.unitPriceCents / 100)}/magnet`}
                    secondaryLine={`for ${quantity} ${quantity === 1 ? 'magnet' : 'magnets'}`}
                    detailRows={[
                      { label: 'Material', value: materialLabel },
                      { label: 'Print', value: 'Single-Sided' },
                      { label: 'Rounded Corners', value: `${getCarMagnetRoundedCornersLabel(carMagnetRoundedCorners)} • Included Free` },
                    ]}
                    baseSubtotalCents={carMagnetPricing.baseSubtotalCents}
                    baseSubtotalLabel="Base price"
                    quantityDiscountCents={carMagnetPricing.quantityDiscountCents}
                    quantityDiscountRate={carMagnetPricing.quantityDiscountRate}
                    sameDayHitServiceCents={previewSameDayFeeCents}
                    taxCents={0}
                    taxRate={0.06}
                    adjustedSubtotalCents={carMagnetPricing.subtotalCents}
                    totalCents={carMagnetPricing.subtotalCents + previewSameDayFeeCents}
                    taxCalculatedAtCheckout
                    footerNote="Destination-based tax calculated at checkout"
                  />
                ) : (
                  <PriceBreakdown
                    topLine={`${sqft.toFixed(2)} sq ft • ${usd(pricePerSqFt)} per sq ft`}
                    secondaryLine={`for ${quantity} ${quantity === 1 ? 'banner' : 'banners'} • ${widthDisplay} × ${heightDisplay} • ${materialLabel}`}
                    showTopSummary={false}
                    detailRows={[
                      { label: 'Grommets', value: formatOptionValue(grommetsLabel) },
                      { label: 'Pole Pockets', value: formatOptionValue(getDisplayPlacement(polePockets)) },
                      { label: 'Rope Hemming', value: formatOptionValue(addRope ? getDisplayPlacement(ropePlacement) : '') },
                      { label: 'Hemming', value: 'Always Included' },
                    ]}
                    baseSubtotalCents={bannerPricing.baseBannerPriceCents}
                    baseSubtotalLabel="Base banner"
                    addOns={[
                      ...(bannerPricing.polePocketCostCents > 0
                        ? [{ label: 'Pole pockets', amountCents: bannerPricing.polePocketCostCents }]
                        : []),
                      ...(bannerPricing.ropeCostCents > 0
                        ? [{ label: 'Rope', amountCents: bannerPricing.ropeCostCents }]
                        : []),
                    ]}
                    quantityDiscountCents={
                      bannerPromoResolution.appliedDiscountType === 'quantity'
                        ? bannerPromoResolution.appliedDiscountAmountCents
                        : 0
                    }
                    quantityDiscountRate={
                      bannerPromoResolution.appliedDiscountType === 'quantity'
                        ? bannerPromoResolution.quantityDiscountRate
                        : undefined
                    }
                    promoDiscountCents={
                      bannerPromoActuallyApplied
                        ? bannerPromoResolution.appliedDiscountAmountCents
                        : 0
                    }
                    promoDiscountRate={
                      bannerPromoActuallyApplied
                        ? bannerPromoResolution.promoDiscountRate
                        : undefined
                    }
                    promoDiscountCode={
                      bannerPromoActuallyApplied
                        ? bannerPromoResolution.promoDiscountCode
                        : undefined
                    }
                    sameDayHitServiceCents={previewSameDayFeeCents}
                    taxCents={0}
                    taxRate={0.06}
                    adjustedSubtotalCents={bannerSubtotalAfterAllDiscountsCents}
                    totalCents={bannerSubtotalAfterAllDiscountsCents + previewSameDayFeeCents}
                    taxCalculatedAtCheckout
                    promo={{
                      code: promoCode,
                      applied: promoApplied,
                      onCodeChange: setPromoCode,
                      onApply: handlePromoApply,
                      onRemove: handlePromoRemove,
                      appliedLabel: bannerPromoActuallyApplied
                        ? `${promoCode} — ${Math.round(bannerPromoResolution.promoDiscountRate * 100)}% off applied`
                        : `${promoCode} entered — quantity discount is larger, so we kept that`,
                    }}
                    footerNote="Destination-based tax calculated at checkout"
                  />
                )}

                {/* Same-Day Hit Service upsell — production priority (NOT shipping). */}
                <div className="hidden md:block">
                  <DeliveryTimer variant="compact" />
                </div>
                <SameDayHitServiceCard
                  variant="compact"
                  previewHasPrice={
                    isCarMagnet
                      ? !!carMagnetPricing && !!uploadedFile
                      : !!uploadedFile && bannerPricing.subtotalBeforeDiscountCents > 0
                  }
                  previewSubtotalCents={
                    isCarMagnet
                      ? carMagnetPricing?.baseSubtotalCents
                      : bannerPricing.subtotalBeforeDiscountCents
                  }
                />

                <button onClick={handleCheckout} disabled={!uploadedFile || !hasCommittedBannerSize || isUploading || isProcessingUpsell} className={`group w-full font-bold text-lg py-5 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 ${uploadedFile && hasCommittedBannerSize && !isUploading && !isProcessingUpsell ? 'bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white cursor-pointer shadow-orange-500/30' : 'bg-orange-300 text-white/80 cursor-not-allowed'}`}>
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {isProcessingUpsell ? 'Preparing exact preview…' : 'Review and continue'}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={handleAddToCart}
                  disabled={!uploadedFile || !hasCommittedBannerSize || isUploading || isProcessingUpsell}
                  className={`w-full font-semibold text-base py-4 rounded-xl border-2 transition-all duration-200 ${
                    uploadedFile && hasCommittedBannerSize && !isUploading && !isProcessingUpsell
                      ? 'border-slate-300 text-slate-800 hover:bg-slate-50'
                      : 'border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isProcessingUpsell ? 'Preparing exact preview…' : 'Add to Cart'}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1">
                  <Lock className="h-3 w-3" />
                  <span>Secure checkout.</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-2">
                  <Mail className="h-3 w-3" />
                  <span>Questions? support@bannersonthefly.com</span>
                </div>
                {!uploadedFile && <p className="text-xs text-center text-gray-400">Upload your artwork to continue</p>}
              </div>
            </div>
            )}
          </div>
        </section>

        <TrustStrip />

        <div className="py-4 pb-24 md:pb-4 text-center text-xs text-gray-400 border-t border-gray-100">
          <div className="mb-2">
            <Link to="/terms" className="hover:text-gray-600">Terms</Link>
            <span className="mx-2">&middot;</span>
            <Link to="/privacy" className="hover:text-gray-600">Privacy</Link>
            <span className="mx-2">&middot;</span>
            <Link to="/shipping" className="hover:text-gray-600">Shipping</Link>
          </div>
          &copy; {new Date().getFullYear()} Banners On The Fly. All rights reserved.
        </div>
      </div>

        <MobileSubtotalBar
          cartItemCount={cartItemCount}
          onViewCart={openCartDrawer}
          priceNote={showPopularBannerPriceNote ? POPULAR_BANNER_PRESET.mobilePriceNote : undefined}
          subtotal={
            isYardSign && yardSignPricing ? (
              <p className="text-xl font-bold text-gray-900">
                {yardSignTotalQty > 0 ? usd(yardSignPricing.totalCents / 100) : '—'}
              </p>
            ) : bannerPromoActuallyApplied ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-400 line-through">{usd(totals.materialTotal)}</p>
                <p className="text-xl font-bold text-[#0B1F3A]">{usd(discountedTotal)}</p>
              </div>
            ) : (
              <p className="text-xl font-bold text-gray-900">{usd(totals.materialTotal)}</p>
            )
          }
        />

      {/* Preview Modal */}
      {showPreview && uploadedFile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col modal-dvh-fix">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{isYardSign ? 'Live Yard Sign Preview' : isCarMagnet ? 'Live Car Magnet Preview' : 'Live Banner Preview'}</h3>
                <p className="text-xs text-gray-400">Final print preview — what you see is what you get</p>
              </div>
              <button type="button" aria-label="Close preview" onClick={() => setShowPreview(false)} className="p-2.5 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1"><Move className="w-4 h-4" /> Drag to reposition · Drag corners to resize</p>
              {/* Banner surface */}
              <div className="rounded-lg p-3 border border-slate-300" style={{ background: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)' }}>
                <PreviewRulerFrame
                  widthIn={widthIn}
                  heightIn={heightIn}
                  unit={isCarMagnet ? 'in' : unit}
                  className="mx-auto max-w-full"
                  style={previewWrapperStyle}
                >
                  <ArtworkPreviewEditor
                    ref={modalEditorRef}
                    compositionKey={buildArtworkCompositionKey(uploadedFile, productType)}
                    initialNormalizedTransform={restoredNormalizedTransform}
                    initialCompositionRevision={restoredCompositionRevision}
                    src={uploadedFile.previewUrl || uploadedFile.thumbnailUrl || uploadedFile.url}
                            previewUrl={uploadedFile.previewUrl || uploadedFile.thumbnailUrl || null}
                            productionUrl={uploadedFile.productionUrl || uploadedFile.url}
                            resourceType={uploadedFile.resourceType}
                            mimeType={uploadedFile.mimeType}
                            onRetryPreview={uploadedFile.isPdf ? handleRetryPdfPreview : undefined}
                    alt="Banner preview"
                    paddingPct={previewPaddingPct}
                    containerRef={previewContainerRef}
                    mobileToolbarContainer={modalMobileToolbarEl}
                    value={{ x: imgPos.x, y: imgPos.y, scaleX: imgScale, scaleY: imgScaleY }}
                    onChange={(v) => {
                      setImgPos({ x: v.x, y: v.y });
                      setImgScale(v.scaleX);
                      setImgScaleY(v.scaleY);
                    }}
                    constrain={constrainProps}
                    onConstrainChange={setConstrainProps}
                    compactControls
                    canvasStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: 2,
                      border: '1px solid #94a3b8',
                      boxShadow: '0 14px 28px -10px rgba(15, 23, 42, 0.28), 0 4px 8px rgba(15, 23, 42, 0.10), inset 0 0 0 1px rgba(255,255,255,0.6)',
                    }}
                    overlay={
                      grommets !== 'none' ? (
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          viewBox={`0 0 ${widthIn} ${heightIn}`}
                          preserveAspectRatio="none"
                          style={{ zIndex: 10 }}
                          aria-hidden="true"
                        >
                          <GrommetOverlay
                            widthIn={widthIn}
                            heightIn={heightIn}
                            option={grommets}
                            idSuffix="ga-modal"
                          />
                        </svg>
                      ) : null
                    }
                  />
                </PreviewRulerFrame>
              </div>
              {/* Toolbar slot for the modal preview — rendered below the
                  canvas on all screen sizes. */}
              <div
                ref={setModalMobileToolbarEl}
                className="mt-2"
                data-mobile-artwork-toolbar="ga-modal"
              />
              {/* Size below preview */}
              <p className="text-xs text-gray-400 text-center mt-2">
                Size: {widthFt} ft{widthInR > 0 ? ` ${widthInR} in` : ''} × {heightFt} ft{heightInR > 0 ? ` ${heightInR} in` : ''} ({sqft.toFixed(1)} sq ft)
              </p>
              {/* Confidence text */}
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">Your design will be printed based on this preview</p>
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={() => setShowPreview(false)} className="flex-1 py-3.5 sm:py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleConfirmPosition(imgPos, imgScale, imgScaleY)} className="flex-1 py-3.5 sm:py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg">Confirm & Checkout</button>
            </div>
          </div>
        </div>
      )}
      {/* Upsell Modal */}
      <UpsellModal
        isOpen={showUpsellModal}
        onClose={() => setShowUpsellModal(false)}
        onContinue={handleUpsellContinue}
        quote={{
          widthIn,
          heightIn,
          quantity,
          material,
          grommets: grommets as any,
          polePockets,
          polePocketSize,
          addRope,
          thumbnailUrl: pendingPlacementPreview?.previewUrl,
          file: uploadedFile ? { name: uploadedFile.name, url: uploadedFile.url } : undefined,
          imagePosition: pendingCheckoutData?.pos,
          imageScale: pendingCheckoutData?.scale,
          imageScaleY: pendingCheckoutData?.scaleY ?? pendingCheckoutData?.scale,
        } as any}
        thumbnailUrl={pendingPlacementPreview?.previewUrl}
        thumbnailIsExactComposition={isReadyPlacementPreview(pendingPlacementPreview)}
        thumbnailCompositionSignature={pendingPlacementPreview?.compositionSignature}
        actionType={pendingActionType === 'checkout' ? 'checkout' : 'cart'}
        isProcessing={isProcessingUpsell}
        productType={productType}
      />
      {/* Cart Modal */}
      <CartModal
        isOpen={isCartOpen}
        onClose={closeCartDrawer}
      />
      {/* Create with AI Modal */}
      {!isYardSign && !isCarMagnet && showCreateWithAI && (
        <CreateWithAIModal
          open={aiModalOpen}
          onOpenChange={setAiModalOpen}
          productType={isCarMagnet ? 'car_magnet' : 'banner'}
          widthIn={widthIn || null}
          heightIn={heightIn || null}
          material={material || null}
          materialLabel={materialLabel}
          quantity={quantity}
          onGenerated={handleAIGenerated}
        />
      )}
      {/* Edit with AI Modal */}
      {!isYardSign && !isCarMagnet && showCreateWithAI && (
        <EditWithAIModal
          open={aiEditModalOpen}
          onOpenChange={setAiEditModalOpen}
          productType={isCarMagnet ? 'car_magnet' : 'banner'}
          widthIn={widthIn || null}
          heightIn={heightIn || null}
          material={material || null}
          materialLabel={materialLabel}
          originalPrompt={aiPrompt}
          currentImageUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url || null}
          session={aiDesignSession}
          onEdited={handleAIEdited}
        />
      )}
    </>
  );
};

export default GoogleAdsBanner;
