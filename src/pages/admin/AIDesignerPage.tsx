import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { TAX_RATE, usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import type { MaterialKey } from '@/store/quote';

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
  keepProportions: boolean;
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
  const [useFeet, setUseFeet] = useState(true);
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
  const [cartMessage, setCartMessage] = useState('');

  const [history, setHistory] = useState<Snap[]>([]);

  const [imageTransform, setImageTransform] = useState({ x: 0, y: 0, scale: 1, mode: 'fill' as 'fit'|'fill'|'custom' });
  const [imageNaturalRatio, setImageNaturalRatio] = useState(16/9);
  const [keepProportions, setKeepProportions] = useState(true);
  const [selected, setSelected] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ type: 'move' | 'scale'; handle?: 'tl'|'tr'|'bl'|'br'; startX: number; startY: number; origin: typeof imageTransform } | null>(null);

  const widthFt = sizeMode === 'popular' ? size.w : (useFeet ? wInput : wInput / 12);
  const heightFt = sizeMode === 'popular' ? size.h : (useFeet ? hInput : hInput / 12);
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
        return;
      }

      // Proportional corner scaling with opposite-corner anchor stability.
      const signByHandle: Record<string, { sx: number; sy: number }> = {
        tl: { sx: -1, sy: -1 },
        tr: { sx: 1, sy: -1 },
        bl: { sx: -1, sy: 1 },
        br: { sx: 1, sy: 1 },
      };
      const signs = signByHandle[d.handle || 'br'];
      const dominant = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const signedDelta = signs.sx * dominant;
      const directionalDelta = keepProportions ? signedDelta : (signs.sx * dx + signs.sy * dy) / 2;
      const nextScale = Math.max(0.2, Math.min(6, d.origin.scale + directionalDelta / 260));
      const ratio = nextScale / Math.max(0.0001, d.origin.scale);

      // Move center so opposite corner remains anchored.
      const box = getImageBox();
      const wPx = (box.baseW / 100) * (canvasRef.current?.clientWidth || 1) * d.origin.scale;
      const hPx = (box.baseH / 100) * (canvasRef.current?.clientHeight || 1) * d.origin.scale;
      const offsetX = (wPx * (ratio - 1)) / 2;
      const offsetY = (hPx * (ratio - 1)) / 2;
      const cxDir = signs.sx;
      const cyDir = signs.sy;

      setImageTransform((t) => ({
        ...t,
        scale: nextScale,
        x: d.origin.x + cxDir * offsetX,
        y: d.origin.y + cyDir * offsetY,
        mode: 'custom',
      }));
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
    const snap: Snap = { imageUrl, prompt, enhancedPrompt, transform: imageTransform, keepProportions, finishingType, grommetOption, ropePlacement, polePocketPlacement };
    setHistory((h) => [snap, ...h].slice(0, 20));
  };

  const restoreSnapshot = (s: Snap) => {
    setImageUrl(s.imageUrl);
    setPrompt(s.prompt);
    setEnhancedPrompt(s.enhancedPrompt);
    setImageTransform(s.transform);
    setKeepProportions(s.keepProportions);
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

  const addToCartFromAI = async () => {
    try {
      setCartMessage('');
      if (!imageUrl) return setCartMessage('Add to cart failed: no generated image.');
      const subtotal = pricing.subtotalCents / 100;
      const tax = (pricing.subtotalCents * TAX_RATE) / 100;
      const total = subtotal + tax;
      const id = addFromQuote({ widthIn, heightIn, quantity, material, grommets: grommetOption === 'none' ? 'none' : 'all', polePockets: polePocketPlacement, rope: ropePlacement !== 'none', ropePlacement, file: { url: imageUrl, name: 'ai-banner.png', isPdf: false }, imageScale: imageTransform.scale, imagePosition: { x: imageTransform.x, y: imageTransform.y }, fitMode: imageTransform.mode, textElements: [], overlayImage: null } as any, {
        productType: 'banner',
        source: 'admin-ai-designer',
        widthFt,
        heightFt,
        grommetOption,
        ropePlacement,
        polePocketPlacement,
        hemmingIncluded: true,
        designTransform: imageTransform,
        pricingBreakdown: { subtotal, tax, total, materialRate: pricing.materialPricePerSqFtCents / 100 },
        canvasStateJson: JSON.stringify({ imageTransform, finishingType, grommetOption, ropePlacement, polePocketPlacement }),
      });
      setCartMessage(id ? 'Added to cart.' : 'Add to cart failed.');
    } catch (e: any) {
      setCartMessage(`Add to cart failed: ${e?.message || 'Unknown error'}`);
    }
  };

  const readFile = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(f); });

  const grommetLabel = GROMMET_OPTIONS.find((o) => o.value === grommetOption)?.label || 'None';
  const ropeLabel = PLACEMENTS.find((o) => o.value === ropePlacement)?.label || 'None';
  const poleLabel = PLACEMENTS.find((o) => o.value === polePocketPlacement)?.label || 'None';

  return <Layout><section className="min-h-screen bg-[#0b0d12] text-white p-4 lg:p-6"><div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[360px_1fr_340px] gap-4">
    <aside className="border border-white/10 bg-[#12151d] p-5 space-y-3">
      <h1 className="text-4xl font-black">AI DESIGNER</h1>
      <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={4} className="w-full bg-black/60 border border-yellow-500 rounded p-3" placeholder="Describe the banner design you want to generate..." />
      <button disabled={busy!==null||!prompt.trim()} onClick={async()=>{setBusy('enhance');setErrorOutput('');try{const {body}=await callFn('enhance'); if(body?.enhancedPrompt) setEnhancedPrompt(body.enhancedPrompt); else setErrorOutput(body?.safeErrorMessage||body?.error||'Enhance failed.');}finally{setBusy(null);}}} className="w-full border border-yellow-600 text-yellow-300 py-2 rounded inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='enhance'?<><Spinner/>Enhancing Prompt...</>:'✨ ENHANCE PROMPT WITH AI'}</button>
      <textarea value={enhancedPrompt} onChange={(e)=>setEnhancedPrompt(e.target.value)} rows={5} className="w-full bg-black/60 border border-white/20 rounded p-3" placeholder="Enhanced prompt will appear here after AI enhancement..." />
      <input type="file" accept="image/*" onChange={async(e)=>{const f=e.target.files?.[0]; if(f) setReferenceImage(await readFile(f));}} className="block w-full text-sm"/>
      <button disabled={busy!==null||!(enhancedPrompt||prompt).trim()} onClick={async()=>{setBusy('generate');setErrorOutput('');setGenerationFallbackNote('');try{const {body}=await callFn('generate'); if(body?.image?.url||body?.imageUrl){saveSnapshot(); setImageUrl(body?.image?.url||body?.imageUrl); if(body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');} else setErrorOutput(body?.safeErrorMessage||body?.error||'Generate failed.');}finally{setBusy(null);}}} className="w-full bg-yellow-700 text-black font-bold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='generate'?<><Spinner/>Generating Design...</>:'⚡ GENERATE DESIGN'}</button>
      {imageUrl && <>
        <input value={editInstruction} onChange={(e)=>setEditInstruction(e.target.value)} className="w-full bg-black/60 border border-white/20 rounded p-2" placeholder="Edit instruction"/>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async()=>{setBusy('enhanceEdit');try{const {body}=await callFn('enhance'); if(body?.enhancedPrompt) setEditInstruction(body.enhancedPrompt);}finally{setBusy(null);}}} className="w-full border border-white/20 py-2 rounded disabled:opacity-50">Enhance Edit Prompt with AI</button>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async()=>{setBusy('edit');setErrorOutput('');try{const {body}=await callFn('edit'); if(body?.image?.url||body?.imageUrl){saveSnapshot(); setImageUrl(body?.image?.url||body?.imageUrl); if(body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');} else setErrorOutput(body?.safeErrorMessage||body?.error||'Edit failed.');}finally{setBusy(null);}}} className="w-full border border-white/20 py-2 rounded inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='edit'?<><Spinner/>Applying AI edits...</>:'Edit with AI'}</button>
        <button disabled={busy!==null||history.length===0} onClick={revertOne} className="w-full border border-white/20 py-2 rounded disabled:opacity-50">Revert</button>
      </>}
      <button disabled={busy!==null} onClick={async()=>{setBusy('debug');try{const {body}=await callFn('debug'); setDebugOutput(JSON.stringify(body,null,2));}finally{setBusy(null);}}} className="w-full border border-cyan-600 text-cyan-300 py-2 rounded disabled:opacity-50">Admin Debug Check</button>
      {errorOutput && <p className="text-sm text-red-400">{errorOutput}</p>}
      {generationFallbackNote && <p className="text-sm text-amber-300">{generationFallbackNote}</p>}
      {debugOutput && <pre className="text-xs text-cyan-200 bg-black/40 p-2 rounded overflow-auto">{debugOutput}</pre>}
    </aside>

    <main className="border border-white/10 bg-[#11151d] p-6">
      <div className="mt-2 mx-auto max-w-4xl">
        <div className="relative pl-14 pb-16 pr-4 pt-4">
          <div className="absolute left-0 top-4 bottom-16 w-12 pointer-events-none">
            <div className="absolute inset-0 border-r border-white/40" />
            {marks(heightFt, 320).map((i)=> <div key={`y-${i}`} className="absolute" style={{ top:`${(i/Math.max(1,heightFt))*100}%`, right:'4px', transform:'translateY(-50%)' }}><div className="h-px w-2 bg-white/80 ml-auto"/><span className="text-[10px] text-white/90 whitespace-nowrap block text-right">{i} ft</span></div>)}
          </div>

          <div ref={canvasRef} className="relative w-full bg-black border border-white/30" style={{ aspectRatio: `${widthIn}/${heightIn}` }} onMouseDown={(e)=>{ if (e.target === e.currentTarget) setSelected(false); }}>
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
                {selected && <div className="absolute inset-0 border border-blue-400 pointer-events-none" />}
                {selected && ['tl','tr','bl','br'].map((h)=> <button key={h} className={`absolute bg-white border border-blue-500 shadow ${h==='tl'?'cursor-nwse-resize':h==='tr'?'cursor-nesw-resize':h==='bl'?'cursor-nesw-resize':'cursor-nwse-resize'}`} style={{ width:'9px', height:'9px', borderRadius:'4px', left: h.includes('l') ? '0%' : '100%', top: h.startsWith('t') ? '0%' : '100%', transform:'translate(-50%, -50%)' }} onPointerDown={(e)=>{ e.stopPropagation(); dragState.current={type:'scale',handle:h as any,startX:e.clientX,startY:e.clientY,origin:imageTransform}; }} />)}
              </div>;
            })()}
          </div> : <div className="absolute inset-0 grid place-items-center text-white/90 font-semibold">Generate or upload an image</div>}

            <div className="absolute inset-0 pointer-events-none">
              {grommetPositions.map((p, i) => {
                const inset = 12;
                const x = `calc(${p.xPercent}% + ${p.xPercent < 50 ? inset : -inset}px)`;
                const y = `calc(${p.yPercent}% + ${p.yPercent < 50 ? inset : -inset}px)`;
                return <div key={i} className="absolute h-3 w-3 rounded-full bg-slate-100 border border-slate-700 shadow" style={{ left: x, top: y, transform:'translate(-50%,-50%)' }}><div className="absolute inset-[3px] rounded-full bg-slate-700"/></div>;
              })}
            </div>

            {busy==='generate' && <div className="absolute inset-0 bg-black/60 grid place-items-center"><div className="text-center"><div className="mx-auto mb-3 h-8 w-8 border-4 border-yellow-400 border-r-transparent rounded-full animate-spin"/><p className="text-white font-semibold">Generating your banner design...</p></div></div>}
          </div>

          <div className="absolute left-14 right-4 bottom-10 h-6 pointer-events-none border-t border-white/40">
            {marks(widthFt, 720).map((i)=> <div key={`x-${i}`} className="absolute" style={{ left:`${(i/Math.max(1,widthFt))*100}%`, top:'0', transform:'translateX(-50%)' }}><div className="w-px h-2 bg-white/80 mx-auto"/><span className="text-[10px] text-white/90 whitespace-nowrap block text-center mt-1">{i} ft</span></div>)}
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <button onClick={fit} className="px-3 py-1 border border-white/20 rounded">Fit</button>
          <button onClick={fill} className="px-3 py-1 border border-white/20 rounded">Fill</button>
          <button onClick={reset} className="px-3 py-1 border border-white/20 rounded">Reset</button>
          <button onClick={()=>setKeepProportions(v=>!v)} className="px-3 py-1 border border-white/20 rounded">Keep Proportions: {keepProportions?'On':'Off'}</button>
          <button onClick={clearImage} className="px-3 py-1 border border-red-400/40 text-red-200 rounded">Clear Image</button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto">{history.map((h,i)=><button key={i} onClick={()=>restoreSnapshot(h)} className="w-14 h-14 border border-white/20 overflow-hidden"><img src={h.imageUrl} className="w-full h-full object-cover"/></button>)}</div>
      </div>
    </main>

    <aside className="border border-white/10 bg-[#12151d] p-5">
      <h2 className="text-3xl font-black">BANNER OPTIONS</h2>
      <label className="block mt-3">Size Mode<select value={sizeMode} onChange={(e)=>setSizeMode(e.target.value as any)} className="mt-1 w-full bg-black border border-white/20 p-2"><option value="popular">Popular Sizes</option><option value="custom">Custom Size</option></select></label>
      {sizeMode==='popular' ? <select value={size.label} onChange={(e)=>setSize(POPULAR_SIZES.find(s=>s.label===e.target.value) || POPULAR_SIZES[0])} className="mt-2 w-full bg-black border border-white/20 p-2">{POPULAR_SIZES.map(s=><option key={s.label}>{s.label}</option>)}</select> : <div className="mt-2 space-y-2"><button onClick={()=>setUseFeet((v)=>!v)} className="w-full border border-white/20 p-2 rounded">Units: {useFeet?'Feet':'Inches'}</button><input type="number" value={wInput} onChange={e=>setWInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2"/><input type="number" value={hInput} onChange={e=>setHInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2"/></div>}
      <p className="mt-2 text-xs text-gray-300">{areaSqFt.toFixed(2)} sq ft • {widthIn} in x {heightIn} in</p>

      <label className="block mt-2">Material<select value={material} onChange={(e)=>setMaterial(e.target.value as MaterialKey)} className="mt-1 w-full bg-black border border-white/20 p-2">{MATERIALS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className="block mt-2">Grommets<select value={grommetOption} onChange={(e)=>onGrommetChange(e.target.value)} className="mt-1 w-full bg-black border border-white/20 p-2">{GROMMET_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block mt-2">Rope<select value={ropePlacement} onChange={(e)=>onRopeChange(e.target.value)} className="mt-1 w-full bg-black border border-white/20 p-2">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block mt-2">Pole Pockets<select value={polePocketPlacement} onChange={(e)=>onPoleChange(e.target.value)} className="mt-1 w-full bg-black border border-white/20 p-2">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <p className="mt-2 text-xs text-gray-300">Hemming is always included. All banners are finished with a folded, heat-welded hem for added strength.</p>

      <label className="block mt-2">Quantity<input type="number" min={1} value={quantity} onChange={(e)=>setQuantity(Math.max(1, Number(e.target.value)||1))} className="mt-1 w-full bg-black border border-white/20 p-2"/></label>

      <div className="mt-4 text-sm space-y-1">
        <p>Size: {widthFt.toFixed(0)} ft x {heightFt.toFixed(0)} ft</p>
        <p>Area: {areaSqFt.toFixed(2)} sq ft</p>
        <p>Material: {MATERIALS.find(m=>m.value===material)?.label}</p>
        <p>Quantity: {quantity}</p>
        <p>Hemming: Included</p>
        <p>Grommets: {finishingType==='grommets' ? grommetLabel : 'None'}</p>
        <p>Rope: {finishingType==='rope' ? ropeLabel : 'None'}</p>
        <p>Pole Pockets: {finishingType==='pole_pockets' ? poleLabel : 'None'}</p>
        <p>Base price: {usd(pricing.unitBasePriceCents / 100)}</p>
        <p>Material rate: {usd((pricing.materialPricePerSqFtCents||0)/100)}/sqft</p>
        <p>Subtotal: {usd(pricing.subtotalCents / 100)}</p>
        <p>Tax: {usd((pricing.subtotalCents * TAX_RATE) / 100)}</p>
        <p className="font-bold">Total: {usd((pricing.subtotalCents * (1 + TAX_RATE)) / 100)}</p>
      </div>

      <button onClick={addToCartFromAI} disabled={!imageUrl} className="mt-3 w-full bg-yellow-700 text-black font-bold py-3 disabled:opacity-60">ADD TO CART</button>
      {cartMessage && <p className={`mt-2 text-sm ${cartMessage === 'Added to cart.' ? 'text-emerald-400' : 'text-red-400'}`}>{cartMessage}</p>}
    </aside>
  </div></section></Layout>;
};

export default AIDesignerPage;
