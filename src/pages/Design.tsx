import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, Clock, Star, CheckCircle, Truck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock, Mail, Droplets, Sun, Wind, Palette, Tag, Move, ZoomIn, ZoomOut, Ruler, Layers } from 'lucide-react';
import Layout from '@/components/Layout';
import { useQuoteStore, type MaterialKey } from '@/store/quote';
import { useCartStore, type CartItem } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import { calcTotals, usd, PRICE_PER_SQFT } from '@/lib/pricing';
import { DESIGN_GROMMET_OPTIONS } from '@/lib/grommets';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import { getQuantityDiscountRate } from '@/lib/quantity-discount';
import { useToast } from '@/components/ui/use-toast';
import { generateFinalRenderFromHTML } from '@/utils/generateFinalRenderFromHTML';
import type { ProductTypeSlug } from '@/lib/products';
import ProductTypeSwitcher from '@/components/design/ProductTypeSwitcher';
import YardSignConfigurator from '@/components/design/YardSignConfigurator';
import YardSignPriceSummary from '@/components/design/YardSignPriceSummary';
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

const PRESET_SIZES = [
  { label: "2' × 4'", w: 48, h: 24 },
  { label: "2' × 6'", w: 72, h: 24 },
  { label: "3' × 6'", w: 72, h: 36 },
  { label: "3' × 8'", w: 96, h: 36 },
  { label: "4' × 8'", w: 96, h: 48 },
  { label: "4' × 10'", w: 120, h: 48 },
];

const MATERIALS: { key: string; label: string; mapped: MaterialKey; desc: string; image: string }[] = [
  { key: '13oz', label: '13oz Vinyl', mapped: '13oz', desc: 'Standard outdoor — great for most uses', image: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png' },
  { key: '15oz', label: '15oz Vinyl', mapped: '15oz', desc: 'Heavy-duty — extra durability and rigidity', image: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png' },
  { key: '18oz', label: '18oz Vinyl', mapped: '18oz', desc: 'Premium blockout — thick, wind-resistant', image: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png' },
  { key: 'mesh', label: 'Mesh Fence', mapped: 'mesh', desc: 'Wind pass-through — ideal for fences', image: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_80,h_80,c_fill,f_auto,q_auto/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png' },
];

const PROMO_NEW20_DISCOUNT_RATE = 0.2;
const HERO_BG_VIDEO_URL = 'https://res.cloudinary.com/dtrxl120u/video/upload/v1776752374/Multi-Shot_Video_-_Create_a_premium__high-end_commercial_background_video_for_a_fast_custom_printing_plodlm.mp4';

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
          Printed in 24 hours + <strong className="text-white">Free Next-Day Air Shipping</strong>.
        </p>
        <p className="text-sm text-gray-200">Most orders arrive in 2 business days.</p>
      </>
    ),
    topFeatures: [
      { icon: Clock, iconClass: 'text-orange-500', label: '24-Hr Print' },
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
        Standard 24&quot; × 18&quot; corrugated plastic yard signs, printed fast and shipped next business day.
      </p>
    ),
    topFeatures: [
      { icon: Clock, iconClass: 'text-orange-500', label: '24-Hr Print' },
      { icon: Truck, iconClass: 'text-orange-500', label: 'Free Next-Day Air' },
      { icon: Layers, iconClass: 'text-orange-500', label: 'Up to 10 Designs' },
      { icon: Brush, iconClass: 'text-orange-500', label: 'Designer Reviewed' },
    ],
    builtTitle: 'Built for the Outdoors',
    builtItems: [
      { icon: Clock, iconClass: 'text-orange-500', label: '24-Hour Turnaround' },
      { icon: Sun, iconClass: 'text-yellow-500', label: 'Outdoor Durable' },
      { icon: Palette, iconClass: 'text-purple-500', label: 'Vibrant Print' },
      { icon: Droplets, iconClass: 'text-blue-500', label: 'Corrugated Plastic' },
    ],
  },
} as const;

// Calculate grommet positions for preview overlay
function calcGrommetPts(w: number, h: number, mode: string): { x: number; y: number }[] {
  const m = 1;
  const corners = [{ x: m, y: m }, { x: w - m, y: m }, { x: m, y: h - m }, { x: w - m, y: h - m }];
  if (mode === "none") return [];
  if (mode === "4-corners") return corners;
  if (mode === "top-corners") return [corners[0], corners[1]];
  if (mode === "left-corners") return [corners[0], corners[2]];
  if (mode === "right-corners") return [corners[1], corners[3]];
  const spacing = mode === "every-1-2ft" ? 18 : 24;
  const pts = [...corners];
  const uw = Math.max(0, w - 2 * m), nw = Math.floor(uw / spacing);
  if (nw > 0) { const ws = uw / (nw + 1); for (let i = 1; i <= nw; i++) { pts.push({ x: m + i * ws, y: m }); pts.push({ x: m + i * ws, y: h - m }); } }
  const uh = Math.max(0, h - 2 * m), nh = Math.floor(uh / spacing);
  if (nh > 0) { const hs = uh / (nh + 1); for (let i = 1; i <= nh; i++) { pts.push({ x: m, y: m + i * hs }); pts.push({ x: w - m, y: m + i * hs }); } }
  const seen = new Set<string>();
  return pts.filter(p => { const k = p.x.toFixed(2) + "," + p.y.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Convert Cloudinary PDF URL to an image thumbnail (renders page 1)
function getPdfThumbnailUrl(pdfUrl: string): string {
  if (!pdfUrl || !pdfUrl.includes('cloudinary.com') || !pdfUrl.toLowerCase().endsWith('.pdf')) return pdfUrl;
  return pdfUrl.replace('/upload/', '/upload/pg_1,f_jpg,w_800/');
}

const Design: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();
  const orderRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasEnteredBuilder, setHasEnteredBuilder] = useState(false);
  const [isBuilderInView, setIsBuilderInView] = useState(false);

  // Product type state — read ?tab= or ?product= query param for routing
  const initialProductType = (() => {
    const tab = searchParams.get('tab');
    const product = searchParams.get('product');
    const param = tab || product;
    if (param === 'yard-sign' || param === 'yard_sign' || param === 'yard-signs') return 'yard_sign' as ProductTypeSlug;
    return 'banner' as ProductTypeSlug;
  })();
  const [productType, setProductType] = useState<ProductTypeSlug>(initialProductType);
  const isYardSign = productType === 'yard_sign';

  // Yard sign specific state (multi-design)
  const [yardSignDesigns, setYardSignDesigns] = useState<YardSignDesign[]>([]);
  const [yardSignSidedness, setYardSignSidedness] = useState<YardSignSidedness>('single');
  const [yardSignAddStepStakes, setYardSignAddStepStakes] = useState(false);
  const [yardSignStepStakeQty, setYardSignStepStakeQty] = useState(1);
  const [yardSignQuickQuoteQtyPreset, setYardSignQuickQuoteQtyPreset] = useState<number | null>(null);
  // Auto-open first design preview when editing yard sign from cart
  const [autoOpenDesignId, setAutoOpenDesignId] = useState<string | null>(null);

  // Handle product type switch — reset state
  const handleProductTypeChange = useCallback((newType: ProductTypeSlug) => {
    setProductType(newType);
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setQuantity(1);
    setPromoCode('');
    setPromoApplied(false);
    if (newType === 'yard_sign') {
      setYardSignDesigns([]);
      setYardSignSidedness('single');
      setYardSignAddStepStakes(false);
      setYardSignStepStakeQty(1);
      setYardSignQuickQuoteQtyPreset(null);
    }
  }, []);

  // Restore cart item state when editing from cart (editItem query param)
  const editItemId = searchParams.get('editItem');
  const [editItemRestored, setEditItemRestored] = useState(false);
  useEffect(() => {
    if (!editItemId || editItemRestored) return;
    const cartItems = useCartStore.getState().getMigratedItems();
    const item = cartItems.find((i: CartItem) => i.id === editItemId);
    if (!item) return;
    setEditItemRestored(true);

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
        imgPos: d.imgPos,
        previewThumbnailUrl: d.previewThumbnailUrl,
      }));
      setYardSignDesigns(restoredDesigns);
      setYardSignSidedness(item.yard_sign_sidedness || 'single');
      setYardSignAddStepStakes(item.yard_sign_step_stakes_enabled || false);
      setYardSignStepStakeQty(item.yard_sign_step_stakes_qty || 1);
      setYardSignQuickQuoteQtyPreset(null);
      // Auto-open the first design's preview so user can adjust immediately
      if (restoredDesigns.length > 0) {
        setAutoOpenDesignId(restoredDesigns[0].id);
      }
    } else {
      // Switch to banner tab and restore banner state
      setProductType('banner');
      if (item.file_url) {
        setUploadedFile({
          name: item.file_name || 'artwork',
          url: item.file_url,
          fileKey: item.file_key || '',
          size: 0,
          isPdf: item.is_pdf || false,
          thumbnailUrl: item.thumbnail_url || item.file_url,
        });
      }
      setImgPos(item.image_position || { x: 0, y: 0 });
      setImgScale(item.image_scale || 1);
      if (item.grommets) setGrommets(item.grommets);
      if (item.pole_pockets) setPolePockets(item.pole_pockets);
      setAddRope(!!item.rope_feet);
      setQuantity(item.quantity || 1);
      setYardSignQuickQuoteQtyPreset(null);

      // Auto-open preview modal so user can adjust
      setShowPreview(true);
    }

    // Remove the cart item since user is re-editing it
    useCartStore.getState().removeItem(editItemId);
  }, [editItemId, editItemRestored]);

  // Use string state for dimension inputs so users can clear and retype freely
  const [widthFtStr, setWidthFtStr] = useState('4');
  const [widthInRStr, setWidthInRStr] = useState('0');
  const [heightFtStr, setHeightFtStr] = useState('2');
  const [heightInRStr, setHeightInRStr] = useState('0');
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
  const [addRope, setAddRope] = useState(false);
  const [hemming, setHemming] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{name: string; url: string; fileKey: string; size: number; isPdf: boolean; thumbnailUrl?: string} | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(0);
  const [dragActive, setDragActive] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [dragStartPt, setDragStartPt] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartScale, setResizeStartScale] = useState(1);
  const [resizeStartDist, setResizeStartDist] = useState(0);
  const [resizeCenter, setResizeCenter] = useState({ x: 0, y: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Drag hint auto-fade state
  const [showDragHint, setShowDragHint] = useState(false);

  // Upsell modal state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [isProcessingUpsell, setIsProcessingUpsell] = useState(false);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{pos: {x: number; y: number}; scale: number} | null>(null);

  const quoteStore = useQuoteStore();
  const cartStore = useCartStore();
  const { setIsCartOpen } = useUIStore();

  // Dimensions: for banners, use ft+in inputs; for yard signs, fixed 24" × 18"
  const widthIn = isYardSign ? YARD_SIGN_WIDTH_IN : (widthFt * 12 + widthInR);
  const heightIn = isYardSign ? YARD_SIGN_HEIGHT_IN : (heightFt * 12 + heightInR);
  const sqft = (widthIn * heightIn) / 144;

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

  // Handle quick quote URL parameters (banner + yard sign)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const productParam = searchParams.get('productType') || searchParams.get('product');
    const isYardSignParam = ['yard-sign', 'yard_sign', 'yard-signs'].includes((tab || productParam || '').toLowerCase());
    const hasYardSignQuickQuoteParams =
      searchParams.has('printSide') ||
      searchParams.has('qty') ||
      searchParams.has('stepStakes') ||
      searchParams.has('stepStakeQty') ||
      searchParams.has('size');

    if (isYardSignParam && hasYardSignQuickQuoteParams) {
      const printSide = searchParams.get('printSide');
      const qty = searchParams.get('qty');
      const stepStakes = searchParams.get('stepStakes');
      const stepStakeQty = searchParams.get('stepStakeQty');
      const parsedQty = qty ? parseInt(qty, 10) : NaN;
      const qtyValidation = Number.isFinite(parsedQty)
        ? validateYardSignQuantity(parsedQty)
        : { valid: false, message: 'Invalid yard sign quantity from quick quote.' };
      const sidedness: YardSignSidedness = printSide === 'double' ? 'double' : 'single';
      const addStepStakes = stepStakes === '1' || stepStakes === 'true';
      const parsedStakeQty = stepStakeQty ? parseInt(stepStakeQty, 10) : parsedQty;
      const safeStakeQty = Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, Number.isFinite(parsedStakeQty) ? parsedStakeQty : 1));

      setProductType('yard_sign');
      setYardSignSidedness(sidedness);
      setYardSignAddStepStakes(addStepStakes);
      setYardSignStepStakeQty(addStepStakes ? safeStakeQty : 1);
      setYardSignQuickQuoteQtyPreset(qtyValidation.valid ? parsedQty : null);

      if (qtyValidation.valid) {
        toast({
          title: 'Quick Quote Applied',
          description: `24" x 18" ${sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'} yard signs (Qty: ${parsedQty})`,
        });
      }

      navigate(`${location.pathname}?tab=yard-sign`, { replace: true });
      return;
    }

    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const qty = searchParams.get('qty');
    const materialParam = searchParams.get('material');

    if (width && height && qty && materialParam) {
      const wIn = parseFloat(width);
      const hIn = parseFloat(height);
      const q = parseInt(qty, 10);

      if (wIn >= 1 && wIn <= 1000 && hIn >= 1 && hIn <= 1000 && q >= 1 &&
          ['13oz', '15oz', '18oz', 'mesh'].includes(materialParam)) {
        // Convert inches to feet + remaining inches for the input fields
        setWidthFtStr(String(Math.floor(wIn / 12)));
        setWidthInRStr(String(Math.round(wIn % 12)));
        setHeightFtStr(String(Math.floor(hIn / 12)));
        setHeightInRStr(String(Math.round(hIn % 12)));
        setMaterial(materialParam as MaterialKey);
        setQuantity(q);
        setActivePreset(null);

        const materialName = {
          '13oz': '13oz Vinyl',
          '15oz': '15oz Vinyl',
          '18oz': '18oz Vinyl',
          'mesh': 'Mesh Vinyl'
        }[materialParam];

        toast({
          title: "Quick Quote Applied",
          description: `${wIn}" × ${hIn}" ${materialName} banner (Qty: ${q})`,
        });

        navigate(location.pathname, { replace: true });
      }
    }
  }, [searchParams, location.pathname, navigate, toast]);

  // Reset image position/scale when dimensions change to prevent clipping
  useEffect(() => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
  }, [widthIn, heightIn]);

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

  const previewCanvasStyle = useMemo(() => getCanvasStyle(isLgScreen ? 400 : 260), [getCanvasStyle, isLgScreen]);
  const dimPreviewCanvasStyle = useMemo(() => getCanvasStyle(isLgScreen ? 200 : 140), [getCanvasStyle, isLgScreen]);
  const totals = calcTotals({ widthIn, heightIn, qty: quantity, material, addRope, polePockets });

  const pricePerSqFt = PRICE_PER_SQFT[material];
  const selectedMaterial = MATERIALS.find(m => m.mapped === material) || MATERIALS[0];
  const materialLabel = selectedMaterial.label;
  const grommetsLabel = DESIGN_GROMMET_OPTIONS.find(o => o.value === grommets)?.label || 'None';
  const widthDisplay = widthInR > 0 ? `${widthFt}'${widthInR}"` : `${widthFt}'`;
  const heightDisplay = heightInR > 0 ? `${heightFt}'${heightInR}"` : `${heightFt}'`;

  // Quantity discount info
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const discountedTotal = promoApplied ? totals.materialTotal * (1 - PROMO_NEW20_DISCOUNT_RATE) : totals.materialTotal;

  const scrollToOrder = useCallback(() => {
    setHasEnteredBuilder(true);
    orderRef.current?.scrollIntoView({ behavior: 'smooth' });
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
  };

  const handlePromoApply = () => {
    if (promoCode.trim().toUpperCase() === 'NEW20') {
      setPromoApplied(true);
      sessionStorage.setItem('pendingPromoCode', 'NEW20');
    }
  };

  // Compress images client-side to stay under Netlify's 6 MB function limit
  const compressImage = useCallback(async (file: File): Promise<File> => {
    if (file.type === 'application/pdf' || file.size <= 4.5 * 1024 * 1024) return file;
    return new Promise((resolve) => {
      const img = new Image();
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
          const compressed = new File([blob], file.name.replace(/.png$/i, '.jpg'), { type: 'image/jpeg' });
          resolve(compressed);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    const accepted = ['application/pdf','image/jpeg','image/png'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!accepted.includes(file.type) && !['pdf','png','jpg','jpeg'].includes(ext)) {
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
      setUploadedFile({ name: file.name, url: data.secureUrl, fileKey: data.fileKey || data.publicId, size: file.size, isPdf: file.type === 'application/pdf', thumbnailUrl: file.type === 'application/pdf' ? getPdfThumbnailUrl(data.secureUrl) : data.secureUrl });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [compressImage]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  // CRITICAL: Generate final_render before adding to cart - orders without it cannot be printed
  const performCheckout = useCallback(async (selectedOptions: UpsellOption[], directData?: { pos: { x: number; y: number }, scale: number }) => {
    const checkoutData = directData || pendingCheckoutData;

    // Yard signs: multi-design flow
    if (isYardSign && yardSignPricing) {
      if (yardSignDesigns.length === 0 || yardSignTotalQty === 0) return;
      if (!yardSignQuantityValid.valid) return;

      const primaryDesign = yardSignDesigns[0];
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
          imgPos: d.imgPos,
          previewThumbnailUrl: d.previewThumbnailUrl,
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
        fitMode: 'fill',
        thumbnailUrl: primaryDesign.previewThumbnailUrl || primaryDesign.thumbnailUrl,
        file: {
          name: primaryDesign.fileName,
          url: primaryDesign.fileUrl,
          fileKey: primaryDesign.fileKey,
          size: 0,
          isPdf: primaryDesign.isPdf,
          thumbnailUrl: primaryDesign.previewThumbnailUrl || primaryDesign.thumbnailUrl,
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
      cartStore.addFromQuote(quoteState, undefined, pricing);

      console.log('[YARD_SIGN] ✅ Cart item created with yard sign metadata (design page)');
      setIsCartOpen(true);
      setPendingCheckoutData(null);
      // Preserve tab in history so browser Back returns to Yard Sign tab
      window.history.replaceState(null, '', '/design?tab=yard-sign');
      navigate('/checkout');
      return;
    }

    // Banner flow
    if (!uploadedFile || !checkoutData) return;

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

    let finalRenderResult: { url: string; fileKey: string; widthPx: number; heightPx: number; dpi: number } | null = null;
    try {
      const imgSrc = uploadedFile.thumbnailUrl || uploadedFile.url;
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
    const canvasStateJson = JSON.stringify({
      source: 'design-page',
      version: 2,
      originalImageUrl: uploadedFile.url,
      originalImageFileKey: uploadedFile.fileKey,
      isPdf: uploadedFile.isPdf,
      widthIn,
      heightIn,
      imgPos: checkoutData.pos,
      imgScale: checkoutData.scale,
      containerCssWidth: container?.offsetWidth || null,
      containerCssHeight: container?.offsetHeight || null,
      bgColor: '#fafafa',
      productType: 'banner',
    });

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
      imagePosition: checkoutData.pos,
      imageScale: checkoutData.scale,
      fitMode: 'fill',
      thumbnailUrl: uploadedFile.thumbnailUrl,
      file: { name: uploadedFile.name, url: uploadedFile.url, fileKey: uploadedFile.fileKey, size: uploadedFile.size, isPdf: uploadedFile.isPdf, thumbnailUrl: uploadedFile.thumbnailUrl, type: uploadedFile.isPdf ? 'application/pdf' : 'image/*' } as any,
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
    cartStore.addFromQuote(bannerQuoteState, undefined, pricing);
    setIsCartOpen(true);
    setPendingCheckoutData(null);
    // Preserve tab in history so browser Back returns to Banner tab
    window.history.replaceState(null, '', '/design?tab=banner');
    navigate('/checkout');
  }, [uploadedFile, pendingCheckoutData, grommets, addRope, polePockets, widthIn, heightIn, quantity, material, quoteStore, cartStore, setIsCartOpen, navigate, toast, isYardSign, yardSignPricing, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, yardSignSidedness, yardSignAddStepStakes, yardSignStepStakeQty]);


  // Proceed directly to checkout using current inline preview position
  const handleCheckout = useCallback(() => {
    // Yard signs: multi-design flow (no single uploadedFile needed)
    if (isYardSign) {
      if (yardSignDesigns.length === 0 || yardSignTotalQty === 0) return;
      if (!yardSignQuantityValid.valid) return;
      performCheckout([], { pos: { x: 0, y: 0 }, scale: 1 });
      return;
    }

    // Banner flow
    if (!uploadedFile) return;
    const container = previewContainerRef.current;
    const containerWidth = container?.offsetWidth || 1;
    const containerHeight = container?.offsetHeight || 1;
    const posPercent = {
      x: (imgPos.x / containerWidth) * 100,
      y: (imgPos.y / containerHeight) * 100
    };
    setPendingCheckoutData({ pos: posPercent, scale: imgScale });

    const hasFinishing = grommets !== 'none' || polePockets !== 'none';
    const hasRope = addRope;
    if (hasFinishing && hasRope) {
      performCheckout([], { pos: posPercent, scale: imgScale });
    } else {
      setShowUpsellModal(true);
    }
  }, [uploadedFile, imgPos, imgScale, grommets, polePockets, addRope, performCheckout, isYardSign, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid]);

  // Trigger upsell modal after confirming position from preview modal
  const handleConfirmPosition = useCallback((pos: { x: number; y: number }, scale: number) => {
    if (!uploadedFile) return;
    const container = previewContainerRef.current;
    const containerWidth = container?.offsetWidth || 1;
    const containerHeight = container?.offsetHeight || 1;
    const posPercent = {
      x: (pos.x / containerWidth) * 100,
      y: (pos.y / containerHeight) * 100
    };
    setPendingCheckoutData({ pos: posPercent, scale });
    setShowPreview(false);

    const hasFinishing = grommets !== 'none' || polePockets !== 'none';
    const hasRope = addRope;
    if (hasFinishing && hasRope) {
      performCheckout([], { pos: posPercent, scale });
    } else {
      setShowUpsellModal(true);
    }
  }, [uploadedFile, grommets, polePockets, addRope, performCheckout]);

  // Handle upsell modal continue
  const handleUpsellContinue = useCallback((selectedOptions: UpsellOption[], dontAskAgain: boolean) => {
    setIsProcessingUpsell(true);
    setShowUpsellModal(false);
    if (dontAskAgain) {
      sessionStorage.setItem('upsell-dont-show-again', 'true');
    }
    performCheckout(selectedOptions);
    setIsProcessingUpsell(false);
  }, [performCheckout]);

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

  const mobileCheckoutReady = isYardSign
    ? yardSignTotalQty > 0 && yardSignQuantityValid.valid
    : !!uploadedFile;
  const showEntryCta = !hasEnteredBuilder;
  const mobileCtaLabel = showEntryCta
    ? 'Start Order'
    : (mobileCheckoutReady ? 'Checkout' : 'Continue Building');
  const mobileCtaAction = showEntryCta
    ? scrollToOrder
    : (mobileCheckoutReady ? handleCheckout : scrollToOrder);
  const modeContent = PRODUCT_MODE_CONTENT[productType];

  return (
    <Layout>
      <Helmet>
        <title>Design Your Banner | Banners On The Fly</title>
        <meta name="description" content="Design and order custom vinyl banners. Upload your artwork, choose your size and material, and get free next-day air shipping." />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-8 pb-10 md:pt-10 md:pb-12 bg-slate-900">
        <video
          className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 object-cover z-0"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={HERO_BG_VIDEO_URL} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.35))',
          }}
          aria-hidden="true"
        />
        <div className="relative z-[2] max-w-2xl mx-auto text-center space-y-4">
          <h1 className="text-white text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
            Design Your
            <br />
            <span className="text-orange-500">{modeContent.heroTitle}</span>
          </h1>

          {modeContent.heroDescription}

          {/* Inline benefit pills */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-gray-100">
            {modeContent.topFeatures.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 font-medium">
                <b.icon className={`h-3.5 w-3.5 ${b.iconClass}`} /> {b.label}
              </span>
            ))}
          </div>

          <div className="pt-2 flex flex-col items-center gap-2">
            <button
              onClick={scrollToOrder}
              className="group inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold text-lg px-10 py-4 rounded-xl shadow-[0_4px_14px_rgba(251,146,60,0.4)] hover:shadow-[0_6px_20px_rgba(251,146,60,0.5)] transition-all w-full sm:w-auto"
            >
              Upload &amp; Start Your Order →
            </button>
          </div>
        </div>
      </section>

      <section ref={orderRef} id="order-builder" className="py-12 px-4 bg-white">
        <div className="max-w-4xl lg:max-w-6xl mx-auto">
          {/* Product type switcher — public for all users */}
          <ProductTypeSwitcher productType={productType} onProductTypeChange={handleProductTypeChange} />
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
            {isYardSign ? 'Build Your Yard Sign Order' : 'Build Your Banner'}
          </h2>
          {isYardSign ? (
            /* ========== YARD SIGN ORDER BUILDER ========== */
            <div className="grid md:grid-cols-2 lg:grid-cols-[1.4fr_1fr] gap-10">
              <div className="space-y-8 min-w-0">
                <YardSignConfigurator
                  designs={yardSignDesigns}
                  onDesignsChange={setYardSignDesigns}
                  sidedness={yardSignSidedness}
                  onSidednessChange={setYardSignSidedness}
                  addStepStakes={yardSignAddStepStakes}
                  onStepStakesChange={setYardSignAddStepStakes}
                  stepStakeQuantity={yardSignStepStakeQty}
                  onStepStakeQuantityChange={setYardSignStepStakeQty}
                  promoCode={promoCode}
                  promoApplied={promoApplied}
                  onPromoCodeChange={setPromoCode}
                  onPromoApply={handlePromoApply}
                  onPromoRemove={() => { setPromoApplied(false); setPromoCode(''); sessionStorage.removeItem('pendingPromoCode'); }}
                  autoOpenDesignId={autoOpenDesignId}
                  initialDesignQuantity={yardSignQuickQuoteQtyPreset ?? undefined}
                />
                {yardSignQuickQuoteQtyPreset && yardSignDesigns.length === 0 && (
                  <p className="text-xs text-orange-600 font-medium -mt-4">
                    Quick Quote preset applied: your first uploaded design will default to {yardSignQuickQuoteQtyPreset} signs.
                  </p>
                )}
              </div>
              <div className="space-y-6">
                {yardSignPricing && (
                  <YardSignPriceSummary
                    pricing={yardSignPricing}
                    designs={yardSignDesigns}
                    promoCode={promoCode}
                    promoApplied={promoApplied}
                    onPromoCodeChange={setPromoCode}
                    onPromoApply={handlePromoApply}
                    onPromoRemove={() => { setPromoApplied(false); setPromoCode(''); sessionStorage.removeItem('pendingPromoCode'); }}
                  />
                )}

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
          <div className="grid md:grid-cols-2 lg:grid-cols-[1.4fr_1fr] gap-10">
            <div className="space-y-8">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Popular Sizes</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_SIZES.map((p, i) => (
                    <button key={i} onClick={() => applyPreset(i)} className={`border rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${activePreset === i ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Size</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Width</span>
                    <div className="flex gap-1 mt-1">
                      <input type="number" min={1} max={50} value={widthFtStr} onChange={e => { setWidthFtStr(e.target.value); setActivePreset(null); }} onBlur={() => { const n = parseInt(widthFtStr, 10); setWidthFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                      <span className="self-center text-xs text-gray-500">ft</span>
                      <input type="number" min={0} max={11} value={widthInRStr} onChange={e => { setWidthInRStr(e.target.value); setActivePreset(null); }} onBlur={() => { const n = parseInt(widthInRStr, 10); setWidthInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                      <span className="self-center text-xs text-gray-500">in</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Height</span>
                    <div className="flex gap-1 mt-1">
                      <input type="number" min={1} max={50} value={heightFtStr} onChange={e => { setHeightFtStr(e.target.value); setActivePreset(null); }} onBlur={() => { const n = parseInt(heightFtStr, 10); setHeightFtStr(String(isNaN(n) ? 1 : Math.max(1, Math.min(50, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                      <span className="self-center text-xs text-gray-500">ft</span>
                      <input type="number" min={0} max={11} value={heightInRStr} onChange={e => { setHeightInRStr(e.target.value); setActivePreset(null); }} onBlur={() => { const n = parseInt(heightInRStr, 10); setHeightInRStr(String(isNaN(n) ? 0 : Math.max(0, Math.min(11, n)))); }} className="w-16 border rounded-lg px-2 py-1.5 text-base" />
                      <span className="self-center text-xs text-gray-500">in</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{sqft.toFixed(1)} sq ft</p>
                {/* Dimension preview canvas */}
                <label className="block text-sm font-semibold text-gray-700 mb-2 mt-4">Banner Size Preview</label>
                <div className="flex justify-center mb-6">
                  <div
                    className="bg-gray-100/70 border border-gray-200 rounded-lg relative transition-all duration-300 ease-out"
                    style={dimPreviewCanvasStyle}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <Ruler className="h-4 w-4 text-gray-300" />
                      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                        {widthDisplay} × {heightDisplay}
                      </span>
                      <span className="text-[10px] text-gray-400">Preview of selected size</span>
                    </div>
                  </div>
                </div>
              </div>
              <div ref={materialDropdownRef} className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Material</label>
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
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Your Artwork</label>
                {!uploadedFile ? (
                  <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onClick={() => fileInputRef.current?.click()} className={`relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ease-out overflow-hidden mx-auto ${dragActive ? 'border-orange-400 bg-orange-50 scale-[1.01] shadow-md' : 'border-gray-300 bg-gray-50/50 hover:border-orange-300 hover:bg-orange-50/30'}`} style={previewCanvasStyle}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 md:p-10">
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
                      {isUploading ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-10 w-10 text-orange-500 animate-spin mb-2" />
                          <p className="text-sm text-gray-600">Uploading...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 md:h-10 md:w-10 text-gray-400 mx-auto mb-1 md:mb-2" />
                          <p className="font-semibold text-gray-800 text-sm md:text-base">Drag &amp; Drop or Click to Upload</p>
                          <p className="text-xs text-gray-500 mt-0.5 md:mt-1">PDF, PNG, JPG, JPEG — Max 50 MB</p>
                          <p className="text-[10px] text-gray-400 mt-1">{widthDisplay} × {heightDisplay}</p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-2">
                      <h3 className="text-sm font-bold text-gray-800">Live Banner Preview</h3>
                      <p className="text-xs text-gray-400">Final print preview — what you see is what you get</p>
                    </div>
                    <div className="rounded-xl p-4 md:p-6" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
                      <div
                        ref={previewContainerRef}
                        className="relative mx-auto rounded-sm select-none overflow-hidden transition-all duration-300 ease-out"
                        style={{
                          ...previewCanvasStyle,
                          cursor: isDraggingPreview ? "grabbing" : "grab",
                          touchAction: "none",
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
                      >
                        <div
                          className="absolute inset-0 w-full h-full"
                          style={{ transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})` }}
                        >
                          <img
                            src={uploadedFile.thumbnailUrl || uploadedFile.url}
                            alt="Uploaded artwork preview"
                            className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                            draggable={false}
                          />
                        </div>
                        {showDragHint && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20" style={{ animation: 'fadeOut 0.5s ease-out 1.5s forwards' }}>
                            <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                              Drag to reposition • Use buttons to zoom
                            </span>
                          </div>
                        )}
                        {grommets !== "none" && calcGrommetPts(widthIn, heightIn, grommets).map((pos, idx) => {
                          const leftPct = (pos.x / widthIn) * 100;
                          const topPct = (pos.y / heightIn) * 100;
                          const dotSize = Math.max(6, Math.min(12, 180 / Math.max(widthIn, heightIn)));
                          return (
                            <div key={`inline-grommet-${idx}`} className="absolute rounded-full pointer-events-none" style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${dotSize}px`, height: `${dotSize}px`, transform: "translate(-50%, -50%)", background: 'radial-gradient(circle at 40% 35%, #d1d5db, #6b7280)', border: '1px solid #9ca3af', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25), 0 0.5px 1px rgba(0,0,0,0.15)', zIndex: 10 }}>
                              <div className="absolute rounded-full" style={{ left: "50%", top: "50%", width: "45%", height: "45%", transform: "translate(-50%, -50%)", background: '#374151', border: '0.5px solid #4b5563' }} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center mt-3">
                        <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm border border-gray-200/60">
                          <button onClick={() => setImgScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
                          <span className="text-xs font-medium text-gray-500 min-w-[3ch] text-center">{Math.round(imgScale * 100)}%</span>
                          <button onClick={() => setImgScale(s => Math.min(3, s + 0.1))} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
                          <div className="w-px h-4 bg-gray-200" />
                          <button onClick={() => { setImgPos({ x: 0, y: 0 }); setImgScale(1); }} className="text-xs text-orange-600 hover:text-orange-700 font-medium px-1.5">Reset</button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Size: {widthFt} ft{widthInR > 0 ? ` ${widthInR} in` : ''} × {heightFt} ft{heightInR > 0 ? ` ${heightInR} in` : ''} ({sqft.toFixed(1)} sq ft)
                    </p>
                    <p className="text-xs text-gray-500 text-center mt-1 font-medium">Your design will be printed based on this preview</p>
                    <div className="mt-2 p-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-green-800 truncate">{uploadedFile.name}</span>
                      </div>
                      <button onClick={() => { setUploadedFile(null); setImgPos({ x: 0, y: 0 }); setImgScale(1); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-green-100 text-gray-500 hover:text-gray-700 transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
                {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
                <p className="text-xs text-gray-400 mt-2 text-center">Every file reviewed by a real designer before printing.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                    <Minus className="h-4 w-4 text-gray-600" />
                  </button>
                  <input type="number" min={1} max={999} value={quantity} onChange={e => setQuantity(Math.max(1, +e.target.value || 1))} className="w-20 border rounded-xl px-3 py-1.5 text-base text-center" />
                  <button onClick={() => setQuantity(q => Math.min(999, q + 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                    <Plus className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
                {quantityDiscountRate > 0 && (
                  <p className="text-xs text-green-600 font-medium mt-1.5">
                    🎉 {Math.round(quantityDiscountRate * 100)}% bulk discount applied at checkout
                  </p>
                )}
                {quantity === 1 && (
                  <p className="text-xs text-gray-400 mt-1.5">Order 2+ for up to 13% off</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Finishing Options</label>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-gray-600">Grommets</span>
                    <select value={grommets} onChange={e => setGrommets(e.target.value)} className="w-full border rounded-xl px-3 py-1.5 text-base mt-1 bg-white">
                      {DESIGN_GROMMET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600">Pole Pockets</span>
                    <select value={polePockets} onChange={e => setPolePockets(e.target.value)} className="w-full border rounded-xl px-3 py-1.5 text-base mt-1 bg-white">
                      <option value="none">None</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="top-bottom">Top &amp; Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={addRope} onChange={e => setAddRope(e.target.checked)} className="accent-orange-500" /> Rope
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={hemming} onChange={e => setHemming(e.target.checked)} className="accent-orange-500" /> Hemming (included)
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl p-6 text-center" style={{ background: "#F7F8FA", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <p className="text-sm text-gray-500 mb-1">Your Price</p>
                {promoApplied ? (
                  <>
                    <p className="text-2xl text-gray-400 line-through leading-tight">{usd(totals.materialTotal)}</p>
                    <p className="text-5xl font-extrabold text-green-600 leading-tight">{usd(discountedTotal)}</p>
                    <p className="text-sm text-green-600 font-semibold mt-1">You save {usd(totals.materialTotal - discountedTotal)}!</p>
                  </>
                ) : (
                  <p className="text-5xl font-extrabold text-gray-900 leading-tight">{usd(totals.materialTotal)}</p>
                )}
                <p className="text-base text-green-600 font-semibold mt-2">FREE Next-Day Air Included</p>
                <p className="text-sm text-gray-500 mt-1">Printed within 24 hours.</p>
                <p className="text-sm text-gray-500 mt-1">{usd(pricePerSqFt)}/sq ft</p>

                <div className="text-left text-sm text-gray-600 space-y-1 mt-4 mb-2">
                  <p><strong>Size:</strong> {widthDisplay} × {heightDisplay} ({sqft.toFixed(1)} sq ft)</p>
                  <p><strong>Material:</strong> {materialLabel}</p>
                  <p><strong>Quantity:</strong> {quantity}</p>
                  <p><strong>Grommets:</strong> {grommetsLabel}</p>
                  {polePockets !== 'none' && <p><strong>Pole Pockets:</strong> {polePockets}</p>}
                  {addRope && <p><strong>Rope:</strong> Included</p>}
                </div>

                {/* Promo Code */}
                <div className="mt-3 mb-2">
                  {!promoApplied ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Promo Code"
                        className="flex-1 border rounded-xl px-3 py-2 text-base"
                      />
                      <button onClick={handlePromoApply} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium">
                        Apply
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        {promoCode} — 20% off
                      </span>
                      <button
                        onClick={() => { setPromoApplied(false); setPromoCode(''); sessionStorage.removeItem('pendingPromoCode'); }}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-3">Tax calculated at checkout</p>
              </div>

              <button onClick={handleCheckout} disabled={!uploadedFile} className={`group w-full font-bold text-lg py-5 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 ${uploadedFile ? 'bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white cursor-pointer shadow-orange-500/30' : 'bg-orange-300 text-white/80 cursor-not-allowed'}`}>
                Checkout
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
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

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-40 overflow-x-clip" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Total</p>
            {isYardSign && yardSignPricing ? (
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
            )}
          </div>
          <button
            onClick={mobileCtaAction}
            disabled={!showEntryCta && isBuilderInView && !mobileCheckoutReady}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl disabled:bg-orange-300 disabled:cursor-not-allowed"
          >
            {mobileCtaLabel}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && uploadedFile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col modal-dvh-fix">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Live Banner Preview</h3>
                <p className="text-xs text-gray-400">Final print preview — what you see is what you get</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1"><Move className="w-4 h-4" /> Drag to reposition · Pinch or use buttons to zoom</p>
              <div className="rounded-lg p-4" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
                <div
                  className="relative w-full rounded-sm select-none overflow-hidden transition-all duration-300 ease-out"
                  style={{
                    aspectRatio: `${widthIn || 96} / ${heightIn || 48}`,
                    cursor: isDraggingPreview ? "grabbing" : "grab",
                    touchAction: "none",
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
                >
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{ transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})` }}
                  >
                    <img
                      src={uploadedFile.thumbnailUrl || uploadedFile.url}
                      alt="Banner preview"
                      className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                      draggable={false}
                    />
                    {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
                      <div
                        key={corner}
                        role="slider"
                        aria-label={`Resize from ${corner} corner`}
                        tabIndex={0}
                        onMouseDown={onCornerMouseDown}
                        className="absolute w-7 h-7 sm:w-5 sm:h-5 bg-white border-2 border-orange-500 rounded-sm z-20 hover:bg-orange-50 pointer-events-auto shadow-md"
                        style={{
                          top: corner.includes('top') ? 0 : 'auto',
                          bottom: corner.includes('bottom') ? 0 : 'auto',
                          left: corner.includes('left') ? 0 : 'auto',
                          right: corner.includes('right') ? 0 : 'auto',
                          transform: `translate(${corner.includes('left') ? '-50%' : '50%'}, ${corner.includes('top') ? '-50%' : '50%'})`,
                          cursor: corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
                        }}
                      />
                    ))}
                  </div>
                  {grommets !== "none" && calcGrommetPts(widthIn, heightIn, grommets).map((pos, idx) => {
                    const leftPct = (pos.x / widthIn) * 100;
                    const topPct = (pos.y / heightIn) * 100;
                    const dotSize = Math.max(6, Math.min(12, 200 / Math.max(widthIn, heightIn)));
                    return (
                      <div key={`grommet-preview-${idx}`} className="absolute rounded-full pointer-events-none" style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${dotSize}px`, height: `${dotSize}px`, transform: "translate(-50%, -50%)", background: 'radial-gradient(circle at 40% 35%, #d1d5db, #6b7280)', border: '1px solid #9ca3af', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25), 0 0.5px 1px rgba(0,0,0,0.15)', zIndex: 10 }}>
                        <div className="absolute rounded-full" style={{ left: "50%", top: "50%", width: "45%", height: "45%", transform: "translate(-50%, -50%)", background: '#374151', border: '0.5px solid #4b5563' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                Size: {widthFt} ft{widthInR > 0 ? ` ${widthInR} in` : ''} × {heightFt} ft{heightInR > 0 ? ` ${heightInR} in` : ''} ({sqft.toFixed(1)} sq ft)
              </p>
              <div className="flex items-center justify-center mt-3">
                <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm border border-gray-200/60">
                  <button onClick={() => setImgScale(s => Math.max(0.5, s - 0.1))} className="p-2 sm:p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom out"><ZoomOut className="w-5 h-5 text-gray-600" /></button>
                  <span className="text-sm font-medium text-gray-500 min-w-[3ch] text-center">{Math.round(imgScale * 100)}%</span>
                  <button onClick={() => setImgScale(s => Math.min(3, s + 0.1))} className="p-2 sm:p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom in"><ZoomIn className="w-5 h-5 text-gray-600" /></button>
                  <div className="w-px h-4 bg-gray-200" />
                  <button onClick={() => { setImgPos({ x: 0, y: 0 }); setImgScale(1); }} className="text-sm text-orange-600 hover:text-orange-700 font-medium px-2">Reset</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">Your design will be printed based on this preview</p>
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={() => setShowPreview(false)} className="flex-1 py-3.5 sm:py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleConfirmPosition(imgPos, imgScale)} className="flex-1 py-3.5 sm:py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg">Confirm & Checkout</button>
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
          thumbnailUrl: uploadedFile?.thumbnailUrl || uploadedFile?.url,
          file: uploadedFile ? { name: uploadedFile.name, url: uploadedFile.url } : undefined,
          imagePosition: pendingCheckoutData?.pos,
          imageScale: pendingCheckoutData?.scale,
        } as any}
        thumbnailUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url}
        actionType="checkout"
        isProcessing={isProcessingUpsell}
      />
    </Layout>
  );
};

export default Design;
