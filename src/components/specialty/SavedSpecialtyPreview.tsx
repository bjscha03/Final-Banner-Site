import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getSpecialtyProduct, specialtyTemplates } from '@/lib/specialtyProducts';
import type { SpecialtyConfiguration } from '@/lib/specialtyArtwork';
import SpecialtyPreview from './SpecialtyPreview';
export default function SavedSpecialtyPreview({ configuration }: { configuration: SpecialtyConfiguration }) {
  const [open,setOpen]=useState(false),[index,setIndex]=useState(0);
  const product=getSpecialtyProduct(configuration.productSlug), panel=configuration.panels[index];
  if(!product||!panel)return <p className="text-sm text-slate-500">Preview unavailable</p>;
  const template={...specialtyTemplates[panel.templateId],widthIn:panel.composition.widthIn,heightIn:panel.composition.heightIn};
  return <div><button type="button" className="w-full" onClick={()=>setOpen(true)} aria-label={`Enlarge ${configuration.productName} preview`}><SpecialtyPreview product={product} template={template} imageUrl={panel.preview.url}/></button><button className="mt-2 min-h-11 w-full text-sm font-semibold text-blue-800 underline" onClick={()=>setOpen(true)}>Review {configuration.panels.length>1?'all panels':'artwork'}</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92dvh] w-[96vw] max-w-4xl overflow-auto"><DialogTitle>{configuration.productName}</DialogTitle><DialogDescription>{configuration.variantLabel} · Approved artwork</DialogDescription><div className="flex flex-wrap gap-2">{configuration.panels.map((p,i)=><button key={p.id} type="button" onClick={()=>setIndex(i)} className={`min-h-11 rounded-lg border px-4 text-sm ${index===i?'border-orange-600 bg-orange-50':''}`}>{p.label}</button>)}</div><div className="grid items-center gap-5 md:grid-cols-2"><img src={panel.preview.url} alt={`${panel.label} approved print layout`} className="max-h-[65dvh] w-full object-contain"/><SpecialtyPreview product={product} template={template} imageUrl={panel.preview.url}/></div></DialogContent></Dialog></div>;
}
