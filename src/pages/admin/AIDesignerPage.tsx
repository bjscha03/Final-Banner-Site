import React, { useEffect, useMemo, useState } from 'react';
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
const GROMMET_OPTIONS = ['none', 'every_2_3_ft', 'every_1_2_ft', 'four_corners', 'top_corners', 'bottom_corners', 'left_only', 'right_only'];
const POLE_OPTIONS = ['none', 'top', 'bottom', 'top-bottom'];
const ROPE_OPTIONS = ['none', 'top', 'bottom', 'top-bottom'];
const loadingMsgs = ['Generating your banner design...', 'Optimizing layout and typography...', 'Preparing print-ready artwork...'];

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
  const [prompt, setPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [grommetOption, setGrommetOption] = useState('none');
  const [polePocket, setPolePocket] = useState('none');
  const [ropePlacement, setRopePlacement] = useState('none');
  const [quantity, setQuantity] = useState(1);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'enhance'|'enhanceEdit'|'generate'|'edit'|'debug'|'revert'|null>(null);
  const [message, setMessage] = useState('');
  const [debugOutput, setDebugOutput] = useState('');
  const [errorOutput, setErrorOutput] = useState('');
  const [generationFallbackNote, setGenerationFallbackNote] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [fitMode, setFitMode] = useState<'fit'|'fill'>('fill');
  const [keepProportions, setKeepProportions] = useState(true);

  useEffect(() => {
    if (busy === 'generate') {
      const t = setInterval(() => setLoadingMsgIndex((i) => (i + 1) % loadingMsgs.length), 2200);
      return () => clearInterval(t);
    }
  }, [busy]);

  const widthFt = sizeMode === 'popular' ? size.w : (useFeet ? wInput : wInput / 12);
  const heightFt = sizeMode === 'popular' ? size.h : (useFeet ? hInput : hInput / 12);
  const widthIn = Math.max(12, Math.round(widthFt * 12));
  const heightIn = Math.max(12, Math.round(heightFt * 12));

  const pricing = useMemo(() => calculateBannerPricing({
    widthIn, heightIn, quantity, material,
    addRope: ropePlacement !== 'none',
    ropePlacement: ropePlacement === 'top-bottom' ? 'top-bottom' : ropePlacement === 'top' ? 'top' : ropePlacement === 'bottom' ? 'bottom' : 'top-bottom',
    polePockets: polePocket,
  } as any), [widthIn, heightIn, quantity, material, ropePlacement, polePocket]);

  if (!loading && !admin) return <Navigate to="/admin/setup" replace />;

  const readFile = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(f); });
  const callFn = async (action: string) => {
    const payload = { action, prompt, enhancedPrompt, editInstruction, imageUrl, size: { w: Number((widthFt).toFixed(2)), h: Number((heightFt).toFixed(2)) }, material, quantity, referenceImage };
    console.log('[ai-designer] clicked', action); console.log('[ai-designer] request payload', payload);
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({ ok: false, safeErrorMessage: 'Invalid JSON response from function' }));
    console.log('[ai-designer] response status', res.status); console.log('[ai-designer] response body', body);
    return { status: res.status, body };
  };

  const addToCartFromAI = async () => { try {
      setCartMessage(''); if (!imageUrl) return setCartMessage('Add to cart failed: no generated image.');
      const subtotal = pricing.subtotalCents / 100; const tax = (pricing.subtotalCents * TAX_RATE) / 100; const total = subtotal + tax;
      const id = addFromQuote({ widthIn, heightIn, quantity, material, grommets: grommetOption === 'none' ? 'none' : 'all', polePockets: polePocket, rope: ropePlacement !== 'none', ropePlacement, file:{url:imageUrl,name:'ai-banner.png',isPdf:false}, imageScale:1, imagePosition:{x:0,y:0}, fitMode, textElements:[], overlayImage:null } as any, { source:'admin-ai-designer', hemmingIncluded:true, finishing:{grommetOption,polePocket,ropePlacement}, aiPricing:{subtotal,tax,total}});
      setCartMessage(id ? 'Added to cart.' : 'Add to cart failed.');
    } catch (e:any) { console.error('[ai-designer] add to cart failed', e); setCartMessage(`Add to cart failed: ${e?.message || 'Unknown error'}`); }
  };

  const applyVersion = async (u: string) => { setBusy('revert'); setImageUrl(u); setTimeout(()=>setBusy(null),200); };

  const ruler = (ft:number, axis:'x'|'y') => Array.from({length: Math.floor(ft)+1}, (_,i)=>i).map(i=><span key={`${axis}-${i}`} className="absolute text-[10px] text-gray-400" style={axis==='x'?{left:`${(i/ft)*100}%`,bottom:'-18px',transform:'translateX(-50%)'}:{top:`${(i/ft)*100}%`,left:'-26px',transform:'translateY(-50%)'}}>{i} ft</span>);

  return <Layout><section className="min-h-screen bg-[#0b0d12] text-white p-4 lg:p-6"><div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[360px_1fr_340px] gap-4">
    <aside className="border border-white/10 bg-[#12151d] p-5 space-y-4"><h1 className="text-4xl font-black tracking-wide">AI DESIGNER</h1>
      <div><p className="text-yellow-400 font-bold text-sm">2. DESCRIBE YOUR DESIGN</p><textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={4} className="mt-2 w-full bg-black/60 border border-yellow-500 rounded p-3"/></div>
      <button disabled={busy!==null||!prompt.trim()} onClick={async()=>{setBusy('enhance');setMessage('');setErrorOutput('');try{const {body}=await callFn('enhance');if(body?.enhancedPrompt){setEnhancedPrompt(body.enhancedPrompt);setMessage('Enhance prompt success.');}else setErrorOutput(body?.safeErrorMessage||body?.error||'Enhance failed.')}catch(e:any){setErrorOutput(e?.message||'Enhance failed.')}setBusy(null);}} className={`w-full border border-yellow-600 text-yellow-300 py-2 rounded inline-flex items-center justify-center gap-2 ${busy==='enhance'?'animate-pulse shadow-[0_0_20px_rgba(212,175,55,0.35)]':''}`}>{busy==='enhance'?<><Spinner/>Enhancing Prompt...</>:'✨ ENHANCE PROMPT WITH AI'}</button>
      <textarea value={enhancedPrompt} disabled={busy==='enhance'} onChange={(e)=>setEnhancedPrompt(e.target.value)} rows={5} className="w-full bg-black/60 border border-white/20 rounded p-3 disabled:opacity-60"/>
      <div><input type="file" accept="image/*" onChange={async(e)=>{const f=e.target.files?.[0]; if(f) setReferenceImage(await readFile(f));}} className="mt-2 block w-full text-sm"/></div>
      <button disabled={busy!==null||!(enhancedPrompt||prompt).trim()} onClick={async()=>{setBusy('generate');setMessage('');setErrorOutput('');setGenerationFallbackNote('');try{const {body}=await callFn('generate');if(body?.imageUrl){if(imageUrl) setHistory((h)=>[imageUrl,...h].slice(0,8));setImageUrl(body.imageUrl);setMessage('Generate design success (1 image).');if(body?.generationFallback===true)setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');}else setErrorOutput(body?.safeErrorMessage||body?.error||'Generate failed.')}catch(e:any){setErrorOutput(e?.message||'Generate failed.')}setBusy(null);}} className="w-full bg-yellow-700 text-black font-bold py-3 inline-flex items-center justify-center gap-2">{busy==='generate'?<><Spinner/>Generating Design...</>:'⚡ GENERATE DESIGN'}</button>
      <button disabled={busy!==null||!imageUrl||!editInstruction.trim()} onClick={async()=>{setBusy('edit');setErrorOutput('');try{const {body}=await callFn('edit');if(body?.imageUrl){if(imageUrl) setHistory((h)=>[imageUrl,...h].slice(0,8));setImageUrl(body.imageUrl);if(body?.generationFallback)setGenerationFallbackNote('Temporary fallback image shown. Imagen API paid access is required for real AI image generation.');}else setErrorOutput(body?.safeErrorMessage||body?.error||'Edit failed.')}catch(e:any){setErrorOutput(e?.message||'Edit failed.')}setBusy(null);}} className="w-full border border-white/20 py-2 rounded inline-flex items-center justify-center gap-2">{busy==='edit'?<><Spinner/>Applying AI edits...</>:'Edit with AI'}</button>
      <input value={editInstruction} onChange={(e)=>setEditInstruction(e.target.value)} className="w-full bg-black/60 border border-white/20 rounded p-2" placeholder="Edit instruction"/>
      <button disabled={busy!==null||!editInstruction.trim()} onClick={async () => {setBusy('enhanceEdit');try{const {body}=await callFn('enhance');if(body?.enhancedPrompt)setEditInstruction(body.enhancedPrompt);}finally{setBusy(null);}}} className="w-full border border-white/20 py-2 rounded inline-flex items-center justify-center gap-2">{busy==='enhanceEdit'?<><Spinner/>Enhancing Prompt...</>:'Enhance Edit Prompt with AI'}</button>
      <button disabled={busy!==null||history.length===0} onClick={()=>history[0]&&applyVersion(history[0])} className="w-full border border-white/20 py-2 rounded">{busy==='revert'?'Restoring...':'Revert'}</button>
      <button disabled={busy!==null} onClick={async()=>{setBusy('debug'); setErrorOutput(''); try{const {body}=await callFn('debug'); setDebugOutput(JSON.stringify({functionReachable:body?.functionReachable??false, env:body?.env||{}, modelsEndpointReachable:body?.modelsEndpointReachable??false, selectedTextModel:body?.selectedTextModel||null, selectedImageModel:body?.selectedImageModel||null, safeErrorMessage:body?.safeErrorMessage||null},null,2));}catch(e:any){setErrorOutput(e?.message||'Debug failed.')} setBusy(null);}} className="w-full border border-cyan-600 text-cyan-300 py-2 rounded">Admin Debug Check</button>
      {message && <p className="text-sm text-gray-300">{message}</p>}{errorOutput && <p className="text-sm text-red-400">{errorOutput}</p>}{generationFallbackNote && <p className="text-sm text-amber-300">{generationFallbackNote}</p>}{debugOutput && <pre className="text-xs text-cyan-200 bg-black/40 p-2 rounded overflow-auto">{debugOutput}</pre>}
    </aside>
    <main className="border border-white/10 bg-[#11151d] p-6"><div className="text-center text-yellow-500 tracking-[0.5em] text-xs">PROFESSIONAL RENDERING ENGINE</div>
      <div className="mt-6 mx-auto max-w-4xl pl-10 pb-10"><div className="relative w-full bg-black border border-white/20 overflow-hidden" style={{aspectRatio:`${widthIn}/${heightIn}`}}>
        {imageUrl ? <img src={imageUrl} alt="Generated banner" className={`absolute inset-0 w-full h-full ${fitMode==='fit'?'object-contain':'object-cover'} ${busy==='edit'?'opacity-50':''}`}/> : <div className="absolute inset-0 grid place-items-center text-gray-500">GENERATE OR UPLOAD AN IMAGE</div>}
        {busy==='generate' && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse grid place-items-center"><p className="text-sm text-gray-200">{loadingMsgs[loadingMsgIndex]}</p></div>}
        {grommetOption !== 'none' && <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${widthIn} ${heightIn}`} preserveAspectRatio="none"><GrommetOverlay widthIn={widthIn} heightIn={heightIn} option="all" idSuffix="admin-ai-designer" /></svg>}
        <div className="absolute inset-0 pointer-events-none">{ruler(widthFt,'x')}{ruler(heightFt,'y')}</div>
      </div>
      <div className="mt-3 flex gap-2"><button onClick={()=>setFitMode('fit')} className="px-3 py-1 border border-white/20 rounded">Fit</button><button onClick={()=>setFitMode('fill')} className="px-3 py-1 border border-white/20 rounded">Fill</button><button onClick={()=>{setFitMode('fill');setKeepProportions(true);}} className="px-3 py-1 border border-white/20 rounded">Reset</button><button onClick={()=>setKeepProportions(v=>!v)} className="px-3 py-1 border border-white/20 rounded">Keep Proportions: {keepProportions?'On':'Off'}</button></div>
      <div className="mt-3 flex gap-2 overflow-x-auto">{history.map((u,i)=><button key={`${u}-${i}`} onClick={()=>applyVersion(u)} className="w-14 h-14 border border-white/20 overflow-hidden"><img src={u} className="w-full h-full object-cover"/></button>)}</div>
      </div></main>
    <aside className="border border-white/10 bg-[#12151d] p-5"><h2 className="text-3xl font-black">BANNER OPTIONS</h2>
      <label className="block mt-4">Size Mode<select value={sizeMode} onChange={(e)=>setSizeMode(e.target.value as any)} className="mt-1 w-full bg-black border border-white/20 p-2"><option value="popular">Popular Sizes</option><option value="custom">Custom Size</option></select></label>
      {sizeMode==='popular' ? <select value={size.label} onChange={(e)=>setSize(POPULAR_SIZES.find(s=>s.label===e.target.value) || POPULAR_SIZES[0])} className="mt-2 w-full bg-black border border-white/20 p-2">{POPULAR_SIZES.map(s=><option key={s.label}>{s.label}</option>)}</select> : <div className="mt-2 space-y-2"><button onClick={()=>setUseFeet(v=>!v)} className="w-full border border-white/20 p-2 rounded">Units: {useFeet?'Feet':'Inches'}</button><input type="number" value={wInput} onChange={e=>setWInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2" placeholder="Width"/><input type="number" value={hInput} onChange={e=>setHInput(Number(e.target.value)||1)} className="w-full bg-black border border-white/20 p-2" placeholder="Height"/></div>}
      <p className="mt-2 text-xs text-gray-300">{(widthIn*heightIn/144).toFixed(2)} sq ft • {widthIn} in x {heightIn} in</p>
      <div className="mt-4"><p className="font-bold">Material</p>{BANNER_MATERIALS.filter(m=>['13oz','15oz','18oz'].includes(m.mapped)).map(m=><button key={m.mapped} onClick={()=>setMaterial(m.mapped)} className={`w-full mt-1 border p-2 text-left ${material===m.mapped?'border-yellow-500':'border-white/20'}`}>{m.label}</button>)}</div>
      <div className="mt-4"><p className="font-bold">Grommets</p><select value={grommetOption} onChange={(e)=>setGrommetOption(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{GROMMET_OPTIONS.map(o=><option key={o} value={o}>{o.replaceAll('_',' ')}</option>)}</select></div>
      <div className="mt-4"><p className="font-bold">Pole Pockets</p><select value={polePocket} onChange={(e)=>setPolePocket(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{POLE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select><p className="text-xs text-gray-400">$15 setup fee + $2.00 / linear ft</p></div>
      <div className="mt-4"><p className="font-bold">Rope</p><select value={ropePlacement} onChange={(e)=>setRopePlacement(e.target.value)} className="w-full mt-1 bg-black border border-white/20 p-2">{ROPE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select><p className="text-xs text-gray-400">$2.00 / linear ft</p></div>
      <p className="mt-3 text-xs text-gray-300">Hemming is always included. All banners are finished with a folded, heat-welded hem for added strength.</p>
      <label className="block mt-3">Quantity<input type="number" min={1} className="mt-1 w-full bg-black border border-white/20 p-2" value={quantity} onChange={(e)=>setQuantity(Math.max(1,Number(e.target.value)||1))}/></label>
      <div className="mt-5 border-t border-white/10 pt-4 text-sm space-y-1"><p>Base price: {usd(pricing.unitBasePriceCents/100)}</p><p>Material rate: {usd((pricing.materialPricePerSqFtCents||0)/100)}/sqft</p><p>Area: {pricing.areaSqFt.toFixed(2)} sq ft</p><p>Subtotal: {usd(pricing.subtotalCents/100)}</p><p>Tax: {usd((pricing.subtotalCents*TAX_RATE)/100)}</p><p className="font-bold">Total: {usd((pricing.subtotalCents*(1+TAX_RATE))/100)}</p></div>
      <button onClick={addToCartFromAI} disabled={!imageUrl} className="mt-4 w-full bg-yellow-700 text-black font-bold py-3 disabled:opacity-60">ADD TO CART</button>{cartMessage && <p className={`mt-2 text-sm ${cartMessage === 'Added to cart.' ? 'text-emerald-400' : 'text-red-400'}`}>{cartMessage}</p>}
    </aside>
  </div></section></Layout>;
};

export default AIDesignerPage;
