/**
 * New AI Generation Modal
 * 
 * Uses the cost-optimized AI generation system
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AIGeneratorPanel } from '@/components/ai';
import AIDisclaimerDialog from './AIDisclaimerDialog';

interface NewAIGenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NewAIGenerationModal: React.FC<NewAIGenerationModalProps> = ({ 
  open, 
  onOpenChange 
}) => {
  const { set } = useQuoteStore();
  const { toast } = useToast();

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [userId] = useState(() => {
    // Get or create user ID from localStorage
    let id = localStorage.getItem('ai_user_id');
    if (!id) {
      id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('ai_user_id', id);
    }
    return id;
  });

  const handleImageApply = (imageUrl: string, tier: 'premium' | 'standard') => {
    // Preserve existing text elements when applying AI background
    const currentTextElements = useQuoteStore.getState().textElements;

    console.log('[NewAIModal] Applying AI-generated image');
    console.log('[NewAIModal] Current text elements:', currentTextElements);
    console.log('[NewAIModal] Image URL:', imageUrl);
    console.log('[NewAIModal] Tier:', tier);

    set({
      file: {
        name: `ai-generated-${tier}-${Date.now()}.jpg`,
        type: 'image/jpeg',
        size: 0,
        lastModified: Date.now(),
        arrayBuffer: async () => new ArrayBuffer(0),
        slice: () => new Blob(),
        stream: () => new ReadableStream(),
        text: async () => '',
        webkitRelativePath: '',
        aiGenerated: true,
        aiMetadata: {
          tier,
          timestamp: new Date().toISOString(),
        }
      } as File & { aiGenerated?: boolean; aiMetadata?: any },
      previewScalePct: 100,
      // CRITICAL: Explicitly preserve text elements
      textElements: currentTextElements,
      // Store the Cloudinary URL for later use
      fileKey: imageUrl,
    });

    console.log('[NewAIModal] Text elements after applying background:', useQuoteStore.getState().textElements);

    toast({
      title: 'Background Applied!',
      description: `Your ${tier === 'premium' ? 'premium quality' : 'standard quality'} AI-generated background is ready for customization.`,
    });

    onOpenChange(false);
  };

  const handleDisclaimerAccept = () => {
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && !disclaimerAccepted) {
      setShowDisclaimer(true);
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              AI Banner Generation
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {disclaimerAccepted ? (
              <AIGeneratorPanel
                userId={userId}
                onImageApply={handleImageApply}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Please accept the AI disclaimer to continue
                </p>
                <button
                  onClick={() => setShowDisclaimer(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  View Disclaimer
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AIDisclaimerDialog
        open={showDisclaimer}
        onOpenChange={setShowDisclaimer}
        onAccept={handleDisclaimerAccept}
      />
    </>
  );
};

export default NewAIGenerationModal;
