import React, { useState, useMemo } from 'react';
import { Sparkles, Palette, Type, RefreshCw, Download, ShoppingCart, Zap } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/Header';
import { calcTotals, usd, formatDimensions } from '@/lib/pricing';

// Style chips for AI generation
const STYLE_CHIPS = [
  { id: 'modern', label: 'Modern', description: 'Clean, minimalist design' },
  { id: 'vintage', label: 'Vintage', description: 'Retro, classic aesthetic' },
  { id: 'bold', label: 'Bold', description: 'High contrast, striking' },
  { id: 'elegant', label: 'Elegant', description: 'Sophisticated, refined' },
  { id: 'playful', label: 'Playful', description: 'Fun, energetic vibe' },
  { id: 'professional', label: 'Professional', description: 'Business-appropriate' },
  { id: 'artistic', label: 'Artistic', description: 'Creative, expressive' },
  { id: 'tech', label: 'Tech', description: 'Digital, futuristic' }
];

interface AIDesignState {
  prompt: string;
  selectedStyles: string[];
  customColors: string[];
  textLayers: {
    headline?: string;
    subheadline?: string;
    cta?: string;
  };
  generatedImage?: {
    url: string;
    publicId: string;
    seed?: number;
  };
  isGenerating: boolean;
  isFinalizing: boolean;
}

const AIDesign: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const quote = useQuoteStore();
  const { addFromQuote } = useCartStore();

  const [aiState, setAIState] = useState<AIDesignState>({
    prompt: '',
    selectedStyles: [],
    customColors: ['#1e40af', '#ffffff', '#f3f4f6'],
    textLayers: {},
    isGenerating: false,
    isFinalizing: false
  });

  // Calculate pricing using existing logic
  const totals = useMemo(() => {
    try {
      return calcTotals({ widthIn: quote.widthIn, heightIn: quote.heightIn, qty: quote.quantity, material: quote.material, addRope: quote.addRope, polePockets: quote.polePockets });
    } catch (error) {
      console.error('Error calculating totals:', error);
      return { area: 0, unit: 0, rope: 0, polePocket: 0, materialTotal: 0, tax: 0, totalWithTax: 0 };
    }
  }, [quote.widthIn, quote.heightIn, quote.quantity, quote.material, quote.addRope, quote.polePockets]);

  const handleStyleToggle = (styleId: string) => {
    setAIState(prev => ({
      ...prev,
      selectedStyles: prev.selectedStyles.includes(styleId)
        ? prev.selectedStyles.filter(s => s !== styleId)
        : [...prev.selectedStyles, styleId]
    }));
  };

  const handleColorChange = (index: number, color: string) => {
    setAIState(prev => ({
      ...prev,
      customColors: prev.customColors.map((c, i) => i === index ? color : c)
    }));
  };

  const handleGenerate = async () => {
    if (!aiState.prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please enter a description for your banner design.',
        variant: 'destructive'
      });
      return;
    }

    setAIState(prev => ({ ...prev, isGenerating: true }));

    try {
      const response = await fetch('/.netlify/functions/ai-generate-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiState.prompt,
          styles: aiState.selectedStyles,
          colors: aiState.customColors,
          size: { wIn: quote.widthIn, hIn: quote.heightIn },
          textLayers: aiState.textLayers
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();
      setAIState(prev => ({
        ...prev,
        generatedImage: {
          url: result.imageUrl,
          publicId: result.publicId,
          seed: result.seed
        }
      }));

      toast({
        title: 'Banner generated!',
        description: 'Your AI-generated banner is ready for preview.'
      });

    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    } finally {
      setAIState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleAddToCart = () => {
    if (!aiState.generatedImage) {
      toast({
        title: 'No design generated',
        description: 'Please generate a banner design first.',
        variant: 'destructive'
      });
      return;
    }

    // Add AI metadata to cart item
    const aiMetadata = {
      aiDesign: {
        prompt: aiState.prompt,
        styles: aiState.selectedStyles,
        colors: aiState.customColors,
        size: { wIn: quote.widthIn, hIn: quote.heightIn },
        material: quote.material,
        options: {
          grommets: quote.grommets,
          polePockets: quote.polePockets,
          addRope: quote.addRope
        },
        ai: {
          provider: 'gemini',
          seed: aiState.generatedImage.seed,
          draftPublicId: aiState.generatedImage.publicId
        },
        layers: aiState.textLayers,
        assets: {
          proofUrl: aiState.generatedImage.url,
          finalUrl: quote.file?.fileKey
        }
      }
    };

    addFromQuote(quote, aiMetadata);
    
    toast({
      title: 'Added to cart!',
      description: 'Your AI-generated banner has been added to your cart.'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">AI Banner Generator</h1>
              <p className="text-gray-600">Create stunning banners with artificial intelligence</p>
            </div>
            <Badge variant="secondary" className="ml-auto">Beta</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Prompt Section */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center gap-2 mb-4">
                <Type className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Describe Your Banner</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="prompt">Design Description</Label>
                  <Textarea
                    id="prompt"
                    placeholder="e.g., A modern tech conference banner with geometric patterns and bold typography..."
                    value={aiState.prompt}
                    onChange={(e) => setAIState(prev => ({ ...prev, prompt: e.target.value }))}
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </div>

            {/* Style Chips */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">Style</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {STYLE_CHIPS.map((style) => (
                  <Badge
                    key={style.id}
                    variant={aiState.selectedStyles.includes(style.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleStyleToggle(style.id)}
                  >
                    {style.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Color Picker */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Colors</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {aiState.customColors.map((color, index) => (
                    <div key={index} className="space-y-2">
                      <Label className="text-xs">Color {index + 1}</Label>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => handleColorChange(index, e.target.value)}
                        className="w-full h-10 rounded border cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Text Layers */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Text Layers (Optional)</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="headline" className="text-sm">Headline</Label>
                  <Input
                    id="headline"
                    placeholder="Main headline text"
                    value={aiState.textLayers.headline || ''}
                    onChange={(e) => setAIState(prev => ({
                      ...prev,
                      textLayers: { ...prev.textLayers, headline: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="subheadline" className="text-sm">Subheadline</Label>
                  <Input
                    id="subheadline"
                    placeholder="Supporting text"
                    value={aiState.textLayers.subheadline || ''}
                    onChange={(e) => setAIState(prev => ({
                      ...prev,
                      textLayers: { ...prev.textLayers, subheadline: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cta" className="text-sm">Call to Action</Label>
                  <Input
                    id="cta"
                    placeholder="e.g., Visit Us Today!"
                    value={aiState.textLayers.cta || ''}
                    onChange={(e) => setAIState(prev => ({
                      ...prev,
                      textLayers: { ...prev.textLayers, cta: e.target.value }
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={aiState.isGenerating || !aiState.prompt.trim()}
              className="w-full"
              size="lg"
            >
              {aiState.isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Banner
                </>
              )}
            </Button>
          </div>

          {/* Center Panel - Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="p-6 border-b">
                <h3 className="font-semibold text-gray-900">Preview</h3>
                <p className="text-sm text-gray-600">
                  {formatDimensions(quote.widthIn, quote.heightIn)} • {quote.material} vinyl
                </p>
              </div>
              
              <div className="p-6">
                {aiState.generatedImage ? (
                  <div className="relative">
                    <img
                      src={aiState.generatedImage.url}
                      alt="Generated banner"
                      className="w-full h-auto rounded-lg shadow-lg"
                    />
                    <div className="absolute top-4 right-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleGenerate}
                        disabled={aiState.isGenerating}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[2/1] bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">Your AI-generated banner will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Summary & Actions */}
          <div className="lg:col-span-1 space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Size:</span>
                  <span>{formatDimensions(quote.widthIn, quote.heightIn)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Material:</span>
                  <span>{quote.material} vinyl</span>
                </div>
                <div className="flex justify-between">
                  <span>Quantity:</span>
                  <span>{quote.quantity}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-semibold">
                  <span>Total:</span>
                  <span>{usd(totals.totalWithTax || 0)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleAddToCart}
                disabled={!aiState.generatedImage}
                className="w-full"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>

              <Button
                onClick={() => {
                  if (aiState.generatedImage?.url) {
                    const link = document.createElement('a');
                    link.href = aiState.generatedImage.url;
                    link.download = `ai-banner-proof-${Date.now()}.png`;
                    link.click();
                  }
                }}
                disabled={!aiState.generatedImage}
                variant="outline"
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Proof
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIDesign;
