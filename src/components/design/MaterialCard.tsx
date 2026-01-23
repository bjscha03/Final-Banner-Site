import React, { useState, useEffect } from 'react';
import { trackMaterialSelected } from '@/lib/analytics';
import { Palette } from 'lucide-react';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { PRICE_PER_SQFT } from '@/lib/pricing';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Lightbox from './Lightbox';

interface MaterialOption {
  key: MaterialKey;
  name: string;
  subtitle: string;
  popular?: boolean;
  category: 'vinyl' | 'specialty';
  imagePath: string;
}

// Add cache-busting timestamp to force image reload
const CACHE_BUST = "1758606986";

const materials: MaterialOption[] = [
  {
    key: '13oz',
    name: '13oz Vinyl',
    subtitle: 'Standard outdoor vinyl',
    category: 'vinyl',
    imagePath: `/direct-assets/materials/13oz.svg?v=${CACHE_BUST}`
  },
  {
    key: '15oz',
    name: '15oz Vinyl',
    subtitle: 'Premium outdoor vinyl',
    popular: true,
    category: 'vinyl',
    imagePath: `/direct-assets/materials/15oz.svg?v=${CACHE_BUST}`
  },
  {
    key: '18oz',
    name: '18oz Vinyl',
    subtitle: 'Heavy-duty vinyl',
    category: 'vinyl',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1762035586/unnamed-2_ucrvav.jpg'
  },
  {
    key: 'mesh',
    name: 'Mesh Fence Application',
    subtitle: 'Wind-resistant mesh',
    category: 'specialty',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209380/White-label_Outdoor_Mesh_Banner_1_Product_from_4over_ivkbqu.png'
  }
];

const MaterialCard: React.FC = () => {
  const { material, set } = useQuoteStore();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt: string;
    title: string;
  } | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const vinylMaterials = materials.filter(m => m.category === 'vinyl');
  const specialtyMaterials = materials.filter(m => m.category === 'specialty');

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

  const handleMaterialChange = (value: string) => {
    set({ material: value as MaterialKey });
    trackMaterialSelected(value);
  };

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

  const renderMaterialOption = (materialOption: MaterialOption) => (
    <div key={materialOption.key} className={`flex items-center space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg transition-colors border-2 ${material === materialOption.key ? "border-orange-500 bg-orange-50" : "border-transparent hover:bg-gray-50"}`}>
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
              // Fallback placeholder if image fails to load
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
  );

  return (
    <>
      <div className="relative bg-white border border-purple-200/40 rounded-lg overflow-hidden shadow-sm backdrop-blur-sm">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
        </div>

        {/* Header */}
        <div className="relative bg-slate-50 px-6 py-4 border-b border-slate-200 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full shadow-sm animate-pulse"></div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Material</h3>
              <p className="text-sm text-gray-600 font-medium">Choose your banner material</p>
            </div>
          </div>
        </div>

        <div className="relative p-6">

          <RadioGroup value={material} onValueChange={handleMaterialChange} className="space-y-6">
            {/* VINYL Section */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                VINYL MATERIALS
              </h4>
              <div className="space-y-2">
                {vinylMaterials.map(renderMaterialOption)}
              </div>
            </div>

            {/* SPECIALTY Section */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                SPECIALTY MATERIALS
              </h4>
              <div className="space-y-2">
                {specialtyMaterials.map(renderMaterialOption)}
              </div>
            </div>
          </RadioGroup>
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
    </>
  );
};

export default MaterialCard;
