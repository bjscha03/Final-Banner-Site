import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Clock, Star, CheckCircle, Truck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock, Mail, Droplets, Sun, Wind, Palette, Tag, Move, ZoomIn, ZoomOut, Ruler, Layers, Sparkles } from 'lucide-react';
import Layout from '@/components/Layout';
import { useQuoteStore, type MaterialKey } from '@/store/quote';
import { useCartStore, type CartItem } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import { calcTotals, usd } from '@/lib/pricing';
import { DESIGN_GROMMET_OPTIONS } from '@/lib/grommets';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import {
  calculateBannerPricing,
  type RopePlacement,
} from '@/lib/bannerPricingEngine';
import { resolvePromo, getKnownPromo } from '@/lib/promoEngine';
import { useToast } from '@/components/ui/use-toast';
import { generateFinalRenderFromHTML } from '@/utils/generateFinalRenderFromHTML';
import { renderPdfToDataUrl, type PdfPreviewResult } from '@/utils/pdf/renderPdfToDataUrl';
import type { ProductTypeSlug } from '@/lib/products';
import { getConfiguratorProductQuery, parseConfiguratorProductQuery } from '@/lib/configurator';
import ProductTypeSwitcher from '@/components/design/ProductTypeSwitcher';
import YardSignConfigurator, { type YardSignConfiguratorHandle } from '@/components/design/YardSignConfigurator';
import YardSignPriceSummary from '@/components/design/YardSignPriceSummary';
import PriceBreakdown from '@/components/pricing/PriceBreakdown';
import SameDayHitServiceCard from '@/components/cart/SameDayHitServiceCard';
import DeliveryTimer from '@/components/delivery/DeliveryTimer';
import MobileSubtotalBar from '@/components/design/MobileSubtotalBar';
import FileUploader, { type FileUploaderHandle } from '@/components/ui/FileUploader';
import {
  calcYardSignPricing,
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
import GrommetOverlay from '@/components/preview/GrommetOverlay';
import PreviewRulerFrame from '@/components/preview/PreviewRulerFrame';
import ArtworkPreviewEditor, { type ArtworkPreviewEditorHandle } from '@/components/design/ArtworkPreviewEditor';
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
import MobileStepProgress from '@/components/design/MobileStepProgress';
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
import { useAuth } from '@/lib/auth';
import CreateWithAIModal, { type AIDesignSession, type CreateWithAIResult } from '@/components/design/CreateWithAIModal';
import EditWithAIModal from '@/components/design/EditWithAIModal';
import { useAIAdminAccess } from '@/hooks/useAIAdminAccess';
import { consumeAIHandoff } from '@/lib/aiDesignHandoff';
import { trackAIEvent } from '@/lib/aiAnalytics';
import { canUseAIAdminPreview } from '@/lib/aiAdminVisibility';
import type { ArtworkManifest } from '@/types/artwork';
import {
  PREVIEW_ARTIFACT_VERSION,
  PreviewLifecycleError,
  buildCompositionSignature,
  explainPreviewLifecycleError,
  isReadyPlacementPreview,
  toCheckoutTransform,
  type ArtworkCompositionSpec,
  type ReadyPlacementPreviewManifest,
} from '@/lib/previewLifecycle';
import { createPermanentPlacementPreview } from '@/lib/previewArtifactCoordinator';
import { trackViewItem } from '@/lib/analytics';
import { getProductLandingDefinition } from '@/lib/seo/productLandingData';

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
 * unit. `unit === 'ft'` always renders whole-foot labels (the presets
 * are all foot multiples). `unit === 'in'` renders inch labels.
 * Pure UI helper — never affects pricing/cart/print.
 */
function formatPresetLabel(w: number, h: number, unit: 'in' | 'ft'): string {
  if (unit === 'ft') return `${w / 12}' × ${h / 12}'`;
  return `${w}" × ${h}"`;
}



const PROMO_NEW20_DISCOUNT_RATE = 0.2;


const TESTIMONIALS = [
  {
    name: "Dan Oliver",
    company: "Dan-O's Seasoning",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/w_140,h_140,c_fill,f_auto,q_auto/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg",
    text: "I've been ordering banners from these guys since before they even launched their new website. They've handled every single one of my banner needs since the day I started my business.",
  },
  {
    name: "Brandon Schaefer",
    company: "HempRise LLC",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/w_140,h_140,c_fill,f_auto,q_auto/v1759933582/1758106259564_oysdje.jpg",
    text: "Best banner service I've used. The 24-hour turnaround saved our grand opening event. Quality exceeded expectations.",
  },
  {
    name: "Jennifer Chen",
    company: "Premier Events",
    image: "https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118820418_895c1191.webp",
    text: "We order dozens of banners monthly for events. Banners On The Fly consistently delivers premium quality with fast turnaround.",
  },
];

const PRODUCT_MODE_CONTENT = {
  banner: {
    heroTitle: 'Custom Banner',
    heroDescription: (
      <>
        <p className="text-base md:text-lg text-gray-100 max-w-lg mx-auto leading-relaxed">
          Most standard orders are produced within 24 hours. <strong className="text-white">Free next-day air begins after production</strong>.
        </p>
        <p className="text-sm text-gray-200">Delivery dates are estimates and can change.</p>
      </>
    ),
    topFeatures: [
      { icon: Clock, iconClass: 'text-orange-500', label: 'Most: 24-Hr Production' },
      { icon: Truck, iconClass: 'text-orange-500', label: 'Free Next-Day Air' },
      { icon: Tag, iconClass: 'text-orange-500', label: '20% Off · NEW20' },
      { icon: Brush, iconClass: 'text-orange-500', label: 'Designer Reviewed' },
    ],
    builtTitle: 'Built to Last',
    builtItems: [
      { icon: Droplets, iconClass: 'text-blue-500', label: 'Weather Resistant' },
      { icon: Palette, iconClass: 'text-purple-500', label: 'Vibrant CMYK Colors' },
      { icon: Sun, iconClass: 'text-yellow-500', label: 'UV Fade Resistant' },
      { icon: Wind, iconClass: 'text-teal-500', label: 'Indoor & Outdoor Use' },
    ],
  },
  yard_sign: {
    heroTitle: 'Custom Yard Signs',
    heroDescription: (
      <p className="text-base md:text-lg text-gray-100 max-w-lg mx-auto leading-relaxed">
        Standard 24&quot; × 18&quot; corrugated plastic yard signs with production and carrier transit shown separately.
      </p>
    ),
    topFeatures: [
      { icon: Clock, iconClass: 'text-orange-500', label: 'Most: 24-Hr Production' },
      { icon: Truck, iconClass: 'text-orange-500', label: 'Free Next-Day Air' },
      { icon: Layers, iconClass: 'text-orange-500', label: 'Up to 10 Designs' },
      { icon: Brush, iconClass: 'text-orange-500', label: 'Designer Reviewed' },
    ],
    builtTitle: 'Built for the Outdoors',
    builtItems: [
      { icon: Clock, iconClass: 'text-orange-500', label: 'Most: 24-Hour Production' },
      { icon: Sun, iconClass: 'text-yellow-500', label: 'Outdoor Durable' },
      { icon: Palette, iconClass: 'text-purple-500', label: 'Vibrant Print' },
      { icon: Droplets, iconClass: 'text-blue-500', label: 'Corrugated Plastic' },
    ],
  },
  car_magnet: {
    heroTitle: 'Car Magnets',
    heroDescription: (
      <p className="text-base md:text-lg text-gray-100 max-w-lg mx-auto leading-relaxed">
        Durable vehicle magnets with production and free next-day air transit shown separately
      </p>
    ),
    topFeatures: [
      { icon: Clock, iconClass: 'text-orange-500', label: 'Most: 24-Hour Production' },
      { icon: Truck, iconClass: 'text-orange-500', label: 'Free Next-Day Air' },
      { icon: Move, iconClass: 'text-orange-500', label: 'Removable Magnetic Signage' },
      { icon: Brush, iconClass: 'text-orange-500', label: 'Rounded Corner Options' },
    ],
    builtTitle: 'Built for Vehicles',
    builtItems: [
      { icon: Clock, iconClass: 'text-orange-500', label: 'Most: 24-Hour Production' },
      { icon: Sun, iconClass: 'text-yellow-500', label: 'Outdoor Durable' },
      { icon: Palette, iconClass: 'text-purple-500', label: 'Full-Color Print' },
      { icon: Move, iconClass: 'text-blue-500', label: 'Removable Material' },
    ],
  },
} as const;

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
  // Skip if a transformation already exists right after /upload/.
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
  const restored: UploadedArtworkFile = {
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
  return restored;
}

const Design: React.FC = () => {
  const { user } = useAuth();
  const aiAccess = useAIAdminAccess(Boolean(user));
  const showCreateWithAI = canUseAIAdminPreview(user);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[AI_VISIBILITY][Design]', {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      isAdmin: aiAccess.authorized,
      shouldRenderCreateWithAI: showCreateWithAI,
    });
  }, [user?.id, user?.email, aiAccess.authorized, showCreateWithAI]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();
  const orderRef = useRef<HTMLDivElement>(null);
  const builderStartRef = useRef<HTMLHeadingElement>(null);
  const yardSignConfiguratorRef = useRef<YardSignConfiguratorHandle>(null);
  const [hasEnteredBuilder, setHasEnteredBuilder] = useState(false);
  const [isBuilderInView, setIsBuilderInView] = useState(false);
  const getProductQuerySlug = useCallback((type: ProductTypeSlug) => {
    return getConfiguratorProductQuery(type);
  }, []);

  // Product type state — read ?tab= or ?product= query param for routing
  const initialProductType = (() => {
    const tab = searchParams.get('tab');
    const product = searchParams.get('product');
    const param = tab || product;
    return parseConfiguratorProductQuery(param);
  })();
  const [productType, setProductType] = useState<ProductTypeSlug>(initialProductType);
  const isYardSign = productType === 'yard_sign';
  const isCarMagnet = productType === 'car_magnet';

  // Yard sign specific state (multi-design)
  const [yardSignDesigns, setYardSignDesigns] = useState<YardSignDesign[]>([]);
  const [yardSignSidedness, setYardSignSidedness] = useState<YardSignSidedness>('single');
  const [yardSignAddStepStakes, setYardSignAddStepStakes] = useState(false);
  const [yardSignStepStakeQty, setYardSignStepStakeQty] = useState(1);
  const [carMagnetSizeLabel, setCarMagnetSizeLabel] = useState(CAR_MAGNET_SIZES[0].label);
  const [carMagnetRoundedCorners, setCarMagnetRoundedCorners] = useState<CarMagnetRoundedCorner>('none');
  // Auto-open first design preview when editing yard sign from cart
  const [autoOpenDesignId, setAutoOpenDesignId] = useState<string | null>(null);

  // Per-product design state stash. Each product tab keeps its own
  // uploaded artwork and image transform so switching tabs does NOT
  // leak design state between banner / car magnet (yard sign manages
  // its own multi-design array via `yardSignDesigns`).
  type DesignSnapshot = {
    uploadedFile: UploadedArtworkFile | null;
    imgPos: { x: number; y: number };
    imgScale: number;
    // PR3: per-axis scale + constrain-proportions toggle. scaleY defaults
    // to imgScale (uniform) for backward compatibility; constrainProps
    // defaults to ON.
    imgScaleY: number;
    constrainProps: boolean;
  };
  const productDesignStashRef = useRef<Record<string, DesignSnapshot>>({});
  // Mirror of the latest design snapshot for the *current* product. Read
  // by `handleProductTypeChange` at the moment of switching, so the
  // callback does not need `uploadedFile` / `imgPos` / `imgScale` as
  // dependencies (those `useState` calls are declared further down in
  // the function body and would cause a TDZ error if referenced in this
  // useCallback's deps array).
  const latestDesignRef = useRef<DesignSnapshot>({ uploadedFile: null, imgPos: { x: 0, y: 0 }, imgScale: 1, imgScaleY: 1, constrainProps: true });

  // Handle product type switch — reset state
  const handleProductTypeChange = useCallback((newType: ProductTypeSlug) => {
    if (newType === productType) return;
    // Stash current product's design before switching.
    productDesignStashRef.current[productType] = { ...latestDesignRef.current };
    setProductType(newType);
    navigate(`${location.pathname}?product=${getProductQuerySlug(newType)}`, { replace: true });
    // Restore destination's stashed design (or clean defaults). This is
    // what isolates artwork between product tabs.
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
    // Keep the latest mirror in sync immediately so a rapid second
    // switch can't re-stash the just-restored snapshot.
    latestDesignRef.current = { ...restored };
    setQuantity(newType === 'yard_sign' ? 10 : 1);
    setPromoCode('');
    setPromoApplied(false);
    // Switching product tabs is a fresh start — clear confirmation flags so
    // the new product's mobile guided flow walks the user back through
    // size → material → quantity → options → upload from Step 1.
    setHasConfirmedSize(false);
    setHasConfirmedMaterial(false);
    setHasConfirmedQuantity(false);
    setHasReviewedOptions(false);
    setHasReviewedYardSignPrintSide(false);
    setHasReviewedYardSignStakes(false);
    // Switching tabs always exits the post-add success state so the
    // sticky CTA reflects the new product's first required action.
    setHasJustAddedToCart(false);
    // Tab switch must reset Same-Day Hit Service / Saturday Delivery so the
    // new product never starts with these auto-selected.
    useCartStore.getState().setSameDayHitService(false);
    useCartStore.getState().setSaturdayDelivery(false);
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
  }, [productType, getProductQuerySlug, location.pathname, navigate]);

  // Restore cart item state when editing from cart (editItem query param)
  const editItemId = searchParams.get('editItem');
  const [editItemRestored, setEditItemRestored] = useState(false);
  const editCartItems = useCartStore((state) => state.items);
  const cartRestoreTransformRef = useRef<{
    productType: ProductTypeSlug;
    widthIn: number;
    heightIn: number;
    pos: { x: number; y: number };
    scaleX: number;
    scaleY: number;
    constrain: boolean;
  } | null>(null);
  useEffect(() => {
    if (!editItemId || editItemRestored) return;
    const item = editCartItems.find((i: CartItem) => i.id === editItemId);
    if (!item) return;
    setEditItemRestored(true);
    // Editing an existing cart item: every section is implicitly already
    // confirmed (the user previously checked out / saved this configuration),
    // so the mobile guided flow shouldn't force them to re-confirm each
    // section before they can update the artwork or change quantity.
    setHasConfirmedSize(true);
    setHasConfirmedMaterial(true);
    setHasConfirmedQuantity(true);
    setHasReviewedOptions(true);

    if (item.product_type === 'yard_sign' && item.yard_sign_designs) {
      // Switch to yard sign tab and restore designs with saved preview state
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
        pos: item.image_position || { x: 0, y: 0 },
        scaleX: item.image_scale || 1,
        scaleY: item.image_scale_y ?? item.image_scale ?? 1,
        constrain: item.image_scale_y == null || item.image_scale_y === item.image_scale,
      };
      setQuantity(item.quantity || 1);
      setShowPreview(true);
    } else {
      // Switch to banner tab and restore banner state
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
        pos: item.image_position || { x: 0, y: 0 },
        scaleX: item.image_scale || 1,
        scaleY: item.image_scale_y ?? item.image_scale ?? 1,
        constrain: item.image_scale_y == null || item.image_scale_y === item.image_scale,
      };
      if (item.grommets) setGrommets(item.grommets);
      if (item.pole_pockets) setPolePockets(item.pole_pockets);
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

  // Use string state for dimension inputs so users can clear and retype freely
  const [widthFtStr, setWidthFtStr] = useState('4');
  const [widthInRStr, setWidthInRStr] = useState('0');
  const [heightFtStr, setHeightFtStr] = useState('2');
  const [heightInRStr, setHeightInRStr] = useState('0');
  // Raw string state for the inches-mode "Custom Size" inputs. Keeps the
  // user's literal keystrokes (so "3" never becomes "03") and is only
  // converted/clamped on blur. Pricing reactivity is preserved by an
  // effect below that mirrors valid values into widthFtStr/widthInRStr.
  const [widthCustomInStr, setWidthCustomInStr] = useState('48');
  const [heightCustomInStr, setHeightCustomInStr] = useState('24');
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
  // Display unit for size inputs and the live preview ruler. Single source
  // of truth — both the Feet/Inches toggle and PreviewRulerFrame read this
  // state, so switching units updates the visible ruler immediately. Pure
  // UI state — does NOT affect pricing, cart, or print pipeline (those
  // continue to use widthIn / heightIn in inches).
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
  const [activePreset, setActivePreset] = useState<number | null>(0);
  const [quantity, setQuantity] = useState(initialProductType === 'yard_sign' ? 10 : 1);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // Mobile guided-flow confirmation flags. These are the source of truth for
  // the mobile step-progress indicator and sticky CTA. Default-preselected
  // values (a preset size, the `13oz` material, quantity 1) MUST NOT
  // auto-mark a step complete — the user has to interact with the section
  // (or tap the sticky CTA which both scrolls to the section and confirms
  // the step) before progress advances. When the user is editing an
  // existing cart item, all four are pre-set to true so they don't have to
  // re-confirm each section.
  const [hasConfirmedSize, setHasConfirmedSize] = useState(false);
  const [hasConfirmedMaterial, setHasConfirmedMaterial] = useState(false);
  const [hasConfirmedQuantity, setHasConfirmedQuantity] = useState(false);
  const [hasReviewedOptions, setHasReviewedOptions] = useState(false);

  // Yard-sign-specific confirmation flags. Print side defaults to 'single'
  // but the user must explicitly review (tap the sticky CTA or interact
  // with the card) before the step machine advances. Stakes is optional —
  // user must visit the section once before Add to Cart unlocks.
  const [hasReviewedYardSignPrintSide, setHasReviewedYardSignPrintSide] = useState(false);
  const [hasReviewedYardSignStakes, setHasReviewedYardSignStakes] = useState(false);
  // Mirrored upload status from <YardSignConfigurator/> so the parent can
  // surface "Uploading…" / "Retry Upload" in the sticky CTA.
  const [yardSignUploadStatus, setYardSignUploadStatus] = useState<{ isUploading: boolean; uploadError: string | null }>({ isUploading: false, uploadError: null });
  // Programmatic preview-open trigger (incremented to re-open).
  const [yardSignPreviewTrigger, setYardSignPreviewTrigger] = useState<{ designId: string; nonce: number } | null>(null);

  // Post-add-to-cart success state — when true the mobile sticky CTA
  // collapses to "View Cart (n)" and the step progress indicator hides
  // so the user is never confused about whether they're still in the
  // build flow. Reset whenever the user starts another build (changes
  // product type, taps a step pill, etc.).
  const [hasJustAddedToCart, setHasJustAddedToCart] = useState(false);
  const [showPostAddResetNotice, setShowPostAddResetNotice] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);
  // PR3: per-axis Y scale (defaults to imgScale → uniform). The
  // "Constrain proportions" toggle, when ON, keeps scaleY tied to scaleX
  // so freeform mode is opt-in.
  const [imgScaleY, setImgScaleY] = useState(1);
  const [constrainProps, setConstrainProps] = useState(true);
  // Keep the latest design snapshot mirrored in a ref so
  // `handleProductTypeChange` (declared above the underlying useState
  // calls) can read the current artwork/transform without referencing
  // those state variables in its dependency array.
  useEffect(() => {
    latestDesignRef.current = { uploadedFile, imgPos, imgScale, imgScaleY, constrainProps };
  }, [uploadedFile, imgPos, imgScale, imgScaleY, constrainProps]);
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
  // every screen size. Using state (not refs) ensures the portal
  // re-renders as soon as the mount node is attached. Two slots: one for
  // the inline preview, one for the confirm modal preview.
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

  // "Create with AI" modal state. Only available for banner & car_magnet on
  // this page — yard signs use YardSignConfigurator which has its own button.
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [aiEditModalOpen, setAiEditModalOpen] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState<string | null>(null);
  const [aiDesignSession, setAiDesignSession] = useState<AIDesignSession | null>(null);
  const aiHandoffProcessedRef = useRef(false);

  const quoteStore = useQuoteStore();
  const cartStore = useCartStore();
  const { setIsCartOpen } = useUIStore();

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

  // Mobile guided-flow auto-confirm watchers. We snapshot each step's
  // user-controlled values on first render (so the initial defaults
  // don't count as a confirmation) and bump the corresponding flag
  // whenever the value subsequently changes WITHIN THE SAME PRODUCT
  // TAB. The snapshot key is prefixed with `productType` so a tab
  // switch (which programmatically resets values back to defaults
  // inside `handleProductTypeChange`) re-snapshots silently instead
  // of firing a spurious confirmation.
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
  const yardSignPromoRate = promoApplied ? PROMO_NEW20_DISCOUNT_RATE : 0;
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

  // Reset image position/scale when dimensions change to prevent clipping
  useEffect(() => {
    const pendingRestore = cartRestoreTransformRef.current;
    if (pendingRestore) {
      if (
        pendingRestore.productType === productType
        && pendingRestore.widthIn === widthIn
        && pendingRestore.heightIn === heightIn
      ) {
        setImgPos(pendingRestore.pos);
        setImgScale(pendingRestore.scaleX);
        setImgScaleY(pendingRestore.scaleY);
        setConstrainProps(pendingRestore.constrain);
        cartRestoreTransformRef.current = null;
      }
      preparedPlacementRef.current = null;
      setPendingPlacementPreview(null);
      return;
    }
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    preparedPlacementRef.current = null;
    setPendingPlacementPreview(null);
  }, [heightIn, productType, widthIn]);

  // Keep the inches-mode raw input strings in sync with widthIn/heightIn
  // when those change from outside the inches inputs (e.g. presets, feet-mode
  // editing, cart restore). Effect dep is [widthIn]/[heightIn], so this never
  // fires while the user is only typing into the inches input — typing-in-
  // progress (including empty/partial values) is preserved until blur.
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
  // pricing (which is derived from widthIn = widthFt*12 + widthInR) updates
  // reactively while the user is typing in inches mode. We do the parsing
  // here (in an effect), not inside onChange, per the input handling spec.
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

  // Cross-browser preview container styles using padding-bottom technique.
  // The CSS `aspect-ratio` property collapses to 0 height on mobile Safari /
  // Firefox when combined with absolutely-positioned children + overflow:hidden,
  // which causes the live preview image to render at its natural pixel size and
  // overflow the page after upload. Using a width wrapper with a padding-bottom
  // child reliably reserves vertical space across all browsers.
  const getPreviewContainerStyles = useCallback((maxH: number) => {
    const w = widthIn || 96;
    const h = heightIn || 48;
    const ar = w / h;
    return {
      wrapperStyle: { width: '100%', maxWidth: `${Math.round(maxH * ar)}px` } as React.CSSProperties,
      paddingPct: `${(h / w) * 100}%`,
    };
  }, [widthIn, heightIn]);
  const { wrapperStyle: previewWrapperStyle, paddingPct: previewPaddingPct } = useMemo(
    () => getPreviewContainerStyles(isLgScreen ? 480 : 280),
    [getPreviewContainerStyles, isLgScreen]
  );
  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(
    () => getPreviewContainerStyles(isLgScreen ? 200 : 140),
    [getPreviewContainerStyles, isLgScreen]
  );
  const bannerPricing = calculateBannerPricing({
    widthIn,
    heightIn,
    quantity,
    material,
    grommets,
    addRope,
    ropePlacement,
    polePockets,
  });
  const totals = calcTotals({ widthIn, heightIn, qty: quantity, material, addRope, polePockets });

  const selectedMaterial = MATERIALS.find(m => m.mapped === material) || MATERIALS[0];
  const materialLabel = isCarMagnet ? 'Premium Magnetic Material' : selectedMaterial.label;
  const grommetsLabel = DESIGN_GROMMET_OPTIONS.find(o => o.value === grommets)?.label || 'None';
  const widthDisplay = isCarMagnet ? `${widthIn}"` : (widthInR > 0 ? `${widthFt}'${widthInR}"` : `${widthFt}'`);
  const heightDisplay = isCarMagnet ? `${heightIn}"` : (heightInR > 0 ? `${heightFt}'${heightInR}"` : `${heightFt}'`);

  // Quantity discount info
  const quantityDiscountRate = bannerPricing.quantityDiscountRate;

  // Banner promo math: route through promoEngine so /design uses the SAME
  // best-discount-wins logic as cart and checkout. We feed it the RAW
  // pre-discount subtotal (subtotalBeforeDiscountCents) so the resolver
  // chooses correctly between the quantity tier and the promo rate without
  // double-discounting.
  const effectivePromoCode = promoApplied ? promoCode : null;
  const bannerPromoResolution = useMemo(() => resolvePromo({
    subtotalCents: bannerPricing.subtotalBeforeDiscountCents,
    quantity,
    code: effectivePromoCode,
  }), [bannerPricing.subtotalBeforeDiscountCents, quantity, effectivePromoCode]);

  const bannerSubtotalAfterAllDiscountsCents = Math.max(
    0,
    bannerPricing.subtotalBeforeDiscountCents - bannerPromoResolution.appliedDiscountAmountCents,
  );
  const bannerTaxAfterAllDiscountsCents = Math.round(bannerSubtotalAfterAllDiscountsCents * 0.06);
  const bannerTotalAfterAllDiscountsCents = bannerSubtotalAfterAllDiscountsCents + bannerTaxAfterAllDiscountsCents;
  const discountedTotal = bannerSubtotalAfterAllDiscountsCents / 100;
  // Show "promo applied" badge only when the resolver actually selected it
  // AND the amount is non-zero (never show messaging without a real reduction).
  const bannerPromoActuallyApplied =
    bannerPromoResolution.appliedDiscountType === 'promo' &&
    bannerPromoResolution.appliedDiscountAmountCents > 0;

  // Same-Day Hit Service preview fee for product-page summary.
  // Read cart-level flag; if selected compute the fee against the product subtotal
  // so the PriceBreakdown shows the line item and updated total before adding to cart.
  const sameDayHitService = useCartStore(s => s.sameDayHitService);
  // Compute the Same-Day Hit Service fee preview for the currently selected product type.
  // Used to update PriceBreakdown totals and show the line item before adding to cart.
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

  const scrollToOrder = useCallback(() => {
    setHasEnteredBuilder(true);
    // Prefer the per-product builder start anchor (the "Build Your ..." heading)
    // so the user lands directly on the active builder. Falls back to the
    // section ref (which contains the product type cards) on first entry
    // before the heading has rendered.
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

  const applyPreset = (idx: number) => {
    const p = PRESET_SIZES[idx];
    setWidthFtStr(String(Math.floor(p.w / 12)));
    setWidthInRStr(String(p.w % 12));
    setHeightFtStr(String(Math.floor(p.h / 12)));
    setHeightInRStr(String(p.h % 12));
    setActivePreset(idx);
    setHasConfirmedSize(true);
  };

  const handlePromoApply = () => {
    if (promoCode.trim().toUpperCase() === 'NEW20') {
      setPromoApplied(true);
      // Promo codes are NOT persisted to sessionStorage. The user must re-enter
      // the code in Checkout where it is validated server-side. This prevents
      // unvalidated codes from auto-applying to other users' carts.
    }
  };

  const handlePromoRemove = () => {
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
  // for user-uploaded artwork. This guarantees the AI image flows through
  // cart, checkout, admin, and the print PDF export with no special-casing.
  const handleAIGenerated = useCallback(
    async (result: CreateWithAIResult) => {
      const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
      setAiPrompt(result.prompt);
      setAiEditPrompt(null);
      setAiDesignSession(result.session);
      // Reset position/scale so the AI image is shown full-bleed by default.
      setImgPos({ x: 0, y: 0 });
      setImgScale(1);
      setImgScaleY(1);
      await handleFileUpload(file);
    },
    [handleFileUpload],
  );

  // The admin AI workspace hands this route a short-lived in-memory token.
  // High-resolution image bytes never enter browser history, local/session
  // storage, or the cart. The existing upload handler persists the consumed
  // artifact through the same permanent pipeline used by normal uploads.
  useEffect(() => {
    const state = location.state as { aiHandoffId?: string } | null;
    if (!state?.aiHandoffId || aiHandoffProcessedRef.current) return;
    const handoff = consumeAIHandoff(state.aiHandoffId);
    if (!handoff) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      toast({ title: 'AI handoff expired', description: 'Return to the AI Designer and approve the artwork again.', variant: 'destructive' });
      return;
    }
    aiHandoffProcessedRef.current = true;
    const config = handoff.configurator;
    const targetWidth = Number(config.widthIn || handoff.result.width);
    const targetHeight = Number(config.heightIn || handoff.result.height);
    setProductType('banner');
    setUnit('in');
    setWidthCustomInStr(String(targetWidth));
    setHeightCustomInStr(String(targetHeight));
    if (config.material) setMaterial(config.material);
    if (config.quantity) setQuantity(Math.max(1, Number(config.quantity)));
    setHasEnteredBuilder(true);

    const frame = window.requestAnimationFrame(() => {
      void handleAIGenerated(handoff.result)
        .then(() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null }))
        .catch(() => {
          aiHandoffProcessedRef.current = false;
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handleAIGenerated, location.pathname, location.search, location.state, navigate, setProductType, toast]);

  // Handle a successful "Edit with AI" update: replace the existing AI image
  // on the canvas (no second image layer) and persist the edit prompt.
  const handleAIEdited = useCallback(
    async (result: CreateWithAIResult & { editPrompt: string }) => {
      const file = base64ToFile(result.imageBase64, result.fileName, result.mimeType);
      setAiEditPrompt(result.editPrompt);
      setAiDesignSession(result.session);
      // Keep aiPrompt as-is (the original "Create with AI" intent).
      setImgPos({ x: 0, y: 0 });
      setImgScale(1);
      setImgScaleY(1);
      await handleFileUpload(file);
    },
    [handleFileUpload],
  );

  // Reset the preview/builder state after a successful "Add to Cart" so the
  // user can immediately start building another product without lingering
  // artwork/transform state from the previous item.
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
    setUploadError('');
    setAiPrompt(null);
    setAiEditPrompt(null);
    setAiDesignSession(null);
    setHasJustAddedToCart(false);
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
      throw new PreviewLifecycleError(
        'ORIGINAL_UPLOAD_INCOMPLETE',
        'The direct original-artwork upload did not complete.',
      );
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const editor = editorSource === 'modal'
        ? (modalEditorRef.current || inlineEditorRef.current)
        : (inlineEditorRef.current || modalEditorRef.current);
      if (!editor) {
        throw new PreviewLifecycleError(
          'PREVIEW_GEOMETRY_NOT_READY',
          'The visible artwork editor is not mounted.',
          { editorSource },
        );
      }

      const snapshot = editor.getCompositionSnapshot();
      const config = latestPreviewConfigRef.current;
      artwork = uploadedFileRef.current || artwork;
      const manifest = artwork.artworkManifest;
      const permanentOriginalUrl = manifest?.originalUrl || artwork.productionUrl || artwork.url;
      const permanentPreviewUrl = artwork.isPdf
        ? (artwork.previewUrl && /^https?:\/\//i.test(artwork.previewUrl)
            ? artwork.previewUrl
            : getPdfThumbnailUrl(permanentOriginalUrl))
        : permanentOriginalUrl;
      const sourceIdentity = [
        manifest?.publicId || artwork.productionPublicId || artwork.fileKey,
        manifest?.version ?? '',
        artwork.pdfPageNumber || 1,
      ].join('@');
      const spec: ArtworkCompositionSpec = {
        version: PREVIEW_ARTIFACT_VERSION,
        sourceUrl: permanentPreviewUrl,
        sourceIdentity,
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
      const latestSourceUrl = latestArtwork.isPdf
        ? (latestArtwork.previewUrl && /^https?:\/\//i.test(latestArtwork.previewUrl)
            ? latestArtwork.previewUrl
            : getPdfThumbnailUrl(latestOriginalUrl))
        : latestOriginalUrl;
      const latestSpec: ArtworkCompositionSpec = {
        version: PREVIEW_ARTIFACT_VERSION,
        sourceUrl: latestSourceUrl,
        sourceIdentity: [
          latestManifest?.publicId || latestArtwork.productionPublicId || latestArtwork.fileKey,
          latestManifest?.version ?? '',
          latestArtwork.pdfPageNumber || 1,
        ].join('@'),
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
      console.info('[placement_preview_stale_discarded]', {
        attempt,
        completedSignature: artifact.compositionSignature,
        latestSignature: buildCompositionSignature(latestSpec),
      });
    }

    throw new PreviewLifecycleError(
      'COMPOSITION_CHANGED',
      'The composition changed during all bounded preparation attempts.',
    );
  }, [ensurePermanentArtworkUploaded]);

  // CRITICAL: Generate final_render before adding to cart - orders without it cannot be printed
  const performCheckout = useCallback(async (
    selectedOptions: UpsellOption[],
    directData?: { pos: { x: number; y: number }, scale: number, scaleY?: number },
    actionType: 'checkout' | 'cart' = 'checkout',
  ) => {
    const checkoutData = directData || pendingCheckoutData;
    let checkoutArtwork = uploadedFileRef.current;
    const preparedPlacement = preparedPlacementRef.current;

    // Yard signs: multi-design flow
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

      const primaryDesign = yardSignDesigns[0];
      const primaryPlacement = primaryDesign.placementPreview!;
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
        source: 'design-page',
        version: 3,
        originalImageUrl: primaryDesign.fileUrl,
        originalImageFileKey: primaryDesign.fileKey,
        isPdf: primaryDesign.isPdf,
        widthIn: YARD_SIGN_WIDTH_IN,
        heightIn: YARD_SIGN_HEIGHT_IN,
        imgPos: primaryDesign.imgPos || { x: 0, y: 0 },
        imgScale: primaryDesign.imgScale || 1,
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

      console.log('[YARD_SIGN] ✅ Cart item created with yard sign metadata (design page)');
      finishAddToCart(actionType, '/design?product=yard-signs');
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
      if (!checkoutArtwork) {
        toast({
          title: 'Artwork required',
          description: 'Please upload your Car Magnet artwork before checkout.',
          variant: 'destructive',
        });
        return;
      }
      if (!checkoutData) {
        toast({
          title: 'Unable to continue',
          description: 'Please confirm your artwork position, then try checkout again.',
          variant: 'destructive',
        });
        return;
      }
      checkoutArtwork = await ensurePermanentArtworkUploaded();
      if (!checkoutArtwork) return;

      const container = previewContainerRef.current;
      const canvasStateJson = JSON.stringify({
        source: 'design-page',
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
        imgPos: checkoutData.pos,
        imgScale: checkoutData.scale,
        ...(checkoutData.scaleY != null && checkoutData.scaleY !== checkoutData.scale ? { imgScaleY: checkoutData.scaleY } : {}),
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

      finishAddToCart(actionType, '/design?product=car-magnets');
      return;
    }

    // Banner flow
    if (!checkoutArtwork || !checkoutData) return;
    checkoutArtwork = await ensurePermanentArtworkUploaded();
    if (!checkoutArtwork) return;

    let finalGrommets = grommets;
    let finalRope = addRope;
    let finalPolePockets = polePockets;
    let finalPolePocketSize = '2';

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

    // Generate final_render - MANDATORY for print file generation
    console.log('[DESIGN_CHECKOUT] Generating final_render, sourceFlow: design-page');
    console.log('[DESIGN_CHECKOUT] bannerWidthIn:', widthIn, 'bannerHeightIn:', heightIn);

    const finalRenderResult: { url: string; fileKey: string; widthPx: number; heightPx: number; dpi: number } | null = null;
    try {
      const imgSrc = checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || checkoutArtwork.url;
      const container = previewContainerRef.current;
      const containerWidth = container?.offsetWidth || 1;
      const containerHeight = container?.offsetHeight || 1;
      const imgPosPixels = {
        x: (checkoutData.pos.x / 100) * containerWidth,
        y: (checkoutData.pos.y / 100) * containerHeight,
      };

      // DISABLED for speed - server uses canvasStateJson
      // finalRenderResult = await generateFinalRenderFromHTML(imgSrc, widthIn, heightIn, imgPosPixels, checkoutData.scale, container);

      if (finalRenderResult) {
        console.log('[DESIGN_CHECKOUT] hasFinalRender: true');
      } else {
        console.warn('[DESIGN_CHECKOUT] hasFinalRender: false - proceeding with original');
        // Non-blocking - continue without final render
        // Was return - now continuing
      }
    } catch (err) {
      console.warn('[DESIGN_CHECKOUT] final_render error (non-blocking):', err);
      // Non-blocking - continue without final render
      // Was return - now continuing
    }

    // DESIGN STATE: Save for server-side print re-rendering
    const container = previewContainerRef.current;
    const sourceWidth = checkoutArtwork.originalWidth || 1;
    const sourceHeight = checkoutArtwork.originalHeight || 1;
    const containScaleIn = Math.min(widthIn / sourceWidth, heightIn / sourceHeight);
    const placedWidthIn = sourceWidth * containScaleIn * checkoutData.scale;
    const placedHeightIn = sourceHeight * containScaleIn * (checkoutData.scaleY ?? checkoutData.scale);
    const placedXIn = (widthIn - placedWidthIn) / 2 + (checkoutData.pos.x / 100) * widthIn;
    const placedYIn = (heightIn - placedHeightIn) / 2 + (checkoutData.pos.y / 100) * heightIn;
    const originalUrl = checkoutArtwork.productionUrl || checkoutArtwork.url;
    const originalPublicId = checkoutArtwork.productionPublicId || checkoutArtwork.fileKey;
    const productionObjects: any[] = [{
      id: 'customer-artwork',
      type: 'image',
      zIndex: 0,
      visible: true,
      xIn: placedXIn,
      yIn: placedYIn,
      widthIn: placedWidthIn,
      heightIn: placedHeightIn,
      rotation: 0,
      opacity: 1,
      clip: { xIn: 0, yIn: 0, widthIn, heightIn },
      source: {
        originalUrl,
        publicId: originalPublicId,
        resourceType: checkoutArtwork.resourceType || 'image',
        format: checkoutArtwork.originalFormat,
        mimeType: checkoutArtwork.mimeType,
        originalWidth: checkoutArtwork.originalWidth,
        originalHeight: checkoutArtwork.originalHeight,
        pdfPageNumber: checkoutArtwork.pdfPageNumber || 1,
        isVector: checkoutArtwork.isPdf,
      },
    }];
    const productionQuote = useQuoteStore.getState();
    (productionQuote.textElements || []).forEach((text, index) => productionObjects.push({
      id: text.id || `text-${index}`,
      type: 'text',
      zIndex: 10 + index,
      visible: true,
      xIn: (text.xPercent / 100) * widthIn,
      yIn: (text.yPercent / 100) * heightIn,
      widthIn: widthIn,
      heightIn: Math.max(Number(text.fontSize || 24) / 72, 0.1),
      rotation: 0,
      opacity: 1,
      text: {
        content: text.content,
        fontSize: Math.max(Number(text.fontSize || 24) / 72, 0.1),
        fontFamily: text.fontFamily,
        color: text.color,
        fontWeight: text.fontWeight,
        textAlign: text.textAlign,
      },
    }));
    const productionOverlays = productionQuote.overlayImages?.length
      ? productionQuote.overlayImages
      : (productionQuote.overlayImage ? [productionQuote.overlayImage] : []);
    productionOverlays.forEach((overlay, index) => {
      const overlayWidthIn = widthIn * (overlay.scale || 0.3);
      const overlayHeightIn = overlayWidthIn / (overlay.aspectRatio || 1);
      productionObjects.push({
        id: `overlay-${index}`,
        type: 'image',
        zIndex: 100 + index,
        visible: true,
        xIn: (overlay.position.x / 100) * widthIn - overlayWidthIn / 2,
        yIn: (overlay.position.y / 100) * heightIn - overlayHeightIn / 2,
        widthIn: overlayWidthIn,
        heightIn: overlayHeightIn,
        rotation: 0,
        opacity: 1,
        clip: { xIn: 0, yIn: 0, widthIn, heightIn },
        source: { originalUrl: overlay.url, publicId: overlay.fileKey, resourceType: 'image' },
      });
    });

    const canvasStateJson = JSON.stringify({
      source: 'design-page',
      sceneVersion: 2,
      widthIn,
      heightIn,
      backgroundColor: '#fafafa',
      objects: productionObjects,
      artworkManifest: checkoutArtwork.artworkManifest,
      placement: {
        fitMode: 'fit',
        xIn: placedXIn,
        yIn: placedYIn,
        widthIn: placedWidthIn,
        heightIn: placedHeightIn,
        rotation: 0,
        clip: { xIn: 0, yIn: 0, widthIn, heightIn },
        pdfPageNumber: checkoutArtwork.pdfPageNumber || 1,
      },
      // Legacy fields remain readable by existing order tooling.
      version: 3,
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
      imgPos: checkoutData.pos,
      imgScale: checkoutData.scale,
      // PR3: optional per-axis Y scale for freeform resize. Falls back to
      // imgScale on the server (uniform) when omitted.
      ...(checkoutData.scaleY != null && checkoutData.scaleY !== checkoutData.scale ? { imgScaleY: checkoutData.scaleY } : {}),
      containerCssWidth: container?.offsetWidth || null,
      containerCssHeight: container?.offsetHeight || null,
      bgColor: '#fafafa',
      productType: 'banner',
      canonicalComposition: preparedPlacement.spec,
      placementPreview: preparedPlacement.artifact,
      ...(aiPrompt ? { aiPrompt } : {}),
      ...(aiEditPrompt ? { aiEditPrompt } : {}),
    });

    const approvedThumbnailUrl = preparedPlacement.artifact.previewUrl;

    const updatedTotals = calcTotals({
      widthIn, heightIn, qty: quantity, material,
      addRope: finalRope, polePockets: finalPolePockets
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
      // PR3: thread per-axis Y scale through quote → cart → server PDF.
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
    } as any);

    const pricing = {
      unit_price_cents: Math.round(updatedTotals.unit * 100),
      rope_cost_cents: Math.round(updatedTotals.rope * 100),
      pole_pocket_cost_cents: Math.round(updatedTotals.polePocket * 100),
      line_total_cents: Math.round(updatedTotals.materialTotal * 100),
    };

    console.log('[DESIGN_CHECKOUT] Adding to cart with final_render');
    // Explicitly set product_type on quote state so cart item is correctly tagged as banner
    const bannerQuoteState = useQuoteStore.getState();
    (bannerQuoteState as any).product_type = 'banner';
    if (editItemId) cartStore.updateCartItem(editItemId, bannerQuoteState, undefined, pricing);
    else cartStore.addFromQuote(bannerQuoteState, undefined, pricing);

    finishAddToCart(actionType, '/design?product=banner');
  }, [ensurePermanentArtworkUploaded, pendingCheckoutData, grommets, addRope, polePockets, widthIn, heightIn, quantity, material, quoteStore, cartStore, toast, isYardSign, isCarMagnet, carMagnetPricing, carMagnetRoundedCorners, yardSignPricing, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, yardSignSidedness, yardSignAddStepStakes, yardSignStepStakeQty, finishAddToCart, editItemId, aiPrompt, aiEditPrompt, ropePlacement]);


  const prepareAndRoutePlacement = useCallback((
    actionType: 'checkout' | 'cart',
    editorSource: 'inline' | 'modal',
  ): Promise<void> => {
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

        if (isCarMagnet || finishingType !== 'none') {
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
        console.error('[placement_preview_failed]', {
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
  }, [finishingType, heightIn, isCarMagnet, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);

  // Proceed only after the actual editor canvas has produced a verified artifact.
  const handleCheckout = useCallback(() => {
    // Yard signs: multi-design flow (no single uploadedFile needed)
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

  // Trigger upsell modal after confirming position from preview modal
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
    // Sync chosen finishing options back to page state so preview and pricing reflect the choice
    selectedOptions.forEach(opt => {
      if (!opt.selected) return;
      if (opt.id === 'grommets' && opt.grommetSelection) {
        setGrommets(opt.grommetSelection);
        setFinishingType('grommets');
      } else if (opt.id === 'rope') {
        setAddRope(true);
        setFinishingType('rope');
      } else if (opt.id === 'polePockets' && opt.polePocketSelection) {
        setPolePockets(opt.polePocketSelection);
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

  // Keep this path safe if the guided CTA is re-enabled on /design: open the
  // picker synchronously from the tap and scroll only as a fallback.
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

  // Shared step-machine state used by the sticky CTA and the mobile
  // step-progress indicator. For yard sign / car magnet flows we keep
  // their existing custom CTA rules below — those don't follow the
  // size/material/quantity/options/upload pattern.
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
    optionsRequired: false, // finishing options are upsell-only, never blocking
    sizeConfirmed: hasConfirmedSize,
    materialConfirmed: hasConfirmedMaterial,
    quantityConfirmed: hasConfirmedQuantity,
    optionsReviewed: hasReviewedOptions,
    sizeLabel: `${widthIn}" × ${heightIn}"`,
    materialLabel: material === '13oz' ? '13oz Vinyl' : material === '15oz' ? '15oz Vinyl' : material,
    quantityLabel: `Qty ${quantity}`,
    optionsLabel: finishingType === 'none' ? 'No finishing selected' : 'Finishing selected',
  }), [showEntryCta, widthIn, heightIn, material, isCarMagnet, quantity, isUploading, uploadError, uploadedFile, hasConfirmedSize, hasConfirmedMaterial, hasConfirmedQuantity, hasReviewedOptions, finishingType]);

  const builderProgress = useMemo(() => getProgress(builderState), [builderState]);

  // Confirm a step from a CTA / pill tap — the user has explicitly opted
  // into that section so it counts as confirmed even if they accept the
  // default value. Subsequent renders advance the sticky CTA + progress
  // indicator to the next incomplete step.
  const confirmStep = useCallback((step: BuilderStepKey) => {
    if (step === 'size') setHasConfirmedSize(true);
    else if (step === 'material') setHasConfirmedMaterial(true);
    else if (step === 'quantity') setHasConfirmedQuantity(true);
    else if (step === 'options') setHasReviewedOptions(true);
  }, []);

  const handleStepPillClick = useCallback((key: BuilderStepKey) => {
    setHasEnteredBuilder(true);
    // Tapping a progress pill is a deliberate "I want to keep building"
    // action — clear the post-add success state so the sticky CTA returns
    // to the normal step machine.
    setHasJustAddedToCart(false);
    logUx('step_scrolled', { step: key, source: 'progress_pill' });
    scrollToStepAnchor(STEP_ANCHOR_FOR(key));
    if (key !== 'upload') confirmStep(key);
  }, [confirmStep]);

  // ID of the first uploaded yard sign design that has not yet been
  // preview-confirmed (no previewThumbnailUrl). Drives the "Review Design"
  // sticky CTA stop in `mobileCta`.
  const yardSignUnconfirmedDesignId = useMemo(() => {
    if (!isYardSign) return null;
    const pending = yardSignDesigns.find(d => !d.previewThumbnailUrl);
    return pending?.id ?? null;
  }, [isYardSign, yardSignDesigns]);

  const cartItemCount = useCartStore(s => s.getItemCount());

  // Open the cart drawer and emit analytics for the post-add "View Cart" CTA.
  const openCartDrawer = useCallback(() => {
    logUx('cart_opened', { source: 'sticky_view_cart' });
    setIsCartOpen(true);
  }, [setIsCartOpen]);

  // "Start another" — clears just-added flag and resets the builder so the
  // user can immediately create another product. Wired to the secondary
  // helper area when hasJustAddedToCart is true.
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
    // Post-add-to-cart success state — applies to ALL product types. The
    // sticky CTA must NEVER point backward at "Upload Artwork" / "Add a
    // Design" / "Add to Cart" once an item has just been added.
    if (hasJustAddedToCart) {
      const post = getPostAddToCartCta(cartItemCount);
      return { label: post.label, onClick: openCartDrawer, disabled: false, loading: false, helper: post.helper };
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
          return {
            label: desc.label,
            onClick: wrap(() => {
              setHasEnteredBuilder(true);
              setHasReviewedYardSignPrintSide(true);
              scrollToStepAnchor(YARD_SIGN_ANCHORS.printSide);
            }),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'add_design':
          return {
            label: desc.label,
            onClick: wrap(() => {
              openOrScrollToYardSignUpload();
            }),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'review_design':
          return {
            label: desc.label,
            onClick: wrap(() => {
              if (desc.designId) {
                setYardSignPreviewTrigger({ designId: desc.designId, nonce: Date.now() });
                logUx('preview_opened', { source: 'sticky_review_design', designId: desc.designId });
              }
              scrollToStepAnchor(YARD_SIGN_ANCHORS.upload);
            }),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'assign_quantities':
          return {
            label: desc.label,
            onClick: wrap(() => scrollToStepAnchor(YARD_SIGN_ANCHORS.quantity)),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'fix_quantity':
          return {
            label: desc.label,
            onClick: wrap(() => {
              logUx('quantity_invalid', { total: yardSignTotalQty });
              scrollToStepAnchor(YARD_SIGN_ANCHORS.quantity);
            }),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'review_stakes':
          return {
            label: desc.label,
            onClick: wrap(() => {
              setHasReviewedYardSignStakes(true);
              logUx('finishing_reviewed', { productType: 'yard_sign' });
              scrollToStepAnchor(YARD_SIGN_ANCHORS.finishing);
            }),
            disabled: false,
            loading: false,
            helper: desc.helper,
          };
        case 'add_to_cart':
          return {
            label: desc.label,
            onClick: wrap(() => {
              logUx('add_to_cart_attempted', { productType: 'yard_sign' });
              handleAddToCart();
            }),
            disabled: false,
            loading: false,
            helper: null,
          };
        default:
          return { label: desc.label, onClick: undefined, disabled: true, loading: false, helper: desc.helper };
      }
    }

    // Banner / car magnet — use shared step machine.
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
          scrollToStepAnchor(targetId);
          // Tapping the CTA both reveals the section AND counts as
          // confirming it — so the next render advances the step
          // machine to the next incomplete step. (Upload is excluded
          // here because confirmation comes from a successful upload.)
          if (stepKey !== 'upload') confirmStep(stepKey as BuilderStepKey);
        });
        return { label: desc.label, onClick, disabled: false, loading: false, helper: desc.helper };
      }
      default:
        return { label: desc.label, onClick: undefined, disabled: true, loading: false, helper: desc.helper };
    }
  })();
  // Emit sticky_cta_rendered every time the visible label changes so we
  // can see in Clarity exactly what each user was looking at when a flow
  // dropped off.
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

  const modeContent = PRODUCT_MODE_CONTENT[productType];

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
      category: 'Printing product configurator',
      variant: productType,
      price: product.startingPriceCents,
    });
  }, [productType]);

  return (
    <Layout>
      <Helmet>
        <title>Design Your Banner | Banners On The Fly</title>
        <meta name="description" content="Design custom vinyl banners online. Upload artwork, choose size and material, preview the print, and review production and shipping before checkout." />
        <link rel="canonical" href="https://bannersonthefly.com/design" />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0B1F3A] px-4 py-12 text-white md:py-16">
        <div className="relative z-[2] mx-auto max-w-4xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF8A3D]">Online order builder</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">
            Design your {modeContent.heroTitle}
          </h1>

          {modeContent.heroDescription}

          <div className="mx-auto mt-5 max-w-xl text-left md:hidden">
            <DeliveryTimer variant="compact" className="shadow-lg" />
          </div>

          {/* Inline benefit pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-slate-200">
            {modeContent.topFeatures.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 font-medium">
                <b.icon className={`h-3.5 w-3.5 ${b.iconClass}`} /> {b.label}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-col items-center gap-2">
            <button
              onClick={scrollToOrder}
              className="brand-button-primary w-full gap-2 px-10 text-lg sm:w-auto"
            >
              Start Order
            </button>
          </div>
        </div>
      </section>

      <section ref={orderRef} id="order-builder" className="bg-[#F7F7F7] px-4 py-12 sm:py-14">
        <div className="max-w-4xl lg:max-w-7xl mx-auto">
          {/* Product type switcher — public for all users */}
          <ProductTypeSwitcher productType={productType} onProductTypeChange={handleProductTypeChange} mobileStickyTopPx={77} />
          <h2
            ref={builderStartRef}
            id="builder-start"
            className="mb-10 scroll-mt-[140px] text-center font-display text-2xl font-bold text-[#0B1F3A] md:scroll-mt-24 md:text-3xl"
          >
            {isYardSign ? 'Build Your Yard Sign Order' : isCarMagnet ? 'Design Your Custom Car Magnets' : 'Build Your Banner'}
          </h2>
          {showPostAddResetNotice && (
            <p className="mb-4 text-sm text-green-700 text-center">Added to cart. Start another order or view your cart.</p>
          )}
          {/* Mobile-only step progress — driven by the same step machine as the
              sticky CTA so they can never disagree. Hidden on yard sign (uses a
              different multi-design flow). */}
          {false && (
            <div className="mb-4">
              <MobileStepProgress progress={builderProgress} onStepClick={handleStepPillClick} />
            </div>
          )}
          {isYardSign ? (
            /* ========== YARD SIGN ORDER BUILDER ========== */
            <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10 max-w-full">
              <div className="space-y-8 min-w-0 max-w-full">
                <YardSignConfigurator
                  ref={yardSignConfiguratorRef}
                  designs={yardSignDesigns}
                  onDesignsChange={(next) => {
                    // Mark stakes/print-side as reviewed implicitly when the
                    // user actively engages with quantities — but defer the
                    // explicit "Review Stakes" stop to the dedicated CTA.
                    setYardSignDesigns(next);
                  }}
                  sidedness={yardSignSidedness}
                  onSidednessChange={(s) => {
                    setYardSignSidedness(s);
                    setHasReviewedYardSignPrintSide(true);
                  }}
                  addStepStakes={yardSignAddStepStakes}
                  onStepStakesChange={(v) => {
                    setYardSignAddStepStakes(v);
                    setHasReviewedYardSignStakes(true);
                  }}
                  stepStakeQuantity={yardSignStepStakeQty}
                  onStepStakeQuantityChange={setYardSignStepStakeQty}
                  promoCode={promoCode}
                  promoApplied={promoApplied}
                  onPromoCodeChange={setPromoCode}
                  onPromoApply={handlePromoApply}
                  onPromoRemove={handlePromoRemove}
                  autoOpenDesignId={autoOpenDesignId}
                  onUploadStatusChange={setYardSignUploadStatus}
                  showCreateWithAI={false}
                  onPreviewDone={(id) => {
                    // The user finished positioning a design; advance the
                    // sticky CTA to the next step.
                    logUx('preview_done', { designId: id, productType: 'yard_sign' });
                  }}
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
                  Checkout
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
                <div className="flex items-center justify-center gap-2 mt-3 py-2 px-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm font-medium text-blue-700">📦 Orders made on Friday will be delivered on Tuesday.</span>
                </div>
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
              {/* Step 1 — Choose your size. Wraps the in/ft toggle (header right slot, banner only),
                  popular sizes, and custom size inputs. UI display only — pricing
                  and cart continue to use inches internally. */}
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
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthFtStr} onChange={e => { setWidthFtStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(widthFtStr, 10); setWidthFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                            <span className="self-center text-xs text-gray-500">ft</span>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthInRStr} onChange={e => { setWidthInRStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(widthInRStr, 10); setWidthInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                            <span className="self-center text-xs text-gray-500">in</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Height</span>
                          <div className="flex gap-1 mt-1">
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightFtStr} onChange={e => { setHeightFtStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(heightFtStr, 10); setHeightFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                            <span className="self-center text-xs text-gray-500">ft</span>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightInRStr} onChange={e => { setHeightInRStr(e.target.value); setActivePreset(null); }} onFocus={e => e.target.select()} onBlur={() => { const n = parseInt(heightInRStr, 10); setHeightInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                            <span className="self-center text-xs text-gray-500">in</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">{sqft.toFixed(1)} sq ft</p>
                    {/* Equivalent size — shows the size in the OTHER unit so the
                        Feet/Inches toggle gives users an instant cross-reference.
                        Display-only; never touches pricing or cart. */}
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
                  {isCarMagnet ? (
                    <div className="w-full border rounded-xl px-3 py-2.5 text-base bg-gray-50 text-gray-800 font-medium">
                      Premium Magnetic Material
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setMaterialDropdownOpen(prev => !prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-base bg-white flex items-center gap-3 cursor-pointer hover:border-gray-400 transition-colors"
                      >
                        <img
                          src={selectedMaterial.image}
                          alt={selectedMaterial.label}
                          className="w-9 h-9 rounded object-cover flex-shrink-0 bg-gray-100"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="font-medium text-gray-800">{selectedMaterial.label}</span>
                        <svg className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${materialDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {materialDropdownOpen && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                          {MATERIALS.map(m => (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => { setMaterial(m.mapped); setMaterialDropdownOpen(false); }}
                              className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer ${
                                m.mapped === material
                                  ? 'bg-orange-50 border-l-2 border-orange-500'
                                  : 'hover:bg-gray-50 border-l-2 border-transparent'
                              }`}
                            >
                              <img
                                src={m.image}
                                alt={m.label}
                                className="w-10 h-10 rounded object-cover flex-shrink-0 bg-gray-100"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="min-w-0">
                                <div className={`text-sm font-medium ${m.mapped === material ? 'text-orange-700' : 'text-gray-800'}`}>{m.label}</div>
                                <div className="text-xs text-gray-400 truncate">{m.desc}</div>
                              </div>
                              {m.mapped === material && (
                                <CheckCircle className="ml-auto w-4 h-4 text-orange-500 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ConfigCard>
              )}
              <ConfigCard step={isCarMagnet ? 2 : 3} title="Quantity" id="quantity-section">
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                    <Minus className="h-4 w-4 text-gray-600" />
                  </button>
                  <input type="number" min={1} max={999} value={quantity} onChange={e => setQuantity(Math.max(1, +e.target.value || 1))} className="w-20 border rounded-xl px-3 py-1.5 text-base text-center" />
                  <button onClick={() => setQuantity(q => Math.min(999, q + 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                    <Plus className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
                {!isCarMagnet && quantityDiscountRate > 0 && (
                  <p className="text-xs text-green-600 font-medium mt-1.5">
                    🎉 {Math.round(quantityDiscountRate * 100)}% bulk discount applied at checkout
                  </p>
                )}
                {quantity === 1 && (
                  <p className="text-xs text-gray-500 mt-1.5">Use +/- to adjust quantity quickly.</p>
                )}
                {!isCarMagnet && quantity === 1 && (
                  <p className="text-xs text-gray-400 mt-1">Order 2+ for up to 13% off</p>
                )}
              </ConfigCard>
              <ConfigCard step={isCarMagnet ? 3 : 4} title={isCarMagnet ? 'Rounded Corners' : 'More options'} id="options-section">
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
              <ConfigCard step={isCarMagnet ? 4 : 5} title="Upload your artwork" id="upload-section">
                {/* Helper banner: shown when the user reaches the upload card before
                    completing required choices. Doesn't block upload (per spec) — just
                    surfaces what still needs to happen before "Add to Cart" works. */}
                {!isYardSign && !isCarMagnet && !uploadedFile && (() => {
                  const missing: string[] = [];
                  if (!widthIn || !heightIn) missing.push('size');
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
                          disabled={!widthIn || !heightIn || !material || isUploading}
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
                    <div className="mb-2">
                      <h3 className="text-sm font-bold text-gray-800">{isYardSign ? 'Live Yard Sign Preview' : isCarMagnet ? 'Live Car Magnet Preview' : 'Live Banner Preview'}</h3>
                      <p className="text-xs text-gray-400">Final print preview — what you see is what you get</p>
                    </div>
                    <div className="rounded-xl p-4 md:p-6 max-w-full overflow-hidden bg-slate-300 border border-slate-400/70 shadow-inner">
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
                          compositionKey={`${uploadedFile.editorIdentity || uploadedFile.productionPublicId || uploadedFile.fileKey || uploadedFile.name}|${productType}|${widthIn}x${heightIn}`}
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
                            finishingType === 'grommets' && grommets !== 'none' ? (
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
                                  idSuffix="design-inline"
                                />
                              </svg>
                            ) : null
                          }
                        />
                      </PreviewRulerFrame>{/* close ruler frame */}
                    </div>
                    {/* Toolbar slot: the Fit / Fill / Reset / Locked
                        controls portal in here BELOW the canvas on every
                        screen size so they no longer cover the printable
                        artwork on desktop or mobile. */}
                    <div
                      ref={setInlineMobileToolbarEl}
                      className="mt-2"
                      data-mobile-artwork-toolbar="inline"
                    />
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Size: {widthFt} ft{widthInR > 0 ? ` ${widthInR} in` : ''} × {heightFt} ft{heightInR > 0 ? ` ${heightInR} in` : ''} ({sqft.toFixed(1)} sq ft)
                    </p>
                    <p className="text-xs text-gray-500 text-center mt-1 font-medium">Your design will be printed based on this preview</p>
                    <div className="mt-2 p-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-green-800 truncate">{uploadedFile.name}</span>
                      </div>
                      <button onClick={() => { setUploadedFile(null); setImgPos({ x: 0, y: 0 }); setImgScale(1); setImgScaleY(1); setAiPrompt(null); setAiEditPrompt(null); setAiDesignSession(null); }} className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-green-100 text-gray-500 hover:text-gray-700 transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                    {aiPrompt && !isYardSign && !isCarMagnet && showCreateWithAI && (
                      <div className="mt-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setAiEditModalOpen(true)}
                          disabled={!widthIn || !heightIn || !material || isUploading}
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
                  taxCents={carMagnetPricing.taxCents}
                  taxRate={0.06}
                  adjustedSubtotalCents={carMagnetPricing.subtotalCents}
                  totalCents={carMagnetPricing.totalCents + previewSameDayFeeCents}
                  footerNote="Tax calculated at checkout"
                />
              ) : (
                <PriceBreakdown
                  topLine={`${materialLabel} • ${widthDisplay} × ${heightDisplay}`}
                  secondaryLine={`for ${quantity} ${quantity === 1 ? 'banner' : 'banners'} • Current configured total shown below`}
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
                  taxCents={bannerTaxAfterAllDiscountsCents}
                  taxRate={0.06}
                  adjustedSubtotalCents={bannerSubtotalAfterAllDiscountsCents}
                  totalCents={bannerTotalAfterAllDiscountsCents + previewSameDayFeeCents}
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
                  footerNote="Tax calculated at checkout"
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

              <button onClick={handleCheckout} disabled={!uploadedFile || isUploading || isProcessingUpsell} className={`group w-full font-bold text-lg py-5 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 ${uploadedFile && !isUploading && !isProcessingUpsell ? 'bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white cursor-pointer shadow-orange-500/30' : 'bg-orange-300 text-white/80 cursor-not-allowed'}`}>
                <Lock className="h-4 w-4" aria-hidden="true" />
                {isProcessingUpsell ? 'Preparing exact preview…' : 'Checkout securely'}
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={handleAddToCart}
                disabled={!uploadedFile || isUploading || isProcessingUpsell}
                className={`w-full font-semibold text-base py-4 rounded-xl border-2 transition-all duration-200 ${
                  uploadedFile && !isUploading && !isProcessingUpsell
                    ? 'border-slate-300 text-slate-800 hover:bg-slate-50'
                    : 'border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isProcessingUpsell ? 'Preparing exact preview…' : 'Add to Cart'}
              </button>
              {/* Friday shipping badge */}
              <div className="flex items-center justify-center gap-2 mt-3 py-2 px-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-medium text-blue-700">📦 Orders made on Friday will be delivered on Tuesday.</span>
              </div>
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

      {/* Testimonials */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">What Our Customers Say</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex items-center gap-3 mb-3">
                  <img src={t.image} alt={t.name} width="70" height="70" className="w-10 h-10 rounded-full object-cover" loading="lazy" />
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.company}</p>
                  </div>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[...Array(5)].map((_, j) => <Star key={j} className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />)}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg font-bold text-center mb-5">
            {modeContent.builtTitle}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {modeContent.builtItems.map((item, index) => (
              <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <item.icon className={`h-7 w-7 mx-auto mb-1 ${item.iconClass}`} />
                <p className="text-xs md:text-sm font-medium text-gray-700">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MobileSubtotalBar
        cartItemCount={cartItemCount}
        onViewCart={openCartDrawer}
        subtotal={
          isYardSign && yardSignPricing ? (
            <p className="text-xl font-bold text-gray-900">
              {yardSignTotalQty > 0 ? usd(yardSignPricing.totalCents / 100) : '—'}
            </p>
          ) : promoApplied ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-400 line-through">{usd(totals.materialTotal)}</p>
              <p className="text-xl font-bold text-green-600">{usd(discountedTotal)}</p>
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
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1"><Move className="w-4 h-4" /> Drag to reposition · Drag corners to resize</p>
              <div className="rounded-lg p-3 max-w-full overflow-hidden border border-slate-300" style={{ background: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)' }}>
                <PreviewRulerFrame
                  widthIn={widthIn}
                  heightIn={heightIn}
                  unit={isCarMagnet ? 'in' : unit}
                  className="mx-auto max-w-full"
                  style={previewWrapperStyle}
                >
                  <ArtworkPreviewEditor
                    ref={modalEditorRef}
                    compositionKey={`${uploadedFile.editorIdentity || uploadedFile.productionPublicId || uploadedFile.fileKey || uploadedFile.name}|${productType}|${widthIn}x${heightIn}`}
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
                      finishingType === 'grommets' && grommets !== 'none' ? (
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
                            idSuffix="design-modal"
                          />
                        </svg>
                      ) : null
                    }
                  />
                </PreviewRulerFrame>
              </div>
              {/* Toolbar slot for the modal preview — rendered below the
                  canvas on all screen sizes so it never covers artwork. */}
              <div
                ref={setModalMobileToolbarEl}
                className="mt-2"
                data-mobile-artwork-toolbar="modal"
              />
              <p className="text-xs text-gray-400 text-center mt-2">
                Size: {widthFt} ft{widthInR > 0 ? ` ${widthInR} in` : ''} × {heightFt} ft{heightInR > 0 ? ` ${heightInR} in` : ''} ({sqft.toFixed(1)} sq ft)
              </p>
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
        productType={productType}
        isProcessing={isProcessingUpsell}
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
      {/* Edit with AI Modal — only available after an AI design exists */}
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
    </Layout>
  );
};

export default Design;
