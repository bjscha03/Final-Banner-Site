import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AIArtworkHelpProps {
  widthIn: number;
  heightIn: number;
  hasSelectedSize: boolean;
  hasArtwork: boolean;
  artworkWidth?: number | null;
  artworkHeight?: number | null;
  onCreate?: () => void;
  onAdjust?: () => void;
}

export default function AIArtworkHelp({ widthIn, heightIn, hasSelectedSize, hasArtwork, onCreate, onAdjust }: AIArtworkHelpProps) {
  const [open, setOpen] = useState(false);
  return <div className="mb-3" data-ai-artwork-help>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 underline underline-offset-4"><Sparkles className="h-4 w-4" aria-hidden="true" />Need help with your artwork?</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Artwork help</DialogTitle><DialogDescription>{hasSelectedSize ? `Your banner is ${widthIn} × ${heightIn} inches. Your selections stay saved while you get help.` : 'Choose your banner size, then add your artwork.'}</DialogDescription></DialogHeader>
        {hasArtwork && onAdjust && <button type="button" onClick={() => { setOpen(false); onAdjust(); }} className="min-h-11 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white">Adjust my uploaded artwork</button>}
        {onCreate && <button type="button" disabled={!hasSelectedSize} onClick={() => { setOpen(false); onCreate(); }} className="min-h-11 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Create artwork with AI</button>}
        <div className="space-y-2 text-sm text-slate-700"><p>Upload a PNG, JPG, or PDF. Your image keeps its proportions when it is uploaded.</p><p>Fit shows the entire image. Fill covers the banner and may crop the edges. Unlock free resize only when you want to adjust width and height independently.</p><p>On a phone, pinch on the artwork to zoom and drag to reposition it.</p><p>We check printability before production and contact you if needed. No separate proof is sent.</p></div>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold">Return to my banner</button>
      </DialogContent>
    </Dialog>
  </div>;
}
