import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import type { CreateWithAIProductType, CreateWithAIResult } from './CreateWithAIModal';

export interface EditWithAIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productType: CreateWithAIProductType;
  widthIn: number | null;
  heightIn: number | null;
  material: string | null;
  materialLabel?: string;
  /** The original "Create with AI" prompt used to make the current design. */
  originalPrompt: string | null;
  /** A preview URL (data URL or hosted) of the current AI design on canvas. */
  currentImageUrl: string | null;
  /** Optional base64 PNG of the current canvas — reserved for image-to-image
   *  models. Currently sent to the backend for forward-compatibility but
   *  Imagen 3.0 generate falls back to prompt-only regeneration. */
  currentImageBase64?: string | null;
  /** Called when the edit completes. The caller is responsible for replacing
   *  the existing AI image on its canvas (no second image layer). */
  onEdited: (result: CreateWithAIResult & { editPrompt: string }) => void | Promise<void>;
}

const EXAMPLE_CHIPS = [
  'Make text bigger',
  'Change colors',
  'Simplify design',
  'Remove small text',
  'Make background white',
  'Use blue and white colors',
];

const MAX_PROMPT_LENGTH = 500;

const STAGE_MESSAGES = [
  'Reading current design',
  'Applying edits',
  'Updating canvas',
];

const EditWithAIModal: React.FC<EditWithAIModalProps> = ({
  open,
  onOpenChange,
  productType,
  widthIn,
  heightIn,
  material,
  materialLabel,
  originalPrompt,
  currentImageUrl,
  currentImageBase64,
  onEdited,
}) => {
  const { toast } = useToast();
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const requirementsMet = useMemo(
    () =>
      Number.isFinite(widthIn) &&
      (widthIn || 0) > 0 &&
      Number.isFinite(heightIn) &&
      (heightIn || 0) > 0 &&
      !!material,
    [widthIn, heightIn, material],
  );

  useEffect(() => {
    if (open) {
      setError(null);
      setStageIndex(0);
      setIsEditing(false);
      setEditPrompt('');
    }
  }, [open]);

  useEffect(() => {
    if (!isEditing) return;
    setStageIndex(0);
    const t1 = setTimeout(() => setStageIndex(1), 1200);
    const t2 = setTimeout(() => setStageIndex(2), 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isEditing]);

  const handleChipClick = (chip: string) => {
    setEditPrompt((prev) => {
      const trimmed = prev.trim();
      const next = trimmed ? `${trimmed} — ${chip}` : chip;
      return next.slice(0, MAX_PROMPT_LENGTH);
    });
  };

  const handleSubmit = async () => {
    if (!requirementsMet || !widthIn || !heightIn || !material) {
      setError('Select size and material first so AI can keep your dimensions.');
      return;
    }
    if (!editPrompt.trim()) {
      setError('Please describe what to change.');
      return;
    }

    setError(null);
    setIsEditing(true);
    try {
      const res = await fetch('/.netlify/functions/edit-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType,
          width: widthIn,
          height: heightIn,
          material,
          editPrompt: editPrompt.trim().slice(0, MAX_PROMPT_LENGTH),
          originalPrompt: originalPrompt || '',
          // Sent for forward-compatibility with image-to-image models. The
          // backend currently regenerates with combined prompts when the
          // selected Vertex model does not support direct image editing.
          currentImageBase64: currentImageBase64 || null,
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
          detail || `Edit failed (HTTP ${res.status}). Please try again.`,
        );
      }

      const data = await res.json();
      if (!data?.imageBase64) {
        throw new Error('AI returned no image. Please try a different edit.');
      }

      const fileName = `ai-${productType}-edit-${Date.now()}.png`;
      const trimmedEdit = editPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
      await onEdited({
        imageBase64: data.imageBase64,
        mimeType: data.mimeType || 'image/png',
        width: Number(data.width) || widthIn,
        height: Number(data.height) || heightIn,
        fileName,
        prompt: originalPrompt || '',
        editPrompt: trimmedEdit,
      });

      toast({
        title: 'Design updated',
        description: 'Your AI design has been updated on the canvas.',
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Edit failed.';
      setError(message);
      toast({
        title: 'Edit failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsEditing(false);
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
              <Wand2 className="w-5 h-5 text-purple-500" />
              Edit with AI
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div className="text-xs text-gray-500">
            {productType.replace('_', ' ')} • {dimensionsLabel}
            {materialLabel ? ` • ${materialLabel}` : ''}
          </div>

          {currentImageUrl && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1.5">
                Current design
              </div>
              <div className="rounded-md overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                <img
                  src={currentImageUrl}
                  alt="Current AI design"
                  className="max-h-48 w-auto object-contain"
                  draggable={false}
                />
              </div>
            </div>
          )}

          {!requirementsMet && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Size and material are required to keep your dimensions.</span>
            </div>
          )}

          <div>
            <label
              htmlFor="ai-edit-prompt"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              What should we change?
            </label>
            <Textarea
              id="ai-edit-prompt"
              value={editPrompt}
              onChange={(e) =>
                setEditPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))
              }
              placeholder='e.g. "make the background red", "change headline to GRAND OPENING", "make it cleaner"'
              maxLength={MAX_PROMPT_LENGTH}
              rows={4}
              disabled={isEditing || !requirementsMet}
              className="w-full resize-none"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
              <span>The new design keeps your exact size and material.</span>
              <span>
                {editPrompt.length}/{MAX_PROMPT_LENGTH}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Quick edits
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  disabled={isEditing || !requirementsMet}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              onClick={handleSubmit}
              disabled={isEditing || !requirementsMet || !editPrompt.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isEditing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {STAGE_MESSAGES[stageIndex]}…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Update Design
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isEditing}
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

export default EditWithAIModal;
