import {useEffect,useState} from 'react';
import {FileDown,ZoomIn} from 'lucide-react';
import sourceData from '../../../shared/specialty-supplier.json';
import mediaData from '../../../shared/specialty-media.json';
import {specialtyPanels,specialtyTemplate,specialtyOptionSummary} from '@/lib/specialtyProducts';
import {SpecialtyTemplateGuide} from './SpecialtyPreview';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {type SpecialtyProduct,type SpecialtyVariant,type SpecialtyOptions} from '@/lib/specialtyProducts';
type Resource={id:string;name:string;sourceUrl:string;specifications:string[];gallery:Array<{url:string;thumb:string;label:string}>;groups:any[];downloads:Array<{label:string;url:string;kind:string;format:string;localUrl?:string}>;installation?:Array<{text:string;images:string[]}>;installationNotes?:string[];videos?:string[]};
const sources=sourceData as unknown as Record<string,Resource>;
type GalleryImage={url:string;label:string;when?:Record<string,string>};
const media=mediaData as {variants:Record<string,GalleryImage[]>;products:Record<string,GalleryImage[]>;options:Record<string,string>};
let guideFonts:Promise<{regular:Uint8Array;bold:Uint8Array}>|undefined;
function loadGuideFonts(){
  return guideFonts ||= Promise.all(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].map(async file=>{const response=await fetch(`/fonts/artwork-guides/${file}`);if(!response.ok)throw new Error('Font download failed');return new Uint8Array(await response.arrayBuffer());})).then(([regular,bold])=>({regular,bold})).catch(error=>{guideFonts=undefined;throw error;});
}
export function SpecialtyProductGallery({product,variant,options,width=24,height=18}:{product:SpecialtyProduct;variant:SpecialtyVariant;options:SpecialtyOptions;width?:number;height?:number}) {
  const [selected,setSelected]=useState(0),[open,setOpen]=useState(false);
  const variantImages=media.variants[variant.id]||[{url:product.image,label:product.imageAlt}];
  // Custom-size photos depict the catalog's 24 x 18-inch reference only.
  // Other dimensions need their actual artboard, not an unchanged setup image.
  const referenceSize=product.priceUnit!=='sqft'||(width===24&&height===18);
  const matches=referenceSize?variantImages.filter(img=>!img.when||Object.entries(img.when).every(([k,v])=>options[k]===v)):[];
  const images=matches.length?[...matches,...(media.products[product.slug]||[])]:[];
  useEffect(()=>setSelected(0),[variant.id,JSON.stringify(options)]);
  const current=images[selected]||images[0];
  const panel=specialtyPanels(variant,options)[0];
  const template=specialtyTemplate(product,variant,panel,width,height);
  if(!current)return <div className="min-w-0 break-words rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8" data-testid="selected-configuration-guide"><p className="text-xs font-black uppercase tracking-widest text-orange-700">Your selected configuration</p><h2 className="mt-3 text-2xl font-bold text-slate-900">{product.name}</h2><p className="mt-2 font-semibold">{variant.label}</p><div className="mx-auto my-6 relative w-full border bg-white" style={{aspectRatio:`${template.widthIn}/${template.heightIn}`,maxWidth:Math.min(420,300*template.widthIn/template.heightIn)}}><SpecialtyTemplateGuide template={template}/></div><p className="text-center text-sm font-semibold">{panel.label}: {template.widthIn.toFixed(2).replace(/\.00$/,'')} × {template.heightIn.toFixed(2).replace(/\.00$/,'')} in</p><dl className="mt-6 space-y-2 text-sm">{specialtyOptionSummary(variant,options).map(o=><div key={o.key} className="flex justify-between gap-4 border-t pt-2"><dt className="text-slate-600">{o.label}</dt><dd className="text-right font-semibold">{o.value}</dd></div>)}</dl><p className="mt-5 text-sm leading-6 text-slate-600">Upload your artwork below to preview its exact print placement. The guide shows this panel; selected accessories are listed above.</p></div>;
  return <div className="min-w-0">
    <button type="button" className="relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white" onClick={()=>setOpen(true)} aria-label={`Enlarge ${current.label}`}><img src={current.url} alt={current.label} className="aspect-square w-full object-contain"/><span className="absolute bottom-3 right-3 rounded-full bg-white p-2 shadow"><ZoomIn className="h-5 w-5"/></span></button>
    {images.length>1&&<div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Product and accessory photographs">{images.map((img,i)=><button key={`${img.url}-${i}`} type="button" onClick={()=>setSelected(i)} aria-pressed={selected===i} aria-label={img.label} className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${selected===i?'border-orange-600':'border-slate-200'}`}><img src={img.url} alt="" loading="lazy" className="h-full w-full object-contain"/></button>)}</div>}
    <p className="mt-3 text-sm font-semibold text-slate-700">{current.label}</p>
    <p className="mt-1 text-xs leading-5 text-slate-500">Example artwork and setup. Your order includes the size, print sides, hardware and accessories selected alongside this image.</p>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92dvh] max-w-4xl overflow-auto"><DialogTitle>{current.label}</DialogTitle><img src={current.url} alt={current.label} className="max-h-[75dvh] w-full object-contain"/></DialogContent></Dialog>
  </div>;
}
export default function SpecialtyProductResources({product,variant,options,width,height}:{product:SpecialtyProduct;variant:SpecialtyVariant;options:SpecialtyOptions;width:number;height:number}) {
  const [downloadError,setDownloadError]=useState('');
  const panels=specialtyPanels(variant,options);
  async function downloadGuide(panel:typeof panels[number]) {
    try {setDownloadError('');const {createSpecialtyTemplateGuide}=await import('../../../shared/specialty-template-guide.mjs');const t=specialtyTemplate(product,variant,panel,width,height);const bytes=await createSpecialtyTemplateGuide(t,`${product.name} - ${variant.label} - ${panel.label}`,await loadGuideFonts());const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=`${product.slug}-${panel.id}-${t.widthIn}x${t.heightIn}-artwork-guide.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);} catch {setDownloadError('The artwork guide could not be downloaded. Please try again.');}
  }
  const source=sources[variant.supplierProfile||''];if(!source)return null;
  const groups=[['Specifications','spec'],['Artwork templates & file setup','template'],['Assembly & installation','installation']] as const;
  return <section aria-label="Product specifications and downloads" className="min-w-0 break-words space-y-4">
    {groups.map(([label,kind])=><details key={kind} className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><summary className="cursor-pointer text-lg font-bold text-slate-900">{label}</summary>
      {kind==='spec'?<ul className="mt-5 grid gap-x-8 gap-y-3 text-sm leading-6 text-slate-700 md:grid-cols-2">{source.specifications.map((spec,i)=><li key={i} className="border-l-2 border-orange-200 pl-3">{spec}</li>)}</ul>:<>
        {kind==='template'&&<><div className="mt-5 grid gap-3 sm:grid-cols-2">{panels.map(panel=>{const t=specialtyTemplate(product,variant,panel,width,height);return <button type="button" key={panel.id} onClick={()=>downloadGuide(panel)} className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 p-4 text-left text-sm font-semibold text-blue-900 hover:border-blue-400"><FileDown className="h-5 w-5 shrink-0"/><span>{panel.label}<span className="mt-1 block text-xs font-medium text-slate-500">{t.widthIn} × {t.heightIn} in · {t.exportScale*100}% scale · PDF guide</span></span></button>;})}</div>{downloadError&&<p role="alert" className="mt-3 text-sm text-red-700">{downloadError}</p>}<p className="mt-4 text-sm leading-6 text-slate-600">Upload a single-page PDF, JPG or PNG for each required print panel. Build to the selected template, keep critical content inside the safe area, and remove template guides before uploading. Supplier production files require CMYK, outlined fonts and 150 dpi raster artwork. Maximum upload: 300 MB. Template scale is shown in the artwork editor. Download links above follow your selected size and required panels.</p></>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{source.downloads.filter(d=>d.kind===kind&&(kind!=='template'||panels.some(p=>specialtyTemplate(product,variant,p,width,height).sourceUrl===d.url))).map((d,i)=><a key={`${d.url}-${i}`} href={d.localUrl||d.url} target="_blank" rel="noreferrer" className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-blue-900 hover:border-blue-400"><FileDown className="h-5 w-5 shrink-0"/><span>{d.label}<span className="mt-1 block text-xs font-medium text-slate-500">{d.format} · Open/download</span></span></a>)}</div>
        {kind==='installation'&&source.installation?.map((step,i)=><div key={i} className="mt-5"><p className="text-sm leading-6 text-slate-700">{step.text}</p></div>)}
        {kind==='installation'&&source.installationNotes?.map(note=><p key={note} className="mt-4 text-sm leading-6 text-slate-600">{note}</p>)}
        {kind==='installation'&&source.videos?.map(url=><a key={url} href={url.replace('/embed/','/watch?v=')} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-800 underline">Watch the manufacturer’s assembly video</a>)}
        {kind==='installation'&&!source.downloads.some(d=>d.kind===kind)&&!source.installation?.length&&!source.videos?.length&&<p className="mt-4 text-sm text-slate-600">The manufacturer does not publish a separate installation guide for this item. Product specifications and artwork templates are provided above.</p>}
        {kind==='template'&&!source.downloads.some(d=>d.kind===kind)&&<p className="mt-3 text-sm text-slate-600">This product uses the selected rectangular artwork dimensions. Follow the safe margins shown in your artwork editor.</p>}
      </>}
    </details>)}
  </section>;
}
