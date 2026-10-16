import {useEffect,useState} from 'react';
import {FileDown,ZoomIn} from 'lucide-react';
import sourceData from '../../../shared/specialty-supplier.json';
import {specialtyGallery,specialtyPackageNote} from '@/lib/specialtyGallery';
import {specialtyPanels,specialtyTemplate,specialtyOptionSummary} from '@/lib/specialtyProducts';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {type SpecialtyProduct,type SpecialtyVariant,type SpecialtyOptions} from '@/lib/specialtyProducts';
type Resource={id:string;name:string;sourceUrl:string;specifications:string[];gallery:Array<{url:string;thumb:string;label:string}>;groups:any[];downloads:Array<{label:string;url:string;kind:string;format:string;localUrl?:string}>;installation?:Array<{text:string;images:string[]}>;installationNotes?:string[];videos?:string[]};
const sources=sourceData as unknown as Record<string,Resource>;
let guideFonts:Promise<{regular:Uint8Array;bold:Uint8Array}>|undefined;
function loadGuideFonts(){
  return guideFonts ||= Promise.all(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].map(async file=>{const response=await fetch(`/fonts/artwork-guides/${file}`);if(!response.ok)throw new Error('Font download failed');return new Uint8Array(await response.arrayBuffer());})).then(([regular,bold])=>({regular,bold})).catch(error=>{guideFonts=undefined;throw error;});
}
export function SpecialtyProductGallery({product,variant,options,width=24,height=18}:{product:SpecialtyProduct;variant:SpecialtyVariant;options:SpecialtyOptions;width?:number;height?:number}) {
  const [selectedUrl,setSelectedUrl]=useState<string|null>(null),[open,setOpen]=useState(false);
  const images=specialtyGallery(product,variant,options);
  const current=images.find(image=>image.url===selectedUrl)||images[0];
  const summary=specialtyOptionSummary(variant,options);
  const packageNote=specialtyPackageNote(product,options);
  useEffect(()=>{setSelectedUrl(null);setOpen(false);},[product.slug,variant.id]);
  const dimensions=(product.priceUnit==='sqft'||variant.customSize)?`${width} × ${height} in`:variant.label;
  return <div className="min-w-0" data-testid="specialty-product-gallery">
    <button type="button" className="relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white" onClick={()=>setOpen(true)} aria-label={`Enlarge ${current.label}`}><img src={current.url} alt={`${product.name} — ${current.label}`} className="aspect-square w-full object-contain"/>{packageNote&&current.overview&&<span className="absolute left-3 right-3 top-3 rounded-lg bg-orange-50 px-3 py-2 text-left text-sm font-bold text-orange-950 shadow-sm">{options.tent_hardware==='0'?'Canopy graphic only · Frame not included':product.visual==='flag'?'Flag only · Pole and base not included':product.visual==='sign'?'Panel only · Mounting hardware not included':'Graphic only · Stand / frame not included'}</span>}<span className="absolute bottom-3 right-3 rounded-full bg-white p-2 shadow"><ZoomIn className="h-5 w-5"/></span></button>
    <p className="mt-3 text-sm font-bold text-slate-900">{current.label}</p>
    <p className="mt-1 text-xs leading-5 text-slate-600">{current.overview?'Example artwork and assembled setup. Your selected package and accessories are listed below.':'Product detail photo. Viewing a photo does not change your order.'}</p>
    {images.length>1&&<div className="mt-4" role="group" aria-label="Product and accessory photographs">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Product details & accessories</p>
      <div className="flex gap-2 overflow-x-auto pb-3">{images.map((img,i)=><button key={`${img.url}-${i}`} type="button" onClick={()=>setSelectedUrl(img.url)} aria-pressed={current.url===img.url} aria-label={`View ${img.label}`} className={`w-28 shrink-0 overflow-hidden rounded-xl border-2 bg-white text-left ${current.url===img.url?'border-orange-600 ring-1 ring-orange-600':'border-slate-200 hover:border-orange-300'}`}>
        <img src={img.url} alt="" loading="lazy" className="h-24 w-full object-contain"/>
        <span className="block px-2 pb-2 text-xs font-semibold leading-4">{img.label}</span>
        {img.optionKey&&<span className={`block px-2 py-1.5 text-[11px] font-bold ${img.selected?'bg-orange-50 text-orange-800':'bg-slate-50 text-slate-500'}`}>{img.selected?'Selected':'Not selected'}</span>}
      </button>)}</div>
    </div>}
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Your selected package" data-testid="selected-package-summary">
      <h3 className="text-sm font-bold text-slate-900">Your selection · {dimensions}</h3>
      {packageNote&&<p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm font-semibold leading-6 text-orange-900" role="status">{packageNote}</p>}
      <dl className="mt-3 grid gap-2 text-sm">{summary.filter(row=>row.key!=='size'&&row.key!=='Size').map(row=><div key={row.key} className="flex min-w-0 justify-between gap-4 border-t border-slate-100 pt-2"><dt className="text-slate-600">{row.label}</dt><dd className="min-w-0 break-words text-right font-semibold text-slate-900">{row.value}</dd></div>)}</dl>
      {product.visual==='tent'&&<p className="mt-3 text-xs leading-5 text-slate-600">Sandbags are supplied empty. Wall photos show installation examples; the quantities and print sides above determine your order.</p>}
      {product.visual==='flag'&&<p className="mt-3 text-xs leading-5 text-slate-600">Single-sided flags show a mirrored image on the other side. Reverse print changes the reading direction. Double-sided flags read correctly from both sides.</p>}
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92dvh] max-w-4xl overflow-auto"><DialogTitle>{product.name} — {current.label}</DialogTitle><img src={current.url} alt={`${product.name} — ${current.label}`} className="max-h-[70dvh] w-full object-contain"/><p className="text-sm text-slate-600">Example product photo. Your order follows your selected package and accessories.</p></DialogContent></Dialog>
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
