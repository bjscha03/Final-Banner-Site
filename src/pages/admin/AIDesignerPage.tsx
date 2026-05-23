import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { BANNER_MATERIALS } from '@/lib/banner-materials';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { TAX_RATE, usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import type { MaterialKey } from '@/store/quote';

const SIZES = [{ label: '4 FT X 8 FT BANNER', w: 8, h: 4 }, { label: '3 FT X 6 FT BANNER', w: 6, h: 3 }];
const FINISHING = ['none', 'grommets', 'rope', 'pole_pockets'] as const;

const AIDesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const admin = isAdmin(user);
  const addFromQuote = useCartStore((s) => s.addFromQuote);
  const [size, setSize] = useState(SIZES[0]);
  const [prompt, setPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [finishing, setFinishing] = useState<(typeof FINISHING)[number]>('none');
  const [quantity, setQuantity] = useState(1);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'enhance' | 'generate' | 'debug' | null>(null);
  const [message, setMessage] = useState<string>('');

  const pricing = useMemo(() => calculateBannerPricing({
    widthIn: size.w * 12, heightIn: size.h * 12, quantity, material, addRope: finishing === 'rope', polePockets: finishing === 'pole_pockets' ? 'top-bottom' : 'none',
  }), [size, quantity, material, finishing]);

  if (!loading && !admin) return <Navigate to="/admin/setup" replace />;

  const readFile = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(f); });
  const callFn = async (action: string) => {
    const res = await fetch('/.netlify/functions/generate-ai-designs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, prompt, enhancedPrompt, size, material, finishing, quantity, referenceImage }) });
    return res.json();
  };

  return <Layout><section className="min-h-screen bg-[#0b0d12] text-white p-4 lg:p-6"><div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[360px_1fr_340px] gap-4">
    <aside className="border border-white/10 bg-[#12151d] p-5 space-y-4"><h1 className="text-4xl font-black tracking-wide">AI DESIGNER</h1><p className="text-gray-400">Generate and configure your perfect banner.</p>
      <div><p className="text-yellow-400 font-bold text-sm">2. DESCRIBE YOUR DESIGN</p><textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={4} className="mt-2 w-full bg-black/60 border border-yellow-500 rounded p-3" placeholder="e.g. A vibrant summer sale background..."/></div>
      <button disabled={busy!==null||!prompt.trim()} onClick={async()=>{setBusy('enhance');setMessage('');const d=await callFn('enhance');setEnhancedPrompt(d.enhancedPrompt||'');setMessage(d.message||'');setBusy(null);}} className="w-full border border-yellow-600 text-yellow-300 py-2 rounded">{busy==='enhance'?'Enhancing...':'✨ ENHANCE PROMPT WITH AI'}</button>
      <textarea value={enhancedPrompt} onChange={(e)=>setEnhancedPrompt(e.target.value)} rows={5} className="w-full bg-black/60 border border-white/20 rounded p-3" placeholder="Enhanced prompt"/>
      <div><p className="text-yellow-400 font-bold text-sm">3. UPLOAD REFERENCE IMAGE (OPTIONAL)</p><input type="file" accept="image/*" onChange={async(e)=>{const f=e.target.files?.[0]; if(f) setReferenceImage(await readFile(f));}} className="mt-2 block w-full text-sm"/></div>
      <button disabled={busy!==null||!(enhancedPrompt||prompt).trim()} onClick={async()=>{setBusy('generate');setMessage('');const d=await callFn('generate');if(d.imageUrl) setImageUrl(d.imageUrl);setMessage(d.message||d.error||'');setBusy(null);}} className="w-full bg-yellow-700 text-black font-bold py-3">{busy==='generate'?'Generating...':'⚡ GENERATE DESIGN'}</button>
      <button disabled={busy!==null} onClick={async()=>{setBusy('debug'); const d=await callFn('debug'); setMessage(d.message || JSON.stringify(d.checks)); setBusy(null);}} className="w-full border border-cyan-600 text-cyan-300 py-2 rounded">Admin Debug Check</button>
      {message && <p className="text-sm text-gray-300">{message}</p>}
    </aside>
    <main className="border border-white/10 bg-[#11151d] p-6"><div className="text-center text-yellow-500 tracking-[0.5em] text-xs">PROFESSIONAL RENDERING ENGINE</div><div className="text-center text-4xl md:text-6xl font-black text-white/15">{size.h} FT X {size.w} FT</div>
      <div className="mt-6 mx-auto max-w-4xl"><div className="relative w-full bg-black border border-white/20 overflow-hidden" style={{aspectRatio:`${size.w}/${size.h}`}}>{imageUrl ? <img src={imageUrl} alt="Generated banner" className="absolute inset-0 w-full h-full object-cover"/> : <div className="absolute inset-0 grid place-items-center text-gray-500">GENERATE OR UPLOAD AN IMAGE</div>}</div>
      <div className="flex justify-between text-xs text-gray-300 mt-1"><span>{size.h} FT</span><span>{size.w} FT</span></div></div></main>
    <aside className="border border-white/10 bg-[#12151d] p-5"><h2 className="text-3xl font-black">BANNER OPTIONS</h2>
      <label className="block mt-4 text-sm">1. SIZE<select className="mt-2 w-full bg-black border border-white/20 p-2" value={size.label} onChange={(e)=>setSize(SIZES.find(s=>s.label===e.target.value) || SIZES[0])}>{SIZES.map(s=><option key={s.label}>{s.label}</option>)}</select></label>
      <div className="mt-4"><p className="font-bold">2. SELECT MATERIAL</p><div className="space-y-2 mt-2">{BANNER_MATERIALS.filter(m=>['13oz','15oz','18oz'].includes(m.mapped)).map(m=><button key={m.mapped} onClick={()=>setMaterial(m.mapped)} className={`w-full border p-2 text-left ${material===m.mapped?'border-yellow-500':'border-white/20'}`}>{m.label} <span className="float-right">${(m.mapped==='13oz'?4:m.mapped==='15oz'?4.5:5.5).toFixed(2)}/sqft</span></button>)}</div></div>
      <div className="mt-4"><p className="font-bold">3. SELECT FINISHING TYPE</p><div className="grid grid-cols-2 gap-2 mt-2">{FINISHING.map(f=><button key={f} onClick={()=>setFinishing(f)} className={`border p-2 ${finishing===f?'border-yellow-500':'border-white/20'}`}>{f}</button>)}</div></div>
      <label className="block mt-4">Quantity<input type="number" min={1} className="mt-2 w-full bg-black border border-white/20 p-2" value={quantity} onChange={(e)=>setQuantity(Math.max(1,Number(e.target.value)||1))}/></label>
      <div className="mt-5 border-t border-white/10 pt-4 text-sm space-y-1"><p>Base price: {usd(pricing.unitBasePriceCents/100)}</p><p>Material rate: {usd((pricing.materialPricePerSqFtCents||0)/100)}/sqft</p><p>Area: {pricing.areaSqFt.toFixed(2)} sq ft</p><p>Subtotal: {usd(pricing.subtotalCents/100)}</p><p>Tax: {usd((pricing.subtotalCents*TAX_RATE)/100)}</p><p className="font-bold">Total: {usd((pricing.subtotalCents*(1+TAX_RATE))/100)}</p></div>
      <button onClick={()=>addFromQuote({ widthIn:size.w*12, heightIn:size.h*12, quantity, material, grommets: finishing==='grommets' ? 'all' : 'none', polePockets: finishing==='pole_pockets' ? 'top-bottom' : 'none', rope: finishing==='rope', file:{url:imageUrl||'',name:'ai-banner.png',isPdf:false}, imageScale:1, imagePosition:{x:0,y:0}, fitMode:'fill', textElements:[], overlayImage:null } as any)} disabled={!imageUrl} className="mt-4 w-full bg-yellow-700 text-black font-bold py-3 disabled:opacity-60">ADD TO CART</button>
    </aside>
  </div></section></Layout>;
};

export default AIDesignerPage;
