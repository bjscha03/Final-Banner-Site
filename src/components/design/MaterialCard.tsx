import React, { useState, useEffect } from 'react';
import { trackMaterialSelected } from '@/lib/analytics';
import { Palette, ZoomIn, Check } from 'lucide-react';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { PRICE_PER_SQFT } from '@/lib/pricing';
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
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png'
  },
  {
    key: '15oz',
    name: '15oz Vinyl',
    subtitle: 'Premium outdoor vinyl',
    popular: true,
    category: 'vinyl',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209584/White-label_Outdoor_Banner_1_Product_from_4over_aas332.png'
  },
  {
    key: '18oz',
    name: '18oz Vinyl',
    subtitle: 'Heavy-duty vinyl',
    category: 'vinyl',
    imagePath: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1769209691/White-label_Outdoor_Banner_3_Product_from_4over_vfdbxc.png'
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

  const renderMaterialOption = (materialOption: MaterialOption) => {
    const isSelected = material === materialOption.key;

    return (
      <div
        key={materialOption.key}
        onClick={() => handleMaterialChange(materialOption.key)}
        className={`relative cursor-pointer rounded-xl transition-all duration-200 overflow-hidden ${
          isSelected
            ? "ring-2 ring-orange-500 bg-orange-50 shadow-md"
            : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
        }`}
      >
        <div className="flex items-center p-3 gap-3">
          {/* Selection indicator */}
          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected
              ? "border-orange-500 bg-orange-500"
              : "border-gray-300 bg-white"
          }`}>
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>

          {/* Clickable thumbnail with zoom indicator */}
          <button
            onClick={(e) => handleThumbnailClick(materialOption, e)}
            className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label={`Click to enlarge ${materialOption.name} sample image`}
            type="button"
          >
            {imageErrors.has(materialOption.key) ? (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                <Palette className="h-6 w-6 text-gray-400" />
              </div>
            ) : (
              <>
                <img
                  src={materialOption.imagePath}
                  alt={`${materialOption.name} material sample`}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                  onError={() => {
                    setImageErrors(prev => new Set(prev).add(materialOption.key));
                  }}
                />
                {/* Zoom overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                  <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </div>
              </>
            )}
          </button>

          {/* Material info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Label
                htmlFor={materialOption.key}
                className={`font-semibold cursor-pointer ${isSelected ? 'text-orange-900' : 'text-gray-900'}`}
              >
                {materialOption.name}
              </Label>
              {materialOption.popular && (
                <Badge className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold shadow-sm border-0">
                  Popular
                </Badge>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${isSelected ? 'text-orange-700' : 'text-gray-500'}`}>
              {materialOption.subtitle}
            </p>
          </div>

          {/* Price */}
          <div className="flex-shrink-0 text-right">
            <p className={`text-base font-bold ${isSelected ? 'text-orange-600' : 'text-green-600'}`}>
              ${PRICE_PER_SQFT[materialOption.key].toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-500">per sq ft</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-5">
        {/* Hint text */}
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <ZoomIn className="w-3.5 h-3.5" />
          Click any image to enlarge
        </p>

        {/* VINYL Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-orange-500 rounded-full"></div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Vinyl Materials
            </h4>
          </div>
          <div className="space-y-2">
            {vinylMaterials.map(renderMaterialOption)}
          </div>
        </div>

        {/* SPECIALTY Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Specialty Materials
            </h4>
          </div>
          <div className="space-y-2">
            {specialtyMaterials.map(renderMaterialOption)}
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
    </>
  );
};

export default MaterialCard;
