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
        url: imageUrl, // ✅ FIX: Set the URL so LivePreviewCard can display it
        isAI: true,
        isPdf: false,
        fileKey: imageUrl,
        aiMetadata: {
          tier,
          timestamp: new Date().toISOString(),
        }
      },
      previewScalePct: 100,
      // CRITICAL: Explicitly preserve text elements
      textElements: currentTextElements,
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
    // Open the main modal after accepting disclaimer
    onOpenChange(true);
  };

  const handleDisclaimerDecline = () => {
    setShowDisclaimer(false);
    setDisclaimerAccepted(false);
    // Close the main modal when user declines
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && !disclaimerAccepted) {
      // Show disclaimer immediately when opening modal
      setShowDisclaimer(true);
      // Don't open the main modal yet
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
            {disclaimerAccepted && (
              <AIGeneratorPanel
                userId={userId}
                onImageApply={handleImageApply}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AIDisclaimerDialog
        open={showDisclaimer}
        onAccept={handleDisclaimerAccept}
        onDecline={handleDisclaimerDecline}
      />
    </>
  );
};

export default NewAIGenerationModal;
