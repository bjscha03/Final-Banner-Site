import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ENABLE_AI } from '@/lib/featureFlags';
import AIWorkspace from './ai/AIWorkspace';
import type { AIDesignSession, CreateWithAIProductType, CreateWithAIResult } from './ai/types';

export interface EditWithAIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productType: CreateWithAIProductType;
  widthIn: number | null;
  heightIn: number | null;
  material: string | null;
  materialLabel?: string;
  originalPrompt: string | null;
  currentImageUrl: string | null;
  currentImageBase64?: string | null;
  session?: AIDesignSession | null;
  onEdited: (result: CreateWithAIResult & { editPrompt: string }) => void | Promise<void>;
}

const EditWithAIModal: React.FC<EditWithAIModalProps> = (props) => {
  if (!ENABLE_AI) return null;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[94dvh] w-[98vw] max-w-[1800px] overflow-y-auto border-0 bg-[#f8f6f1] p-0 shadow-2xl sm:rounded-2xl">
        <DialogTitle className="sr-only">Edit the current artwork with AI</DialogTitle>
        <DialogDescription className="sr-only">Edit the actual current image while preserving exact dimensions, text, logos, and previous versions.</DialogDescription>
        {props.session ? (
          <AIWorkspace
            productType={props.productType}
            widthIn={props.widthIn}
            heightIn={props.heightIn}
            material={props.material}
            materialLabel={props.materialLabel}
            initialSession={props.session}
            onClose={() => props.onOpenChange(false)}
            onGenerated={(result) => props.onEdited({ ...result, editPrompt: 'Approved GPT Image 2 edit' })}
          />
        ) : (
          <div className="grid min-h-[60vh] place-items-center bg-[#f8f6f1] p-6">
            <div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
              <h2 className="mt-3 text-xl font-black text-[#0b1f3a]">This design has no recoverable AI source</h2>
              <p className="mt-2 text-sm text-slate-600">For controlled editing, start with Create with AI so the flat background, exact text layers, logo layer, and version history stay separate.</p>
              <button type="button" onClick={() => props.onOpenChange(false)} className="mt-5 min-h-11 rounded-lg bg-[#0b1f3a] px-5 text-sm font-bold text-white">Return to designer</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditWithAIModal;
