import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { TAX_RATE, usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import type { MaterialKey } from '@/store/quote';
import { Sparkles, Upload, Wand2, Mic, Minus, Plus, BadgeCheck, EyeOff, Eye } from 'lucide-react';

const POPULAR_SIZES = [{ label: "4' x 2'", w: 4, h: 2 }, { label: "6' x 2'", w: 6, h: 2 }, { label: "6' x 3'", w: 6, h: 3 }, { label: "8' x 3'", w: 8, h: 3 }, { label: "8' x 4'", w: 8, h: 4 }, { label: "10' x 4'", w: 10, h: 4 }];
const MATERIALS: { value: MaterialKey; label: string }[] = [{ value: '13oz', label: '13oz Vinyl' }, { value: '15oz', label: '15oz Vinyl' }, { value: '18oz', label: '18oz Vinyl' }];
const GROMMET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'every_2_3_feet', label: 'Every 2–3 Feet' },
  { value: 'every_1_2_feet', label: 'Every 1–2 Feet' },
  { value: 'four_corners', label: '4 Corners Only' },
  { value: 'top_corners', label: 'Top Corners Only' },
  { value: 'bottom_corners', label: 'Bottom Corners Only' },
  { value: 'left_side', label: 'Left Side Only' },
  { value: 'right_side', label: 'Right Side Only' },
] as const;
const PLACEMENTS = [{ value: 'none', label: 'None' }, { value: 'top', label: 'Top Only' }, { value: 'bottom', label: 'Bottom Only' }, { value: 'top-bottom', label: 'Top & Bottom' }] as const;
type Finishing = 'none' | 'grommets' | 'rope' | 'pole_pockets';

type Snap = {
  imageUrl: string;
  prompt: string;
  enhancedPrompt: string;
  transform: { x: number; y: number; scale: number; mode: 'fit' | 'fill' | 'custom' };
  finishingType: Finishing;
  grommetOption: string;
  ropePlacement: string;
  polePocketPlacement: string;
};

function getGrommetPositions({ grommetOption, widthFt, heightFt }: { grommetOption: string; widthFt: number; heightFt: number }) {
  const w = Math.max(1, widthFt);
  const h = Math.max(1, heightFt);
  const corners = [{ xPercent: 0, yPercent: 0 }, { xPercent: 100, yPercent: 0 }, { xPercent: 0, yPercent: 100 }, { xPercent: 100, yPercent: 100 }];
  const edgeSeries = (lengthFt: number, stepFt: number) => {
    const count = Math.max(2, Math.floor(lengthFt / stepFt) + 1);
    return Array.from({ length: count }, (_, i) => (i / (count - 1)) * 100);
  };
  const dedupe = (pts: { xPercent: number; yPercent: number }[]) => {
    const seen = new Set<string>();
    return pts.filter((p) => {
      const k = `${Math.round(p.xPercent * 10) / 10}:${Math.round(p.yPercent * 10) / 10}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  if (grommetOption === 'none') return [];
  if (grommetOption === 'four_corners') return corners;
  if (grommetOption === 'top_corners') return corners.slice(0, 2);
  if (grommetOption === 'bottom_corners') return corners.slice(2, 4);

  const spacing = grommetOption === 'every_1_2_feet' ? 1.5 : 2.5;
  const xs = edgeSeries(w, spacing);
  const ys = edgeSeries(h, spacing);

  if (grommetOption === 'left_side') return ys.map((yPercent) => ({ xPercent: 0, yPercent }));
  if (grommetOption === 'right_side') return ys.map((yPercent) => ({ xPercent: 100, yPercent }));

  const all = [
    ...xs.map((xPercent) => ({ xPercent, yPercent: 0 })),
    ...xs.map((xPercent) => ({ xPercent, yPercent: 100 })),
    ...ys.map((yPercent) => ({ xPercent: 0, yPercent })),
    ...ys.map((yPercent) => ({ xPercent: 100, yPercent })),
  ];
  return dedupe(all);
}

const Spinner = () => <span className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />;

const AIDesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const admin = isAdmin(user);
  const addFromQuote = useCartStore((s) => s.addFromQuote);

  const [sizeMode, setSizeMode] = useState<'popular'|'custom'>('popular');
  const [size, setSize] = useState(POPULAR_SIZES[4]);
  const [wInput, setWInput] = useState(8);
  const [hInput, setHInput] = useState(4);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [quantity, setQuantity] = useState(1);

  const [prompt, setPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [finishingType, setFinishingType] = useState<Finishing>('none');
  const [grommetOption, setGrommetOption] = useState<string>('none');
  const [ropePlacement, setRopePlacement] = useState<string>('none');
  const [polePocketPlacement, setPolePocketPlacement] = useState<string>('none');

  const [busy, setBusy] = useState<'enhance'|'enhanceEdit'|'generate'|'edit'|'debug'|null>(null);
  const [errorOutput, setErrorOutput] = useState('');
  const [generationFallbackNote, setGenerationFallbackNote] = useState('');
  const [debugOutput, setDebugOutput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [cartMessage, setCartMessage] = useState('');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  const [history, setHistory] = useState<Snap[]>([]);

  const [imageTransform, setImageTransform] = useState({ x: 0, y: 0, scale: 1, mode: 'fill' as 'fit'|'fill'|'custom' });
  const [imageNaturalRatio, setImageNaturalRatio] = useState(16/9);
    const [selected, setSelected] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ type: 'move'; startX: number; startY: number; origin: typeof imageTransform } | null>(null);

  const widthFt = sizeMode === 'popular' ? size.w : Math.max(1, Math.round(wInput));
  const heightFt = sizeMode === 'popular' ? size.h : Math.max(1, Math.round(hInput));
  const widthIn = Math.max(12, Math.round(widthFt * 12));
  const heightIn = Math.max(12, Math.round(heightFt * 12));
  const areaSqFt = (widthIn * heightIn) / 144;

  const pricing = useMemo(() => calculateBannerPricing({ widthIn, heightIn, quantity, material, addRope: ropePlacement !== 'none', ropePlacement: ropePlacement as any, polePockets: polePocketPlacement } as any), [widthIn, heightIn, quantity, material, ropePlacement, polePocketPlacement]);

  const grommetPositions = useMemo(() => getGrommetPositions({ grommetOption, widthFt, heightFt }), [grommetOption, widthFt, heightFt, imageTransform.mode]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragState.current) return;
      const d = dragState.current;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.type === 'move') {
        setImageTransform((t) => ({ ...t, x: d.origin.x + dx, y: d.origin.y + dy, mode: 'custom' }));
      }
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [widthIn, heightIn, imageNaturalRatio]);

  if (!loading && !admin) return <Navigate to="/admin/setup" replace />;

  const saveSnapshot = () => {
    if (!imageUrl) return;
    const snap: Snap = { imageUrl, prompt, enhancedPrompt, transform: imageTransform, finishingType, grommetOption, ropePlacement, polePocketPlacement };
    setHistory((h) => [snap, ...h].slice(0, 20));
  };

  const restoreSnapshot = (s: Snap) => {
    setImageUrl(s.imageUrl);
    setPrompt(s.prompt);
    setEnhancedPrompt(s.enhancedPrompt);
    setImageTransform(s.transform);
    setFinishingType(s.finishingType);
    setGrommetOption(s.grommetOption);
    setRopePlacement(s.ropePlacement);
    setPolePocketPlacement(s.polePocketPlacement);
  };

  const revertOne = () => {
    if (!history.length) return;
    const [head, ...rest] = history;
    restoreSnapshot(head);
    setHistory(rest);
  };

  const onGrommetChange = (v: string) => {
    setGrommetOption(v);
    if (v === 'none') {
      if (ropePlacement === 'none' && polePocketPlacement === 'none') setFinishingType('none');
      return;
    }
    setFinishingType('grommets');
    setRopePlacement('none');
    setPolePocketPlacement('none');
  };
  const onRopeChange = (v: string) => {
    setRopePlacement(v);
    if (v === 'none') { if (grommetOption === 'none' && polePocketPlacement === 'none') setFinishingType('none'); return; }
    setFinishingType('rope');
    setGrommetOption('none');
    setPolePocketPlacement('none');
  };
  const onPoleChange = (v: string) => {
    setPolePocketPlacement(v);
    if (v === 'none') { if (grommetOption === 'none' && ropePlacement === 'none') setFinishingType('none'); return; }
    setFinishingType('pole_pockets');
    setGrommetOption('none');
    setRopePlacement('none');
  };

  const callFn = async (action: string) => {
    const payload = { action, prompt, enhancedPrompt, editInstruction, imageUrl, size: { w: Number(widthFt.toFixed(2)), h: Number(heightFt.toFixed(2)) }, material, quantity, referenceImage };
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({ ok: false, safeErrorMessage: 'Invalid JSON response from function' }));
    return { body };
  };


  const getImageBox = () => {
    const bannerRatio = widthIn / heightIn;
    const imgRatio = imageNaturalRatio || (16 / 9);
    let baseW = 100, baseH = 100;
    if (imageTransform.mode === 'fit') {
      if (imgRatio > bannerRatio) { baseW = 100; baseH = (bannerRatio / imgRatio) * 100; }
      else { baseH = 100; baseW = (imgRatio / bannerRatio) * 100; }
    }
    return { baseW, baseH };
  };


  const marks = (n: number, pxLen: number) => {
    const max = Math.floor(n);
    const pxPerUnit = pxLen / Math.max(1, n);
    const step = pxPerUnit >= 52 ? 1 : pxPerUnit >= 26 ? 2 : 4;
    const vals = Array.from({ length: max + 1 }, (_, i) => i).filter((v) => v === 0 || v === max || v % step === 0);
    return vals;
  };

  const clearImage = () => {
    setImageUrl(null);
    setSelected(false);
    setImageTransform({ x: 0, y: 0, scale: 1, mode: 'fill' });
  };

  const fit = () => setImageTransform({ x: 0, y: 0, scale: 1, mode: 'fit' });
  const fill = () => setImageTransform({ x: 0, y: 0, scale: 1, mode: 'fill' });
  const reset = () => { setImageTransform({ x: 0, y: 0, scale: 1, mode: 'fill' }); setSelected(false); };


  const resetDesigner = () => {
    setPrompt('');
    setEnhancedPrompt('');
    setEditInstruction('');
    setReferenceImage(null);
    setImageUrl(null);
    setSelected(false);
    setHistory([]);
    setImageTransform({ x: 0, y: 0, scale: 1, mode: 'fill' });
    setFinishingType('none');
    setGrommetOption('none');
    setRopePlacement('none');
    setPolePocketPlacement('none');
    setSizeMode('popular');
    setSize(POPULAR_SIZES[4]);
    setWInput(8);
    setHInput(4);
    setMaterial('13oz');
    setQuantity(1);
    setErrorOutput('');
    setGenerationFallbackNote('');
    setDebugOutput('');
    setBusy(null);
  };

  const addToCartFromAI = async () => {
    try {
      if (isAddingToCart) return;
      setIsAddingToCart(true);
      setCartMessage('');
      if (!imageUrl) { setCartMessage('Add to cart failed: no generated image.'); setIsAddingToCart(false); return; }
      const subtotal = pricing.subtotalCents / 100;
      const tax = (pricing.subtotalCents * TAX_RATE) / 100;
      const total = subtotal + tax;
      const id = addFromQuote({ widthIn, heightIn, quantity, material, grommets: grommetOption === 'none' ? 'none' : 'all', polePockets: polePocketPlacement, rope: ropePlacement !== 'none', ropePlacement, file: { url: imageUrl, name: 'ai-banner.png', isPdf: false }, imageScale: imageTransform.scale, imagePosition: { x: imageTransform.x, y: imageTransform.y }, fitMode: imageTransform.mode, textElements: [], overlayImage: null } as any, {
        productType: 'banner',
        source: 'admin-ai-designer',
        widthFt,
        heightFt,
        finishingSystem: finishingType,
        grommetOption,
        grommetOptionLabel: grommetLabel,
        ropePlacement,
        ropePlacementLabel: ropeLabel,
        polePocketPlacement,
        polePocketPlacementLabel: poleLabel,
        hemmingIncluded: true,
        designTransform: imageTransform,
        pricingBreakdown: { subtotal, tax, total, materialRate: pricing.materialPricePerSqFtCents / 100 },
        canvasStateJson: JSON.stringify({ imageTransform, finishingType, grommetOption, ropePlacement, polePocketPlacement }),
      });
      if (id) {
        setCartMessage('Added to cart.');
        setTimeout(() => {
          resetDesigner();
          setCartMessage('');
          setIsAddingToCart(false);
        }, 1000);
      } else {
        setCartMessage('Add to cart failed.');
        setIsAddingToCart(false);
      }
    } catch (e: any) {
      setCartMessage(`Add to cart failed: ${e?.message || 'Unknown error'}`);
      setIsAddingToCart(false);
    }
  };

  const readFile = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(f); });

  const grommetLabel = GROMMET_OPTIONS.find((o) => o.value === grommetOption)?.label || 'None';
  const ropeLabel = PLACEMENTS.find((o) => o.value === ropePlacement)?.label || 'None';
  const poleLabel = PLACEMENTS.find((o) => o.value === polePocketPlacement)?.label || 'None';

  return (
    <Layout>
      <section className="min-h-screen bg-[#f3f4f6] text-slate-900">
        <div className="max-w-[1680px] mx-auto p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-[360px_1fr_360px] gap-5">
    <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <p className="text-slate-500 text-lg">Generate and configure your perfect banner.</p>
      <div className="border-t border-slate-100 pt-5">
      <h1 className="text-sm font-black tracking-wide uppercase flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-[#ffd200] grid place-items-center text-xs">1</span>Describe your design</h1>
      <p className="text-sm text-slate-500 mt-2">Be descriptive. Mention colors, styles, and text.</p>
      <div className="relative mt-3">
        <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={5} className="w-full rounded-xl border border-slate-200 bg-white p-4 pr-11 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60" placeholder="e.g. A vibrant summer sale banner with palm trees, bright sun rays, and a central text area." />
        <Mic className="absolute bottom-3 right-3 w-4 h-4 text-slate-400" />
      </div>
      <button disabled={busy!==null||!prompt.trim()} onClick={async()=>{setBusy('enhance');setErrorOutput('');try{const {body}=await callFn('enhance'); if(body?.enhancedPrompt) setEnhancedPrompt(body.enhancedPrompt); else setErrorOutput(body?.safeErrorMessage||body?.error||'Enhance failed.');}finally{setBusy(null);}}} className="mt-3 w-full border border-slate-200 bg-white text-slate-700 py-2.5 rounded-xl inline-flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"><Sparkles className="w-4 h-4 text-[#d4a700]" />{busy==='enhance'?<><Spinner/>Enhancing Prompt...</>:'Enhance Prompt with AI'}</button>
      <textarea value={enhancedPrompt} onChange={(e)=>setEnhancedPrompt(e.target.value)} rows={4} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" placeholder="Enhanced prompt will appear here..." />
      </div>
      <div className="border-t border-slate-100 pt-5">
        <h2 className="text-sm font-black tracking-wide uppercase flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-[#ffd200] grid place-items-center text-xs">2</span>Upload reference image</h2>
        <label className="mt-3 block rounded-xl border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-[#ffd200] bg-slate-50/60">
          <Upload className="w-7 h-7 mx-auto text-slate-500 mb-2" />
          <span className="text-sm font-semibold text-slate-700">Upload Reference Image</span>
          <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP • Optional</p>
          <input type="file" accept="image/*" onChange={async(e)=>{const f=e.target.files?.[0]; if(f) setReferenceImage(await readFile(f));}} className="hidden"/>
        </label>
      </div>
      <button disabled={busy!==null||!(enhancedPrompt||prompt).trim()} onClick={async()=>{setBusy('generate');setErrorOutput('');setGenerationFallbackNote('');try{const {body}=await callFn('generate'); if(body?.image?.url||body?.imageUrl){saveSnapshot(); setImageUrl(body?.image?.url||body?.imageUrl); if(body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');} else setErrorOutput(body?.safeErrorMessage||body?.error||'Generate failed.');}finally{setBusy(null);}}} className="w-full bg-[#ffd200] hover:bg-[#ffdb38] text-slate-900 font-bold py-3.5 rounded-xl inline-flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all disabled:bg-[#fde68a] disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none">{busy==='generate'?<><Spinner/>Generating Design...</>:<><Sparkles className="w-4 h-4" />Generate Design</>}</button>
      {imageUrl && <>
        <input value={editInstruction} onChange={(e)=>setEditInstruction(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3" placeholder="Edit instruction"/>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async()=>{setBusy('enhanceEdit');try{const {body}=await callFn('enhance'); if(body?.enhancedPrompt) setEditInstruction(body.enhancedPrompt);}finally{setBusy(null);}}} className="w-full border border-slate-200 py-2.5 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed bg-white">Enhance Edit Prompt</button>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async()=>{setBusy('edit');setErrorOutput('');try{const {body}=await callFn('edit'); if(body?.image?.url||body?.imageUrl){saveSnapshot(); setImageUrl(body?.image?.url||body?.imageUrl); if(body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');} else setErrorOutput(body?.safeErrorMessage||body?.error||'Edit failed.');}finally{setBusy(null);}}} className="w-full border border-slate-200 py-2.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed bg-white">{busy==='edit'?<><Spinner/>Applying AI edits...</>:<><Wand2 className="w-4 h-4" />Edit with AI</>}</button>
        <button disabled={busy!==null||history.length===0} onClick={revertOne} className="w-full border border-slate-200 py-2.5 rounded-xl disabled:opacity-50 bg-white">Revert</button>
      </>}
      <div className="border-t border-slate-100 pt-4">
      <button onClick={()=>setShowDebug(v=>!v)} className="w-full py-2 rounded-lg text-xs border border-slate-200 bg-slate-50 inline-flex items-center justify-center gap-2 text-slate-600 hover:bg-slate-100">{showDebug ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}Admin debug tools</button>
      {showDebug && <button disabled={busy!==null} onClick={async()=>{setBusy('debug');try{const {body}=await callFn('debug'); setDebugOutput(JSON.stringify(body,null,2));}finally{setBusy(null);}}} className="mt-2 w-full border border-cyan-200 bg-cyan-50 text-cyan-800 py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed">Run Debug Check</button>}
      </div>
      {errorOutput && <p className="text-sm text-red-400">{errorOutput}</p>}
      {generationFallbackNote && <p className="text-sm text-amber-300">{generationFallbackNote}</p>}
      {debugOutput && <pre className="text-xs text-slate-700 bg-slate-100 border border-slate-200 p-2 rounded overflow-auto">{debugOutput}</pre>}
    </aside>

    <main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mx-auto max-w-4xl">
        <div className="relative pl-14 pb-16 pr-4 pt-4">
          <div className="absolute left-0 top-4 bottom-16 w-12 pointer-events-none">
            <div className="absolute inset-0 border-r border-slate-300" />
            {marks(heightFt, 320).map((i)=> <div key={`y-${i}`} className="absolute" style={{ top:`${(i/Math.max(1,heightFt))*100}%`, right:'4px', transform:'translateY(-50%)' }}><div className="h-px w-2 bg-slate-400 ml-auto"/><span className="text-[10px] text-slate-500 whitespace-nowrap block text-right">{i} ft</span></div>)}
          </div>

          <div ref={canvasRef} className="relative w-full bg-white border border-slate-300 shadow-sm" style={{ aspectRatio: `${widthIn}/${heightIn}` }} onMouseDown={(e)=>{ if (e.target === e.currentTarget) setSelected(false); }}>
            {imageUrl ? <div className="absolute inset-0 overflow-hidden">
            {(() => {
              const b = getImageBox();
              const wrapperStyle = {
                position: 'absolute' as const,
                left: '50%',
                top: '50%',
                width: `${b.baseW}%`,
                height: `${b.baseH}%`,
                transform: `translate(-50%, -50%) translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageTransform.scale})`,
                transformOrigin: 'center',
              };
              return <div style={wrapperStyle}>
                <img src={imageUrl} alt="Generated banner" className="w-full h-full cursor-move select-none" draggable={false}
                  style={{ objectFit: imageTransform.mode==='fit'?'contain':'cover' }}
                  onLoad={(e)=>{ const img=e.currentTarget; if(img.naturalWidth&&img.naturalHeight) setImageNaturalRatio(img.naturalWidth/img.naturalHeight); }}
                  onPointerDown={(e)=>{ e.stopPropagation(); setSelected(true); dragState.current={type:'move',startX:e.clientX,startY:e.clientY,origin:imageTransform}; }} />
              </div>;
            })()}
          </div> : <div className="absolute inset-0 grid place-items-center text-slate-500 font-semibold">Generate or upload an image</div>}

                      <div className="absolute inset-0 pointer-events-none">
              {grommetPositions.map((p, i) => {
                const inset = 12;
                const x = `calc(${p.xPercent}% + ${p.xPercent < 50 ? inset : -inset}px)`;
                const y = `calc(${p.yPercent}% + ${p.yPercent < 50 ? inset : -inset}px)`;
                return <div key={i} className="absolute h-3 w-3 rounded-full bg-slate-100 border border-slate-700 shadow" style={{ left: x, top: y, transform:'translate(-50%,-50%)' }}><div className="absolute inset-[3px] rounded-full bg-slate-700"/></div>;
              })}
            </div>

            {busy==='generate' && <div className="absolute inset-0 bg-white/70 grid place-items-center"><div className="text-center"><div className="mx-auto mb-3 h-8 w-8 border-4 border-yellow-500 border-r-transparent rounded-full animate-spin"/><p className="text-slate-700 font-semibold">Generating your banner design...</p></div></div>}
          </div>

          <div className="absolute left-14 right-4 bottom-10 h-6 pointer-events-none border-t border-slate-300">
            {marks(widthFt, 720).map((i)=> <div key={`x-${i}`} className="absolute" style={{ left:`${(i/Math.max(1,widthFt))*100}%`, top:'0', transform:'translateX(-50%)' }}><div className="w-px h-2 bg-slate-400 mx-auto"/><span className="text-[10px] text-slate-500 whitespace-nowrap block text-center mt-1">{i} ft</span></div>)}
          </div>
        </div>

          <div className="mt-2 flex gap-2 flex-wrap">
          <button onClick={fit} className="px-3 py-1.5 border border-slate-200 bg-white rounded-full shadow-sm">Fit</button>
          <button onClick={fill} className="px-3 py-1.5 border border-slate-200 bg-white rounded-full shadow-sm">Fill</button>
          <button onClick={reset} className="px-3 py-1.5 border border-slate-200 bg-white rounded-full shadow-sm">Reset</button>
          <button onClick={()=>setImageTransform(t=>({...t, scale:Math.min(2, Number((t.scale+0.1).toFixed(2))), mode:'custom'}))} className="px-3 py-1.5 border border-slate-200 bg-white rounded-full shadow-sm">Zoom In</button><button onClick={()=>setImageTransform(t=>({...t, scale:Math.max(0.5, Number((t.scale-0.1).toFixed(2))), mode:'custom'}))} className="px-3 py-1.5 border border-slate-200 bg-white rounded-full shadow-sm">Zoom Out</button>
          <button onClick={clearImage} className="px-3 py-1.5 border border-red-200 text-red-600 bg-white rounded-full shadow-sm">Clear Image</button>
        </div>
        <input type="range" min={0.5} max={2} step={0.01} value={imageTransform.scale} onChange={(e)=>setImageTransform(t=>({...t, scale:Number(e.target.value), mode:'custom'}))} className="mt-3 w-full" />

        <div className="mt-3 flex gap-2 overflow-x-auto">{history.map((h,i)=><button key={i} onClick={()=>restoreSnapshot(h)} className="w-14 h-14 border border-slate-200 rounded overflow-hidden"><img src={h.imageUrl} className="w-full h-full object-cover"/></button>)}</div>
      </div>
    </main>

    <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-3xl font-black tracking-tight">BANNER OPTIONS</h2>
      <label className="block mt-3 text-sm font-semibold text-slate-700">Size Mode<select value={sizeMode} onChange={(e)=>setSizeMode(e.target.value as any)} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]"><option value="popular">Popular Sizes</option><option value="custom">Custom Size</option></select></label>
      {sizeMode==='popular' ? <select value={size.label} onChange={(e)=>setSize(POPULAR_SIZES.find(s=>s.label===e.target.value) || POPULAR_SIZES[0])} className="mt-2 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]">{POPULAR_SIZES.map(s=><option key={s.label}>{s.label}</option>)}</select> : <div className="mt-2 space-y-2"><label className="block text-sm text-slate-700">Width (ft)<input type="number" step={1} value={wInput} onChange={e=>setWInput(Math.max(1, Math.round(Number(e.target.value)||1)))} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]"/></label><label className="block text-sm text-slate-700">Height (ft)<input type="number" step={1} value={hInput} onChange={e=>setHInput(Math.max(1, Math.round(Number(e.target.value)||1)))} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]"/></label></div>}
      <p className="mt-2 text-xs text-slate-500">{areaSqFt.toFixed(2)} sq ft • {widthIn} in x {heightIn} in</p>

      <label className="block mt-2 text-sm font-semibold text-slate-700">Material<select value={material} onChange={(e)=>setMaterial(e.target.value as MaterialKey)} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]">{MATERIALS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className="block mt-2 text-sm font-semibold text-slate-700">Grommets<select value={grommetOption} onChange={(e)=>onGrommetChange(e.target.value)} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]">{GROMMET_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block mt-2 text-sm font-semibold text-slate-700">Rope<select value={ropePlacement} onChange={(e)=>onRopeChange(e.target.value)} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block mt-2 text-sm font-semibold text-slate-700">Pole Pockets<select value={polePocketPlacement} onChange={(e)=>onPoleChange(e.target.value)} className="mt-1 w-full bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <p className="mt-2 text-xs text-slate-500">Hemming is always included. All banners are finished with a folded, heat-welded hem for added strength.</p>

      <label className="block mt-2">Quantity
        <div className="mt-1 grid grid-cols-3 border border-slate-200 rounded-xl overflow-hidden">
          <button type="button" onClick={()=>setQuantity(q=>Math.max(1,q-1))} className="h-11 grid place-items-center hover:bg-slate-50"><Minus className="w-4 h-4"/></button>
          <input type="number" min={1} value={quantity} onChange={(e)=>setQuantity(Math.max(1, Number(e.target.value)||1))} className="h-11 text-center border-x border-slate-200"/>
          <button type="button" onClick={()=>setQuantity(q=>q+1)} className="h-11 grid place-items-center hover:bg-slate-50"><Plus className="w-4 h-4"/></button>
        </div>
      </label>

      <div className="mt-3 text-center">
        <p className="text-4xl font-black text-slate-900">{usd((pricing.subtotalCents * (1 + TAX_RATE)) / 100)}</p>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
        <div className="flex justify-between"><span className="text-slate-500">Grommets</span><span className="text-slate-700">{finishingType==='grommets' ? grommetLabel : 'None'}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Pole Pockets</span><span className="text-slate-700">{finishingType==='pole_pockets' ? poleLabel : 'None'}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Rope Hemming</span><span className="text-slate-700">{finishingType==='rope' ? ropeLabel : 'None'}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Hemming</span><span className="text-slate-700">Always Included</span></div>
        <hr className="border-slate-200 my-2" />
        <div className="flex justify-between"><span className="text-slate-500">Base banner</span><span className="text-slate-700">{usd(pricing.unitBasePriceCents / 100)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Shipping</span><span className="text-emerald-600 font-semibold">FREE</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Tax (6%)</span><span className="text-slate-700">{usd((pricing.subtotalCents * TAX_RATE) / 100)}</span></div>
        <div className="flex justify-between font-semibold"><span>Adjusted subtotal</span><span>{usd(pricing.subtotalCents / 100)}</span></div>
        <div className="flex justify-between font-bold text-lg"><span>Total with tax</span><span className="text-[#D4AF37]">{usd((pricing.subtotalCents * (1 + TAX_RATE)) / 100)}</span></div>
      </div>

      <div className="mt-3 flex gap-2">
        <input value={promoCode} onChange={(e)=>setPromoCode(e.target.value)} placeholder="Promo Code" className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ffd200]/60 focus:border-[#ffd200]" />
        <button type="button" className="px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50">Apply</button>
      </div>
      <p className="mt-3 text-xs text-center text-gray-500 inline-flex items-center gap-1"><BadgeCheck className="w-3 h-3 text-emerald-600"/>FREE Next-Day Air Included • Tax calculated at checkout</p>

      <button onClick={addToCartFromAI} disabled={!imageUrl || isAddingToCart} className="mt-3 w-full bg-[#ffd200] hover:bg-[#ffdb38] text-slate-900 font-bold py-3 rounded-xl transition-colors disabled:bg-[#fde68a] disabled:text-slate-500 disabled:cursor-not-allowed">{isAddingToCart ? 'Adding...' : cartMessage === 'Added to cart.' ? 'Added' : 'ADD TO CART'}</button>
      {cartMessage && <p className={`mt-2 text-sm ${cartMessage === 'Added to cart.' ? 'text-emerald-400' : 'text-red-400'}`}>{cartMessage}</p>}
    </aside>
        </div>
      </section>
    </Layout>
  );
};

export default AIDesignerPage;
