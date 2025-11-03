/**
 * New AI Generation Modal
 * 
 * Uses the cost-optimized AI generation system
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useEditorStore } from '@/store/editor';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
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
  
  // Show disclaimer when modal is opened and disclaimer not yet accepted
  React.useEffect(() => {
    if (open && !disclaimerAccepted) {
      setShowDisclaimer(true);
    }
  }, [open, disclaimerAccepted]);
  
  // Show disclaimer when modal is opened and disclaimer not yet accepted
  React.useEffect(() => {
    if (open && !disclaimerAccepted) {
      setShowDisclaimer(true);
    }
  }, [open, disclaimerAccepted]);
  const { user } = useAuth();
  
  // Use authenticated user's ID (this should always exist since we require login)
  const userId = user?.id || '';

  const handleImageApply = (imageUrl: string, tier: 'premium' | 'standard') => {
    const { widthIn, heightIn } = useQuoteStore.getState();
    const { addObject } = useEditorStore.getState();

    console.log('[NewAIModal] Applying AI-generated image to canvas');
    console.log('[NewAIModal] Image URL:', imageUrl);
    console.log('[NewAIModal] Tier:', tier);
    console.log('[NewAIModal] Canvas dimensions:', { widthIn, heightIn });

    // Load the image to get its dimensions
    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      
      // Calculate size to fit within canvas (with some padding)
      const maxWidth = widthIn * 0.8;
      const maxHeight = heightIn * 0.8;
      
      let width = maxWidth;
      let height = width / aspectRatio;
      
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      // Add image to canvas centered
      const imageObject = {
        type: 'image' as const,
        url: imageUrl,
        x: widthIn / 2 - width / 2,
        y: heightIn / 2 - height / 2,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        isPDF: false,
      };
      
      console.log('[NewAIModal] Adding AI image to canvas:', imageObject);
      addObject(imageObject);
      
      toast({
        title: 'AI Image Added!',
        description: `Your ${tier === 'premium' ? 'premium quality' : 'standard quality'} AI-generated image has been added to the canvas.`,
      });
      
      onOpenChange(false);
    };
    
    img.onerror = () => {
      console.error('[NewAIModal] Failed to load AI image');
      toast({
        title: 'Error',
        description: 'Failed to load the AI-generated image. Please try again.',
        variant: 'destructive',
      });
    };
    
    img.src = imageUrl;
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
    if (!newOpen) {
      // User is closing the modal
      onOpenChange(false);
      return;
    }
    
    if (newOpen && !disclaimerAccepted) {
      // Show disclaimer immediately when opening modal
      setShowDisclaimer(true);
      // Keep the modal "open" state in parent so it can be controlled
      // but don't show the Dialog yet
      return;
    }
    
    // If disclaimer already accepted, open normally
    onOpenChange(newOpen);
  };

  return (
    <>
      <Dialog open={open && disclaimerAccepted} onOpenChange={handleOpenChange}>
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
