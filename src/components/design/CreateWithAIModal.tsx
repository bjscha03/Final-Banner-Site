import React, { useMemo, useState } from 'react';
import { Sparkles, Upload, Wand2, RefreshCw, Expand, ZoomIn, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ENABLE_AI } from '@/lib/featureFlags';

export type CreateWithAIProductType = 'banner' | 'yard_sign' | 'car_magnet';
export interface CreateWithAIResult { imageBase64: string; mimeType: string; width: number; height: number; fileName: string; prompt: string; }
interface CreateWithAIModalProps { open: boolean; onOpenChange: (open: boolean) => void; productType: CreateWithAIProductType; widthIn: number | null; heightIn: number | null; material: string | null; quantity?: number | null; onGenerated: (result: CreateWithAIResult) => void | Promise<void>; }

type BrandMatch = 'light' | 'medium' | 'strong';
const CHIPS = ['Luxury','Bold','Minimal','Streetwear','Corporate','Contractor','Food Truck','Sports','Event','Modern','Premium','High Energy'];
const EDIT_EXAMPLES = ['make text bigger','use darker colors','make more premium','use stronger typography','use neon pink accents','make more luxury','increase contrast','use black background','make more minimal'];

type DesignResult = { imageUrl: string; prompt: string; originalPrompt: string; revision: number };
type ApiError = { category?: string | null; message?: string | null; status?: number | null; code?: string | null; type?: string | null; details?: string | null };
type GenerationDebug = { success?: boolean; stepFailed?: string | null; durationMs?: number; model?: string; openaiStatus?: string | null; cloudinaryStatus?: string | null; imageDetected?: boolean; inspirationIncluded?: boolean; fallbackAttempted?: boolean; fallbackSucceeded?: boolean; error?: string | ApiError | null; openaiError?: ApiError | null };
type GenerationResponse = { success?: boolean; stepFailed?: string | null; durationMs?: number; model?: string; imageDetected?: boolean; inspirationIncluded?: boolean; fallbackAttempted?: boolean; fallbackSucceeded?: boolean; openaiStatus?: string | null; cloudinaryStatus?: string | null; error?: ApiError | string | null; image?: { url?: string }; images?: Array<{ url?: string }>; prompt?: string; debug?: GenerationDebug | null };
const CreateWithAIModal: React.FC<CreateWithAIModalProps> = (props) => ENABLE_AI ? <CreateWithAIModalImpl {...props} /> : null;

const toBase64FromUrl = async (url: string) => {
  const r = await fetch(url); const b = await r.blob(); const fr = new FileReader();
  const dataUrl: string = await new Promise((resolve) => { fr.onloadend = () => resolve(String(fr.result || '')); fr.readAsDataURL(b); });
  return { base64: dataUrl.split(',')[1] || '', mimeType: b.type || 'image/png' };
};

const CreateWithAIModalImpl: React.FC<CreateWithAIModalProps> = ({ open, onOpenChange, productType, widthIn, heightIn, material, quantity, onGenerated }) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('Create a premium, cinematic banner for my business with bold hierarchy and high readability.');
  const [inspirationDataUrl, setInspirationDataUrl] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignResult | null>(null);
  const [versions, setVersions] = useState<DesignResult[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('make text bigger and more premium');
  const [brandMatchStrength, setBrandMatchStrength] = useState<BrandMatch>('strong');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [debugInfo, setDebugInfo] = useState<GenerationDebug | null>(null);
  const [rawGenerateResponse, setRawGenerateResponse] = useState<string>('');
  const [rawTestResponse, setRawTestResponse] = useState<string>('');
  const requirementsMet = useMemo(() => Number(widthIn) > 0 && Number(heightIn) > 0 && !!material, [widthIn, heightIn, material]);

  const generate = async (basePrompt: string, regenerate = false) => {
    const payload = { prompt: basePrompt, regenerate, productType, width: widthIn, height: heightIn, material, quantity, size: { wIn: widthIn, hIn: heightIn }, inspirationImage: inspirationDataUrl, brandMatchStrength, styleChips: CHIPS.filter((c)=>basePrompt.includes(c)) };
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body: GenerationResponse = await res.json().catch(() => ({} as GenerationResponse));
    setRawGenerateResponse(JSON.stringify(body, null, 2));
    setDebugInfo(body?.debug || body || null);
    if (!res.ok) {
      const errObj = typeof body?.error === 'object' ? body.error : null;
      const backendCategory = body?.stepFailed || errObj?.category || null;
      const detail = [
        backendCategory ? `stepFailed: ${backendCategory}` : null,
        body?.openaiStatus ? `openaiStatus: ${body.openaiStatus}` : null,
        errObj?.status != null ? `openai.error.status: ${errObj.status}` : null,
        errObj?.code ? `openai.error.code: ${errObj.code}` : null,
        errObj?.type ? `openai.error.type: ${errObj.type}` : null,
        errObj?.message ? `openai.error.message: ${errObj.message}` : null,
        body?.fallbackAttempted != null ? `fallbackAttempted: ${String(body.fallbackAttempted)}` : null,
        body?.inspirationIncluded != null ? `inspirationIncluded: ${String(body.inspirationIncluded)}` : null,
        errObj?.details ? `details: ${errObj.details}` : null,
      ].filter(Boolean).join('\n');
      throw new Error(detail || JSON.stringify(body));
    }
    const image = body?.image || body?.images?.[0];
    if (!image?.url) throw new Error(JSON.stringify(body));
    return { imageUrl: image.url, prompt: body?.prompt || basePrompt, originalPrompt: basePrompt, revision: (design?.revision || 0) + 1 };
  };

  const handleGenerate = async (regenerate = false) => {
    if (!requirementsMet || !prompt.trim()) return;
    setError(null); setIsGenerating(true);
    try {
      const result = await generate(prompt.trim(), regenerate);
      setDesign(result); setVersions((prev) => [result, ...prev].slice(0, 8));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate design.';
      setError(msg); toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
    } finally { setIsGenerating(false); }
  };



  const handleRunAITest = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/ai-generate-banner-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });
      const body = await res.json().catch(() => ({}));
      setRawTestResponse(JSON.stringify(body, null, 2));
      if (!res.ok) throw new Error(JSON.stringify(body));
      const testImage = body?.image?.url;
      if (testImage) setDesign((prev) => ({ imageUrl: testImage, prompt: body?.prompt || prompt, originalPrompt: prompt, revision: (prev?.revision || 0) + 1 }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI test failed';
      setError(msg);
      toast({ title: 'AI test failed', description: msg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditDesign = async () => {
    if (!design || !editInstruction.trim()) return;
    setIsGenerating(true); setError(null);
    try {
      const { base64 } = await toBase64FromUrl(design.imageUrl);
      const res = await fetch('/.netlify/functions/edit-design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productType, width: widthIn, height: heightIn, material, originalPrompt: design.originalPrompt, editPrompt: editInstruction.trim(), currentImageBase64: base64, inspirationImage: inspirationDataUrl, brandMatchStrength }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.imageBase64) throw new Error(body?.error || 'Unable to apply AI edit right now.');
      const edited: DesignResult = { ...design, imageUrl: `data:${body.mimeType || 'image/png'};base64,${body.imageBase64}`, revision: design.revision + 1 };
      setDesign(edited); setVersions((prev) => [edited, ...prev].slice(0, 8)); setEditInstruction('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to apply AI edit.';
      setError(msg); toast({ title: 'AI edit unavailable', description: msg, variant: 'destructive' });
    } finally { setIsGenerating(false); }
  };

  return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[98vw] max-w-[1800px] h-[92vh] p-0 overflow-hidden border-slate-800 bg-gradient-to-br from-[#030711] via-[#071529] to-[#0a1425] text-white"><DialogHeader className="px-8 py-5 border-b border-white/10"><DialogTitle className="text-3xl font-black">AI Banner Design Studio</DialogTitle><p className="text-slate-300 text-sm">AI will enhance your prompt automatically.</p></DialogHeader><div className="grid grid-cols-1 xl:grid-cols-12 gap-4 p-6 h-[calc(92vh-96px)] overflow-y-auto"><section className="xl:col-span-3 rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-lg mb-2">Brand Inspiration</h3><p className="text-xs text-slate-300 mb-4">Upload your logo, website, branding, screenshot, or inspiration image.</p><label className="block border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-fuchsia-400/70 transition"><Upload className="mx-auto mb-2" /><span className="text-sm">Drag and drop or click to upload</span><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setInspirationDataUrl(String(r.result)); r.readAsDataURL(f); }} /></label>{inspirationDataUrl && <div className="mt-4 space-y-2"><img src={inspirationDataUrl} alt="Inspiration" className="w-full h-56 object-cover rounded-xl border border-white/20"/><div className="grid grid-cols-2 gap-2"><button onClick={() => setInspirationDataUrl(null)} className="text-xs py-2 rounded bg-red-500/20 border border-red-400/40 inline-flex items-center justify-center gap-1"><Trash2 className="w-3 h-3"/>Remove</button><button onClick={() => setPreviewUrl(inspirationDataUrl)} className="text-xs py-2 rounded bg-white/10 border border-white/20 inline-flex items-center justify-center gap-1"><ZoomIn className="w-3 h-3"/>Preview</button></div></div>}</section><section className="xl:col-span-4 rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-lg mb-2">Prompt + Controls</h3><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={10} placeholder="Design a premium black-and-gold banner for an upscale contractor brand with bold headline typography and high contrast CTA." className="w-full rounded-xl bg-[#081427] border border-white/15 p-4" /><p className="text-xs text-slate-300 mt-2">Examples: cinematic real-estate launch • luxury product drop • high-energy sports event.</p><div className="flex flex-wrap gap-2 mt-3">{CHIPS.map((c) => <button key={c} onClick={() => setPrompt((p)=>`${p} ${c}`.trim())} className="px-3 py-1 text-xs rounded-full border border-white/20 hover:border-fuchsia-300">{c}</button>)}</div><div className='mt-4'><p className='text-xs mb-2 text-slate-300'>Brand Match Strength</p><div className='grid grid-cols-3 gap-2'>{(['light','medium','strong'] as BrandMatch[]).map((v)=><button key={v} onClick={()=>setBrandMatchStrength(v)} className={`py-2 rounded-lg text-sm border ${brandMatchStrength===v?'bg-fuchsia-500/30 border-fuchsia-300':'border-white/20 bg-white/5'}`}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div></div><div className="grid grid-cols-1 gap-3 mt-5"><button onClick={handleRunAITest} disabled={isGenerating} className="rounded-xl border border-emerald-300/50 bg-emerald-500/20 py-3 font-semibold">Run AI Test</button><div className="grid grid-cols-2 gap-3"><button onClick={() => handleGenerate(false)} disabled={isGenerating || !requirementsMet || !prompt.trim()} className="rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-50 py-3 font-semibold inline-flex items-center justify-center gap-2"><Sparkles className="w-4 h-4"/>Generate Design</button><button onClick={() => handleGenerate(true)} disabled={isGenerating || !requirementsMet || !prompt.trim()} className="rounded-xl border border-white/25 py-3 font-semibold inline-flex items-center justify-center gap-2"><RefreshCw className={`w-4 h-4 ${isGenerating?'animate-spin':''}`}/>Generate New Direction</button></div></div>{isGenerating && <div className='mt-4 rounded-xl border border-white/10 bg-white/5 p-3'><div className='h-2 rounded bg-gradient-to-r from-fuchsia-500/20 via-fuchsia-300/60 to-fuchsia-500/20 animate-pulse'/><p className='text-sm mt-2 text-slate-200'>Designing your banner...</p></div>}{error && <div className="mt-3 text-red-200 bg-red-950/40 border border-red-400/40 rounded p-2 text-sm">{error}</div>}</section><section className="xl:col-span-5 rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-lg mb-3">Live AI Preview</h3><div className="rounded-xl border border-white/15 bg-black/30 min-h-[420px] flex items-center justify-center overflow-hidden">{design ? <img src={design.imageUrl} alt="Generated design" className="w-full h-full object-contain" /> : <p className="text-slate-400">Generate a design to preview revisions.</p>}</div>{design && <div className='grid grid-cols-3 gap-2 mt-3'><button onClick={async()=>{ const { base64, mimeType } = await toBase64FromUrl(design.imageUrl); await onGenerated({ imageBase64: base64, mimeType, width: Number(widthIn)||96, height: Number(heightIn)||48, fileName: `ai-${productType}-${Date.now()}.png`, prompt: design.prompt }); onOpenChange(false); }} className='py-2 rounded bg-fuchsia-500 font-semibold'>Apply Design</button><button onClick={handleEditDesign} className='py-2 rounded border border-white/20 inline-flex items-center justify-center gap-1'><Wand2 className='w-4 h-4'/>AI Edit</button><button onClick={() => setPreviewUrl(design.imageUrl)} className='py-2 rounded border border-white/20 inline-flex items-center justify-center gap-1'><Expand className='w-4 h-4'/>Full Preview</button></div>}<input value={editInstruction} onChange={(e)=>setEditInstruction(e.target.value)} placeholder='AI edit prompt' className='w-full mt-3 rounded-lg bg-[#081427] border border-white/15 p-3 text-sm'/><div className='flex flex-wrap gap-2 mt-2'>{EDIT_EXAMPLES.map((s)=><button key={s} onClick={()=>setEditInstruction(s)} className='text-xs px-2 py-1 rounded border border-white/20'>{s}</button>)}</div><div className='mt-3'><p className='text-xs text-slate-300 mb-1'>Version History</p><div className='flex gap-2 overflow-x-auto'>{versions.map((v,i)=><button key={`${v.revision}-${i}`} onClick={()=>setDesign(v)} className='shrink-0 w-16 h-16 rounded border border-white/20 overflow-hidden'><img src={v.imageUrl} className='w-full h-full object-cover'/></button>)}</div></div><div className='mt-3 space-y-2'><p className='text-xs text-slate-300'>Raw generate-ai-designs response</p><pre className='overflow-x-auto rounded border border-cyan-400/30 bg-black/30 p-2 text-[11px] leading-relaxed whitespace-pre-wrap'>{rawGenerateResponse || 'No generate-ai-designs response yet.'}</pre><p className='text-xs text-slate-300'>Raw ai-generate-banner-test response</p><pre className='overflow-x-auto rounded border border-emerald-400/30 bg-black/30 p-2 text-[11px] leading-relaxed whitespace-pre-wrap'>{rawTestResponse || 'No ai-generate-banner-test response yet.'}</pre></div></section></div></DialogContent>{previewUrl && <Dialog open onOpenChange={() => setPreviewUrl(null)}><DialogContent className="max-w-6xl bg-black border-white/20"><img src={previewUrl} alt="Full preview" className="w-full"/></DialogContent></Dialog>}</Dialog>);
};

export default CreateWithAIModal;
