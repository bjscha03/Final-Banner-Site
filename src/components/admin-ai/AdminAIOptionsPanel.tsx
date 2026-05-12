import React from 'react';
export const AdminAIOptionsPanel: React.FC<any> = ({widthIn,heightIn,setWidthIn,setHeightIn,material,setMaterial,quantity,setQuantity,finishing,setFinishing,priceLabel,onGenerate,generating,onEdit,editPrompt,setEditPrompt,onRevert,canRevert}) => (
  <section className="rounded-xl border border-white/10 bg-[#11151d] p-5 space-y-3 text-white"><h3 className="text-2xl font-black">Banner Options</h3>
  <div className="grid grid-cols-2 gap-2"><input type="number" value={widthIn} onChange={(e)=>setWidthIn(Number(e.target.value)||1)} className="bg-black/50 border border-white/20 rounded p-2"/><input type="number" value={heightIn} onChange={(e)=>setHeightIn(Number(e.target.value)||1)} className="bg-black/50 border border-white/20 rounded p-2"/></div>
  <select value={material} onChange={(e)=>setMaterial(e.target.value)} className="w-full bg-black/50 border border-white/20 rounded p-2"><option value="13oz-vinyl">13oz Standard Vinyl</option><option value="15oz-vinyl">15oz Premium Vinyl</option><option value="18oz-vinyl">18oz Heavy Duty Vinyl</option></select>
  <select value={finishing} onChange={(e)=>setFinishing(e.target.value)} className="w-full bg-black/50 border border-white/20 rounded p-2"><option>none</option><option>grommets</option><option>rope</option><option>pole_pockets</option></select>
  <input type="number" value={quantity} onChange={(e)=>setQuantity(Number(e.target.value)||1)} className="w-full bg-black/50 border border-white/20 rounded p-2"/>
  <div className="text-[#FFB36B] font-bold">{priceLabel}</div>
  <button onClick={onGenerate} disabled={generating} className="w-full bg-[#FF6A00] hover:bg-[#ff7f2a] text-white font-black rounded p-3">{generating?'Generating…':'Generate Design'}</button>
  <input value={editPrompt} onChange={(e)=>setEditPrompt(e.target.value)} placeholder="Edit with AI instruction" className="w-full bg-black/50 border border-white/20 rounded p-2"/>
  <button onClick={onEdit} disabled={generating||!editPrompt.trim()} className="w-full border border-white/30 rounded p-2">Edit with AI</button>
  <button onClick={onRevert} disabled={!canRevert} className="w-full border border-white/30 rounded p-2">Revert</button>
  </section>
);
