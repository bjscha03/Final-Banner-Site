import React, { useState } from 'react';
import { Sparkles, Wand2, RefreshCw, X } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';
import { formatDimensions } from '@/lib/pricing';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import AIDisclaimerDialog from './AIDisclaimerDialog';

const STYLE_CHIPS = [
  { id: 'modern', label: 'Modern' },
  { id: 'bold', label: 'Bold' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'retro', label: 'Retro' },
  { id: 'kid-friendly', label: 'Kid-friendly' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'corporate', label: 'Corporate' }
];

interface AIGenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeneratedImage {
  url: string;
  cloudinary_public_id: string;
  model?: string;
  aspectRatio?: string;
}

const AIGenerationModal: React.FC<AIGenerationModalProps> = ({ open, onOpenChange }) => {
  const { widthIn, heightIn, material, grommets, polePockets, addRope, set } = useQuoteStore();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [colors, setColors] = useState(['#1e40af', '#ffffff', '#f3f4f6']);
  const [variations, setVariations] = useState<'1' | '3'>('3'); // Always 3 images
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [showSelection, setShowSelection] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const handleStyleToggle = (styleId: string) => {
    setSelectedStyles(prev =>
      prev.includes(styleId)
        ? prev.filter(s => s !== styleId)
        : [...prev, styleId]
    );
  };

  const handleColorChange = (index: number, color: string) => {
    setColors(prev => prev.map((c, i) => i === index ? color : c));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please describe your banner background.',
        variant: 'destructive'
      });
      return;
    }

    // Show disclaimer if not yet accepted
    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]);
    setShowSelection(false);

    try {
      const response = await fetch('/.netlify/functions/ai-generate-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          styles: selectedStyles,
          colors,
          size: { wIn: widthIn, hIn: heightIn },
          variations: 3, // Always generate 3 images
          quality: 'high', // Always use high quality
          preset: 'loft_hero'
        })
      });

      if (!response.ok) {
        let errorMessage = 'Generation failed';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }
      
      // Always show selection (we always generate 3 images)
      setGeneratedImages(result.images || []);
      setShowSelection(true);

    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Please try again or continue with manual upload.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const applyGeneratedImage = (image: GeneratedImage) => {
    // Apply the AI-generated image as the background using existing preview system
    set({
      file: {
        name: `ai-generated-${Date.now()}.jpg`,
        type: 'image/jpeg',
        size: 0, // Unknown size for AI images
        url: image.url,
        isPdf: false,
        fileKey: image.cloudinary_public_id, // Use publicId as fileKey for AI images
        isAI: true, // Flag to identify AI-generated backgrounds
        aiMetadata: {
          prompt: prompt.trim(),
          styles: selectedStyles,
          colors,
          model: image.model,
          aspectRatio: image.aspectRatio
        }
      },
      previewScalePct: 100
    });

    toast({
      title: 'Background applied!',
      description: 'Your AI-generated background is now ready for customization.'
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setPrompt('');
    setSelectedStyles([]);
    setColors(['#1e40af', '#ffffff', '#f3f4f6']);
    setVariations('1');
    setQuality('fast');
    setGeneratedImages([]);
    setShowSelection(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Format options summary
  const optionsSummary = [];
  if (grommets !== 'none') {
    const grommetLabels = {
      'every-2-3ft': 'Every 2-3ft',
      'every-1-2ft': 'Every 1-2ft', 
      '4-corners': '4 corners',
      'top-corners': 'Top corners',
      'right-corners': 'Right corners',
      'left-corners': 'Left corners'
    };
    optionsSummary.push(`Grommets: ${grommetLabels[grommets] || grommets}`);
  }
  if (polePockets !== 'none') {
    optionsSummary.push(`Pole pockets: ${polePockets}`);
  }
  if (addRope) {
    optionsSummary.push(`Rope: ${(widthIn / 12).toFixed(1)} ft`);
  }


  const handleDisclaimerAccept = () => {
    // Set accepted flag and close dialog
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
    // Directly trigger generation without calling handleGenerate
    // This avoids the race condition where disclaimerAccepted state hasn't updated yet
    proceedWithGeneration();
  };

  const proceedWithGeneration = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please describe your banner background.',
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]);
    setShowSelection(false);

    try {
      const response = await fetch('/.netlify/functions/ai-generate-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          styles: selectedStyles,
          colors,
          size: { wIn: widthIn, hIn: heightIn },
          variations: 3, // Always generate 3 images
          quality: 'high', // Always use high quality
          preset: 'loft_hero'
        })
      });

      if (!response.ok) {
        let errorMessage = 'Generation failed';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }
      
      // Always show selection (we always generate 3 images)
      setGeneratedImages(result.images || []);
      setShowSelection(true);

    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Please try again or continue with manual upload.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDisclaimerDecline = () => {
    setShowDisclaimer(false);
    toast({
      title: 'Terms Required',
      description: 'You must accept the terms to use AI generation.',
      variant: 'destructive'
    });
  };




  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            Generate Background with AI
          </DialogTitle>
        </DialogHeader>

        {!showSelection ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Input Fields */}
            <div className="space-y-6">
              <div>
                <Label htmlFor="prompt" className="text-base font-medium">
                  Describe your banner background
                </Label>
                <Textarea
                  id="prompt"
                  placeholder="e.g., balloon backdrop for birthday party, modern office space, etc."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="mt-2 min-h-[100px]"
                  maxLength={480}
                />
                <p className="text-sm text-gray-500 mt-1">
                  AI creates the background. Your text stays editable and crisp.
                </p>
              </div>

              <div>
                <Label className="text-base font-medium mb-3 block">Style (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_CHIPS.map((style) => (
                    <Badge
                      key={style.id}
                      variant={selectedStyles.includes(style.id) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleStyleToggle(style.id)}
                    >
                      {style.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-medium mb-3 block">Color Palette</Label>
                <div className="grid grid-cols-3 gap-3">
                  {colors.map((color, index) => (
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

              <div>
                <Label className="text-base font-medium mb-3 block">Variations</Label>
                <p className="text-sm text-gray-600">
                  Always generates 3 high-quality images for you to choose from
                </p>
              </div>


            </div>

            {/* Right Column - Summary */}
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">Current Banner Settings</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Size:</span>{' '}
                    <span className="font-medium">{formatDimensions(widthIn, heightIn)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Material:</span>{' '}
                    <span className="font-medium">{material} Vinyl</span>
                  </div>
                  {optionsSummary.length > 0 && (
                    <div>
                      <span className="text-gray-600">Options:</span>{' '}
                      <span className="font-medium">{optionsSummary.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Your banner text stays crisp as editable layers.
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Image Selection View
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Choose your favorite:</h3>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
                data-cta="ai-refresh-3"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh 3
                  </>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {generatedImages.map((image, index) => (
                <div key={index} className="relative group cursor-pointer" onClick={() => applyGeneratedImage(image)}>
                  <img
                    src={image.url}
                    alt={`Generated option ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg border-2 border-transparent group-hover:border-blue-500 transition-colors"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-opacity" />
                  <Button
                    className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-cta="ai-variations-pick"
                  >
                    Select This One
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          
          {!showSelection && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              data-cta="ai-generate-submit"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* AI Disclaimer Dialog */}
    <AIDisclaimerDialog
      open={showDisclaimer}
      onAccept={handleDisclaimerAccept}
      onDecline={handleDisclaimerDecline}
    />
  </>;
};

export default AIGenerationModal;
