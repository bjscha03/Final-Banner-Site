import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { BANNER_MATERIALS } from '@/lib/banner-materials';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { TAX_RATE, usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import type { MaterialKey } from '@/store/quote';
import GrommetOverlay from '@/components/preview/GrommetOverlay';

const POPULAR_SIZES = [{ label: "4' x 2'", w: 4, h: 2 }, { label: "6' x 2'", w: 6, h: 2 }, { label: "6' x 3'", w: 6, h: 3 }, { label: "8' x 3'", w: 8, h: 3 }, { label: "8' x 4'", w: 8, h: 4 }, { label: "10' x 4'", w: 10, h: 4 }];
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
const PLACEMENTS = [{ value: 'none', label: 'None' }, { value: 'top', label: 'Top Only' }, { value: 'bottom', label: 'Bottom Only' }, { value: 'top-bottom', label: 'Top & Bottom' }];

const Spinner = () => <span className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />;

type Finishing = 'none' | 'grommets' | 'rope' | 'pole_pockets';
type Snap = { imageUrl: string; prompt: string; enhancedPrompt: string; imageX: number; imageY: number; imageScale: number; fitMode: 'fit'|'fill'|'custom'; keepProportions: boolean; finishingType: Finishing; grommetOption: string; ropePlacement: string; polePocketPlacement: string };

const AIDesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const admin = isAdmin(user);
  const addFromQuote = useCartStore((s) => s.addFromQuote);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{sx:number;sy:number;ox:number;oy:number;mode:'move'|'scale';sxScale:number;syScale:number} | null>(null);

  const [sizeMode, setSizeMode] = useState<'popular'|'custom'>('popular');
  const [size, setSize] = useState(POPULAR_SIZES[4]);
  const [useFeet, setUseFeet] = useState(true);
  const [wInput, setWInput] = useState(8);
  const [hInput, setHInput] = useState(4);
  const [prompt, setPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [finishingType, setFinishingType] = useState<Finishing>('none');
  const [grommetOption, setGrommetOption] = useState('none');
  const [ropePlacement, setRopePlacement] = useState('none');
  const [polePocketPlacement, setPolePocketPlacement] = useState('none');
  const [quantity, setQuantity] = useState(1);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'enhance'|'enhanceEdit'|'generate'|'edit'|'debug'|'revert'|null>(null);
  const [message, setMessage] = useState('');
  const [debugOutput, setDebugOutput] = useState('');
  const [errorOutput, setErrorOutput] = useState('');
  const [generationFallbackNote, setGenerationFallbackNote] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [history, setHistory] = useState<Snap[]>([]);
  const [fitMode, setFitMode] = useState<'fit'|'fill'|'custom'>('fill');
  const [keepProportions, setKeepProportions] = useState(true);
  const [imageX, setImageX] = useState(0);
  const [imageY, setImageY] = useState(0);
  const [imageScale, setImageScale] = useState(1);
  const [selected, setSelected] = useState(false);

  const widthFt = sizeMode === 'popular' ? size.w : (useFeet ? wInput : wInput / 12);
  const heightFt = sizeMode === 'popular' ? size.h : (useFeet ? hInput : hInput / 12);
  const widthIn = Math.max(12, Math.round(widthFt * 12));
  const heightIn = Math.max(12, Math.round(heightFt * 12));
  const areaSqFt = (widthIn * heightIn) / 144;

  const pricing = useMemo(() => calculateBannerPricing({ widthIn, heightIn, quantity, material, addRope: ropePlacement !== 'none', ropePlacement: ropePlacement as any, polePockets: polePocketPlacement } as any), [widthIn, heightIn, quantity, material, ropePlacement, polePocketPlacement]);
  if (!loading && !admin) return <Navigate to="/admin/setup" replace />;

  const toOverlayOption = () => {
    if (grommetOption === 'none') return 'none';
    const m:any = {
      every_2_3_feet: 'all',
      every_1_2_feet: 'allDense',
      four_corners: 'corners',
      top_corners: 'topCorners',
      bottom_corners: 'bottomCorners',
      left_side: 'leftOnly',
      right_side: 'rightOnly',
    };
    return m[grommetOption] || 'none';
  };

  const snapNow = (): Snap | null => imageUrl ? ({ imageUrl, prompt, enhancedPrompt, imageX, imageY, imageScale, fitMode, keepProportions, finishingType, grommetOption, ropePlacement, polePocketPlacement }) : null;
  const pushHistory = () => { const s = snapNow(); if (s) setHistory((h)=>[s,...h].slice(0,15)); };

  const callFn = async (action: string) => {
    const payload = { action, prompt, enhancedPrompt, editInstruction, imageUrl, size: { w: Number(widthFt.toFixed(2)), h: Number(heightFt.toFixed(2)) }, material, quantity, referenceImage };
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({ ok: false, safeErrorMessage: 'Invalid JSON response from function' }));
    return { status: res.status, body };
  };

  const setFinishingNone = () => { setFinishingType('none'); setGrommetOption('none'); setRopePlacement('none'); setPolePocketPlacement('none'); };
  const onGrommetChange = (v:string) => { setGrommetOption(v); if (v==='none') { if (finishingType==='grommets') setFinishingNone(); return; } setFinishingType('grommets'); setRopePlacement('none'); setPolePocketPlacement('none'); };
  const onRopeChange = (v:string) => { setRopePlacement(v); if (v==='none') { if (finishingType==='rope') setFinishingNone(); return; } setFinishingType('rope'); setGrommetOption('none'); setPolePocketPlacement('none'); };
  const onPoleChange = (v:string) => { setPolePocketPlacement(v); if (v==='none') { if (finishingType==='pole_pockets') setFinishingNone(); return; } setFinishingType('pole_pockets'); setGrommetOption('none'); setRopePlacement('none'); };

  const applyFit = () => { setFitMode('fit'); setImageScale(1); setImageX(0); setImageY(0); };
  const applyFill = () => { setFitMode('fill'); setImageScale(1); setImageX(0); setImageY(0); };
  const applyReset = () => { setFitMode('fill'); setImageScale(1); setImageX(0); setImageY(0); };

  useEffect(() => {
    const mm = (e:MouseEvent) => { if (!dragRef.current || !wrapRef.current) return; const d=dragRef.current; const dx=e.clientX-d.sx, dy=e.clientY-d.sy; if (d.mode==='move') { setImageX(d.ox+dx); setImageY(d.oy+dy); setFitMode('custom'); } else { const nextX=Math.max(0.2,d.sxScale + dx/200); const nextY=keepProportions?nextX:Math.max(0.2,d.syScale + dy/200); setImageScale(nextX); if(!keepProportions){} setFitMode('custom'); } };
    const mu = () => { dragRef.current=null; };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }, [keepProportions]);

  const restoreSnap = (s:Snap) => { setImageUrl(s.imageUrl); setPrompt(s.prompt); setEnhancedPrompt(s.enhancedPrompt); setImageX(s.imageX); setImageY(s.imageY); setImageScale(s.imageScale); setFitMode(s.fitMode); setKeepProportions(s.keepProportions); setFinishingType(s.finishingType); setGrommetOption(s.grommetOption); setRopePlacement(s.ropePlacement); setPolePocketPlacement(s.polePocketPlacement); };
  const revertOne = () => { if (!history.length) return; const [h,...rest]=history; restoreSnap(h); setHistory(rest); };

  const addToCartFromAI = async () => {
    try { setCartMessage(''); if (!imageUrl) return setCartMessage('Add to cart failed: no generated image.');
      const subtotal = pricing.subtotalCents / 100; const tax = (pricing.subtotalCents * TAX_RATE) / 100; const total = subtotal + tax;
      const id = addFromQuote({ widthIn, heightIn, quantity, material, grommets: finishingType==='grommets' ? 'all' : 'none', polePockets: finishingType==='pole_pockets' ? polePocketPlacement : 'none', rope: finishingType==='rope', ropePlacement, file:{url:imageUrl,name:'ai-banner.png',isPdf:false}, imageScale, imagePosition:{x:imageX,y:imageY}, fitMode, textElements:[], overlayImage:null } as any, { source:'admin-ai-designer', hemmingIncluded:true, finishingType, grommetOption, ropePlacement, polePocketPlacement, aiPricing:{subtotal,tax,total} });
      setCartMessage(id ? 'Added to cart.' : 'Add to cart failed.');
    } catch (e:any) { setCartMessage(`Add to cart failed: ${e?.message || 'Unknown error'}`); }
  };

  const readFile = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(f); });
  const marks = (n:number) => {
    const whole = Math.max(1, Math.floor(n));
    const ticks = Array.from({ length: whole + 1 }, (_, i) => i);
    const useStep2 = whole > 6;
    return ticks.filter((v) => v === 0 || v === whole || !useStep2 || v % 2 === 0);
  };

  return <Layout><section className="min-h-screen bg-[#0b0d12] text-white p-4 lg:p-6"><div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[360px_1fr_340px] gap-4">
    <aside className="border border-white/10 bg-[#12151d] p-5 space-y-3">
      <h1 className="text-4xl font-black">AI DESIGNER</h1>
      <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={4} className="w-full bg-black/60 border border-yellow-500 rounded p-3" placeholder="Describe the banner design you want to generate..." />
      <button disabled={busy!==null||!prompt.trim()} onClick={async () => { setBusy('enhance'); setErrorOutput(''); try { const { body } = await callFn('enhance'); if (body?.enhancedPrompt) setEnhancedPrompt(body.enhancedPrompt); else setErrorOutput(body?.safeErrorMessage || body?.error || 'Enhance failed.'); } finally { setBusy(null); } }} className="w-full border border-yellow-600 text-yellow-300 py-2 rounded inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='enhance'?<><Spinner/>Enhancing Prompt...</>:'✨ ENHANCE PROMPT WITH AI'}</button>
      <textarea value={enhancedPrompt} onChange={(e)=>setEnhancedPrompt(e.target.value)} rows={5} className="w-full bg-black/60 border border-white/20 rounded p-3" placeholder="Enhanced prompt will appear here after AI enhancement..." />
      <input type="file" accept="image/*" onChange={async(e)=>{const f=e.target.files?.[0]; if(f) setReferenceImage(await readFile(f));}} className="block w-full text-sm"/>
      <button disabled={busy!==null||!(enhancedPrompt||prompt).trim()} onClick={async () => { setBusy('generate'); setErrorOutput(''); setGenerationFallbackNote(''); try { const { body } = await callFn('generate'); if (body?.imageUrl || body?.image?.url) { pushHistory(); setImageUrl(body?.image?.url || body.imageUrl); if (body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.'); } else setErrorOutput(body?.safeErrorMessage || body?.error || 'Generate failed.'); } finally { setBusy(null); } }} className="w-full bg-yellow-700 text-black font-bold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='generate'?<><Spinner/>Generating Design...</>:'⚡ GENERATE DESIGN'}</button>
      {imageUrl && <>
        <input value={editInstruction} onChange={(e)=>setEditInstruction(e.target.value)} className="w-full bg-black/60 border border-white/20 rounded p-2" placeholder="Edit instruction"/>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async () => { setBusy('enhanceEdit'); try { const { body } = await callFn('enhance'); if (body?.enhancedPrompt) setEditInstruction(body.enhancedPrompt); } finally { setBusy(null); } }} className="w-full border border-white/20 py-2 rounded disabled:opacity-50">Enhance Edit Prompt with AI</button>
        <button disabled={busy!==null||!editInstruction.trim()} onClick={async () => { setBusy('edit'); setErrorOutput(''); try { const { body } = await callFn('edit'); if (body?.imageUrl || body?.image?.url) { pushHistory(); setImageUrl(body?.image?.url || body.imageUrl); if (body?.generationFallback) setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.'); } else setErrorOutput(body?.safeErrorMessage || body?.error || 'Edit failed.'); } finally { setBusy(null); } }} className="w-full border border-white/20 py-2 rounded inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==='edit'?<><Spinner/>Applying AI edits...</>:'Edit with AI'}</button>
        <button disabled={busy!==null||history.length===0} onClick={revertOne} className="w-full border border-white/20 py-2 rounded disabled:opacity-50">{busy==='revert'?'Restoring...':'Revert'}</button>
      </>}
      <button disabled={busy!==null} onClick={async () => { setBusy('debug'); try { const { body } = await callFn('debug'); setDebugOutput(JSON.stringify(body, null, 2)); } finally { setBusy(null); } }} className="w-full border border-cyan-600 text-cyan-300 py-2 rounded disabled:opacity-50">Admin Debug Check</button>
      {errorOutput && <p className="text-sm text-red-400">{errorOutput}</p>}
      {generationFallbackNote && <p className="text-sm text-amber-300">{generationFallbackNote}</p>}
      {debugOutput && <pre className="text-xs text-cyan-200 bg-black/40 p-2 rounded overflow-auto">{debugOutput}</pre>}
    </aside>

    <main className="border border-white/10 bg-[#11151d] p-6">
      <div className="mt-2 mx-auto max-w-4xl pl-12 pb-10">
        <div ref={wrapRef} className="relative w-full bg-black border border-white/30 overflow-visible" style={{ aspectRatio: `${widthIn}/${heightIn}` }} onMouseDown={()=>setSelected(true)}>
          {imageUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <img src={imageUrl} alt="Generated banner" style={{ transform: `translate(${imageX}px, ${imageY}px) scale(${imageScale})`, transformOrigin: 'center', width: '100%', height: '100%', objectFit: fitMode==='fit'?'contain':'cover' }} className="w-full h-full cursor-move" draggable={false} onMouseDown={(e)=>{e.stopPropagation(); dragRef.current={sx:e.clientX,sy:e.clientY,ox:imageX,oy:imageY,mode:'move',sxScale:imageScale,syScale:imageScale};}}/>
              {selected && <div className="absolute inset-1 border border-blue-400/90 pointer-events-none"/>}
              {selected && <>{['tl','tr','bl','br'].map((h)=> <button key={h} className={`absolute h-3 w-3 bg-white border border-blue-500 rounded-sm ${h==='tl'?'left-0 top-0 -translate-x-1/2 -translate-y-1/2':h==='tr'?'right-0 top-0 translate-x-1/2 -translate-y-1/2':h==='bl'?'left-0 bottom-0 -translate-x-1/2 translate-y-1/2':'right-0 bottom-0 translate-x-1/2 translate-y-1/2'} cursor-nwse-resize`} onMouseDown={(e)=>{e.stopPropagation(); dragRef.current={sx:e.clientX,sy:e.clientY,ox:imageX,oy:imageY,mode:'scale',sxScale:imageScale,syScale:imageScale};}}/> )}</>}
            </div>
          ) : <div className="absolute inset-0 grid place-items-center text-white/90 font-semibold">Generate or upload an image</div>}

          {busy==='generate' && <div className="absolute inset-0 bg-black/60 grid place-items-center"><div className="text-center"><div className="mx-auto mb-3 h-8 w-8 border-4 border-yellow-400 border-r-transparent rounded-full animate-spin"/><p className="text-white font-semibold">Generating your banner design...</p></div></div>}

          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${widthIn} ${heightIn}`} preserveAspectRatio="none">{grommetOption !== 'none' && <GrommetOverlay widthIn={widthIn} heightIn={heightIn} option={toOverlayOption()} idSuffix={`${grommetOption}-${widthIn}-${heightIn}`} />}</svg>

          <div className="absolute left-0 right-0 bottom-0 border-t border-white/50" />
          <div className="absolute top-0 bottom-0 left-0 border-l border-white/50" />
          {marks(widthFt).map(i=><div key={`x-${i}`} className="absolute" style={{left:`${(i/widthFt)*100}%`,top:'100%',marginTop:'6px',transform:'translateX(-50%)'}}><div className="w-px h-3 bg-white/80 mx-auto"/><span className="text-[10px] text-white/90 whitespace-nowrap block text-center">{i} ft</span></div>)}
          {marks(heightFt).map(i=><div key={`y-${i}`} className="absolute" style={{top:`${(i/heightFt)*100}%`,right:'100%',marginRight:'8px',transform:'translateY(-50%)'}}><div className="h-px w-3 bg-white/80 ml-auto"/><span className="text-[10px] text-white/90 whitespace-nowrap block text-right">{i} ft</span></div>)}
        </div>
        <div className="mt-4 flex gap-2"><button onClick={applyFit} className="px-3 py-1 border border-white/20 rounded">Fit</button><button onClick={applyFill} className="px-3 py-1 border border-white/20 rounded">Fill</button><button onClick={applyReset} className="px-3 py-1 border border-white/20 rounded">Reset</button><button onClick={()=>setKeepProportions(v=>!v)} className="px-3 py-1 border border-white/20 rounded">Keep Proportions: {keepProportions?'On':'Off'}</button></div>
        <div className="mt-3 flex gap-2 overflow-x-auto">{history.map((h,i)=><button key={i} onClick={()=>restoreSnap(h)} className="w-14 h-14 border border-white/20 overflow-hidden"><img src={h.imageUrl} className="w-full h-full object-cover"/></button>)}</div>
      </div>
    </main>

    <aside className="border border-white/10 bg-[#12151d] p-5">
      <h2 className="text-3xl font-black">BANNER OPTIONS</h2>
      <label className="block mt-3">Size Mode<select value={sizeMode} onChange={(e)=>setSizeMode(e.target.value as any)} className="mt-1 w-full bg-black border border-white/20 p-2"><option value="popular">Popular Sizes</option><option value="custom">Custom Size</option></select></label>
      {sizeMode==='popular' ? <select value={size.label} onChange={(e)=>setSize(POPULAR_SIZES.find(s=>s.label===e.target.value) || POPULAR_SIZES[0])} className="mt-2 w-full bg-black border border-white/20 p-2">{POPULAR_SIZES.map(s=><option key={s.label}>{s.label}</option>)}</select> : <div className="mt-2 space-y-2"><button onClick={()=>setUseFeet(v=>!v)} className="w-full border border-white/20 p-2 rounded">Units: {useFeet?'Feet':'Inches'}</button><input type="number" value={wInput} onChange={e=>setWInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2"/><input type="number" value={hInput} onChange={e=>setHInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2"/></div>}
      <p className="mt-2 text-xs text-gray-300">{areaSqFt.toFixed(2)} sq ft • {widthIn} in x {heightIn} in</p>
      <div className="mt-2"><p className="font-bold">Grommets</p><select value={grommetOption} onChange={(e)=>onGrommetChange(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{GROMMET_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      <div className="mt-2"><p className="font-bold">Rope</p><select value={ropePlacement} onChange={(e)=>onRopeChange(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      <div className="mt-2"><p className="font-bold">Pole Pockets</p><select value={polePocketPlacement} onChange={(e)=>onPoleChange(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{PLACEMENTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      <p className="mt-2 text-xs text-gray-300">Hemming is always included. All banners are finished with a folded, heat-welded hem for added strength.</p>
      <label className="block mt-2">Quantity<input type="number" min={1} value={quantity} onChange={(e)=>setQuantity(Math.max(1,Number(e.target.value)||1))} className="mt-1 w-full bg-black border border-white/20 p-2"/></label>
      <div className="mt-4 text-sm"><p>Subtotal: {usd(pricing.subtotalCents/100)}</p><p>Tax: {usd((pricing.subtotalCents*TAX_RATE)/100)}</p><p>Total: {usd((pricing.subtotalCents*(1+TAX_RATE))/100)}</p></div>
      <button onClick={addToCartFromAI} disabled={!imageUrl} className="mt-3 w-full bg-yellow-700 text-black font-bold py-3 disabled:opacity-60">ADD TO CART</button>
      {cartMessage && <p className={`mt-2 text-sm ${cartMessage === 'Added to cart.' ? 'text-emerald-400' : 'text-red-400'}`}>{cartMessage}</p>}
    </aside>
  </div></section></Layout>;
};

export default AIDesignerPage;
