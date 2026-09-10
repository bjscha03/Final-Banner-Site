import React from 'react';
export const AIPromptPanel = ({ store }: any) => (
  <div className="rounded-2xl border border-[#2a2a2a] bg-[#111] p-4">
    <h2 className="text-xl font-semibold mb-3">Prompt</h2>
    <textarea className="w-full bg-[#1a1a1a] p-3 rounded mb-3" rows={5} placeholder="Short prompt" value={store.originalPrompt} onChange={(e)=>store.set({originalPrompt:e.target.value})} />
    <textarea className="w-full bg-[#1a1a1a] p-3 rounded" rows={8} placeholder="Enhanced prompt (editable)" value={store.enhancedPrompt} onChange={(e)=>store.set({enhancedPrompt:e.target.value})} />
  </div>
);
