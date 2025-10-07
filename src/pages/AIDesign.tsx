import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Sparkles, Palette, Type, RefreshCw, Download, ShoppingCart, Zap, Eye, Upload, Layers } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import Layout from '@/components/Layout';
import SizeQuantityCard from '@/components/design/SizeQuantityCard';
import GrommetsCard from '@/components/design/GrommetsCard';
import MaterialCard from '@/components/design/MaterialCard';
import OptionsCard from '@/components/design/OptionsCard';
import PricingCard from '@/components/design/PricingCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  { id: 'tech', label: 'Tech', description: 'Digital, futuristic' },
  { id: 'retro', label: 'Retro', description: 'Nostalgic, throwback' },
  { id: 'corporate', label: 'Corporate', description: 'Business, formal' },
  { id: 'kid-friendly', label: 'Kid-friendly', description: 'Colorful, fun for children' },
  { id: 'seasonal', label: 'Seasonal', description: 'Holiday or seasonal theme' }
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
    provider?: string;
  };
  finalizedImage?: {
    proofUrl: string;
    finalUrl: string;
    proofPublicId: string;
    finalPublicId: string;
  };
  isGenerating: boolean;
  isFinalizing: boolean;
  previewScale: number;
}

// AI-specific preview component with text overlay
const AIPreviewCanvas: React.FC<{
  generatedImage?: { url: string };
  textLayers: { headline?: string; subheadline?: string; cta?: string };
  widthIn: number;
  heightIn: number;
  scale: number;
}> = ({ generatedImage, textLayers, widthIn, heightIn, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Calculate display dimensions
  const aspectRatio = widthIn / heightIn;
  const maxWidth = 600;
  const displayWidth = Math.min(maxWidth, maxWidth * (scale / 100));
  const displayHeight = displayWidth / aspectRatio;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Clear canvas
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    if (generatedImage?.url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Draw background image
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        
        // Draw text layers
        drawTextLayers(ctx, textLayers, displayWidth, displayHeight);
        setImageLoaded(true);
      };
      img.src = generatedImage.url;
    } else {
      // Draw placeholder
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, displayWidth, displayHeight);
      
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('AI-generated banner will appear here', displayWidth / 2, displayHeight / 2);
      
      // Still draw text layers on placeholder
      drawTextLayers(ctx, textLayers, displayWidth, displayHeight);
    }
  }, [generatedImage, textLayers, displayWidth, displayHeight]);

  const drawTextLayers = (ctx: CanvasRenderingContext2D, layers: any, width: number, height: number) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    // Headline
    if (layers.headline) {
      const fontSize = Math.max(16, width * 0.08);
      ctx.font = `bold ${fontSize}px Arial`;
      const y = height * 0.25;
      ctx.strokeText(layers.headline, width / 2, y);
      ctx.fillText(layers.headline, width / 2, y);
    }

    // Subheadline
    if (layers.subheadline) {
      const fontSize = Math.max(12, width * 0.04);
      ctx.font = `600 ${fontSize}px Arial`;
      const y = height * 0.6;
      ctx.strokeText(layers.subheadline, width / 2, y);
      ctx.fillText(layers.subheadline, width / 2, y);
    }

    // CTA
    if (layers.cta) {
      const fontSize = Math.max(14, width * 0.05);
      ctx.font = `bold ${fontSize}px Arial`;
      const y = height * 0.8;
      ctx.strokeText(layers.cta, width / 2, y);
      ctx.fillText(layers.cta, width / 2, y);
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-auto border rounded-lg shadow-sm"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      {!imageLoaded && generatedImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
    </div>
  );
};

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
    isFinalizing: false,
    previewScale: 75
  });

  // Ensure page starts at top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  const handleTextLayerChange = (role: 'headline' | 'subheadline' | 'cta', value: string) => {
    setAIState(prev => ({
      ...prev,
      textLayers: { ...prev.textLayers, [role]: value }
    }));
  };

  const handleGenerate = async (variations = 1) => {
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
          textLayers: aiState.textLayers,
          debugPrompt: new URLSearchParams(window.location.search).has('debugPrompt')
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
          url: result.images[0].url,
          publicId: result.images[0].cloudinary_public_id,
          seed: result.metadata?.seed,
          provider: result.metadata?.model || 'imagen-4'
        }
      }));

      toast({
        title: 'Banner generated!',
        description: `Your AI-generated banner is ready for preview. (Provider: ${result.metadata?.model || 'imagen-4'})`
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

  const handleUpscaleForPrint = async () => {
    if (!aiState.generatedImage) {
      toast({
        title: 'No design generated',
        description: 'Please generate a banner design first.',
        variant: 'destructive'
      });
      return;
    }

    setAIState(prev => ({ ...prev, isFinalizing: true }));

    try {
      // Build text layers array for server-side rendering
      const textLayers = [];
      if (aiState.textLayers.headline) {
        textLayers.push({
          type: 'text',
          role: 'headline',
          text: aiState.textLayers.headline,
          font: 'Inter',
          weight: 900,
          align: 'center',
          color: '#ffffff'
        });
      }
      if (aiState.textLayers.subheadline) {
        textLayers.push({
          type: 'text',
          role: 'subheadline',
          text: aiState.textLayers.subheadline,
          font: 'Inter',
          weight: 600,
          align: 'center',
          color: '#ffffff'
        });
      }
      if (aiState.textLayers.cta) {
        textLayers.push({
          type: 'text',
          role: 'cta',
          text: aiState.textLayers.cta,
          font: 'Inter',
          weight: 700,
          align: 'center',
          color: '#ffffff'
        });
      }

      const response = await fetch('/.netlify/functions/ai-finalize-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: aiState.generatedImage.publicId,
          size: { wIn: quote.widthIn, hIn: quote.heightIn },
          dpi: 150,
          material: quote.material,
          options: {
            grommets: quote.grommets !== 'none',
            polePockets: quote.polePockets !== 'none',
            ropeFt: quote.addRope ? quote.widthIn / 12 : 0
          },
          textLayers
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Finalization failed');
      }

      const result = await response.json();
      setAIState(prev => ({
        ...prev,
        finalizedImage: {
          proofUrl: result.proofUrl,
          finalUrl: result.finalUrl,
          proofPublicId: result.proofPublicId,
          finalPublicId: result.finalPublicId
        }
      }));

      toast({
        title: 'Banner finalized!',
        description: 'Your AI banner is ready! Print-ready files will be automatically generated when you place your order at 300 DPI with exact dimensions.'
      });

    } catch (error) {
      console.error('Finalization error:', error);
      toast({
        title: 'Finalization failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    } finally {
      setAIState(prev => ({ ...prev, isFinalizing: false }));
    }
  };

  return (
    <Layout>
      <ErrorBoundary>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">AI Banner Generator</h1>
                <p className="text-gray-600">Create stunning banners with artificial intelligence</p>
              </div>
              <Badge variant="secondary" className="ml-auto">Beta</Badge>
            </div>
          </div>

          {/* 3-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column - AI Inputs + Reused Components */}
            <div className="lg:col-span-3 space-y-6">
              {/* AI Prompt Section */}
              <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-white px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
                      <Type className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Describe Your Banner</h2>
                      <p className="text-sm text-gray-500">AI will create the background</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <Label htmlFor="prompt">Design Description</Label>
                    <Textarea
                      id="prompt"
                      placeholder="e.g., balloon backdrop for birthday party, grand opening sale, tech conference..."
                      value={aiState.prompt}
                      onChange={(e) => setAIState(prev => ({ ...prev, prompt: e.target.value }))}
                      className="min-h-[100px] mt-2"
                    />
                  </div>
                </div>
              </div>

              {/* Style & Color Section */}
              <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-white px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#18448D] rounded-lg flex items-center justify-center shadow-sm">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Style & Colors</h2>
                      <p className="text-sm text-gray-500">Customize the look</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  {/* Style Chips */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">Style</Label>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_CHIPS.map((style) => (
                        <Badge
                          key={style.id}
                          variant={aiState.selectedStyles.includes(style.id) ? "default" : "outline"}
                          className="cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleStyleToggle(style.id)}
                        >
                          {style.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Color Picker */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">Colors</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {aiState.customColors.map((color, index) => (
                        <div key={index} className="space-y-2">
                          <Label className="text-xs text-gray-500">Color {index + 1}</Label>
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => handleColorChange(index, e.target.value)}
                            className="w-full h-10 rounded-lg border border-gray-200 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Layers Section */}
              <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-white px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Text Layers</h2>
                      <p className="text-sm text-gray-500">Add text to your banner</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <Label htmlFor="headline" className="text-sm font-medium text-gray-700">Headline</Label>
                    <Input
                      id="headline"
                      placeholder="Main headline text"
                      value={aiState.textLayers.headline || ''}
                      onChange={(e) => handleTextLayerChange('headline', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="subheadline" className="text-sm font-medium text-gray-700">Subheadline</Label>
                    <Input
                      id="subheadline"
                      placeholder="Supporting text"
                      value={aiState.textLayers.subheadline || ''}
                      onChange={(e) => handleTextLayerChange('subheadline', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cta" className="text-sm font-medium text-gray-700">Call to Action</Label>
                    <Input
                      id="cta"
                      placeholder="e.g., Visit Us Today!"
                      value={aiState.textLayers.cta || ''}
                      onChange={(e) => handleTextLayerChange('cta', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              {/* Reused Components from Manual Design */}
              <SizeQuantityCard />
              <MaterialCard />
              <GrommetsCard />
              <OptionsCard />
            </div>

            {/* Center Column - Live Preview */}
            <div className="lg:col-span-6">
              <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-white px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-600 rounded-lg flex items-center justify-center shadow-sm">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Live Preview</h2>
                        <p className="text-sm text-gray-500">
                          {formatDimensions(quote.widthIn, quote.heightIn)} • {quote.material} vinyl
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-gray-600">Scale:</Label>
                      <div className="w-24">
                        <Slider
                          value={[aiState.previewScale]}
                          onValueChange={([value]) => setAIState(prev => ({ ...prev, previewScale: value }))}
                          min={25}
                          max={100}
                          step={5}
                          className="w-full"
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-10">{aiState.previewScale}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  <AIPreviewCanvas
                    generatedImage={aiState.generatedImage}
                    textLayers={aiState.textLayers}
                    widthIn={quote.widthIn}
                    heightIn={quote.heightIn}
                    scale={aiState.previewScale}
                  />
                  
                  {/* Action Buttons */}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      onClick={() => handleGenerate(1)}
                      disabled={aiState.isGenerating || !aiState.prompt.trim()}
                      className="flex-1 min-w-[140px]"
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
                    
                    <Button
                      onClick={() => handleGenerate(3)}
                      disabled={aiState.isGenerating || !aiState.prompt.trim()}
                      variant="outline"
                      className="flex-1 min-w-[140px]"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Generate 3 Variations
                    </Button>
                    
                    <Button
                      onClick={handleUpscaleForPrint}
                      disabled={!aiState.generatedImage || aiState.isFinalizing}
                      variant="outline"
                      className="flex-1 min-w-[140px]"
                    >
                      {aiState.isFinalizing ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Prepare for Order
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Reused Pricing Card */}
            <div className="lg:col-span-3">
              <PricingCard />
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </Layout>
  );
};

export default AIDesign;
