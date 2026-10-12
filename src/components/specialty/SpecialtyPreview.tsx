import React, { useId } from 'react';
import type { SpecialtyProduct, SpecialtyTemplate } from '@/lib/specialtyProducts';
import type { SpecialtySavedPanel } from '@/lib/specialtyArtwork';

export function SpecialtyTemplateGuide({ template }: { template: SpecialtyTemplate }) {
  const insets = template.safeInsetsIn;
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
    {template.guides?.map((line, i) => <path key={i} d={line.d} fill="none" stroke={line.color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeDasharray={line.dashed ? '5 4' : undefined} />)}
    {insets && <rect x={insets[3] / template.widthIn * 100} y={insets[0] / template.heightIn * 100} width={100 - (insets[1] + insets[3]) / template.widthIn * 100} height={100 - (insets[0] + insets[2]) / template.heightIn * 100} fill="none" stroke="#0284c7" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}
    {template.faces && Object.entries(template.faces).map(([label, [x,y,w,h]]) => <g key={label}><rect x={x*100} y={y*100} width={w*100} height={h*100} fill="none" stroke="#0284c7" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="5 4" /><text x={(x+w/2)*100} y={(y+h/2)*100} textAnchor="middle" fill="#0284c7" fontSize="3" stroke="white" strokeWidth=".3" paintOrder="stroke">{label.toUpperCase()}</text></g>)}
  </svg>;
}

type PanelImage = Pick<SpecialtySavedPanel, 'id' | 'templateId'> & { url: string };
/** The approved flat artwork is mapped onto physical surfaces; it is never regenerated. */
export default function SpecialtyPreview({ product, template, imageUrl, panels = [], className = '' }: { product: SpecialtyProduct; template: SpecialtyTemplate; imageUrl?: string; panels?: PanelImage[]; className?: string }) {
  const uid = useId().replace(/:/g,'');
  const image = imageUrl || panels[0]?.url || '';
  const tableWidth = template.id.startsWith('8ft')?96:template.id.startsWith('6ft')?72:48;
  const tableHeight = 300*29/tableWidth;
  const tableDepth=300*30/tableWidth,tableX=(500-300-tableDepth*.76)/2;
  const tableFrontY = 395-tableHeight;
  const stretch = product.slug === 'stretch-table-throws';
  const frontShape = stretch ? `M0 0H300C288 ${tableHeight*.4} 285 ${tableHeight*.8} 300 ${tableHeight}Q150 ${tableHeight*.65} 0 ${tableHeight}C15 ${tableHeight*.8} 12 ${tableHeight*.4} 0 0Z` : `M0 0H300V${tableHeight}H0Z`;
  const ratio = template.widthIn/template.heightIn;
  const roofHeight=Math.min(169,348/ratio*.72),roofY=242-roofHeight;
  const h = Math.min(340, 360/ratio), w = h*ratio, x = 250-w/2, y = 370-h;
  const crop = (key: 'front'|'top'|'side', width: number, height: number) => {
    const r=template.faces?.[key] || [0,0,1,1];
    return <svg width={width} height={height} viewBox={`${r[0]*100} ${r[1]*100} ${r[2]*100} ${r[3]*100}`} preserveAspectRatio="none" overflow="hidden"><image href={image} width="100" height="100" preserveAspectRatio="none" /></svg>;
  };
  return <div className={`overflow-hidden rounded-xl border border-slate-200 bg-[#f0f1f2] ${className}`}>
    <svg viewBox="0 0 500 450" className="h-full w-full" role="img" aria-label={`Your artwork on ${product.name}`}>
      <defs>
        <linearGradient id={`${uid}-wall`} x2="0" y2="1"><stop stopColor="#fbfbfa"/><stop offset="1" stopColor="#e8e7e4"/></linearGradient>
        <linearGradient id={`${uid}-metal`} x2="0" y2="1"><stop stopColor="#fafafa"/><stop offset=".28" stopColor="#9da5ac"/><stop offset=".52" stopColor="#e6e9eb"/><stop offset="1" stopColor="#737d87"/></linearGradient>
        <linearGradient id={`${uid}-cloth`}><stop stopColor="#000" stopOpacity=".13"/><stop offset=".1" stopColor="#000" stopOpacity="0"/><stop offset=".35" stopColor="#000" stopOpacity=".045"/><stop offset=".58" stopColor="#000" stopOpacity="0"/><stop offset=".9" stopColor="#000" stopOpacity=".04"/><stop offset="1" stopColor="#000" stopOpacity=".17"/></linearGradient>
        <filter id={`${uid}-shadow`} x="-50%" width="200%" y="-100%" height="300%"><feGaussianBlur stdDeviation="8"/></filter>
        <clipPath id={`${uid}-trim`} clipPathUnits="objectBoundingBox"><path d={template.outline || 'M0 0H100V100H0Z'} transform="scale(.01)"/></clipPath>
      </defs>
      <rect width="500" height="450" fill={`url(#${uid}-wall)`}/><path d="M0 376H500V450H0Z" fill="#dcdad5"/><path d="M0 377H500" stroke="#ccc9c2"/>
      <ellipse cx="256" cy="394" rx={product.visual==='tent'||product.visual==='table'?185:Math.max(w*.62,65)} ry="11" fill="#1f2937" opacity=".18" filter={`url(#${uid}-shadow)`}/>
      {product.visual==='table' ? <g>
        <g transform={`translate(${tableX} ${tableFrontY-tableDepth*.46})`}><g transform="matrix(1 0 .76 .46 0 0)">{crop('top',300,tableDepth)}<rect width="300" height={tableDepth} fill="#000" opacity=".035"/></g></g>
        <g transform={`translate(${tableX} ${tableFrontY-tableDepth*.46})`}><g transform="matrix(.76 .46 0 1 0 0)">{crop('side',tableDepth,tableHeight)}<rect width={tableDepth} height={tableHeight} fill="#000" opacity=".17"/></g></g>
        <g transform={`translate(${tableX+tableDepth*.76} ${tableFrontY})`}><clipPath id={`${uid}-tablefront`}><path d={frontShape}/></clipPath><g clipPath={`url(#${uid}-tablefront)`}>{crop('front',300,tableHeight)}<rect width="300" height={tableHeight} fill={`url(#${uid}-cloth)`}/></g><path d={frontShape} fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.25"/></g>
      </g> : product.visual==='tent' ? <g>
        <path d="M78 227V393M422 227V393M157 182V349M342 182V349" stroke={`url(#${uid}-metal)`} strokeWidth="7"/>
        <path d="M78 234L160 177M422 234L343 177M82 225L248 165L417 225" fill="none" stroke="#777f87" strokeWidth="3"/>
        <image href={image} x="76" y={roofY} width="348" height={roofHeight} preserveAspectRatio="none" clipPath={`url(#${uid}-trim)`}/>
        <rect x="76" y={roofY} width="348" height={roofHeight} fill={`url(#${uid}-cloth)`} clipPath={`url(#${uid}-trim)`}/>
        <path d={template.outline} transform={`translate(76 ${roofY}) scale(3.48 ${roofHeight/100})`} fill="none" stroke="#000" strokeOpacity=".18" vectorEffect="non-scaling-stroke"/>
        <path d={`M78 ${roofY+roofHeight*.84}H422`} fill="none" stroke="#000" strokeOpacity=".15"/>
        <path d="M74 392H85M417 392H428" stroke="#454e55" strokeWidth="3"/>
      </g> : product.visual==='flag' ? <g>
        <path d={`M${x+w*.04} 407V${y-15+h*.995}`} stroke="#343b40" strokeWidth="3"/><path d={template.polePath} transform={`translate(${x} ${y-15}) scale(${w/100} ${h/100})`} fill="none" stroke="#343b40" strokeWidth="4" vectorEffect="non-scaling-stroke"/>
        <image href={image} x={x} y={y-15} width={w} height={h} preserveAspectRatio="none" clipPath={`url(#${uid}-trim)`}/>
        <rect x={x} y={y-15} width={w} height={h} fill={`url(#${uid}-cloth)`} clipPath={`url(#${uid}-trim)`}/>
        
      </g> : <g>
        {product.visual==='xstand' && <path d={`M${x+5} ${y+5}L${x+w-5} 385M${x+w-5} ${y+5}L${x+5} 385M250 ${y+h/2}L278 392`} stroke="#252c32" strokeWidth="4"/>}
        {product.visual==='backdrop' && product.slug !== 'tension-fabric-stand' && <><path d={`M${x-5} 383V${y-4}H${x+w+5}V383`} fill="none" stroke="#414a53" strokeWidth="6"/><path d={`M${x-22} 386H${x+22}M${x+w-22} 386H${x+w+22}`} stroke="#39434b" strokeWidth="5"/></>}
        {product.slug === 'tension-fabric-stand' && <path d={`M${x-12} 369H${x+w+12}L${x+w+21} 385H${x-21}Z`} fill={`url(#${uid}-metal)`}/>}
        {product.slug!=='acrylic-signs' && <rect x={x+3} y={y+3} width={w} height={h} fill="#000" opacity=".08"/>}
        <rect x={x} y={y} width={w} height={h} fill="white" opacity={product.slug==='acrylic-signs'?.12:1}/>
        <image href={image} x={x} y={y} width={w} height={h} preserveAspectRatio="none" style={product.slug==='acrylic-signs'?{mixBlendMode:'multiply'}:undefined}/>
        {['backdrop','xstand'].includes(product.visual) && <rect x={x} y={y} width={w} height={h} fill={`url(#${uid}-cloth)`}/>}
        {product.visual==='retractable' && <><rect x={x-2} y={y-3} width={w+4} height="5" rx="1.5" fill={`url(#${uid}-metal)`}/>{product.slug === 'standard-retractable-banner' && <path d={`M${x+8} 388l-14 8M${x+w-8} 388l14 8`} stroke="#838a90" strokeWidth="5"/>}<rect x={x-9} y="370" width={w+18} height="18" rx="6" fill={`url(#${uid}-metal)`}/><path d={`M${x-3} 375H${x+w+3}`} stroke="#535c62" strokeWidth="1.3"/></>}
        {product.visual==='xstand' && [x+4,x+w-4].flatMap(cx=>[y+4,y+h-4].map(cy=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill="#454a4e" stroke="#e1e4e7" strokeWidth="1.5"/>))}
        {product.slug==='acrylic-signs' && [x+w*1.5/template.widthIn,x+w-w*1.5/template.widthIn].flatMap(cx=>[y+h*1.5/template.heightIn,y+h-h*1.5/template.heightIn].map(cy=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={w*.5/template.widthIn} fill={`url(#${uid}-metal)`} stroke="#7b848c" strokeWidth=".75"/>))}
        {product.visual==='sign' && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#9ca3af" strokeWidth="1"/>}
      </g>}
    </svg>
    <p className="px-4 pb-3 text-center text-xs leading-5 text-slate-500">Appearance preview. Your saved flat artwork controls print placement. Color and fabric drape can vary.</p>
  </div>;
}
