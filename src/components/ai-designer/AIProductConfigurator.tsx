import React from 'react';
export const AIProductConfigurator = ({ store }: any) => (
  <div className="rounded-2xl border border-[#2a2a2a] bg-[#111] p-4">
    <h2 className="text-xl font-semibold mb-3">Configuration</h2>
    <div className="space-y-2 text-sm">
      <input type="number" value={store.width} onChange={(e)=>store.set({width:Number(e.target.value)})} className="w-full bg-[#1a1a1a] p-2 rounded" placeholder="Width (ft)"/>
      <input type="number" value={store.height} onChange={(e)=>store.set({height:Number(e.target.value)})} className="w-full bg-[#1a1a1a] p-2 rounded" placeholder="Height (ft)"/>
      <select value={store.material} onChange={(e)=>store.set({material:e.target.value})} className="w-full bg-[#1a1a1a] p-2 rounded"><option>13oz Standard Vinyl</option><option>15oz Premium Vinyl</option><option>18oz Heavy Duty Vinyl</option></select>
      <select value={store.finishing} onChange={(e)=>store.set({finishing:e.target.value})} className="w-full bg-[#1a1a1a] p-2 rounded"><option>None</option><option>Grommets</option><option>Rope</option><option>Pole Pockets</option></select>
      <input type="number" value={store.quantity} onChange={(e)=>store.set({quantity:Number(e.target.value)})} className="w-full bg-[#1a1a1a] p-2 rounded" placeholder="Quantity"/>
    </div>
  </div>
);
