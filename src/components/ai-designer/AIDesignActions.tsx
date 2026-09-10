import React from 'react';
import { saveAIDesign } from '@/services/savedAIDesigns';

export const AIDesignActions = ({ store, adminId }: any) => {
  const ratio = store.width / store.height;
  const enhance = async () => {
    store.pushHistory();
    store.set({ isLoading: true });
    const res = await fetch('/.netlify/functions/ai-enhance-prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: store.originalPrompt, width: store.width, height: store.height }) });
    const data = await res.json();
    store.set({ enhancedPrompt: data.enhancedPrompt || '', isLoading: false });
  };
  const generate = async () => {
    store.pushHistory();
    store.set({ isLoading: true });
    const res = await fetch('/.netlify/functions/ai-generate-banner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: store.enhancedPrompt || store.originalPrompt, width: store.width, height: store.height, aspectRatio: ratio }) });
    const data = await res.json();
    store.set({ imageUrl: data.imageUrl, isLoading: false });
  };
  const edit = async () => {
    store.pushHistory();
    const res = await fetch('/.netlify/functions/ai-edit-banner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageUrl: store.imageUrl, editInstruction: store.editInstruction, width: store.width, height: store.height, aspectRatio: ratio }) });
    const data = await res.json();
    store.set({ imageUrl: data.imageUrl });
  };
  return <div className="mt-6 flex flex-wrap gap-2"><button onClick={enhance} className="px-4 py-2 rounded bg-[#D4AF37] text-black">Enhance Prompt with AI</button><button onClick={generate} className="px-4 py-2 rounded bg-white text-black">Generate Design</button><input value={store.editInstruction} onChange={(e)=>store.set({editInstruction:e.target.value})} className="bg-[#1a1a1a] p-2 rounded" placeholder="Edit instruction"/><button onClick={edit} disabled={!store.imageUrl} className="px-4 py-2 rounded bg-purple-500">Edit with AI</button><button onClick={()=>store.revert()} disabled={!store.history.length} className="px-4 py-2 rounded bg-slate-500">Revert</button><button onClick={()=>saveAIDesign(store, adminId)} disabled={!store.imageUrl} className="px-4 py-2 rounded bg-emerald-600">Save Design</button></div>;
};
