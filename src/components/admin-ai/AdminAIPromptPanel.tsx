import React from 'react';

type Props = {
  prompt: string; setPrompt: (v: string)=>void;
  enhancedPrompt: string; setEnhancedPrompt: (v: string)=>void;
  enhancing: boolean; generating: boolean;
  onEnhance: ()=>void; onUseOriginal: ()=>void;
  referencePreview: string | null; onReferenceFile: (f: File)=>void;
};

export const AdminAIPromptPanel: React.FC<Props> = ({prompt,setPrompt,enhancedPrompt,setEnhancedPrompt,enhancing,generating,onEnhance,onUseOriginal,referencePreview,onReferenceFile}) => (
  <section className="rounded-xl border border-white/10 bg-[#11151d] p-5 space-y-4">
    <h2 className="text-2xl font-black text-white">AI Designer</h2>
    <div>
      <p className="text-xs font-bold text-[#FF6A00] mb-2">1. Describe your design</p>
      <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} className="w-full min-h-28 bg-black/60 border border-white/20 rounded-md p-3 text-white" />
    </div>
    <div className="flex gap-2">
      <button onClick={onEnhance} disabled={enhancing||generating||!prompt.trim()} className="px-4 py-2 text-sm rounded border border-[#FF6A00] text-[#FFB36B] disabled:opacity-50">{enhancing?'Enhancing…':'Enhance Prompt with AI'}</button>
      <button onClick={onUseOriginal} className="px-4 py-2 text-sm rounded border border-white/20 text-white">Revert to Original</button>
    </div>
    <div>
      <p className="text-xs font-bold text-[#FF6A00] mb-2">2. Enhanced prompt</p>
      <textarea value={enhancedPrompt} onChange={(e)=>setEnhancedPrompt(e.target.value)} className="w-full min-h-32 bg-black/60 border border-white/20 rounded-md p-3 text-white" />
    </div>
    <div>
      <p className="text-xs font-bold text-[#FF6A00] mb-2">3. Upload reference image (optional)</p>
      <label className="block border border-dashed border-white/30 rounded-md p-4 text-center text-white/80 cursor-pointer">Upload reference image<input type="file" className="hidden" accept="image/*" onChange={(e)=>{const f=e.target.files?.[0]; if(f) onReferenceFile(f);}}/></label>
      {referencePreview && <img src={referencePreview} className="mt-3 w-full h-24 object-cover rounded"/>}
    </div>
  </section>
);
