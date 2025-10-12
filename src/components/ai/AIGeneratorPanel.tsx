/**
 * AIGeneratorPanel Component
 * 
 * Main UI for AI banner generation with prompt input, aspect selection, and generation controls
 */

import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';
import { CreditCounter } from './CreditCounter';
import { AIImageSelector } from './AIImageSelector';
import type { PreviewImageResponse, MoreVariationsResponse } from '../../types/ai-generation';

interface AIGeneratorPanelProps {
  userId: string;
  onImageApply: (imageUrl: string, tier: 'premium' | 'standard') => void;
  className?: string;
}

const ASPECT_RATIOS = [
  { value: '3:2', label: '3:2 (Landscape)', description: 'Standard banner' },
  { value: '16:9', label: '16:9 (Wide)', description: 'Ultra-wide banner' },
  { value: '4:3', label: '4:3 (Classic)', description: 'Classic format' },
  { value: '1:1', label: '1:1 (Square)', description: 'Square format' },
  { value: '2:3', label: '2:3 (Portrait)', description: 'Vertical banner' },
];

export const AIGeneratorPanel: React.FC<AIGeneratorPanelProps> = ({
  userId,
  onImageApply,
  className = '',
}) => {
  const { toast } = useToast();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('3:2');
  const [style, setStyle] = useState({});

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [tier, setTier] = useState<'premium' | 'standard'>('premium');
  const [cached, setCached] = useState(false);
  const [genId, setGenId] = useState<string | null>(null);

  // UI state
  const [showMoreButton, setShowMoreButton] = useState(false);
  const [creditRefreshTrigger, setCreditRefreshTrigger] = useState(0);

  const MAX_PROMPT_LENGTH = 500;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please enter a description for your banner image.',
        variant: 'destructive',
      });
      return;
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      toast({
        title: 'Prompt too long',
        description: `Please keep your prompt under ${MAX_PROMPT_LENGTH} characters.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedImages([]);
      setShowMoreButton(false);

      const response = await fetch('/.netlify/functions/ai-preview-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspect,
          style,
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.code === 'INSUFFICIENT_CREDITS') {
          toast({
            title: 'Insufficient Credits',
            description: 'You have used your free daily quota. Purchase credits to continue generating images.',
            variant: 'destructive',
          });
          return;
        }

        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data: PreviewImageResponse = await response.json();

      setGeneratedImages(data.urls);
      setTier(data.tier);
      setCached(data.cached);
      setGenId(data.genId);
      setShowMoreButton(true);

      // Refresh credit counter
      setCreditRefreshTrigger(prev => prev + 1);

      toast({
        title: 'Image Generated!',
        description: `${data.tier === 'premium' ? '👑 Premium' : '⚡ Standard'} quality image ready${data.cached ? ' (from cache)' : ''}.`,
      });
    } catch (error: any) {
      console.error('[AIGeneratorPanel] Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadMore = async () => {
    try {
      setIsLoadingMore(true);

      const response = await fetch('/.netlify/functions/ai-more-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspect,
          style,
          count: 2, // Request 2 more variations
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.code === 'INSUFFICIENT_CREDITS') {
          toast({
            title: 'Insufficient Credits',
            description: 'You need more credits to generate additional variations.',
            variant: 'destructive',
          });
          return;
        }

        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data: MoreVariationsResponse = await response.json();

      setGeneratedImages(data.urls);
      setTier(data.tier);
      setCached(data.cached);
      setShowMoreButton(false); // Hide button after loading more

      // Refresh credit counter
      setCreditRefreshTrigger(prev => prev + 1);

      toast({
        title: 'More Variations Loaded!',
        description: `${data.urls.length} images now available${data.cached ? ' (some from cache)' : ''}.`,
      });
    } catch (error: any) {
      console.error('[AIGeneratorPanel] Load more error:', error);
      toast({
        title: 'Failed to Load More',
        description: error.message || 'Failed to generate more variations. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleImageSelect = (imageUrl: string) => {
    console.log('[AIGeneratorPanel] Image selected:', imageUrl);
  };

  const handleImageApply = (imageUrl: string) => {
    onImageApply(imageUrl, tier);
    
    toast({
      title: 'Image Applied!',
      description: 'AI-generated background has been added to your design.',
    });

    // Reset form
    setPrompt('');
    setGeneratedImages([]);
    setShowMoreButton(false);
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Credit Counter */}
      <CreditCounter 
        userId={userId} 
        onRefresh={creditRefreshTrigger > 0 ? () => {} : undefined}
      />

      {/* Prompt Input */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">
          Describe your banner image
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Professional photograph of a sunset over mountains with vibrant orange and purple colors"
          className="min-h-[100px] resize-none"
          maxLength={MAX_PROMPT_LENGTH}
          disabled={isGenerating}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Be specific for best results</span>
          <span>{prompt.length} / {MAX_PROMPT_LENGTH}</span>
        </div>
      </div>

      {/* Aspect Ratio Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">
          Aspect Ratio
        </label>
        <Select value={aspect} onValueChange={setAspect} disabled={isGenerating}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_RATIOS.map((ratio) => (
              <SelectItem key={ratio.value} value={ratio.value}>
                <div className="flex flex-col">
                  <span className="font-medium">{ratio.label}</span>
                  <span className="text-xs text-gray-500">{ratio.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Preview
          </>
        )}
      </Button>

      {/* Generated Images */}
      {generatedImages.length > 0 && (
        <AIImageSelector
          images={generatedImages}
          tier={tier}
          cached={cached}
          onSelect={handleImageSelect}
          onApply={handleImageApply}
          userId={userId}
          prompt={prompt}
          aspect={aspect}
          generationId={genId || undefined}
        />
      )}

      {/* Load More Button */}
      {showMoreButton && generatedImages.length === 1 && (
        <Button
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          variant="outline"
          className="w-full"
        >
          {isLoadingMore ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Generate 2 More Options
            </>
          )}
        </Button>
      )}

      {/* Help Text */}
      {generatedImages.length === 0 && !isGenerating && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700">
            <p className="font-medium mb-1">Tips for best results:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Be specific about colors, style, and subject</li>
              <li>Mention "professional photograph" for realistic images</li>
              <li>Avoid text or logos in the prompt (add those later)</li>
              <li>New users get 3 free credits. Each generation uses 1 credit.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIGeneratorPanel;
