import React, { useState, useEffect } from 'react';
import { Sparkles, Wand2, RefreshCw, MessageSquarePlus } from 'lucide-react';
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
import AIDisclaimerDialog from './AIDisclaimerDialog';
import { useAuth } from '@/lib/auth';

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
  const { user } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [colors, setColors] = useState(['#1e40af', '#ffffff', '#f3f4f6']);
  const [editPrompt, setEditPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [inspirationImage, setInspirationImage] = useState<string | null>(null);
  const [inspirationName, setInspirationName] = useState<string>('');

  const PROMPT_HELPERS = ['Grand Opening', 'Trade Show', 'Food Truck', 'Contractor', 'Restaurant', 'Real Estate', 'Event Banner', 'Sale Promotion'];

  const isAdminUser = Boolean(
    user && (
      user.is_admin === true ||
      String((user as any).role || '').toLowerCase() === 'admin' ||
      String((user as any).user_role || '').toLowerCase() === 'admin' ||
      String((user as any).account_type || '').toLowerCase() === 'admin'
    )
  );

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

    await proceedWithGeneration();
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

    if (!isAdminUser || !user?.email) {
      toast({ title: 'Admin access required', description: 'Only logged-in admins can use Create With AI.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]);
    setEditPrompt('');

    try {
      console.log('Sending AI generation request with colors:', colors);
      const response = await fetch('/.netlify/functions/generate-ai-designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        body: JSON.stringify({
          userEmail: user.email,
          productType: 'banner',
          prompt: prompt.trim(),
          styles: selectedStyles,
          colors,
          size: { wIn: widthIn, hIn: heightIn },
          width: widthIn,
          height: heightIn,
          material,
          inspirationImage,
          variations: 1,
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
        console.log('AI Generation API Response:', result);
        console.log('Generated Images:', result.images);
        if (result.images && result.images.length > 0) {
          console.log('Image URLs:', result.images.map(img => img.url));
        }
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }
      
      setGeneratedImages(result.images || []);

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
    // CRITICAL: Preserve existing text elements when applying AI background
    const currentTextElements = useQuoteStore.getState().textElements;
    
    console.log('[AI Modal] Applying AI-generated image');
    console.log('[AI Modal] Current text elements:', currentTextElements);
    console.log('[AI Modal] Cloudinary public ID:', image.cloudinary_public_id);
    
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
      previewScalePct: 100,
      // CRITICAL FIX: Explicitly preserve text elements
      textElements: currentTextElements
    });

    console.log('[AI Modal] Text elements after applying background:', useQuoteStore.getState().textElements);

    toast({
      title: 'Background applied!',
      description: 'Your AI-generated background is now ready for customization.'
    });

    onOpenChange(false);
    resetForm();
  };

  const handleRefine = async () => {
    if (!generatedImages[0] || !editPrompt.trim()) return;
    setIsRefining(true);
    try {
      const current = generatedImages[0];
      const aiMeta = useQuoteStore.getState().file?.aiMetadata as any;
      const res = await fetch('/.netlify/functions/edit-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType: 'banner',
          width: widthIn,
          height: heightIn,
          material,
          originalPrompt: aiMeta?.prompt || prompt.trim(),
          editPrompt: editPrompt.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Refinement failed');
      }
      const result = await res.json();
      if (!result.imageBase64) throw new Error('No edited image returned');
      const editedImage: GeneratedImage = {
        url: `data:${result.mimeType || 'image/png'};base64,${result.imageBase64}`,
        cloudinary_public_id: current.cloudinary_public_id,
        model: 'imagen-edit',
        aspectRatio: result.aspectRatio
      };
      setGeneratedImages([editedImage]);
      setPrompt((prev) => prev || aiMeta?.prompt || '');
      setEditPrompt('');
      toast({ title: 'Design refined', description: 'Your AI designer applied the update.' });
    } catch (error) {
      toast({
        title: 'Refinement failed',
        description: error instanceof Error ? error.message : 'Please try another edit instruction.',
        variant: 'destructive'
      });
    } finally {
      setIsRefining(false);
    }
  };

  const resetForm = () => {
    setPrompt('');
    setSelectedStyles([]);
    setColors(['#1e40af', '#ffffff', '#f3f4f6']);
    setEditPrompt('');
    setGeneratedImages([]);
    setInspirationImage(null);
    setInspirationName('');
  };

  const onInspirationUpload = async (file: File) => {
    const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Use PNG, JPG, JPEG, or WEBP.', variant: 'destructive' });
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setInspirationImage(base64);
    setInspirationName(file.name);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Reset form when modal opens (Issue #2 fix)
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

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

        {!generatedImages.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Input Fields */}
            <div className="space-y-6">
              <div>
                <Label className="text-base font-medium">Upload Inspiration (optional)</Label>
                <Input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpg,image/jpeg,image/webp" className="mt-2" onChange={(e) => e.target.files?.[0] && onInspirationUpload(e.target.files[0])} />
                {inspirationImage && (
                  <div className="mt-2">
                    <img src={inspirationImage} alt="Inspiration preview" className="w-full max-h-40 object-cover rounded border" />
                    <p className="text-xs text-gray-500 mt-1">{inspirationName}</p>
                  </div>
                )}
              </div>

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
                <div className="flex flex-wrap gap-2 mt-3">
                  {PROMPT_HELPERS.map((helper) => (
                    <Button key={helper} type="button" variant="outline" size="sm" onClick={() => setPrompt((prev) => prev ? `${prev} ${helper} theme.` : `Create a premium ${helper} banner with bold readable typography, high contrast, and print-ready composition.`)}>
                      {helper}
                    </Button>
                  ))}
                </div>
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
              <p className="text-xs text-gray-500">
                Only upload images you have rights to use. AI-generated designs may require review before printing.
              </p>
            </div>
          </div>
        ) : (
          // Single Design + Conversational Refinement View
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Your Premium Concept</h3>
            </div>
            <div className="space-y-4">
              <img src={generatedImages[0].url} alt="Generated premium design" className="w-full max-h-[440px] object-contain rounded-lg border bg-gray-50 p-2" />
              <div className="space-y-2">
                <Label className="text-base font-medium">Edit with AI Designer</Label>
                <div className="flex gap-2">
                  <Input
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g. make text bigger, use darker colors, make more premium"
                  />
                  <Button onClick={handleRefine} disabled={isRefining || !editPrompt.trim()}>
                    {isRefining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['make text bigger', 'use darker colors', 'make typography bolder', 'move logo to top', 'make more minimal', 'use cream background', 'add more contrast'].map((suggestion) => (
                    <Button key={suggestion} variant="outline" size="sm" onClick={() => setEditPrompt(suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGenerate} disabled={isGenerating} data-cta="ai-generate-new-concept">
                  <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                  Generate Another Concept
                </Button>
                <Button onClick={() => applyGeneratedImage(generatedImages[0])} data-cta="ai-apply-design">
                  Apply Design
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          
          {!generatedImages.length && (
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
