/**
 * AIImageSelector Component
 * 
 * Grid display of AI-generated images with selection and application
 */

import React, { useState } from 'react';
import { Check, Loader2, Sparkles, Crown, Bookmark } from 'lucide-react';
import { Button } from '../ui/button';

interface AIImageSelectorProps {
  images: string[];
  tier: 'premium' | 'standard';
  cached: boolean;
  onSelect: (imageUrl: string) => void;
  onApply?: (imageUrl: string) => void;
  userId?: string;
  prompt?: string;
  aspect?: string;
  generationId?: string;
  className?: string;
}

export const AIImageSelector: React.FC<AIImageSelectorProps> = ({
  images,
  tier,
  cached,
  onSelect,
  onApply,
  userId,
  prompt,
  aspect,
  generationId,
  className = '',
}) => {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({});
  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});

  const handleSaveImage = async (imageUrl: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent image selection
    
    if (!userId) {
      alert('Please sign in to save images');
      return;
    }

    try {
      setSavingStates(prev => ({ ...prev, [imageUrl]: true }));
      
      const response = await fetch('/.netlify/functions/save-ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          imageUrl,
          prompt,
          aspect,
          tier,
          generationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSavedStates(prev => ({ ...prev, [imageUrl]: true }));
      
      // Show success for 2 seconds
      setTimeout(() => {
        setSavedStates(prev => ({ ...prev, [imageUrl]: false }));
      }, 2000);
    } catch (error) {
      console.error('[AIImageSelector] Error saving image:', error);
      alert('Failed to save image');
    } finally {
      setSavingStates(prev => ({ ...prev, [imageUrl]: false }));
    }
  };
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({});
  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});

  const handleSaveImage = async (imageUrl: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent image selection
    
    if (!userId) {
      alert('Please sign in to save images');
      return;
    }

    try {
      setSavingStates(prev => ({ ...prev, [imageUrl]: true }));
      
      const response = await fetch('/.netlify/functions/save-ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          imageUrl,
          prompt,
          aspect,
          tier,
          generationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSavedStates(prev => ({ ...prev, [imageUrl]: true }));
      
      // Show success for 2 seconds
      setTimeout(() => {
        setSavedStates(prev => ({ ...prev, [imageUrl]: false }));
      }, 2000);
    } catch (error) {
      console.error('[AIImageSelector] Error saving image:', error);
      alert('Failed to save image');
    } finally {
      setSavingStates(prev => ({ ...prev, [imageUrl]: false }));
    }
  };

  const handleImageClick = (url: string) => {
    setSelectedUrl(url);
    onSelect(url);
  };

  const handleApply = () => {
    if (selectedUrl && onApply) {
      onApply(selectedUrl);
    }
  };

  const handleImageLoad = (url: string) => {
    setLoadingStates(prev => ({ ...prev, [url]: false }));
  };

  const handleImageLoadStart = (url: string) => {
    setLoadingStates(prev => ({ ...prev, [url]: true }));
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header with Tier Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            {images.length} {images.length === 1 ? 'Image' : 'Images'} Generated
          </h3>
          
          {/* Tier Badge */}
          {tier === 'premium' ? (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs font-medium rounded-full">
              <Crown className="w-3 h-3" />
              <span>Premium</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              <Sparkles className="w-3 h-3" />
              <span>Standard</span>
            </div>
          )}

          {/* Cached Badge */}
          {cached && (
            <div className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              ⚡ Cached
            </div>
          )}
        </div>
      </div>

      {/* Image Grid */}
      <div className={`grid gap-3 ${
        images.length === 1 ? 'grid-cols-1' : 
        images.length === 2 ? 'grid-cols-2' : 
        'grid-cols-3'
      }`}>
        {images.map((url, index) => (
          <div
            key={url}
            className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
              selectedUrl === url
                ? 'border-blue-600 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-blue-400'
            }`}
            onClick={() => handleImageClick(url)}
          >
            {/* Loading Spinner */}
            {loadingStates[url] && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            )}

            {/* Image */}
            <img
              src={url}
              alt={`AI generated option ${index + 1}`}
              className="w-full h-auto aspect-[3/2] object-cover"
              onLoadStart={() => handleImageLoadStart(url)}
              onLoad={() => handleImageLoad(url)}
              onError={() => handleImageLoad(url)}
            />

            {/* Selection Overlay */}
            {selectedUrl === url && (
              <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                <div className="bg-blue-600 text-white rounded-full p-2">
                  <Check className="w-6 h-6" />
                </div>
              </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all" />

            {/* Image Number */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
              #{index + 1}
            </div>

            {/* Save Button */}
            {userId && (
              <button
                onClick={(e) => handleSaveImage(url, e)}
                disabled={savingStates[url]}
                className={`absolute top-2 right-2 p-2 rounded-full transition-all ${
                  savedStates[url]
                    ? 'bg-green-600 text-white'
                    : 'bg-white bg-opacity-90 text-gray-700 hover:bg-opacity-100 hover:text-blue-600'
                }`}
                title={savedStates[url] ? 'Saved!' : 'Save image'}
              >
                {savingStates[url] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : savedStates[url] ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Save Button */}
            {userId && (
              <button
                onClick={(e) => handleSaveImage(url, e)}
                disabled={savingStates[url]}
                className={`absolute top-2 right-2 p-2 rounded-full transition-all ${
                  savedStates[url]
                    ? 'bg-green-600 text-white'
                    : 'bg-white bg-opacity-90 text-gray-700 hover:bg-opacity-100 hover:text-blue-600'
                }`}
                title={savedStates[url] ? 'Saved!' : 'Save image'}
              >
                {savingStates[url] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : savedStates[url] ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Apply Button */}
      {selectedUrl && onApply && (
        <div className="flex justify-end">
          <Button
            onClick={handleApply}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Use This Image
          </Button>
        </div>
      )}

      {/* Help Text */}
      {!selectedUrl && (
        <p className="text-xs text-gray-500 text-center">
          Click an image to select it
        </p>
      )}
    </div>
  );
};

export default AIImageSelector;
