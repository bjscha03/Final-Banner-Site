import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, Upload, Wand2, RefreshCw, Expand } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ENABLE_AI } from '@/lib/featureFlags';

export type CreateWithAIProductType = 'banner' | 'yard_sign' | 'car_magnet';
export interface CreateWithAIResult { imageBase64: string; mimeType: string; width: number; height: number; fileName: string; prompt: string; }
interface CreateWithAIModalProps { open: boolean; onOpenChange: (open: boolean) => void; productType: CreateWithAIProductType; widthIn: number | null; heightIn: number | null; material: string | null; quantity?: number | null; onGenerated: (result: CreateWithAIResult) => void | Promise<void>; }

const CHIPS = ['Grand Opening', 'Trade Show', 'Food Truck', 'Contractor', 'Restaurant', 'Real Estate', 'Sale / Promo', 'Event Banner'];
const isDev = import.meta.env.DEV;

type DesignResult = { imageUrl: string; prompt: string; originalPrompt: string };

const CreateWithAIModal: React.FC<CreateWithAIModalProps> = (props) => ENABLE_AI ? <CreateWithAIModalImpl {...props} /> : null;

const toBase64FromUrl = async (url: string) => {
  const r = await fetch(url);
  const b = await r.blob();
  const fr = new FileReader();
  const dataUrl: string = await new Promise((resolve) => { fr.onloadend = () => resolve(String(fr.result || '')); fr.readAsDataURL(b); });
  return { base64: dataUrl.split(',')[1] || '', mimeType: b.type || 'image/png' };
};

const CreateWithAIModalImpl: React.FC<CreateWithAIModalProps> = ({ open, onOpenChange, productType, widthIn, heightIn, material, quantity, onGenerated }) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('Create a premium, bold banner design with clean hierarchy and high contrast.');
  const [inspirationDataUrl, setInspirationDataUrl] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('make text bigger and more premium');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const requirementsMet = useMemo(() => Number(widthIn) > 0 && Number(heightIn) > 0 && !!material, [widthIn, heightIn, material]);

  const generate = async (basePrompt: string) => {
    const payload = { prompt: basePrompt, productType, width: widthIn, height: heightIn, material, quantity, size: { wIn: widthIn, hIn: heightIn }, inspirationImage: inspirationDataUrl };
    if (isDev) console.log('[CreateWithAI] request:start', payload);
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (isDev) console.log('[CreateWithAI] response', body);
    if (!res.ok) throw new Error(body?.details || body?.error || `Generation failed (${res.status})`);
    const image = body?.image || body?.images?.[0];
    if (!image?.url) throw new Error('Expected one generated design, but no image URL was returned.');
    return { imageUrl: image.url, prompt: body?.prompt || basePrompt, originalPrompt: basePrompt };
  };

  const handleGenerate = async () => {
    if (!requirementsMet || !prompt.trim()) return;
    setError(null); setIsGenerating(true);
    try { setDesign(await generate(prompt.trim())); } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg); toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
      if (isDev) console.error('[CreateWithAI] generation error', err);
    } finally { setIsGenerating(false); }
  };

  const handleEditDesign = async () => {
    if (!design || !editInstruction.trim()) return;
    setIsGenerating(true); setError(null);
    try {
      const { base64 } = await toBase64FromUrl(design.imageUrl);
      const res = await fetch('/.netlify/functions/edit-design', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, width: widthIn, height: heightIn, material, originalPrompt: design.originalPrompt, editPrompt: editInstruction.trim(), currentImageBase64: base64 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.imageBase64) throw new Error(body?.details || body?.error || 'AI edit failed');
      const editedUrl = `data:${body.mimeType || 'image/png'};base64,${body.imageBase64}`;
      setDesign((prev) => prev ? { ...prev, imageUrl: editedUrl } : prev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI edit failed';
      setError(msg); toast({ title: 'AI edit failed', description: msg, variant: 'destructive' });
    } finally { setIsGenerating(false); }
  };

  return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[96vw] max-w-[1500px] max-h-[94vh] overflow-y-auto p-0 border-slate-700 bg-[#06152b] text-white"><DialogHeader className="px-6 pt-6 pb-2 border-b border-slate-700"><DialogTitle className="text-3xl font-extrabold tracking-tight">CREATE STUNNING BANNERS <span className="text-orange-500">WITH AI</span></DialogTitle></DialogHeader><div className="grid grid-cols-1 xl:grid-cols-3 gap-4 p-6"><section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3"><h3 className="font-bold text-lg">1. Upload Inspiration</h3><label className="block border border-dashed border-slate-500 rounded-lg p-5 text-center cursor-pointer hover:border-orange-400"><Upload className="mx-auto mb-2"/><span>Upload screenshot / logo / reference</span><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setInspirationDataUrl(String(r.result)); r.readAsDataURL(f); }} /></label>{inspirationDataUrl && <img src={inspirationDataUrl} alt="Inspiration" className="w-full rounded-lg border border-slate-600" />}</section><section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3"><h3 className="font-bold text-lg">2. Tell AI What You Want</h3><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} className="w-full rounded-lg bg-[#071a35] border border-slate-600 p-3 text-white" /><div className="flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c} onClick={() => setPrompt((p) => `${p} ${c}`.trim())} className="px-2 py-1 text-xs rounded border border-slate-500 hover:border-orange-400">{c}</button>)}</div><button onClick={handleGenerate} disabled={isGenerating || !requirementsMet || !prompt.trim()} className="w-full mt-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2">{isGenerating ? <><Loader2 className="animate-spin"/> Creating your design...</> : <><Sparkles/> Generate AI Design</>}</button>{error && <div className="text-red-200 bg-red-900/40 border border-red-400/40 rounded p-2 text-sm whitespace-pre-wrap">{error}</div>}</section><section className="rounded-xl bg-[#0b2345] border border-slate-700 p-4 space-y-3"><h3 className="font-bold text-lg">3. Your AI Design</h3>{design ? (<div className="space-y-3"><img src={design.imageUrl} alt="Generated design" className="w-full rounded-md" /><div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><button onClick={async () => { const { base64, mimeType } = await toBase64FromUrl(design.imageUrl); await onGenerated({ imageBase64: base64, mimeType, width: Number(widthIn) || 96, height: Number(heightIn) || 48, fileName: `ai-${productType}-${Date.now()}.png`, prompt: design.prompt }); onOpenChange(false); }} className="bg-orange-500 hover:bg-orange-600 rounded py-2 text-sm font-semibold">Apply Design</button><button onClick={handleEditDesign} className="border border-slate-500 rounded py-2 text-sm inline-flex justify-center items-center gap-1"><Wand2 className="w-3 h-3"/>AI Edit</button><button onClick={handleGenerate} className="border border-slate-500 rounded py-2 text-sm inline-flex justify-center items-center gap-1"><RefreshCw className="w-3 h-3"/>Generate New Concept</button><button onClick={() => setPreviewUrl(design.imageUrl)} className="border border-slate-500 rounded py-2 text-sm inline-flex justify-center items-center gap-1"><Expand className="w-3 h-3"/>Full Preview</button></div><textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} placeholder="AI edit (e.g., make text bigger, use darker colors, move logo to top)" rows={2} className="w-full rounded bg-[#071a35] border border-slate-600 p-2 text-xs" /></div>) : (<p className="text-xs text-slate-300">Generate AI Design to preview your concept here.</p>)}</section></div></DialogContent>{previewUrl && <Dialog open onOpenChange={() => setPreviewUrl(null)}><DialogContent className="max-w-4xl bg-black/95 border-slate-700"><img src={previewUrl} alt="Full preview" className="w-full"/></DialogContent></Dialog>}</Dialog>);
};

export default CreateWithAIModal;
