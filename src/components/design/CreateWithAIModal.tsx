import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

export type CreateWithAIProductType = 'banner' | 'yard_sign' | 'car_magnet';

export interface CreateWithAIResult {
  /** Cropped, exact-aspect-ratio PNG returned by /generate-design (base64). */
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  /** Suggested filename for the generated artwork. */
  fileName: string;
  /** The trimmed user prompt — persist alongside the design for admin display. */
  prompt: string;
}

interface CreateWithAIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productType: CreateWithAIProductType;
  /** Width in inches. Required-selection. */
  widthIn: number | null;
  /** Height in inches. Required-selection. */
  heightIn: number | null;
  /** Material identifier (e.g. "13oz", "corrugated_plastic"). Required-selection. */
  material: string | null;
  /** Human-readable material label for display + prompt. */
  materialLabel?: string;
  /** Called when generation succeeds. Caller is responsible for inserting
   *  the image into its own canvas / upload pipeline. */
  onGenerated: (result: CreateWithAIResult) => void | Promise<void>;
}

const QUICK_CHIPS = [
  'Grand Opening',
  'Now Hiring',
  'Real Estate',
  'Sale',
  'Event',
  'Business Sign',
];

const MAX_PROMPT_LENGTH = 500;

const STAGE_MESSAGES = [
  'Understanding prompt',
  'Generating design',
  'Fitting to canvas',
];

const PRODUCT_LABEL: Record<CreateWithAIProductType, string> = {
  banner: 'banner',
  yard_sign: 'yard sign',
  car_magnet: 'car magnet',
};

const CreateWithAIModal: React.FC<CreateWithAIModalProps> = ({
  open,
  onOpenChange,
  productType,
  widthIn,
  heightIn,
  material,
  materialLabel,
  onGenerated,
}) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const requirementsMet = useMemo(
    () =>
      Number.isFinite(widthIn || NaN) &&
      Number.isFinite(heightIn || NaN) &&
      (widthIn || 0) > 0 &&
      (heightIn || 0) > 0 &&
      !!material,
    [widthIn, heightIn, material],
  );

  // Reset transient state whenever the modal is opened.
  useEffect(() => {
    if (open) {
      setError(null);
      setStageIndex(0);
      setIsGenerating(false);
    }
  }, [open]);

  // Cycle through the staged loading messages while a request is in flight.
  useEffect(() => {
    if (!isGenerating) return;
    setStageIndex(0);
    const t1 = setTimeout(() => setStageIndex(1), 1200);
    const t2 = setTimeout(() => setStageIndex(2), 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isGenerating]);

  const handleChipClick = (chip: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      const next = trimmed ? `${trimmed} — ${chip}` : chip;
      return next.slice(0, MAX_PROMPT_LENGTH);
    });
  };

  const handleGenerate = async () => {
    if (!requirementsMet || !widthIn || !heightIn || !material) {
      setError(
        'Select size and material first so AI can fit your design perfectly.',
      );
      return;
    }
    if (!prompt.trim()) {
      setError('Please describe your design.');
      return;
    }

    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch('/.netlify/functions/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType,
          width: widthIn,
          height: heightIn,
          material,
          prompt: prompt.trim().slice(0, MAX_PROMPT_LENGTH),
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          detail = body?.error || body?.details || '';
        } catch {
          /* ignore */
        }
        throw new Error(
          detail || `Generation failed (HTTP ${res.status}). Please try again.`,
        );
      }

      const data = await res.json();
      if (!data?.imageBase64) {
        throw new Error('AI returned no image. Please try a different prompt.');
      }

      const fileName = `ai-${productType}-${Date.now()}.png`;
      await onGenerated({
        imageBase64: data.imageBase64,
        mimeType: data.mimeType || 'image/png',
        width: Number(data.width) || widthIn,
        height: Number(data.height) || heightIn,
        fileName,
        prompt: prompt.trim().slice(0, MAX_PROMPT_LENGTH),
      });

      toast({
        title: 'Design generated',
        description: 'Your AI design is ready in the preview.',
      });
      onOpenChange(false);
      setPrompt('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed.';
      setError(message);
      toast({
        title: 'Generation failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const dimensionsLabel =
    widthIn && heightIn ? `${widthIn}" × ${heightIn}"` : '— × —';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto p-0">
        <div className="px-5 pt-5 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Sparkles className="w-5 h-5 text-orange-500" />
              Create with AI
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div className="text-xs text-gray-500">
            {PRODUCT_LABEL[productType]} • {dimensionsLabel}
            {materialLabel ? ` • ${materialLabel}` : ''}
          </div>

          {!requirementsMet && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Select size and material first so AI can fit your design perfectly.
              </span>
            </div>
          )}

          <div>
            <label
              htmlFor="ai-prompt"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Describe your design
            </label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) =>
                setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))
              }
              placeholder="Describe your banner, yard sign, or magnet…"
              maxLength={MAX_PROMPT_LENGTH}
              rows={4}
              disabled={isGenerating || !requirementsMet}
              className="w-full resize-none"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
              <span>
                AI will create a print-ready design sized to your product.
              </span>
              <span>
                {prompt.length}/{MAX_PROMPT_LENGTH}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Quick ideas
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  disabled={isGenerating || !requirementsMet}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={
                isGenerating || !requirementsMet || !prompt.trim()
              }
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {STAGE_MESSAGES[stageIndex]}…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Design
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWithAIModal;
