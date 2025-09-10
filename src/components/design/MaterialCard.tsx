import React, { useState, useEffect } from 'react';
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

const materials: MaterialOption[] = [
  {
    key: '13oz',
    name: '13oz Vinyl',
    subtitle: 'Standard outdoor vinyl',
    category: 'vinyl',
    imagePath: '/images/materials/13oz.svg'
  },
  {
    key: '15oz',
    name: '15oz Vinyl',
    subtitle: 'Premium outdoor vinyl',
    popular: true,
    category: 'vinyl',
    imagePath: '/images/materials/15oz.svg'
  },
  {
    key: '18oz',
    name: '18oz Vinyl',
    subtitle: 'Heavy-duty vinyl',
    category: 'vinyl',
    imagePath: '/images/materials/18oz.svg'
  },
  {
    key: 'mesh',
    name: 'Mesh Fence Application',
    subtitle: 'Wind-resistant mesh',
    category: 'specialty',
    imagePath: '/images/materials/mesh-vinyl.jpg'
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
    <div key={materialOption.key} className="flex items-center space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg hover:bg-gray-50 transition-colors">
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
              <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
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
                <Badge className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold shadow-lg border-0">
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
      <div className="relative bg-gradient-to-br from-white via-purple-50/30 to-pink-50/20 border border-purple-200/40 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-300/20 to-transparent rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-pink-300/20 to-transparent rounded-full blur-2xl"></div>
        </div>

        {/* Header */}
        <div className="relative bg-gradient-to-r from-purple-600/5 via-pink-600/5 to-red-600/5 px-6 py-5 border-b border-purple-200/30 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 via-pink-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-orange-400 to-red-500 rounded-full shadow-sm animate-pulse"></div>
            </div>
            <div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-gray-900 via-purple-800 to-pink-800 bg-clip-text text-transparent tracking-tight">Material</h3>
              <p className="text-sm text-gray-600 font-medium">Choose your banner material</p>
            </div>
          </div>
        </div>

        <div className="relative p-8">

          <RadioGroup value={material} onValueChange={handleMaterialChange} className="space-y-6">
            {/* VINYL Section */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                VINYL MATERIALS
              </h4>
              <div className="space-y-2">
                {vinylMaterials.map(renderMaterialOption)}
              </div>
            </div>

            {/* SPECIALTY Section */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <div className="w-2 h-2 bg-gradient-to-r from-pink-500 to-red-500 rounded-full"></div>
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
