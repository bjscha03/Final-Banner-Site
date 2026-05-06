import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, Upload, Wand2, RefreshCw, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ENABLE_AI } from '@/lib/featureFlags';

export type CreateWithAIProductType = 'banner' | 'yard_sign' | 'car_magnet';
export interface CreateWithAIResult { imageBase64: string; mimeType: string; width: number; height: number; fileName: string; prompt: string; }
interface CreateWithAIModalProps { open: boolean; onOpenChange: (open: boolean) => void; productType: CreateWithAIProductType; widthIn: number | null; heightIn: number | null; material: string | null; materialLabel?: string; quantity?: number | null; onGenerated: (result: CreateWithAIResult) => void | Promise<void>; }

const CHIPS = ['Grand Opening', 'Trade Show', 'Food Truck', 'Contractor', 'Restaurant', 'Real Estate', 'Sale / Promo', 'Event Banner'];

const CreateWithAIModal: React.FC<CreateWithAIModalProps> = (props) => {
  if (!ENABLE_AI) return null;
  return <CreateWithAIModalImpl {...props} />;
};

const CreateWithAIModalImpl: React.FC<CreateWithAIModalProps> = ({ open, onOpenChange, productType, widthIn, heightIn, material, materialLabel, quantity, onGenerated }) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('Create a bold, modern banner in Banners On The Fly brand colors (navy, orange, white).');
  const [inspirationDataUrl, setInspirationDataUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ id: string; imageBase64: string; mimeType: string; prompt: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const requirementsMet = useMemo(() => Number(widthIn) > 0 && Number(heightIn) > 0 && !!material, [widthIn, heightIn, material]);

  const handleInspirationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setInspirationDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const generateOne = async (seed: number) => {
    const res = await fetch('/.netlify/functions/generate-design', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productType, width: widthIn, height: heightIn, material, quantity, prompt: `${prompt}\nVariant ${seed + 1}`, inspirationImageBase64: inspirationDataUrl }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || body?.details || `Generation failed (${res.status})`);
    if (!body?.imageBase64) throw new Error('No image returned by AI service.');
    return { id: `${Date.now()}-${seed}`, imageBase64: body.imageBase64 as string, mimeType: body.mimeType || 'image/png', prompt };
  };

  const handleGenerateAll = async () => {
    if (!requirementsMet || !prompt.trim()) return;
    setError(null);
    setIsGenerating(true);
    try {
      const results = await Promise.all([generateOne(0), generateOne(1), generateOne(2)]);
      setOptions(results);
      setSelectedId(results[0].id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      if (import.meta.env.DEV) console.error('[CreateWithAI] generation error', err);
      setError(msg);
      toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
    } finally { setIsGenerating(false); }
  };

  const selected = options.find((o) => o.id === selectedId) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1500px] max-h-[94vh] overflow-y-auto p-0 border-slate-700 bg-[#06152b] text-white">
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-slate-700">
          <DialogTitle className="text-3xl font-extrabold tracking-tight">CREATE STUNNING BANNERS <span className="text-orange-500">WITH AI</span></DialogTitle>
          <p className="text-slate-300 text-sm">Upload inspiration, describe your vision, generate 3 premium designs, then apply to cart flow.</p>
        </DialogHeader>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 p-6">
          <section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3">
            <h3 className="font-bold text-lg">1. Upload Inspiration</h3>
            <label className="block border border-dashed border-slate-500 rounded-lg p-5 text-center cursor-pointer hover:border-orange-400">
              <Upload className="mx-auto mb-2" />
              <span>Upload screenshot / logo / reference</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleInspirationUpload} />
            </label>
            {inspirationDataUrl && <img src={inspirationDataUrl} alt="Inspiration" className="w-full rounded-lg border border-slate-600" />}
          </section>

          <section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3">
            <h3 className="font-bold text-lg">2. Tell AI What You Want</h3>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} className="w-full rounded-lg bg-[#071a35] border border-slate-600 p-3 text-white" />
            <div className="flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c} onClick={() => setPrompt((p) => `${p} ${c}`.trim())} className="px-2 py-1 text-xs rounded border border-slate-500 hover:border-orange-400">{c}</button>)}</div>
            <button onClick={handleGenerateAll} disabled={isGenerating || !requirementsMet || !prompt.trim()} className="w-full mt-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2">{isGenerating ? <><Loader2 className="animate-spin"/> Generating 3 designs…</> : <><Sparkles/> Generate AI Designs</>}</button>
            {error && <div className="text-red-200 bg-red-900/40 border border-red-400/40 rounded p-2 text-sm">{error}</div>}
          </section>

          <section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3">
            <h3 className="font-bold text-lg">3. Choose Your Design</h3>
            <p className="text-xs text-slate-300">{options.length} designs generated</p>
            <div className="space-y-3 max-h-[56vh] overflow-auto pr-1">
              {options.map((o) => (
                <div key={o.id} className={`rounded-lg border p-2 ${selectedId === o.id ? 'border-orange-400 bg-slate-900/70' : 'border-slate-600'}`}>
                  <img src={`data:${o.mimeType};base64,${o.imageBase64}`} alt="Generated design" className="w-full rounded-md" onClick={() => setSelectedId(o.id)} />
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button onClick={async () => { setSelectedId(o.id); await onGenerated({ imageBase64: o.imageBase64, mimeType: o.mimeType, width: Number(widthIn) || 96, height: Number(heightIn) || 48, fileName: `ai-${productType}-${Date.now()}.png`, prompt: o.prompt }); onOpenChange(false); }} className="bg-orange-500 hover:bg-orange-600 rounded py-2 text-sm font-semibold">Use This Design</button>
                    <button onClick={handleGenerateAll} className="border border-slate-500 rounded py-2 text-sm inline-flex justify-center items-center gap-1"><RefreshCw className="w-3 h-3"/>Regenerate Similar</button>
                    <button onClick={() => setPrompt(o.prompt)} className="border border-slate-500 rounded py-2 text-sm inline-flex justify-center items-center gap-1"><Pencil className="w-3 h-3"/>Edit Prompt</button>
                  </div>
                </div>
              ))}
            </div>
            {selected && <div className="text-xs text-slate-300 pt-2 border-t border-slate-700">4. Add to Cart: after choosing, the design is applied to your existing upload/canvas flow.</div>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWithAIModal;
