import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ArrowRight, Truck, Zap, Package, Palette, DollarSign, Check, Hash, Ruler, Tag } from 'lucide-react';
import { MaterialKey } from '@/store/quote';
import { usd, formatArea, formatDimensionsInFeet, PRICE_PER_SQFT, getFeatureFlags, getPricingOptions } from '@/lib/pricing';
import { getAllDiscountTiers } from '@/lib/quantity-discount';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import {
  calcYardSignPricing,
  validateYardSignQuantity,
  YARD_SIGN_MAX_QUANTITY,
  YARD_SIGN_SINGLE_SIDED_CENTS,
  YARD_SIGN_DOUBLE_SIDED_CENTS,
  type YardSignSidedness,
} from '@/lib/yard-sign-pricing';
import {
  CAR_MAGNET_SIZES,
  CAR_MAGNET_ROUNDED_CORNERS,
  calcCarMagnetPricing,
  type CarMagnetRoundedCorner,
} from '@/lib/car-magnet-pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Lightbox from '@/components/design/Lightbox';
import PriceBreakdown from '@/components/pricing/PriceBreakdown';

interface MaterialOption {
  key: MaterialKey;
  name: string;
  subtitle: string;
  popular?: boolean;
  imagePath: string;
}

// Add cache-busting timestamp to force image reload
const CACHE_BUST = "1758606986";

const materials: MaterialOption[] = [
  {
    key: '13oz',
    name: '13oz Vinyl',
    subtitle: 'Standard outdoor banner',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png'
  },
  {
    key: '15oz',
    name: '15oz Vinyl',
    subtitle: 'Premium outdoor banner',
    popular: true,
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png'
  },
  {
    key: '18oz',
    name: '18oz Vinyl',
    subtitle: 'Heavy-duty, wind resistant',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png'
  },
  {
    key: 'mesh',
    name: 'Mesh Vinyl',
    subtitle: 'Wind-through design',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png'
  }
];

// Popular size presets (landscape orientation)
interface SizePreset {
  label: string;
  w: number;
  h: number;
}

const sizePresets: SizePreset[] = [
  { label: "2' × 4'", w: 48, h: 24 },
  { label: "2' × 6'", w: 72, h: 24 },
  { label: "3' × 6'", w: 72, h: 36 },
  { label: "3' × 8'", w: 96, h: 36 },
  { label: "4' × 8'", w: 96, h: 48 },
  { label: "4' × 10'", w: 120, h: 48 },
];

const QuickQuote: React.FC = () => {
  const navigate = useNavigate();
  const [productType, setProductType] = useState<'banner' | 'yard_sign' | 'car_magnet'>('banner');
  const [widthIn, setWidthIn] = useState(48);
  const [heightIn, setHeightIn] = useState(24);
  const [quantity, setQuantity] = useState(1);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt: string;
    title: string;
  } | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  
  const [widthInput, setWidthInput] = useState('48');
  const [heightInput, setHeightInput] = useState('24');
  const [quantityInput, setQuantityInput] = useState('1');
  const [widthError, setWidthError] = useState('');
  const [heightError, setHeightError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [yardSignSidedness, setYardSignSidedness] = useState<YardSignSidedness>('single');
  const [yardSignQuantity, setYardSignQuantity] = useState(10);
  const [yardSignAddStepStakes, setYardSignAddStepStakes] = useState(false);
  const [yardSignStepStakeQuantity, setYardSignStepStakeQuantity] = useState(10);
  const [carMagnetSizeLabel, setCarMagnetSizeLabel] = useState(CAR_MAGNET_SIZES[0].label);
  const [carMagnetQuantity, setCarMagnetQuantity] = useState(1);
  const [carMagnetRoundedCorners, setCarMagnetRoundedCorners] = useState<CarMagnetRoundedCorner>('none');

  // Debounced update for calculations
  useEffect(() => {
    const timer = setTimeout(() => {
      const width = parseFloat(widthInput) || 0;
      const height = parseFloat(heightInput) || 0;
      const qty = parseInt(quantityInput) || 0;

      if (width >= 1 && width <= 1000) {
        setWidthIn(width);
        setWidthError('');
      } else {
        setWidthError('Width must be between 1 and 1000 inches');
      }

      if (height >= 1 && height <= 1000) {
        setHeightIn(height);
        setHeightError('');
      } else {
        setHeightError('Height must be between 1 and 1000 inches');
      }

      if (qty >= 1 && qty <= 999) {
        setQuantity(qty);
        setQuantityError('');
      } else {
        setQuantityError('Quantity must be between 1 and 999');
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [widthInput, heightInput, quantityInput]);

  // Preload images on mount
  useEffect(() => {
    materials.forEach(material => {
      const img = new Image();
      img.onload = () => {
        // Image loaded successfully
      };
      img.onerror = () => {
        setImageErrors(prev => new Set(prev).add(material.key));
      };
      img.src = material.imagePath;
    });
  }, []);

  const handleThumbnailClick = (materialOption: MaterialOption, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLightboxImage({
      src: materialOption.imagePath,
      alt: `${materialOption.name} material sample`,
      title: materialOption.name
    });
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxImage(null);
  };

  const adjustWidth = (delta: number) => {
    const newValue = widthIn + delta;
    if (newValue >= 1 && newValue <= 1000) {
      setWidthIn(newValue);
      setWidthInput(newValue.toString());
      setWidthError('');
    }
  };

  const adjustHeight = (delta: number) => {
    const newValue = heightIn + delta;
    if (newValue >= 1 && newValue <= 1000) {
      setHeightIn(newValue);
      setHeightInput(newValue.toString());
      setHeightError('');
    }
  };

  const setDimensions = (width: number, height: number) => {
    if (width >= 1 && width <= 1000 && height >= 1 && height <= 1000) {
      setWidthIn(width);
      setHeightIn(height);
      setWidthInput(width.toString());
      setHeightInput(height.toString());
      setWidthError('');
      setHeightError('');
    }
  };

  const isActivePreset = (preset: SizePreset): boolean => {
    return widthIn === preset.w && heightIn === preset.h;
  };

  const adjustQuantity = (delta: number) => {
    const newValue = quantity + delta;
    if (newValue >= 1 && newValue <= 999) {
      setQuantity(newValue);
      setQuantityInput(newValue.toString());
      setQuantityError('');
    }
  };

  const handleWidthBlur = () => {
    const num = parseFloat(widthInput);
    if (isNaN(num) || num < 1) {
      setWidthInput('1');
      setWidthIn(1);
    } else if (num > 1000) {
      setWidthInput('1000');
      setWidthIn(1000);
    }
  };

  const handleHeightBlur = () => {
    const num = parseFloat(heightInput);
    if (isNaN(num) || num < 1) {
      setHeightInput('1');
      setHeightIn(1);
    } else if (num > 1000) {
      setHeightInput('1000');
      setHeightIn(1000);
    }
  };

  const handleQuantityBlur = () => {
    const num = parseInt(quantityInput);
    if (isNaN(num) || num < 1) {
      setQuantityInput('1');
      setQuantity(1);
    } else if (num > 999) {
      setQuantityInput('999');
      setQuantity(999);
    }
  };

  // Safe calculation with error handling, feature flag support, and quantity discount
  const { totals, showMinOrderAdjustment, minOrderAdjustmentCents, quantityDiscountCents, quantityDiscountRate } = React.useMemo(() => {
    try {
      // Ensure all values are valid before calculating
      if (widthIn <= 0 || heightIn <= 0 || quantity <= 0) {
        const fallbackTotals = {
          area: 0,
          unit: 0,
          rope: 0,
          polePocket: 0,
          materialTotal: 0,
          tax: 0,
          totalWithTax: 0
        };
        return {
          totals: fallbackTotals,
          showMinOrderAdjustment: false,
          minOrderAdjustmentCents: 0,
          quantityDiscountCents: 0,
          quantityDiscountRate: 0
        };
      }

      const pricing = calculateBannerPricing({
        widthIn,
        heightIn,
        quantity,
        material,
        addRope: false,
        polePockets: 'none',
        grommets: 'none',
      });

      // Apply feature flag pricing if enabled
      const flags = getFeatureFlags();
      const pricingOptions = getPricingOptions();

      let adjustedSubtotalCents = pricing.subtotalCents;
      let showMinOrderAdjustment = false;
      let minOrderAdjustmentCents = 0;
      const quantityDiscountCents = pricing.quantityDiscountCents;
      const quantityDiscountRate = pricing.quantityDiscountRate;

      if (flags.freeShipping || flags.minOrderFloor) {
        adjustedSubtotalCents = Math.max(adjustedSubtotalCents, pricingOptions.minFloorCents || 0);
        minOrderAdjustmentCents = Math.max(0, adjustedSubtotalCents - pricing.subtotalCents);
        showMinOrderAdjustment = minOrderAdjustmentCents > 0;
      }

      const taxCents = Math.round(adjustedSubtotalCents * 0.06);
      const totalCents = adjustedSubtotalCents + taxCents;

      return {
        totals: {
          area: pricing.areaSqFt,
          unit: pricing.unitBasePriceCents / 100,
          rope: 0,
          polePocket: 0,
          materialTotal: adjustedSubtotalCents / 100,
          tax: taxCents / 100,
          totalWithTax: totalCents / 100,
        },
        showMinOrderAdjustment,
        minOrderAdjustmentCents,
        quantityDiscountCents,
        quantityDiscountRate
      };
    } catch (error) {
      console.error('Error calculating totals:', error);
      const fallbackTotals = {
        area: 0,
        unit: 0,
        rope: 0,
        polePocket: 0,
        materialTotal: 0,
        tax: 0,
        totalWithTax: 0
      };
      return {
        totals: fallbackTotals,
        showMinOrderAdjustment: false,
        minOrderAdjustmentCents: 0,
        quantityDiscountCents: 0,
        quantityDiscountRate: 0
      };
    }
  }, [widthIn, heightIn, quantity, material]);

  const isValid = widthIn >= 1 && widthIn <= 1000 && heightIn >= 1 && heightIn <= 1000 && quantity >= 1 && quantity <= 999;
  const yardSignQuote = useMemo(() => calcYardSignPricing(
    yardSignSidedness,
    yardSignQuantity,
    yardSignAddStepStakes,
    yardSignAddStepStakes ? yardSignStepStakeQuantity : 0,
    0,
  ), [yardSignSidedness, yardSignQuantity, yardSignAddStepStakes, yardSignStepStakeQuantity]);
  const yardSignQtyValidation = validateYardSignQuantity(yardSignQuantity);
  const selectedCarMagnetSize = CAR_MAGNET_SIZES.find((size) => size.label === carMagnetSizeLabel) || CAR_MAGNET_SIZES[0];
  const carMagnetQuote = useMemo(() => (
    calcCarMagnetPricing(selectedCarMagnetSize.widthIn, selectedCarMagnetSize.heightIn, carMagnetQuantity)
  ), [selectedCarMagnetSize, carMagnetQuantity]);

  const adjustYardSignQuantity = (delta: number) => {
    const next = Math.max(10, Math.min(YARD_SIGN_MAX_QUANTITY, yardSignQuantity + delta));
    // Yard signs must stay in increments of 10.
    setYardSignQuantity(next - (next % 10));
    if (yardSignAddStepStakes) {
      setYardSignStepStakeQuantity(next - (next % 10));
    }
  };

  const handleStartDesign = () => {
    if (!isValid) return;

    // Store in sessionStorage as backup
    const quickQuoteData = {
      widthIn,
      heightIn,
      quantity,
      material
    };

    sessionStorage.setItem('quickQuote', JSON.stringify(quickQuoteData));

    // Navigate with URL parameters
    const params = new URLSearchParams({
      width: widthIn.toString(),
      height: heightIn.toString(),
      qty: quantity.toString(),
      material: material,
      grommets: 'none',
      polePockets: 'none',
      addRope: '0',
    });

    navigate(`/design?${params.toString()}`);

    // Scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleStartYardSignDesign = () => {
    if (!yardSignQtyValidation.valid) return;

    const quickQuoteData = {
      productType: 'yard_sign',
      size: '24x18',
      printSide: yardSignSidedness,
      quantity: yardSignQuantity,
      material: 'corrugated-plastic',
      stepStakes: yardSignAddStepStakes,
      stepStakeQty: yardSignAddStepStakes ? yardSignStepStakeQuantity : 0,
    };

    sessionStorage.setItem('quickQuote', JSON.stringify(quickQuoteData));

    const params = new URLSearchParams({
      tab: 'yard-sign',
      productType: 'yard-sign',
      size: '24x18',
      printSide: yardSignSidedness,
      qty: yardSignQuantity.toString(),
      material: 'corrugated-plastic',
      stepStakes: yardSignAddStepStakes ? '1' : '0',
      stepStakeQty: yardSignAddStepStakes ? yardSignStepStakeQuantity.toString() : '0',
    });

    navigate(`/design?${params.toString()}`);

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleStartCarMagnetDesign = () => {
    const quickQuoteData = {
      productType: 'car_magnet',
      size: `${selectedCarMagnetSize.widthIn}x${selectedCarMagnetSize.heightIn}`,
      material: 'magnetic',
      quantity: carMagnetQuantity,
      roundedCorners: carMagnetRoundedCorners,
    };
    sessionStorage.setItem('quickQuote', JSON.stringify(quickQuoteData));

    const params = new URLSearchParams({
      product: 'car-magnets',
      size: `${selectedCarMagnetSize.widthIn}x${selectedCarMagnetSize.heightIn}`,
      material: 'magnetic',
      qty: String(carMagnetQuantity),
      // Send both keys during transition so current and legacy readers both receive corners.
      corners: carMagnetRoundedCorners,
      roundedCorners: carMagnetRoundedCorners,
    });
    navigate(`/design?${params.toString()}`);
  };

  const handleReset = () => {
    setWidthIn(60);
    setHeightIn(36);
    setQuantity(1);
    setMaterial('13oz');
    setWidthInput('60');
    setHeightInput('36');
    setQuantityInput('1');
    setWidthError('');
    setHeightError('');
    setQuantityError('');
  };

  const selectedMaterial = materials.find(m => m.key === material);

  return (
    <section id="quick-quote" className="py-8 bg-slate-50">
<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Get Your Quote in Seconds
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {productType === 'banner'
              ? 'Professional vinyl banners with free next day air delivery. No hidden fees, no surprises.'
              : productType === 'yard_sign'
                ? 'Premium yard signs with instant pricing and fast next-business-day shipping.'
                : 'Durable vehicle magnets with fixed sizes and rounded corner options.'}
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setProductType('banner')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                productType === 'banner'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Banner
            </button>
            <button
              type="button"
              onClick={() => setProductType('yard_sign')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                productType === 'yard_sign'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Yard Signs
            </button>
            <button
              type="button"
              onClick={() => setProductType('car_magnet')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                productType === 'car_magnet'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Car Magnets
            </button>
          </div>
        </div>

        {productType === 'banner' ? (
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-8">
          {/* Left Column - Configuration */}
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-lg order-1 lg:order-1" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)' }}>
{/* Header - Choose Size */}
            <div className="px-6 py-5 border-b border-slate-200" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md" style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.4)' }}>
                    <Ruler className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full shadow-sm animate-pulse border-2 border-white"></div>
                  </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Choose Size</h3>
                  <p className="text-sm text-slate-500 font-medium">Configure your banner dimensions</p>
                </div>
              </div>
            </div>

            <div className="relative p-8 space-y-8">
              {/* Size Selection */}
              <div>

                {/* Popular Size Presets */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">
                    Popular sizes (ft)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sizePresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDimensions(preset.w, preset.h);
                        }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          isActivePreset(preset)
                            ? 'bg-orange-500 text-white border-2 border-orange-600 shadow-md'
                            : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-orange-400 hover:bg-orange-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Just focus the width input to indicate custom mode
                        document.getElementById('qq-width')?.focus();
                      }}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-white text-slate-700 border-2 border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all"
                    >
                      Custom
                    </button>
                  </div>
                </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Width (inches)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustWidth(-1);
                      }}
                      disabled={widthIn <= 1}
                      className="h-11 w-11 flex-shrink-0 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Minus className="h-4 w-4 text-blue-600" />
                    </button>
                    <Input
                      id="qq-width"
                      type="number"
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      onBlur={handleWidthBlur}
                      className="flex-1 text-center bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors h-11"
                      min="1"
                      max="1000"
                    />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustWidth(1);
                      }}
                      disabled={widthIn >= 1000}
                      className="h-11 w-11 flex-shrink-0 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Plus className="h-4 w-4 text-blue-600" />
                    </button>
                  </div>
                  {widthError && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{widthError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Height (inches)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustHeight(-1);
                      }}
                      disabled={heightIn <= 1}
                      className="h-11 w-11 flex-shrink-0 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Minus className="h-4 w-4 text-blue-600" />
                    </button>
                    <Input
                      type="number"
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      onBlur={handleHeightBlur}
                      className="flex-1 text-center bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors h-11"
                      min="1"
                      max="1000"
                    />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustHeight(1);
                      }}
                      disabled={heightIn >= 1000}
                      className="h-11 w-11 flex-shrink-0 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Plus className="h-4 w-4 text-blue-600" />
                    </button>
                  </div>
                  {heightError && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{heightError}</p>
                  )}
                </div>
              </div>

              {/* Size Display */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-center">
                <div className="relative">
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    Total area: <span className="font-bold text-blue-700">{formatArea(totals.area)}</span>
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatDimensionsInFeet(widthIn, heightIn)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ({widthIn}" × {heightIn}")
                  </p>
                </div>
              </div>
            </div>

            {/* Quantity Selection */}
            <div className="space-y-6">
              {/* Header */}
              <div className="px-6 py-5 -mx-8 border-t border-slate-200" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md" style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.4)' }}>
                    <Hash className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full shadow-sm animate-pulse border-2 border-white"></div>
                  </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Quantity</h3>
                    <p className="text-sm text-slate-500 font-medium">How many banners do you need?</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    adjustQuantity(-1);
                  }}
                  disabled={quantity <= 1}
                  className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  type="button"
                >
                  <Minus className="h-5 w-5 text-green-600 group-hover:text-[#ff6b35] transition-colors" />
                </button>

                <div className="text-center space-y-2">
                  <Input
                    type="number"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    onBlur={handleQuantityBlur}
                    className="text-center text-xl font-semibold w-20 h-12 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    min="1"
                    max="999"
                  />
                  <div className="text-sm font-medium text-gray-600">
                    {quantity === 1 ? '1 banner' : `${quantity} banners`}
                  </div>
                  {quantityError && (
                    <p className="text-xs text-red-500 font-medium">{quantityError}</p>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    adjustQuantity(1);
                  }}
                  disabled={quantity >= 999}
                  className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  type="button"
                >
                  <Plus className="h-5 w-5 text-green-600 group-hover:text-[#ff6b35] transition-colors" />
                </button>
              </div>
            </div>

            {/* Material Selection */}
            <div className="space-y-6">
              {/* Header */}
              <div className="px-6 py-5 -mx-8 border-t border-slate-200" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md" style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.4)' }}>
                      <Palette className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full shadow-sm animate-pulse border-2 border-white"></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Material</h3>
                    <p className="text-sm text-slate-500 font-medium">Choose your banner material</p>
                  </div>
                </div>
              </div>

              <RadioGroup value={material} onValueChange={(value) => setMaterial(value as MaterialKey)}>
                <div className="space-y-2">
                  {materials.map((materialOption) => (
                    <div key={materialOption.key} className={`flex items-center space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg transition-colors border-2 ${
                      material === materialOption.key
                        ? "border-orange-500 bg-orange-50"
                        : "border-transparent hover:bg-gray-50"
                    }`}>
                      <RadioGroupItem value={materialOption.key} id={materialOption.key} />
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {/* Clickable thumbnail */}
                          <button
                            onClick={(e) => handleThumbnailClick(materialOption, e)}
                            className="w-14 h-14 rounded border-2 border-gray-200 hover:border-gray-300 transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label={`View ${materialOption.name} sample image`}
                            type="button"
                          >
                            {imageErrors.has(materialOption.key) ? (
                              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                <Palette className="h-6 w-6 text-gray-400" />
                              </div>
                            ) : (
                              <img
                                src={materialOption.imagePath}
                                alt={`${materialOption.name} material sample`}
                                className="w-full h-full object-cover"
                                onError={() => {
                                  setImageErrors(prev => new Set(prev).add(materialOption.key));
                                }}
                              />
                            )}
                          </button>
                          <div>
                            <div className="flex items-center space-x-2">
                              <Label htmlFor={materialOption.key} className="font-medium text-gray-900 cursor-pointer">
                                {materialOption.name}
                              </Label>
                              {materialOption.popular && (
                                <Badge className="text-xs px-3 py-1 rounded-full bg-orange-500 text-white font-bold shadow-sm border-0">
                                  Popular
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{materialOption.subtitle}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">
                            ${PRICE_PER_SQFT[materialOption.key].toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">per sq ft</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>
            </div>
          </div>


          


          {/* Right Column - Price Summary */}
          <div className="order-3 lg:order-2">
            <PriceBreakdown
              showHeader
              heading="Your Instant Quote"
              subheading="Professional quality, instant pricing"
              topLine={`${formatArea(totals.area)} • ${usd(PRICE_PER_SQFT[material])} per sq ft`}
              secondaryLine={`for ${quantity} ${quantity === 1 ? 'banner' : 'banners'}`}
              baseSubtotalCents={Math.round(
                (totals.materialTotal + quantityDiscountCents / 100) * 100,
              ) - (showMinOrderAdjustment ? minOrderAdjustmentCents : 0)}
              baseSubtotalLabel="Banner subtotal"
              quantityDiscountCents={quantityDiscountCents}
              quantityDiscountRate={quantityDiscountRate}
              minOrderAdjustmentCents={showMinOrderAdjustment ? minOrderAdjustmentCents : 0}
              taxCents={Math.round(totals.tax * 100)}
              taxRate={0.06}
              adjustedSubtotalCents={Math.round(totals.materialTotal * 100)}
              totalCents={Math.round(totals.totalWithTax * 100)}
            />

            {/* Buy More, Save More! Tier Table + extras kept under the breakdown */}
            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden mt-6" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="relative p-8" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)' }}>
                {/* Buy More, Save More! Tier Table */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-4 w-4 text-green-600" />
                    <span className="font-bold text-green-800 text-sm">Buy More, Save More!</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center text-xs">
                    {getAllDiscountTiers().map((tier) => (
                      <div
                        key={tier.minQuantity}
                        className={`p-1.5 rounded ${
                          quantity >= tier.minQuantity &&
                          (tier.minQuantity === 5 || quantity < (getAllDiscountTiers().find(t => t.minQuantity > tier.minQuantity)?.minQuantity || 999))
                            ? 'bg-green-200 border border-green-400'
                            : 'bg-white border border-green-100'
                        }`}
                      >
                        <div className="font-semibold text-gray-700">
                          {tier.minQuantity === 5 ? '5+' : tier.minQuantity}
                        </div>
                        <div className={`font-bold ${tier.discountRate > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {tier.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              {/* Shipping & Production Features */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-5 mb-6 mt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 group">
                    <Zap className="h-8 w-8 text-slate-600" />
                    <span className="font-bold text-blue-800 text-lg">24 Hour Production</span>
                  </div>

                  <div className="flex items-center gap-4 group">
                    <Package className="h-8 w-8 text-slate-600" />
                    <span className="font-bold text-purple-800 text-lg">Free Next Day Air Shipping</span>
                  </div>
                </div>
              </div>

              {/* What's Included */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-slate-900 mb-3">What's included:</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 group">
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-gray-800 font-medium">
                      Professional printing on {selectedMaterial?.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 group">
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-gray-800 font-medium">Grommets every 24 inches</span>
                  </div>

                  <div className="flex items-center gap-3 group">
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-gray-800 font-medium">Weather-resistant materials</span>
                  </div>
                </div>
              </div>
              {/* Mobile-only Button Section */}
              <div className="lg:hidden flex justify-center">
                <div className="w-full max-w-md space-y-4">
                  {/* Free Shipping Reinforcement */}
                  <p className="text-center text-sm text-[#ff6b35] font-medium flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Includes FREE Next-Day Air Shipping
                  </p>
                  <Button
                    onClick={handleStartDesign}
                    disabled={!isValid}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                    size="lg"
                  >
                    <div className="relative flex items-center justify-center gap-3">
                      <span>Upload or Create Your Banner</span>
                      <ArrowRight className="h-6 w-6" />
                    </div>
                  </Button>

                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="w-full border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors py-3 font-semibold rounded-md"
                    size="sm"
                  >
                    Reset to Defaults
                  </Button>

                  {isValid && (
                    <p className="text-center text-sm text-gray-600 font-medium">
                      Continue with your selections
                    </p>
                  )}
                </div>
              </div>







              {/* Call-to-Action */}
              <div className="hidden lg:block space-y-4">
                {/* Free Shipping Reinforcement */}
                <p className="text-center text-sm text-[#ff6b35] font-medium flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Includes FREE Next-Day Air Shipping
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          onClick={handleStartDesign}
                          disabled={!isValid}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                          size="lg"
                        >
                          <div className="relative flex items-center justify-center gap-3">
                            <span>Upload or Create Your Banner</span>
                            <ArrowRight className="h-6 w-6 transition-transform duration-300 group-hover:translate-x-2" />
                          </div>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!isValid && (
                      <TooltipContent>
                        <p>Please enter valid dimensions (1-1000 inches) to continue</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                {/* Reset Button */}
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors py-3 font-semibold rounded-md"
                  size="sm"
                >
                  Reset to Defaults
                </Button>

                {isValid && (
                  <p className="text-center text-sm text-gray-600 font-medium">
                    Continue with your selections
                  </p>
                )}
              </div>
            </div>
          </div>
          </div>


        </div>
        ) : productType === 'yard_sign' ? (
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-8">
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-lg order-1 lg:order-1" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="px-6 py-5 border-b border-slate-200" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md" style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.4)' }}>
                    <Ruler className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full shadow-sm animate-pulse border-2 border-white"></div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Yard Sign Options</h3>
                  <p className="text-sm text-slate-500 font-medium">24&quot; × 18&quot; Corrugated Plastic</p>
                </div>
              </div>
            </div>

            <div className="relative p-8 space-y-8">
              <div>
                <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Print Side</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setYardSignSidedness('single')}
                    className={`border rounded-xl py-3 px-4 text-left transition-all ${
                      yardSignSidedness === 'single'
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${yardSignSidedness === 'single' ? 'text-orange-700' : 'text-gray-800'}`}>
                      Single-Sided
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{usd(YARD_SIGN_SINGLE_SIDED_CENTS / 100)}/sign</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setYardSignSidedness('double')}
                    className={`border rounded-xl py-3 px-4 text-left transition-all ${
                      yardSignSidedness === 'double'
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${yardSignSidedness === 'double' ? 'text-orange-700' : 'text-gray-800'}`}>
                      Double-Sided
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{usd(YARD_SIGN_DOUBLE_SIDED_CENTS / 100)}/sign</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Quantity</label>
                <div className="flex items-center justify-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => adjustYardSignQuantity(-10)}
                    disabled={yardSignQuantity <= 10}
                    className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Minus className="h-5 w-5 text-green-600" />
                  </button>
                  <div className="text-2xl font-bold text-slate-900 min-w-[4ch] text-center">{yardSignQuantity}</div>
                  <button
                    type="button"
                    onClick={() => adjustYardSignQuantity(10)}
                    disabled={yardSignQuantity >= YARD_SIGN_MAX_QUANTITY}
                    className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Plus className="h-5 w-5 text-green-600" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => {
                        setYardSignQuantity(qty);
                        if (yardSignAddStepStakes) {
                          setYardSignStepStakeQuantity(qty);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        yardSignQuantity === qty
                          ? 'bg-orange-500 text-white border-2 border-orange-600'
                          : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-orange-400 hover:bg-orange-50'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Material</label>
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <p className="font-semibold text-gray-800">Corrugated Plastic</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Optional Add-on</label>
                <div className={`border rounded-xl p-4 transition-all ${yardSignAddStepStakes ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-400'}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={yardSignAddStepStakes}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setYardSignAddStepStakes(enabled);
                        if (enabled) {
                          setYardSignStepStakeQuantity(yardSignQuantity);
                        }
                      }}
                      className="mt-1 accent-orange-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">Step Stakes</p>
                      <p className="text-xs text-gray-500">$1.50 each</p>
                    </div>
                  </label>
                  {yardSignAddStepStakes && (
                    <div className="mt-3 ml-7">
                      <label className="block text-xs font-semibold text-gray-600 mb-2">Step Stake Quantity</label>
                      <input
                        type="number"
                        min={1}
                        max={YARD_SIGN_MAX_QUANTITY}
                        value={yardSignStepStakeQuantity}
                        onChange={(e) => setYardSignStepStakeQuantity(Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, Number(e.target.value) || 1)))}
                        className="w-24 border rounded-lg px-2 py-1 text-sm text-center bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="order-3 lg:order-2">
            <PriceBreakdown
              showHeader
              heading="Your Instant Quote"
              subheading="Professional quality, instant pricing"
              topLine={`24" × 18" Yard Signs • ${usd(yardSignQuote.unitPriceCents / 100)}/sign`}
              secondaryLine={`for ${yardSignQuantity} ${yardSignQuantity === 1 ? 'sign' : 'signs'}${yardSignAddStepStakes ? ` + ${yardSignStepStakeQuantity} step ${yardSignStepStakeQuantity === 1 ? 'stake' : 'stakes'}` : ''}`}
              detailRows={[
                { label: 'Print', value: yardSignSidedness === 'double' ? 'Double-Sided' : 'Single-Sided' },
                { label: 'Material', value: 'Corrugated Plastic' },
              ]}
              baseSubtotalCents={yardSignQuote.signSubtotalCents}
              baseSubtotalLabel="Signs subtotal"
              addOns={
                yardSignAddStepStakes
                  ? [{ label: `Step stakes (×${yardSignStepStakeQuantity})`, amountCents: yardSignQuote.stepStakeTotalCents }]
                  : []
              }
              taxCents={yardSignQuote.taxCents}
              taxRate={yardSignQuote.taxRate}
              adjustedSubtotalCents={yardSignQuote.totalCents}
              totalCents={yardSignQuote.totalWithTaxCents}
              footerNote="Tax calculated at checkout"
            />

            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden mt-6" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="relative p-8" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)' }}>
              <div className="bg-slate-50 border border-slate-200 rounded-md p-5 mb-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Zap className="h-8 w-8 text-slate-600" />
                    <span className="font-bold text-blue-800 text-lg">24 Hour Production</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Package className="h-8 w-8 text-slate-600" />
                    <span className="font-bold text-purple-800 text-lg">Free Next Day Air Shipping</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {!yardSignQtyValidation.valid && (
                  <p className="text-center text-sm text-red-600 font-medium">{yardSignQtyValidation.message}</p>
                )}
                <Button
                  onClick={handleStartYardSignDesign}
                  disabled={!yardSignQtyValidation.valid}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                  size="lg"
                >
                  <div className="relative flex items-center justify-center gap-3">
                    <span>Continue with Yard Signs</span>
                    <ArrowRight className="h-6 w-6" />
                  </div>
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-8">
            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-lg order-1 lg:order-1" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="px-6 py-5 border-b border-slate-200" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                <h3 className="text-lg font-bold text-slate-900">Car Magnet Options</h3>
                <p className="text-sm text-slate-500 font-medium">Fixed sizes only</p>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Size</label>
                  <div className="grid grid-cols-2 gap-3">
                    {CAR_MAGNET_SIZES.map((size) => (
                      <button
                        key={size.label}
                        type="button"
                        onClick={() => setCarMagnetSizeLabel(size.label)}
                        className={`border rounded-xl py-3 px-4 text-sm text-left transition-all ${
                          carMagnetSizeLabel === size.label
                            ? 'border-orange-500 bg-orange-50 shadow-sm text-orange-700'
                            : 'border-gray-200 hover:border-gray-400 text-gray-800'
                        }`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Quantity</label>
                  <div className="flex items-center justify-center gap-3">
                    <button type="button" onClick={() => setCarMagnetQuantity((q) => Math.max(1, q - 1))} className="h-10 w-10 bg-white border border-slate-300 rounded-md flex items-center justify-center">
                      <Minus className="h-5 w-5 text-green-600" />
                    </button>
                    <div className="text-2xl font-bold text-slate-900 min-w-[4ch] text-center">{carMagnetQuantity}</div>
                    <button type="button" onClick={() => setCarMagnetQuantity((q) => Math.min(999, q + 1))} className="h-10 w-10 bg-white border border-slate-300 rounded-md flex items-center justify-center">
                      <Plus className="h-5 w-5 text-green-600" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide mb-3">Rounded Corners</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CAR_MAGNET_ROUNDED_CORNERS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCarMagnetRoundedCorners(option.value)}
                        className={`border rounded-xl py-2 px-2 text-sm transition-all ${
                          carMagnetRoundedCorners === option.value
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-200 hover:border-gray-400 text-gray-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="order-3 lg:order-2">
              <PriceBreakdown
                showHeader
                heading="Your Instant Quote"
                subheading="Professional quality, instant pricing"
                topLine={`${selectedCarMagnetSize.label} Car Magnets • ${usd(carMagnetQuote.unitPriceCents / 100)}/magnet`}
                secondaryLine={`for ${carMagnetQuantity} ${carMagnetQuantity === 1 ? 'magnet' : 'magnets'}`}
                detailRows={[
                  { label: 'Material', value: 'Premium Magnetic Material' },
                  { label: 'Print', value: 'Single-Sided' },
                  { label: 'Rounded Corners', value: CAR_MAGNET_ROUNDED_CORNERS.find((x) => x.value === carMagnetRoundedCorners)?.label || 'None' },
                ]}
                baseSubtotalCents={carMagnetQuote.baseSubtotalCents}
                baseSubtotalLabel="Base price"
                quantityDiscountCents={carMagnetQuote.quantityDiscountCents}
                quantityDiscountRate={carMagnetQuote.quantityDiscountRate}
                taxCents={carMagnetQuote.taxCents}
                taxRate={0.06}
                adjustedSubtotalCents={carMagnetQuote.subtotalCents}
                totalCents={carMagnetQuote.totalCents}
                footerNote="Tax calculated at checkout"
              />
              <div className="mt-6">
                <Button
                  onClick={handleStartCarMagnetDesign}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold rounded-md"
                  size="lg"
                >
                  <div className="relative flex items-center justify-center gap-3">
                    <span>Continue with Car Magnets</span>
                    <ArrowRight className="h-6 w-6" />
                  </div>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <Lightbox
          isOpen={lightboxOpen}
          onClose={closeLightbox}
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          title={lightboxImage.title}
        />
      )}
    </section>
  );
};

export default QuickQuote;
