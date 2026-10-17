import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Upload, ShoppingCart, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { specialtyTemplate, specialtyConfigurationPrice, specialtyOptions, specialtyPanels, specialtyOptionSummary, specialtyMaterialLabel, formatSpecialtyPrice, type SpecialtyProduct } from '@/lib/specialtyProducts';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import { getPermanentArtworkPreviewUrl } from '@/lib/cartArtworkForEditor';
import { createPermanentPlacementPreview } from '@/lib/previewArtifactCoordinator';
import { PREVIEW_ARTIFACT_VERSION, type ArtworkCompositionSpec, type NormalizedArtworkTransform } from '@/lib/previewLifecycle';
import { exportSpecialtyPanel, specialtyArtworkPpi, type SpecialtySavedPanel } from '@/lib/specialtyArtwork';
import ArtworkPreviewEditor, { type ArtworkPreviewEditorHandle, type ArtworkTransform } from '@/components/design/ArtworkPreviewEditor';
import { uploadArtworkFile, validateArtworkFile } from '@/utils/uploadArtworkFile';
import { renderPositionedThumbnailBlob } from '@/utils/generatePositionedThumbnail';
import SpecialtyPreview, { SpecialtyTemplateGuide } from './SpecialtyPreview';
import SpecialtyOptions from './SpecialtyOptions';
import SpecialtyProductResources, {SpecialtyProductGallery} from './SpecialtyProductResources';

type DraftPanel = { artwork: UploadedArtworkFile; originalArtwork?: UploadedArtworkFile; transform: NormalizedArtworkTransform; revision: number; reviewed: boolean };
const initialTransform = { xPct: 0, yPct: 0, scaleX: 1, scaleY: 1 };
const initialPixels = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
const clearSubstrateStyle = {
  backgroundColor: '#ffffff',
  backgroundImage: 'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

export default function SpecialtyDesigner({ product }: { product: SpecialtyProduct }) {
  const navigate=useNavigate(); const [params]=useSearchParams();
  const editId=params.get('editItem'); const existing=useCartStore(s=>s.items.find(x=>x.id===editId && x.specialty_config?.productSlug===product.slug));
  const initialVariant=product.variants.find(v=>v.id===existing?.specialty_config?.variantId) || product.variants.find(v=>v.priceMatch) || product.variants[0];
  const [variantId,setVariantId]=useState(initialVariant.id);
  const variant=product.variants.find(v=>v.id===variantId) || product.variants[0];
  const [options,setOptions]=useState(()=>specialtyOptions(initialVariant,existing?.specialty_config?.options));
  const definitions=specialtyPanels(variant,options);
  const materialLabel=specialtyMaterialLabel(product,variant,options);
  const [toolbarContainer,setToolbarContainer]=useState<HTMLDivElement|null>(null);
  const [customHoles,setCustomHoles]=useState(existing?.specialty_config?.customHoles||[]);
  const [quantity,setQuantity]=useState(existing?.quantity || 1);
  const [width,setWidth]=useState(String(existing?.width_in || 24)); const [height,setHeight]=useState(String(existing?.height_in || 18));
  const [panelId,setPanelId]=useState(variant.panels[0].id);
  const panel=definitions.find(p=>p.id===panelId) || definitions[0];
  const template=specialtyTemplate(product,variant,panel,Number(width),Number(height));
  const [drafts,setDrafts]=useState<Record<string,DraftPanel>>(()=>Object.fromEntries((existing?.specialty_config?.panels || []).map(p=>[p.id,{artwork:p.artwork,originalArtwork:p.originalArtwork,transform:{xPct:p.composition.transform.xPct,yPct:p.composition.transform.yPct,scaleX:p.composition.transform.scaleX,scaleY:p.composition.transform.scaleY},revision:p.composition.revision,reviewed:!p.composition.transform.crop}])));
  const [pixels,setPixels]=useState<ArtworkTransform>(initialPixels);
  const [constrain,setConstrain]=useState(true); const [guides,setGuides]=useState(true);
  const [busy,setBusy]=useState(''); const [error,setError]=useState(''); const [preview,setPreview]=useState('');
  const [showRealistic,setShowRealistic]=useState(true);
  // Textile drape and multi-panel assembly cannot be certified by a 2D scene.
  const hasAppearancePreview=!['table','tent'].includes(product.visual);
  const editor=useRef<ArtworkPreviewEditorHandle>(null); const revision=useRef(0); const frame=useRef(0);
  const input=useRef<HTMLInputElement>(null); const unmounted=useRef(false);
  const draft=drafts[panel.id]; const artwork=draft?.artwork || null;
  const compositionKey=[product.slug,variant.id,panel.id,artwork?.fileKey,template.widthIn,template.heightIn].join('|');
  const effectivePpi=artwork&&draft?specialtyArtworkPpi(artwork,{widthIn:template.widthIn,heightIn:template.heightIn,transform:draft.transform}):null;
  let pricing:ReturnType<typeof specialtyConfigurationPrice>|undefined,unit=0,priceError='';
  try {pricing=specialtyConfigurationPrice(product,variant,Number(width),Number(height),options);unit=pricing.unitCents;} catch(e) {priceError=(e as Error).message;}
  const priceMatch=pricing?.verified;
  const needsCustomHoles=options.holespunch?.startsWith('custom');
  function changeHoles(next:typeof customHoles){revision.current++;setCustomHoles(next);setDrafts(d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,{...v,reviewed:false}])));}
  function changeOptions(next:Record<string,string>){
    const selectedSize=product.priceUnit==='sqft'&&next.size!==options.size&&next.size?.match(/^(\d+)x(\d+)$/);
    if(selectedSize){changeConfiguration(()=>{setOptions(next);setWidth(selectedSize[1]);setHeight(selectedSize[2]);});return;}
    capture();revision.current++;setDrafts(d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,{...v,reviewed:false}])));setOptions(next);setError('');
  }

  useEffect(()=>{unmounted.current=false;return()=>{unmounted.current=true;cancelAnimationFrame(frame.current);};},[]);
  function capture() {
    if (!artwork || !editor.current) return;
    let snapshot;try { snapshot=editor.current.getCompositionSnapshot(); } catch { setError('Wait for the artwork editor to finish loading, then review the placement.');return; }
    setDrafts(d=>({...d,[panel.id]:{...d[panel.id],transform:snapshot.transform,revision:snapshot.revision}}));
    return snapshot;
  }
  function move(next: ArtworkTransform) {
    setPixels(next);setError('');setDrafts(d=>d[panel.id]?({...d,[panel.id]:{...d[panel.id],reviewed:false}}):d);
    cancelAnimationFrame(frame.current);
    frame.current=requestAnimationFrame(()=>{
      if (!editor.current) return;
      try {const snapshot=editor.current.getCompositionSnapshot();revision.current++;setDrafts(d=>d[panel.id]?({...d,[panel.id]:{...d[panel.id],transform:snapshot.transform,revision:snapshot.revision,reviewed:false}}):d);} catch {/* The image is still decoding. */}
    });
  }
  function changeConfiguration(next: ()=>void) {
    capture();revision.current++; next();setPixels(initialPixels);setPreview('');
    setDrafts(d=>Object.fromEntries(Object.entries(d).map(([key,value])=>[key,{...value,transform:initialTransform,revision:value.revision+1,reviewed:false}])));
  }
  useEffect(()=>{
    let stopped=false;let objectUrl='';setPreview('');
    if (!draft) return;
    const timer=window.setTimeout(()=>{
      void renderPositionedThumbnailBlob({imageUrl:getPermanentArtworkPreviewUrl(draft.artwork),widthIn:template.widthIn,heightIn:template.heightIn,imgPosPercent:{x:draft.transform.xPct,y:draft.transform.yPct},imgScale:draft.transform.scaleX,imgScaleY:draft.transform.scaleY,backgroundColor:product.slug==='acrylic-signs'?'transparent':'#ffffff',mimeType:product.slug==='acrylic-signs'?'image/png':'image/jpeg',maxOutputPx:1400,maxOutputPixels:1_500_000})
      .then(result=>{if(stopped)return;objectUrl=URL.createObjectURL(result.blob);setPreview(objectUrl);}).catch(()=>{if(!stopped)setError('Preview could not load. Please retry the artwork upload before continuing.');});
    },200);
    return ()=>{stopped=true;clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[compositionKey,JSON.stringify(options),draft?.transform.xPct,draft?.transform.yPct,draft?.transform.scaleX,draft?.transform.scaleY]);

  async function upload(file: File, propagateError=false) {
    if (busy) return;const token=++revision.current;setBusy('Uploading your original artwork…');setError('');
    try {
      const validation=validateArtworkFile(file);if(validation) throw new Error(typeof validation==='string'?validation: 'Choose a PDF, PNG or JPG file up to 300 MB.');
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
      if (isPdf) {const {PDFDocument}=await import('pdf-lib');const doc=await PDFDocument.load(await file.arrayBuffer());if(doc.getPageCount()!==1) throw new Error('Use a separate single-page PDF for each panel. This file contains more than one page.');}
      const saved=await uploadArtworkFile(file);let previewUrl=saved.previewUrl;let pixelWidth=saved.width,pixelHeight=saved.height;
      if(isPdf){setBusy('Preparing a clear PDF preview…');const {renderPdfToDataUrl}=await import('@/utils/pdf/renderPdfToDataUrl');const raster=await renderPdfToDataUrl(file,{minWidth:1800,minHeight:1800,maxPixels:4_000_000,transparentBackground:product.slug==='acrylic-signs'});try {const blob=await (await fetch(raster.previewUrl)).blob();const uploaded=await uploadArtworkFile(new File([blob],blob.type==='image/png'?'pdf-preview.png':'pdf-preview.jpg',{type:blob.type}));previewUrl=uploaded.previewUrl;pixelWidth=raster.width;pixelHeight=raster.height;}finally{raster.cleanup();}}
      if (unmounted.current||token!==revision.current) {if(propagateError)throw new Error('The selected product or panel changed while saving. Please upload again for the current selection.');return;}
      const next:UploadedArtworkFile={editorIdentity:`${saved.fileKey}:${Date.now()}`,name:file.name,url:saved.secureUrl,fileKey:saved.fileKey,size:file.size,isPdf,previewUrl,permanentPreviewUrl:previewUrl,thumbnailUrl:previewUrl,productionUrl:saved.productionUrl,productionPublicId:saved.productionPublicId,resourceType:saved.resourceType,mimeType:saved.mimeType,originalWidth:pixelWidth,originalHeight:pixelHeight,artworkManifest:saved.artworkManifest};
      setDrafts(d=>({...d,[panel.id]:{artwork:next,transform:initialTransform,revision:0,reviewed:false}}));setPixels(initialPixels);
    }catch(e){setError((e as Error).message||'Upload failed. Your existing artwork is still available.');if(propagateError)throw e;}finally{if(!unmounted.current)setBusy('');if(input.current)input.current.value='';}
  }
  async function addToCart() {
    if(busy||priceError) return;
    const latest=capture();const token=++revision.current;setBusy('Saving your approved artwork and previews…');setError('');
    try {
      if (!latest) throw new Error('Wait for your artwork editor to finish loading before saving.');
      if(needsCustomHoles&&(!customHoles.length||customHoles.some(h=>!Number.isFinite(h.xIn)||!Number.isFinite(h.yIn)||h.xIn<.5||h.yIn<.5||h.xIn>Number(width)-.5||h.yIn>Number(height)-.5)))throw new Error('Place every custom mounting hole at least ½ inch inside the sign edges.');
      const panels:SpecialtySavedPanel[]=[];
      for(const definition of definitions){
        const d=drafts[definition.id];if(!d?.reviewed)throw new Error(`Review and approve the ${definition.label.toLowerCase()} artwork first.`);
        const t=specialtyTemplate(product,variant,definition,Number(width),Number(height));
        const state=definition.id===panel.id&&latest ? {transform:latest.transform,revision:latest.revision}:d;
        const spec:ArtworkCompositionSpec={version:PREVIEW_ARTIFACT_VERSION,sourceUrl:getPermanentArtworkPreviewUrl(d.artwork),sourceIdentity:d.artwork.editorIdentity||d.artwork.fileKey,productType:`specialty:${product.slug}:${variant.id}:${definition.id}`,widthIn:t.widthIn,heightIn:t.heightIn,fitMode:'fit',transform:state.transform,revision:state.revision};
        const ready=await createPermanentPlacementPreview(spec);const production=await exportSpecialtyPanel(d.artwork,spec,t);
        const ppi=specialtyArtworkPpi(d.artwork,spec);
        panels.push({...definition,artwork:d.artwork,originalArtwork:d.originalArtwork,composition:spec,preview:ready,...production,effectivePpi:ppi});
      }
      if(token!==revision.current||unmounted.current)throw new Error('The design changed while saving. Review the latest version and try again.');
      useCartStore.getState().saveSpecialtyItem({configuration:{version:1,productSlug:product.slug,variantId:variant.id,productName:product.name,variantLabel:variant.label,materialLabel,options,supplierProfile:variant.supplierProfile,optionSummary:specialtyOptionSummary(variant,options),customHoles:needsCustomHoles?customHoles:undefined,priceVerified:!!priceMatch,panels,approvedAt:new Date().toISOString()},quantity,widthIn:panels[0].composition.widthIn,heightIn:panels[0].composition.heightIn,editId:existing?.id});
      navigate('/checkout');
    }catch(e){setError((e as Error).message||'We could not save this design. Please retry.');}finally{if(!unmounted.current)setBusy('');}
  }
  const allReviewed=definitions.every(p=>drafts[p.id]?.reviewed);
  return <div className="min-w-0 space-y-8">
    <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <SpecialtyProductGallery product={product} variant={variant} options={options} width={Number(width)} height={Number(height)}/>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8" aria-label="Product configuration">
        <p className="text-xs font-black uppercase tracking-widest text-orange-700">1 · Choose options</p><h2 className="mt-2 text-2xl font-bold">Choose your size & options</h2>
        <label htmlFor="specialty-variant" className="mt-6 block text-sm font-bold">Size & configuration</label><select id="specialty-variant" value={variantId} disabled={!!busy} onChange={e=>changeConfiguration(()=>{const next=product.variants.find(v=>v.id===e.target.value)!;setVariantId(next.id);setOptions(specialtyOptions(next));setCustomHoles([]);if(next.customSize){setWidth('96');setHeight('96');}setPanelId('front');})} className="mt-2 min-h-12 min-w-0 max-w-full w-full rounded-lg border border-slate-300 bg-white px-3">{product.variants.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>
        {(product.priceUnit==='sqft'||variant.customSize)&&<div className="mt-4 grid grid-cols-2 gap-4">{[['Width',width,setWidth],['Height',height,setHeight]].map(([label,value,setter])=><label key={String(label)} className="min-w-0 text-sm font-bold">{String(label)} (in)<input type="number" min={product.sizeLimits?.min} step={variant.customSize?.step||.25} value={String(value)} disabled={!!busy} onChange={e=>changeConfiguration(()=>{(setter as (s:string)=>void)(e.target.value);if(product.priceUnit==='sqft'&&options.size)setOptions(specialtyOptions(variant,{...options,size:'custom_size'}));})} className="mt-2 min-h-12 min-w-0 max-w-full w-full rounded-lg border px-3"/></label>)}</div>}
        {product.priceMatches&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Standard priced sizes">{product.priceMatches.map(size=><button type="button" disabled={!!busy} key={`${size.widthIn}x${size.heightIn}`} className="min-h-11 rounded-lg border px-3 text-sm font-semibold hover:border-orange-600" onClick={()=>changeConfiguration(()=>{setWidth(String(size.widthIn));setHeight(String(size.heightIn));})}>{size.widthIn} × {size.heightIn} in · {formatSpecialtyPrice(specialtyConfigurationPrice(product,variant,size.widthIn!,size.heightIn!).unitCents)}</button>)}</div>}
        <SpecialtyOptions product={product} variant={variant} value={options} onChange={changeOptions} disabled={!!busy} width={Number(width)} height={Number(height)} basePriced={!!pricing?.baseVerified}/>
        {needsCustomHoles&&<div className="mt-5 rounded-xl border p-4"><h3 className="font-bold">Custom mounting positions</h3><p className="mt-2 text-xs leading-5 text-slate-600">Enter each hole center in inches from the top-left corner of the finished sign. Keep centers at least ½ inch from each edge.</p>{customHoles.map((hole,i)=><div key={i} className="mt-3 flex items-end gap-2">{(['xIn','yIn'] as const).map(key=><label key={key} className="min-w-0 flex-1 text-xs">{key==='xIn'?'From left':'From top'}<input type="number" step=".125" min=".5" value={hole[key]} disabled={!!busy} onChange={e=>changeHoles(customHoles.map((v,n)=>n===i?{...v,[key]:Number(e.target.value)}:v))} className="mt-1 min-h-11 w-full rounded border px-2"/></label>)}<button type="button" className="min-h-11 text-sm text-red-800" disabled={!!busy} onClick={()=>changeHoles(customHoles.filter((_,n)=>n!==i))}>Remove</button></div>)}<button type="button" className="mt-3 min-h-11 text-sm font-semibold text-blue-800 underline" disabled={!!busy||customHoles.length>=32} onClick={()=>changeHoles([...customHoles,{xIn:1,yIn:1}])}>Add mounting hole</button></div>}
        <label className="mt-5 block text-sm font-bold" htmlFor="specialty-qty">Quantity</label><input id="specialty-qty" type="number" min="1" max="100" step="1" value={quantity} disabled={!!busy} onChange={e=>setQuantity(Math.max(1,Math.min(100,Math.floor(Number(e.target.value)||1))))} className="mt-2 min-h-12 w-28 rounded-lg border px-3"/>
        <div className="my-6 border-y py-5" aria-live="polite" data-testid="specialty-price">
          <p className="text-sm text-slate-600">{priceMatch?'Product subtotal':pricing?.baseVerified?'Base + priced options':'Product price'}</p>
          <p className="mt-1 text-3xl font-black tracking-tight" data-testid="specialty-subtotal">{priceError?'Choose a valid size':pricing?.baseVerified?formatSpecialtyPrice(unit*quantity):'Price coming soon'}</p>
          {pricing?.baseVerified&&pricing.adjustments.length>0&&<div className="mt-3 flex justify-between gap-4 text-sm text-slate-600"><span>Base product × {quantity}</span><span>{formatSpecialtyPrice(pricing.baseCents*quantity)}</span></div>}
          {pricing?.adjustments.map(a=><div key={a.key} className="mt-2 flex justify-between gap-4 text-sm text-slate-600"><span>{a.label}</span><span className="whitespace-nowrap">{a.cents===0?'Included':`${a.cents<0?'−':'+'}${formatSpecialtyPrice(Math.abs(a.cents)*quantity)}`}</span></div>)}
          {pricing?.shippingPolicy ? (<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" aria-label="Shipping benefit"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-extrabold text-emerald-900">FREE Next-Day Air Shipping</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-800">$0 shipping</span></div><p className="mt-1 text-xs text-emerald-900">Ships via Next-Day Air after production. Delivery timing begins when your order ships.</p></div>) : (<p className="mt-3 text-sm text-amber-800">Shipping coming soon</p>)}
          <p className="mt-3 text-xs leading-5 text-slate-500">{priceMatch?`${formatSpecialtyPrice(unit)} each, including selected options. Tax calculated separately.`:pricing?.baseVerified?'The amount above includes the base product and priced options. Options listed below are not included yet.':'Customize your artwork and save it to your cart while pricing is added.'}</p>

          {!priceMatch&&pricing&&<p className="mt-2 text-xs leading-5 text-amber-800">Price coming soon: {pricing.missing.join('; ')}.</p>}
        </div>
        <details open className="rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-bold">Your selected package · {variant.label}</summary><dl className="mt-3 space-y-2 text-sm">{specialtyOptionSummary(variant,options).map(o=><div key={o.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-slate-600">{o.label}</dt><dd className="font-semibold">{o.value==='Insert Only'?'Replacement graphic only — stand not included':o.value==='Stand + Insert'?'Printed graphic + stand':o.value}</dd></div>)}</dl></details>
        <a href="#specialty-artwork" className="mt-7 flex min-h-12 w-full min-w-0 items-center justify-center gap-2 text-center rounded-lg bg-brand-orange px-4 font-bold text-brand-ink">Continue to artwork<ArrowRight className="h-4 w-4"/></a>
      </section>
    </div>
    <section id="specialty-artwork" className="min-w-0 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <p className="text-xs font-black uppercase tracking-widest text-orange-700">2 · Add artwork</p><h2 className="mt-2 text-2xl font-bold">Your artwork, on your product</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Upload your design or logo as a PDF, PNG or JPG. Use Fit to show the entire image, or Fill to cover the print area. Keep text and logos inside the safe guides, and check the preview before approving.</p>
      {definitions.length>1&&<div className="my-5 flex flex-wrap gap-2" role="tablist" aria-label="Print panels">{definitions.map(p=><button role="tab" type="button" aria-selected={panel.id===p.id} key={p.id} disabled={!!busy} onClick={()=>{capture();setPanelId(p.id);setPixels(initialPixels);}} className={`min-h-11 rounded-lg border px-4 text-sm font-bold ${panel.id===p.id?'border-orange-600 bg-orange-50':'border-slate-300'}`}>{p.label}{drafts[p.id]?.reviewed?' ✓':''}</button>)}</div>}
      <div className="mt-6 flex flex-wrap gap-3"><input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);}} className="sr-only" aria-label={`Upload ${panel.label} artwork`}/><button type="button" disabled={!!busy||!!priceError} onClick={()=>input.current?.click()} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-slate-900 px-5 font-bold text-white disabled:opacity-50"><Upload className="h-4 w-4"/>{artwork?'Replace artwork':'Upload artwork'}</button>{template.sourceUrl&&<a href={template.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center px-2 text-sm font-semibold text-blue-800 underline">Download setup template (optional)</a>}</div>
      <details className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700"><summary className="cursor-pointer font-semibold">Artwork size & safe-area guidance</summary><strong>{panel.label}: {template.widthIn.toFixed(2).replace(/\.00$/,'')}″ × {template.heightIn.toFixed(2).replace(/\.00$/,'')}″ artwork</strong><p>{template.fitNotes}</p>{template.safeInsetsIn&&<p>Safe margins: top {template.safeInsetsIn[0]}″, right {template.safeInsetsIn[1]}″, bottom {template.safeInsetsIn[2]}″, left {template.safeInsetsIn[3]}″.</p>}{template.exportScale!==1&&<p>The downloaded print PDF uses the supplier’s 1:{1/template.exportScale} template scale.</p>}</details>
      {artwork?<><div className="mt-6 grid items-start gap-6 lg:grid-cols-2"><div className={busy?'pointer-events-none opacity-75':''}><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Artwork placement</h3><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/>Show guides</label></div><div className="mx-auto pt-20" style={{maxWidth:Math.min(600,460*template.widthIn/template.heightIn)}}><ArtworkPreviewEditor key={compositionKey} ref={editor} compositionKey={compositionKey} src={artwork.url} previewUrl={artwork.permanentPreviewUrl||artwork.previewUrl} productionUrl={artwork.productionUrl} resourceType={artwork.resourceType} mimeType={artwork.mimeType} paddingPct={`${template.heightIn/template.widthIn*100}%`} value={pixels} onChange={move} constrain={constrain} onConstrainChange={setConstrain} initialNormalizedTransform={draft.transform} initialCompositionRevision={draft.revision} productLabel="print area" enableCropping={false} canvasStyle={product.slug==='acrylic-signs'?clearSubstrateStyle:undefined} mobileToolbarContainer={toolbarContainer} overlay={guides?<SpecialtyTemplateGuide template={template}/>:undefined}/></div><div ref={setToolbarContainer} className="mt-4 w-full min-w-0"/><p className="mt-3 break-all text-xs text-slate-500">{artwork.name} · Original file preserved</p></div><div className="order-first min-w-0 lg:order-last" data-testid="specialty-live-preview"><div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{showRealistic&&hasAppearancePreview?'Your finished product':`${panel.label} print layout`}</h3>{hasAppearancePreview&&<button type="button" className="min-h-11 text-sm font-semibold text-blue-800 underline" onClick={()=>setShowRealistic(v=>!v)}>{showRealistic?'See flat artwork':'See product'}</button>}</div>{preview?(showRealistic&&hasAppearancePreview?<SpecialtyPreview product={product} template={template} imageUrl={preview} options={options} variant={variant} customHoles={customHoles} className="[&_svg]:max-h-[280px] lg:[&_svg]:max-h-[460px]"/>:<img src={preview} alt={`${panel.label} flat artwork without guides`} className="mx-auto max-h-[520px] w-full rounded-lg border object-contain" style={{maxWidth:Math.min(600,520*template.widthIn/template.heightIn),...(product.slug==='acrylic-signs'?clearSubstrateStyle:{})}}/>):<div role="status" className="flex min-h-60 items-center justify-center gap-2 rounded-lg bg-slate-50"><Loader2 className="h-5 w-5 animate-spin"/>Updating preview…</div>}{!hasAppearancePreview&&<p className="mt-3 text-xs leading-5 text-slate-600">Flat print layout for this panel. Fabric folds and assembled surfaces can change its appearance; use the safe-area guides to check placement.</p>}{product.slug==='acrylic-signs'&&!showRealistic&&<p className="mt-3 text-xs leading-5 text-slate-600">Checkerboard areas are clear, unprinted acrylic. The checkerboard is not part of your print file.</p>}</div></div><p className="mt-8 text-xs font-black uppercase tracking-widest text-orange-700">3 · Review & add to cart</p><label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6"><input type="checkbox" checked={draft.reviewed} disabled={!!busy||!preview} onChange={e=>{if(!capture())return;const checked=e.target.checked;setDrafts(d=>({...d,[panel.id]:{...d[panel.id],reviewed:checked}}));}} className="mt-1 h-5 w-5 accent-orange-600"/><span>I checked the {panel.label.toLowerCase()} artwork, wording, image clarity, and placement inside the safe area.</span></label></>:<div className="mt-6 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500"><Upload className="mx-auto mb-3 h-8 w-8"/><p>Your {panel.label.toLowerCase()} artwork and product preview will appear here.</p></div>}
      {effectivePpi!==null&&effectivePpi<150&&<p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Image resolution at this placement: approximately {Math.round(effectivePpi)} pixels per inch. For sharper print, use artwork with at least 150 pixels per inch at full size, or a vector PDF. Check small text carefully before approving.</p>}
      {(error||priceError)&&<p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error||priceError}</p>}
      {busy&&<p role="status" className="mt-5 flex items-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin"/>{busy}</p>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6"><div><p className="text-sm text-slate-500">{quantity} × {product.name}</p><p className="text-2xl font-black">{priceError?'Choose a valid size':pricing?.baseVerified?formatSpecialtyPrice(unit*quantity):'Price coming soon'}</p><p className="mt-1 text-xs text-slate-600">{pricing?.shippingPolicy?'Free Next-Day Air after production · ':''}Tax calculated at checkout</p>{pricing?.baseVerified&&!priceMatch&&<p className="text-xs text-amber-800">Base + priced options; other option prices coming soon</p>}</div><button type="button" disabled={!!busy||!!priceError||!allReviewed} onClick={()=>void addToCart()} className="inline-flex min-h-14 items-center gap-3 rounded-lg bg-brand-orange px-7 text-lg font-bold text-brand-ink hover:bg-brand-orange-hover disabled:cursor-not-allowed disabled:opacity-40"><ShoppingCart className="h-5 w-5"/>{existing?'Save changes to cart':'Add to cart'}</button></div><p className="mt-3 text-xs text-slate-500">{allReviewed?'Your approved artwork travels with this cart item.':`Next: ${!artwork?'upload your artwork':`review and approve ${definitions.filter(p=>!drafts[p.id]?.reviewed).map(p=>p.label.toLowerCase()).join(', ')}`} to add this product to your cart.`}</p>
    </section>
    <SpecialtyProductResources product={product} variant={variant} options={options} width={Number(width)} height={Number(height)}/>
  </div>;
}
