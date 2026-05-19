import React, { useMemo, useState } from 'react';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { useCartStore } from '@/store/cart';
import { AdminAIPromptPanel } from './AdminAIPromptPanel';
import { AdminAIPreviewCanvas } from './AdminAIPreviewCanvas';
import { AdminAIConfigurator } from './AdminAIConfigurator';
import type { BannerSize, Finishing, MaterialOption, VersionEntry } from './types';

const SIZES: BannerSize[] = [{label:'8×4 ft',widthFt:8,heightFt:4},{label:'10×5 ft',widthFt:10,heightFt:5},{label:'6×3 ft',widthFt:6,heightFt:3},{label:'12×6 ft',widthFt:12,heightFt:6}];
const MATERIALS: MaterialOption[] = [{key:'13oz',label:'13oz Standard Vinyl'},{key:'15oz',label:'15oz Premium Vinyl'},{key:'18oz',label:'18oz Heavy Duty Vinyl'},{key:'mesh',label:'Mesh Banner'}];

export const AdminAIDesignerPage = () => {
  const cart = useCartStore();
  const [size, setSize] = useState(SIZES[0]); const [material,setMaterial]=useState<MaterialOption>(MATERIALS[0]);
  const [finishing,setFinishing]=useState<Finishing>('None'); const [quantity,setQuantity]=useState(1); const [promoCode,setPromoCode]=useState('');
  const [prompt,setPrompt]=useState(''); const [enhancedPrompt,setEnhancedPrompt]=useState(''); const [originalPrompt,setOriginalPrompt]=useState('');
  const [referenceImage,setReferenceImage]=useState<string | null>(null); const [imageUrl,setImageUrl]=useState<string | null>(null);
  const [isEnhancing,setIsEnhancing]=useState(false); const [isGenerating,setIsGenerating]=useState(false);
  const [versions,setVersions]=useState<VersionEntry[]>([]);

  const pricing = useMemo(() => calculateBannerPricing({widthIn:size.widthFt*12,heightIn:size.heightFt*12,quantity,material, grommets: finishing==='Grommets'?'every-2-3ft':'none', polePockets: finishing==='Pole Pockets'?'top-bottom':'none', addRope: finishing==='Rope', ropePlacement:'top-bottom'}),[size,quantity,material,finishing]);
  const tax = pricing.taxCents;

  const enhance = async () => { if (isEnhancing || !prompt.trim()) return; setIsEnhancing(true); setOriginalPrompt(prompt);
    try { const res=await fetch('/.netlify/functions/ai-enhance-prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,width:size.widthFt,height:size.heightFt,use':'gemini'})}); const d=await res.json(); setEnhancedPrompt(d.enhancedPrompt||prompt); } finally { setIsEnhancing(false);} };
  const revertPrompt=()=>setEnhancedPrompt(originalPrompt || prompt);
  const generate = async () => { if (isGenerating) return; setIsGenerating(true);
    try { const res=await fetch('/.netlify/functions/generate-ai-designs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:enhancedPrompt||prompt,size:`${size.widthFt}x${size.heightFt}`,width:size.widthFt,height:size.heightFt,aspectRatio:`${size.widthFt}:${size.heightFt}`,count:1,referenceImage})});
      const d=await res.json(); const url=d?.designs?.[0]?.imageUrl||d?.imageUrl||null; if (url){setImageUrl(url); setVersions(v=>[{id:crypto.randomUUID(),imageUrl:url,prompt,enhancedPrompt,createdAt:new Date().toISOString()},...v]);}
    } finally { setIsGenerating(false);} };

  const addToCart = () => {
    if (!imageUrl) return;
    cart.addFromQuote({ widthIn:size.widthFt*12,heightIn:size.heightFt*12,quantity,material:material.key,grommets:finishing==='Grommets'?'every-2-3ft':'none',polePockets:finishing==='Pole Pockets'?'top-bottom':'none',polePocketSize:'2',addRope:finishing==='Rope',ropePlacement:'top-bottom',previewScalePct:100,textElements:[],set:()=>{},loadFromCartItem:()=>{},addTextElement:()=>{},updateTextElement:()=>{},deleteTextElement:()=>{},resetDesign:()=>{},getSquareFootage:()=>0,isOverSizeLimit:()=>false,getSizeLimitMessage:()=>null,file:{name:'ai-banner.png',type:'image/png',size:0,url:imageUrl,isAI:true,aiMetadata:{prompt:enhancedPrompt||prompt,model:'imagen',aspectRatio:`${size.widthFt}:${size.heightFt}`}} });
  };

  return <div className='min-h-screen bg-[#0a0a0a] text-white p-6'><div className='max-w-[1700px] mx-auto grid grid-cols-1 xl:grid-cols-[360px_1fr_370px] gap-5'>
    <AdminAIPromptPanel {...{prompt,setPrompt,enhancedPrompt,setEnhancedPrompt,isEnhancing,enhance,revertPrompt,isGenerating,generate,referenceImage,setReferenceImage}} />
    <AdminAIPreviewCanvas size={size} imageUrl={imageUrl} versions={versions} onRevert={(v)=>{setImageUrl(v.imageUrl);setPrompt(v.prompt);setEnhancedPrompt(v.enhancedPrompt);}} />
    <AdminAIConfigurator {...{size,setSize,sizes:SIZES,material,setMaterial,materials:MATERIALS,finishing,setFinishing,quantity,setQuantity,promoCode,setPromoCode,pricing,tax,onAddToCart:addToCart}} />
  </div></div>;
};
