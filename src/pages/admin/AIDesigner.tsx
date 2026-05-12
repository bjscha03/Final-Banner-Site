import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { AdminAIPromptPanel } from '@/components/admin-ai/AdminAIPromptPanel';
import { AdminAICanvasPreview } from '@/components/admin-ai/AdminAICanvasPreview';
import { AdminAIOptionsPanel } from '@/components/admin-ai/AdminAIOptionsPanel';
import { AdminAIActionsPanel } from '@/components/admin-ai/AdminAIActionsPanel';
import { AdminAIVersionHistory } from '@/components/admin-ai/AdminAIVersionHistory';
import type { AIVersion } from '@/components/admin-ai/types';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import type { MaterialKey } from '@/store/quote';

const AdminAIDesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [widthIn, setWidthIn] = useState(8);
  const [heightIn, setHeightIn] = useState(4);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [quantity, setQuantity] = useState(1);
  const [finishing, setFinishing] = useState('none');
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [editPrompt, setEditPrompt] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceLabel = useMemo(() => {
    try {
      const result = calculateBannerPricing({
        widthIn: Math.max(1, widthIn) * 12,
        heightIn: Math.max(1, heightIn) * 12,
        quantity: Math.max(1, quantity),
        material,
        grommets: finishing === 'grommets' ? 'corners' : 'none',
        polePockets: finishing === 'pole_pockets' ? 'top-bottom' : 'none',
        addRope: finishing === 'rope',
      });
      const dollars = result.totalCents / 100;
      return Number.isFinite(dollars) ? `$${dollars.toFixed(2)}` : '$0.00';
    } catch (e) {
      console.error('[admin-ai] pricing failed', e);
      return '$0.00';
    }
  }, [widthIn, heightIn, quantity, material, finishing]);

  if (loading) return <Layout><div className='p-10 text-white'>Checking admin access…</div></Layout>;
  if (!user || !isAdmin(user)) return <Navigate to='/admin/setup' replace />;

  const enhancePrompt = async () => {
    if (!prompt.trim()) return;
    setEnhancing(true); setError(null);
    try {
      const res = await fetch('/.netlify/functions/generate-ai-designs', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userEmail:user.email, prompt: prompt.trim(), size:{wIn:widthIn*12,hIn:heightIn*12}, width:widthIn*12,height:heightIn*12, material, fastMode:true })});
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error('enhance_failed');
      setOriginalPrompt(prompt.trim());
      setEnhancedPrompt(body?.prompt || prompt.trim());
    } catch (err) {
      console.error('[admin-ai] enhance failed', err);
      setError('AI generation failed. Please try again.');
    } finally { setEnhancing(false); }
  };

  const generate = async () => {
    const usePrompt = (enhancedPrompt || prompt).trim();
    if (!usePrompt) return;
    setGenerating(true); setError(null);
    try {
      const res = await fetch('/.netlify/functions/generate-ai-designs', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userEmail:user.email, prompt: usePrompt, size:{wIn:widthIn*12,hIn:heightIn*12}, width:widthIn*12,height:heightIn*12, material, inspirationImage: referenceImage })});
      const body = await res.json().catch(()=>({}));
      if (!res.ok || !body?.image?.url) throw new Error('generate_failed');
      const url = body.image.url as string;
      setCurrentImageUrl(url);
      setVersions((p)=>[{id:String(Date.now()), imageUrl:url, promptUsed:usePrompt, createdAt:Date.now()}, ...p]);
    } catch (err) {
      console.error('[admin-ai] generate failed', err);
      setError('AI generation failed. Please try again.');
    } finally { setGenerating(false); }
  };

  const editWithAI = async () => {
    if (!currentImageUrl || !editPrompt.trim()) return;
    setGenerating(true); setError(null);
    try {
      const res = await fetch('/.netlify/functions/edit-design', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({productType:'banner', width:widthIn*12,height:heightIn*12,material, originalPrompt: enhancedPrompt||prompt, editPrompt})});
      const body = await res.json().catch(()=>({}));
      if (!res.ok || !body?.imageBase64) throw new Error('edit_failed');
      const url = `data:${body.mimeType||'image/png'};base64,${body.imageBase64}`;
      setCurrentImageUrl(url);
      setVersions((p)=>[{id:String(Date.now()), imageUrl:url, promptUsed:enhancedPrompt||prompt, editPrompt, createdAt:Date.now()}, ...p]);
      setEditPrompt('');
    } catch (err) {
      console.error('[admin-ai] edit failed', err);
      setError('AI generation failed. Please try again.');
    } finally { setGenerating(false); }
  };

  return <Layout><main className='max-w-[1600px] mx-auto px-4 py-6'><div className='grid grid-cols-1 xl:grid-cols-12 gap-4'><div className='xl:col-span-3'><AdminAIPromptPanel prompt={prompt} setPrompt={setPrompt} enhancedPrompt={enhancedPrompt} setEnhancedPrompt={setEnhancedPrompt} enhancing={enhancing} generating={generating} onEnhance={enhancePrompt} onUseOriginal={()=>setEnhancedPrompt(originalPrompt || prompt)} referencePreview={referenceImage} onReferenceFile={(f)=>{const r=new FileReader(); r.onload=()=>setReferenceImage(String(r.result)); r.readAsDataURL(f);}}/></div><div className='xl:col-span-6 space-y-4'><AdminAICanvasPreview widthIn={widthIn} heightIn={heightIn} imageUrl={currentImageUrl} generating={generating}/><AdminAIVersionHistory versions={versions} onSelect={(id)=>{const v=versions.find(x=>x.id===id); if(v) setCurrentImageUrl(v.imageUrl);}}/><AdminAIActionsPanel error={error}/></div><div className='xl:col-span-3'><AdminAIOptionsPanel widthIn={widthIn} heightIn={heightIn} setWidthIn={setWidthIn} setHeightIn={setHeightIn} material={material} setMaterial={setMaterial} quantity={quantity} setQuantity={setQuantity} finishing={finishing} setFinishing={setFinishing} priceLabel={priceLabel} onGenerate={generate} generating={generating} onEdit={editWithAI} editPrompt={editPrompt} setEditPrompt={setEditPrompt} onRevert={()=>{if(versions.length>1){const [, ...rest]=versions; setVersions(rest); setCurrentImageUrl(rest[0]?.imageUrl||null);}}} canRevert={versions.length>1}/></div></div></main></Layout>
}

export default AdminAIDesignerPage;
