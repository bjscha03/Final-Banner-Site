import React from 'react';
import type { AIVersion } from './types';

export const AdminAIVersionHistory: React.FC<{versions:AIVersion[]; onSelect:(id:string)=>void}> = ({versions,onSelect}) => (
  <section className="rounded-xl border border-white/10 bg-[#11151d] p-4"><h4 className="text-white font-bold mb-2">Version History</h4><div className="flex gap-2 overflow-x-auto">{versions.map(v=><button key={v.id} onClick={()=>onSelect(v.id)} className="w-16 h-16 rounded overflow-hidden border border-white/20"><img src={v.imageUrl} className="w-full h-full object-cover"/></button>)}</div></section>
);
