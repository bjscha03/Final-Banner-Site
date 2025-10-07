import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ArrowRight, Truck, Zap, Package, Palette, DollarSign, Check, Hash, Ruler } from 'lucide-react';
import { MaterialKey } from '@/store/quote';
import { calcTotals, usd, formatArea, PRICE_PER_SQFT, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Lightbox from '@/components/design/Lightbox';

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
    imagePath: `/direct-assets/materials/13oz.svg?v=${CACHE_BUST}`
  },
  {
    key: '15oz',
    name: '15oz Vinyl',
    subtitle: 'Premium outdoor banner',
    popular: true,
    imagePath: `/direct-assets/materials/15oz.svg?v=${CACHE_BUST}`
  },
  {
    key: '18oz',
    name: '18oz Vinyl',
    subtitle: 'Heavy-duty, wind resistant',
    imagePath: `/direct-assets/materials/18oz.svg?v=${CACHE_BUST}`
  },
  {
    key: 'mesh',
    name: 'Mesh Vinyl',
    subtitle: 'Wind-through design',
    imagePath: `/direct-assets/materials/mesh.svg?v=${CACHE_BUST}`
  }
];

const QuickQuote: React.FC = () => {
  const navigate = useNavigate();
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

  // Safe calculation with error handling and feature flag support
  const { totals, showMinOrderAdjustment, minOrderAdjustmentCents } = React.useMemo(() => {
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
          minOrderAdjustmentCents: 0
        };
      }

      // Calculate base totals
      const baseTotals = calcTotals({
        widthIn,
        heightIn,
        qty: quantity,
        material,
        addRope: false,
        polePockets: 'none'
      });

      // Apply feature flag pricing if enabled
      const flags = getFeatureFlags();
      const pricingOptions = getPricingOptions();

      let finalTotals = baseTotals;
      let showMinOrderAdjustment = false;
      let minOrderAdjustmentCents = 0;

      if (flags.freeShipping || flags.minOrderFloor) {
        const items: PricingItem[] = [{ line_total_cents: Math.round(baseTotals.materialTotal * 100) }];
        const featureFlagTotals = computeTotals(items, 0.06, pricingOptions);

        finalTotals = {
          ...baseTotals,
          materialTotal: featureFlagTotals.adjusted_subtotal_cents / 100,
          tax: featureFlagTotals.tax_cents / 100,
          totalWithTax: featureFlagTotals.total_cents / 100
        };

        showMinOrderAdjustment = featureFlagTotals.min_order_adjustment_cents > 0;
        minOrderAdjustmentCents = featureFlagTotals.min_order_adjustment_cents;
      }

      return {
        totals: finalTotals,
        showMinOrderAdjustment,
        minOrderAdjustmentCents
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
        minOrderAdjustmentCents: 0
      };
    }
  }, [widthIn, heightIn, quantity, material]);

  const isValid = widthIn >= 1 && widthIn <= 1000 && heightIn >= 1 && heightIn <= 1000 && quantity >= 1 && quantity <= 999;

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
      material: material
    });

    navigate(`/design?${params.toString()}`);

    // Scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleReset = () => {
    setWidthIn(48);
    setHeightIn(24);
    setQuantity(1);
    setMaterial('13oz');
    setWidthInput('48');
    setHeightInput('24');
    setQuantityInput('1');
    setWidthError('');
    setHeightError('');
    setQuantityError('');
  };

  const selectedMaterial = materials.find(m => m.key === material);

  return (
    <section id="quick-quote" className="py-16 bg-slate-50">
<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Get Your Quote in Seconds
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Professional vinyl banners with free next day air delivery. No hidden fees, no surprises.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-10">
          {/* Left Column - Configuration */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm order-1 lg:order-1">
{/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Ruler className="h-6 w-6 text-white" />
                  </div>
                  </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Choose Size</h3>
                  <p className="text-sm text-gray-600 font-medium">Configure your banner dimensions</p>
                </div>
              </div>
            </div>

            <div className="relative p-8 space-y-8">
              {/* Size Selection */}
              <div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Width (inches)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustWidth(-1);
                      }}
                      disabled={widthIn <= 1}
                      className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Minus className="h-4 w-4 text-blue-600 group-hover:text-blue-700 transition-colors" />
                    </button>
                    <Input
                      id="qq-width"
                      type="number"
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      onBlur={handleWidthBlur}
                      className="flex-1 min-w-[5rem] text-center bg-white border border-slate-300 rounded-md px-4 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
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
                      className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Plus className="h-4 w-4 text-blue-600 group-hover:text-blue-700 transition-colors" />
                    </button>
                  </div>
                  {widthError && (
                    <p className="text-xs text-red-500 mt-2 font-medium">{widthError}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Height (inches)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        adjustHeight(-1);
                      }}
                      disabled={heightIn <= 1}
                      className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Minus className="h-4 w-4 text-blue-600 group-hover:text-blue-700 transition-colors" />
                    </button>
                    <Input
                      type="number"
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      onBlur={handleHeightBlur}
                      className="flex-1 min-w-[5rem] text-center bg-white border border-slate-300 rounded-md px-4 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
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
                      className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <Plus className="h-4 w-4 text-blue-600 group-hover:text-blue-700 transition-colors" />
                    </button>
                  </div>
                  {heightError && (
                    <p className="text-xs text-red-500 mt-2 font-medium">{heightError}</p>
                  )}
                </div>
              </div>

              {/* Size Display */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-center">
                <div className="relative">
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    Total area: <span className="font-bold text-blue-700">{formatArea(totals.area)}</span>
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {widthIn}" × {heightIn}"
                  </p>
                </div>
              </div>
            </div>

            {/* Quantity Selection */}
            <div className="space-y-6">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 -mx-8">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Hash className="h-6 w-6 text-white" />
                  </div>
                  </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Quantity</h3>
                    <p className="text-sm text-gray-600 font-medium">How many banners do you need?</p>
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
                  <Minus className="h-5 w-5 text-green-600 group-hover:text-green-700 transition-colors" />
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
                  <Plus className="h-5 w-5 text-green-600 group-hover:text-green-700 transition-colors" />
                </button>
              </div>
            </div>

            {/* Material Selection */}
            <div className="space-y-6">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 -mx-8">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Palette className="h-6 w-6 text-white" />
                  </div>
                  </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Pick Material</h3>
                    <p className="text-sm text-gray-600 font-medium">Choose your banner material</p>
                  </div>
                </div>
              </div>

              <RadioGroup value={material} onValueChange={(value) => setMaterial(value as MaterialKey)}>
                <div className="space-y-4">
                  {materials.map((materialOption) => (
                    <div key={materialOption.key} className={`relative group p-5 rounded-md border-2 transition-all duration-300 cursor-pointer ${
                      material === materialOption.key
                        ? 'border-orange-500 bg-orange-50 shadow-sm ring-2 ring-orange-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                    }`}>
                      {/* Selection indicator */}
                      <div className="absolute top-4 left-4">
                        <RadioGroupItem value={materialOption.key} id={materialOption.key} className="w-5 h-5" />
                      </div>

                      <div className="flex items-center gap-4 ml-8">
                        {/* Material thumbnail */}
                        <button
                          onClick={(e) => handleThumbnailClick(materialOption, e)}
                          className="relative w-16 h-16 rounded-xl border-2 border-gray-200/60 hover:border-purple-300/60 transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:ring-offset-2 shadow-sm hover:shadow-md group-hover:scale-105"
                          aria-label={`View ${materialOption.name} sample image`}
                          type="button"
                        >
                          {imageErrors.has(materialOption.key) ? (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                              <Palette className="h-6 w-6 text-purple-400" />
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

                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Label htmlFor={materialOption.key} className="text-lg font-bold text-gray-900 cursor-pointer group-hover:text-purple-800 transition-colors">
                              {materialOption.name}
                            </Label>
                            {materialOption.popular && (
                              <div className="relative">
                                <Badge className="text-xs px-3 py-1 rounded-full bg-orange-500 text-white font-semibold shadow-sm border-0">
                                  Popular
                                </Badge>
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full shadow-sm"></div>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 font-medium leading-relaxed">{materialOption.subtitle}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>
            </div>
          </div>


          

          {/* Mobile-only Button Section */}
          <div className="lg:hidden order-2 flex justify-center">
            <div className="w-full max-w-md space-y-4">
              <Button
                onClick={handleStartDesign}
                disabled={!isValid}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                size="lg"
              >
                <div className="relative flex items-center justify-center gap-3">
                  <span>Start My Design</span>
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


          {/* Mobile-only Button Section */}
          <div className="lg:hidden order-2 flex justify-center">
            <div className="w-full max-w-md space-y-4">
              <Button
                onClick={handleStartDesign}
                disabled={!isValid}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-lg font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                size="lg"
              >
                <div className="relative flex items-center justify-center gap-3">
                  <span>Start My Design</span>
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

          {/* Right Column - Price Summary */}
          <div className="hidden lg:block bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm order-3 lg:order-2">
{/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="text-center">
                <div className="inline-flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Your Instant Quote</h3>
                </div>
                <p className="text-sm text-gray-600 font-medium">Professional quality, instant pricing</p>
              </div>
            </div>

            <div className="relative p-8">
              {/* Price Display */}
              <div className="text-center mb-8">
                <div className="relative inline-block">
                  <div className="text-5xl md:text-6xl font-bold text-slate-900 mb-4">
                    {usd(totals.totalWithTax)}
                  </div>
                  </div>

                <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2">
                  <p className="font-bold text-gray-800">{formatArea(totals.area)} • {usd(PRICE_PER_SQFT[material])} per sq ft</p>
                  <p className="text-sm text-gray-600 font-medium">for {quantity} {quantity === 1 ? 'banner' : 'banners'}</p>

                  {/* Price Breakdown */}
                  <div className="mt-3 pt-3 border-t border-green-200/50 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Banner subtotal:</span>
                      <span className="font-semibold text-gray-800">{usd(totals.materialTotal - (showMinOrderAdjustment ? minOrderAdjustmentCents / 100 : 0))}</span>
                    </div>
                    {showMinOrderAdjustment && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Minimum order adjustment:</span>
                        <span className="font-semibold text-gray-800">{usd(minOrderAdjustmentCents / 100)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tax (6%):</span>
                      <span className="font-semibold text-gray-800">{usd(totals.tax)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-green-200/50">
                      <span className="font-bold text-gray-800">Adjusted subtotal:</span>
                      <span className="font-bold text-gray-800">{usd(totals.materialTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-gray-800">Total with tax:</span>
                      <span className="font-bold text-green-700">{usd(totals.totalWithTax)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping & Production Features */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-5 mb-6">
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

              {/* Call-to-Action */}
              <div className="hidden lg:block space-y-4">
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
                            <span>Start My Design</span>
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
