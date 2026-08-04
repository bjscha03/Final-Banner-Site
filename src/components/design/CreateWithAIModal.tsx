import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ENABLE_AI } from '@/lib/featureFlags';
import AIWorkspace from './ai/AIWorkspace';
import type { AIDesignSession, CreateWithAIProductType, CreateWithAIResult } from './ai/types';

export type { AIDesignSession, CreateWithAIProductType, CreateWithAIResult } from './ai/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productType: CreateWithAIProductType;
  widthIn: number | null;
  heightIn: number | null;
  material: string | null;
  materialLabel?: string;
  quantity?: number | null;
  initialSession?: AIDesignSession | null;
  onGenerated: (result: CreateWithAIResult) => void | Promise<void>;
};

const CreateWithAIModal: React.FC<Props> = (props) => {
  if (!ENABLE_AI) return null;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[94dvh] w-[98vw] max-w-[1800px] overflow-y-auto border-0 bg-[#f8f6f1] p-0 shadow-2xl sm:rounded-2xl">
        <DialogTitle className="sr-only">Create professional banner artwork with AI</DialogTitle>
        <DialogDescription className="sr-only">Build a structured creative brief, generate complete flat artwork, validate it, and apply it to the banner configurator.</DialogDescription>
        <AIWorkspace {...props} onClose={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};

export default CreateWithAIModal;
