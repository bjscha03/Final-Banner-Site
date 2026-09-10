import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, ImagePlus, Sparkles, WandSparkles } from 'lucide-react';
import {
  buildCreateArtworkPrompt,
  buildFixArtworkPrompt,
  getBannerDimensionLabel,
  type AIArtworkHelpMode,
} from '@/lib/aiArtworkHelp';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AIArtworkHelpProps {
  widthIn: number;
  heightIn: number;
  hasSelectedSize: boolean;
  hasArtwork: boolean;
  artworkWidth?: number | null;
  artworkHeight?: number | null;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

const AIArtworkHelp: React.FC<AIArtworkHelpProps> = ({
  widthIn,
  heightIn,
  hasSelectedSize,
  hasArtwork,
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AIArtworkHelpMode>('create');
  const [description, setDescription] = useState('');
  const [copiedMode, setCopiedMode] = useState<AIArtworkHelpMode | null>(null);
  const validSize = hasSelectedSize && widthIn > 0 && heightIn > 0;

  const prompt = useMemo(() => {
    if (!validSize) return '';
    return mode === 'create'
      ? buildCreateArtworkPrompt(widthIn, heightIn, description)
      : buildFixArtworkPrompt(widthIn, heightIn);
  }, [description, heightIn, mode, validSize, widthIn]);

  useEffect(() => {
    setCopiedMode(null);
  }, [prompt]);

  const showHelp = (nextMode: AIArtworkHelpMode) => {
    setMode(nextMode);
    setCopiedMode(null);
    setOpen(true);
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await copyText(prompt);
      setCopiedMode(mode);
      window.setTimeout(() => setCopiedMode((current) => current === mode ? null : current), 2200);
    } catch {
      setCopiedMode(null);
    }
  };

  return (
    <div className="mb-4 space-y-3" data-ai-artwork-help>
      <button
        type="button"
        onClick={() => showHelp(hasArtwork ? 'fix' : 'create')}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-left text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[#0B2E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C94008] focus-visible:ring-offset-2"
        aria-label="Open AI artwork help"
      >
        <Sparkles className="h-4 w-4 flex-none text-[#0B2E59]" aria-hidden="true" />
        <span>Need help with your artwork?</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-2xl gap-0 overflow-x-hidden overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:opacity-100">
          <div className="border-b border-slate-200 bg-[#0B2E59] px-5 py-5 pr-12 text-white sm:px-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-left text-xl font-extrabold text-white">
                <Sparkles className="h-5 w-5 text-[#FF9B55]" aria-hidden="true" />
                AI Artwork Help
              </DialogTitle>
              <DialogDescription className="text-left text-sm text-blue-100">
                Copy your ready-made instructions, use them in ChatGPT or Gemini, then upload your finished JPEG here.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-w-0 space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist" aria-label="Artwork help options">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'create'}
                onClick={() => setMode('create')}
                className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${mode === 'create' ? 'border-[#C94008] bg-orange-50 text-[#7A2707]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <ImagePlus className="h-5 w-5 flex-none" aria-hidden="true" />
                <span className="text-sm font-bold">Create New Artwork with AI</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'fix'}
                onClick={() => setMode('fix')}
                className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${mode === 'fix' ? 'border-[#C94008] bg-orange-50 text-[#7A2707]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <WandSparkles className="h-5 w-5 flex-none" aria-hidden="true" />
                <span className="text-sm font-bold">Fix Existing Artwork with AI</span>
              </button>
            </div>

            {!validSize ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Choose your banner size above first. This prompt will automatically use the size you select.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3">
                  <span className="text-sm font-semibold text-[#0B2E59]">Prompt is ready for your banner:</span>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold text-[#0B2E59] shadow-sm" data-ai-selected-dimensions>
                    {getBannerDimensionLabel(widthIn, heightIn)}
                  </span>
                </div>

                {mode === 'create' && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-800">Optional: add your banner idea now</span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      placeholder="Example: Grand opening this Saturday, bold red and blue, include our address"
                      className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-base text-slate-900 outline-none transition focus:border-[#C94008] focus:ring-2 focus:ring-orange-100"
                    />
                    <span className="mt-1 block text-xs text-slate-500">You can also describe your banner after pasting the prompt into the AI tool.</span>
                  </label>
                )}

                <details className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#0B2E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C94008]">
                    View the full prompt
                  </summary>
                  <pre tabIndex={0} aria-label="Full artwork prompt" className="m-0 max-h-56 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words border-t border-slate-200 p-4 font-sans text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]" data-ai-prompt>{prompt}</pre>
                </details>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C94008] px-5 py-3 text-base font-extrabold text-white shadow-md transition-colors hover:bg-[#B93808] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C94008] focus-visible:ring-offset-2"
                >
                  {copiedMode === mode ? <Check className="h-5 w-5" aria-hidden="true" /> : <Clipboard className="h-5 w-5" aria-hidden="true" />}
                  {copiedMode === mode ? 'Copied!' : 'Copy Prompt'}
                </button>
              </>
            )}

            <div>
              <p className="text-sm font-extrabold text-slate-900">What to do next</p>
              <ol className="mt-2 grid gap-2 text-sm text-slate-700">
                {(mode === 'fix'
                  ? ['Upload your existing artwork into ChatGPT, Gemini, or another image-capable AI tool.', 'Paste the copied prompt.', 'Download the corrected high-quality JPEG/JPG.', 'Return here and upload the corrected JPEG.']
                  : ['Copy the prompt.', 'Paste it into ChatGPT, Gemini, or another image-capable AI tool.', 'Describe what you want and generate the artwork.', 'Download the high-quality JPEG/JPG, then return here and upload it.']
                ).map((step, index) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0B2E59] text-xs font-bold text-white">{index + 1}</span>
                    <span className="pt-0.5 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-800">Always download a high-quality JPEG/JPG—not PNG—for your finished banner artwork.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIArtworkHelp;
