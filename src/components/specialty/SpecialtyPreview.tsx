import React, { useId } from 'react';
import { specialtyOptions, type SpecialtyVariant, type SpecialtyProduct, type SpecialtyTemplate } from '@/lib/specialtyProducts';
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
export default function SpecialtyPreview({ product, template, imageUrl, panels = [], variant, options: inputOptions, customHoles = [], showCaption = true, className = '' }: { product: SpecialtyProduct; template: SpecialtyTemplate; imageUrl?: string; panels?: PanelImage[]; variant?:SpecialtyVariant; options?:Record<string,string>; customHoles?:Array<{xIn:number;yIn:number}>; showCaption?: boolean; className?: string }) {
  const options=variant?specialtyOptions(variant,inputOptions):inputOptions||{};
  const hasHardware=options.hardware!=='p'&&options.tent_hardware!=='0'&&options.flag_pole_tab!=='0'&&options.flag_pole!=='fo';
  const visual=template.surface==='wall'||(!hasHardware&&['retractable','xstand','backdrop'].includes(product.visual))?'poster':product.visual;
  const uid = useId().replace(/:/g,'');
  const image = imageUrl || panels[0]?.url || '';
  const tableWidth = /^(8ft|fitted-8)/.test(template.id)?96:/^(6ft|fitted-6)/.test(template.id)?72:48;
  const tableHeight = 300*29/tableWidth;
  const tableDepth=300*30/tableWidth,tableX=(500-300-tableDepth*.76)/2;
  const tableFrontY = 395-tableHeight;
  const stretch = product.slug === 'stretch-table-throws';
  const frontShape = stretch ? `M0 0H300C288 ${tableHeight*.4} 285 ${tableHeight*.8} 300 ${tableHeight}Q150 ${tableHeight*.65} 0 ${tableHeight}C15 ${tableHeight*.8} 12 ${tableHeight*.4} 0 0Z` : `M0 0H300V${tableHeight}H0Z`;
  const ratio = template.widthIn/template.heightIn;
  const roofHeight=Math.min(169,348/ratio*.72),roofY=242-roofHeight;
  const displayRatio=template.doubleFlag?ratio/2:ratio;
  const h = Math.min(340, (template.doubleFlag?170:360)/displayRatio), w = h*displayRatio, x = 250-w/2, y = 370-h;
  const radiusIn=options.cornerstyle==='R'?(product.slug==='aluminum-signs'?.75:.25):({'1_4':.25,'1_2':.5,'3_4':.75,'1':1}[options.cornerstyle]||0);
  const radius=radiusIn*w/template.widthIn;
  const lightCount=hasHardware?Math.min(2,Math.max(0,Number(options.led||options.tradeshow_led)||0)):0;
  const holes=options.holespunch?.startsWith('custom')?customHoles:[];
  const crop = (key: 'front'|'top'|'side', width: number, height: number) => {
    const r=template.faces?.[key] || [0,0,1,1];
    return <svg width={width} height={height} viewBox={`${r[0]*100} ${r[1]*100} ${r[2]*100} ${r[3]*100}`} preserveAspectRatio="none" overflow="hidden"><image href={image} width="100" height="100" preserveAspectRatio="none" /></svg>;
  };
  return <div className={`overflow-hidden rounded-xl border border-slate-200 bg-[#f0f1f2] ${className}`}>
    <svg viewBox="0 0 500 450" className="block h-auto w-full" width="500" height="450" role="img" aria-label={`Your artwork on ${product.name}`}>
      <defs>
        <linearGradient id={`${uid}-wall`} x2="0" y2="1"><stop stopColor="#fbfbfa"/><stop offset="1" stopColor="#e8e7e4"/></linearGradient>
        <linearGradient id={`${uid}-metal`} x2="0" y2="1"><stop stopColor="#fafafa"/><stop offset=".28" stopColor="#9da5ac"/><stop offset=".52" stopColor="#e6e9eb"/><stop offset="1" stopColor="#737d87"/></linearGradient>
        <linearGradient id={`${uid}-cloth`}><stop stopColor="#000" stopOpacity=".13"/><stop offset=".1" stopColor="#000" stopOpacity="0"/><stop offset=".35" stopColor="#000" stopOpacity=".045"/><stop offset=".58" stopColor="#000" stopOpacity="0"/><stop offset=".9" stopColor="#000" stopOpacity=".04"/><stop offset="1" stopColor="#000" stopOpacity=".17"/></linearGradient>
        <filter id={`${uid}-shadow`} x="-50%" width="200%" y="-100%" height="300%"><feGaussianBlur stdDeviation="8"/></filter>
        <clipPath id={`${uid}-trim`} clipPathUnits="objectBoundingBox"><path d={template.outline || 'M0 0H100V100H0Z'} transform="scale(.01)"/></clipPath>
        <clipPath id={`${uid}-sign`}><rect x={x} y={y} width={w} height={h} rx={radius}/></clipPath>
      </defs>
      <rect width="500" height="450" fill={`url(#${uid}-wall)`}/><path d="M0 376H500V450H0Z" fill="#dcdad5"/><path d="M0 377H500" stroke="#ccc9c2"/>
      <ellipse cx="256" cy="394" rx={visual==='tent'||visual==='table'?185:Math.max(w*.62,65)} ry="11" fill="#1f2937" opacity=".18" filter={`url(#${uid}-shadow)`}/>
      {visual==='table' ? <g>
        <g transform={`translate(${tableX} ${tableFrontY-tableDepth*.46})`}><g transform="matrix(1 0 .76 .46 0 0)">{crop('top',300,tableDepth)}<rect width="300" height={tableDepth} fill="#000" opacity=".035"/></g></g>
        <g transform={`translate(${tableX} ${tableFrontY-tableDepth*.46})`}><g transform="matrix(.76 .46 0 1 0 0)">{crop('side',tableDepth,tableHeight)}<rect width={tableDepth} height={tableHeight} fill="#000" opacity=".17"/></g></g>
        <g transform={`translate(${tableX+tableDepth*.76} ${tableFrontY})`}><clipPath id={`${uid}-tablefront`}><path d={frontShape}/></clipPath><g clipPath={`url(#${uid}-tablefront)`}>{crop('front',300,tableHeight)}<rect width="300" height={tableHeight} fill={`url(#${uid}-cloth)`}/></g><path d={frontShape} fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.25"/></g>
      </g> : visual==='tent' ? <g>
        {hasHardware&&<><path d="M78 227V393M422 227V393M157 182V349M342 182V349" stroke={`url(#${uid}-metal)`} strokeWidth="7"/>{variant?.supplierProfile==='10x20-event-tent'&&<path d="M250 227V393M250 182V349" stroke={`url(#${uid}-metal)`} strokeWidth="7"/>}</>}
        {hasHardware&&<path d="M78 234L160 177M422 234L343 177M82 225L248 165L417 225" fill="none" stroke="#777f87" strokeWidth="3"/>}
        <image href={image} x="76" y={roofY} width="348" height={roofHeight} preserveAspectRatio="none" clipPath={`url(#${uid}-trim)`}/>
        <rect x="76" y={roofY} width="348" height={roofHeight} fill={`url(#${uid}-cloth)`} clipPath={`url(#${uid}-trim)`}/>
        <path d={template.outline} transform={`translate(76 ${roofY}) scale(3.48 ${roofHeight/100})`} fill="none" stroke="#000" strokeOpacity=".18" vectorEffect="non-scaling-stroke"/>
        <path d={`M78 ${roofY+roofHeight*.84}H422`} fill="none" stroke="#000" strokeOpacity=".15"/>
        {hasHardware&&<path d="M74 392H85M417 392H428" stroke="#454e55" strokeWidth="3"/>}
      </g> : visual==='flag' ? <g>
        {(template.doubleFlag?[0,1]:[0]).map((face)=>{
          const left=template.doubleFlag?250-w-14+face*(w+28):x;
          const mirrored=template.doubleFlag?face===1:Boolean(template.poleMirrored);
          const poleX=left+w*(mirrored?.96:.04);
          return <g key={face}>
            {hasHardware&&<><path d={`M${poleX} 407V${y-15+h*.995}`} stroke="#343b40" strokeWidth="3"/><path d={template.polePath} transform={`translate(${mirrored?left+w:left} ${y-15}) scale(${(mirrored?-1:1)*w/100} ${h/100})`} fill="none" stroke="#343b40" strokeWidth="4" vectorEffect="non-scaling-stroke"/></>}
            <svg x={left} y={y-15} width={w} height={h} viewBox={template.doubleFlag?`${face*50} 0 50 100`:'0 0 100 100'} preserveAspectRatio="none" overflow="hidden">
              <clipPath id={`${uid}-flag-${face}`}><path d={template.outline||'M0 0H100V100H0Z'}/></clipPath>
              <g clipPath={`url(#${uid}-flag-${face})`}><rect width="100" height="100" fill="white"/>{image&&<image href={image} width="100" height="100" preserveAspectRatio="none"/>}<rect width="100" height="100" fill={`url(#${uid}-cloth)`}/></g>
            </svg>
            {hasHardware&&['PB','PBG','PBW'].includes(options.flaghardware)&&<g transform={`translate(${poleX} 404)`}><path d="M-38 -7L38 7M-38 7L38 -7" stroke="#303840" strokeWidth="6"/>{options.flaghardware==='PBW'&&<ellipse cx="0" cy="-3" rx="29" ry="10" fill="#4b5563" stroke="#252c33" strokeWidth="2"/>}</g>}
            {hasHardware&&options.flaghardware==='PBS'&&<path d={`M${poleX-34} 398h68l10 13h-88Z`} fill="#303840" stroke="#161b20"/>}
            {template.doubleFlag&&<text x={left+w/2} y="435" textAnchor="middle" fill="#475569" fontSize="12">{face===0?'Front view':'Back view'}</text>}
          </g>;
        })}
      </g> : <g>
        {visual==='xstand' && <path d={`M${x+5} ${y+5}L${x+w-5} 385M${x+w-5} ${y+5}L${x+5} 385M250 ${y+h/2}L278 392`} stroke="#252c32" strokeWidth="4"/>}
        {visual==='backdrop' && product.slug !== 'tension-fabric-stand' && <><path d={`M${x-5} 383V${y-4}H${x+w+5}V383`} fill="none" stroke="#414a53" strokeWidth="6"/><path d={`M${x-22} 386H${x+22}M${x+w-22} 386H${x+w+22}`} stroke="#39434b" strokeWidth="5"/></>}
        {hasHardware && product.slug === 'tension-fabric-stand' && <path data-preview-part="stand-base" d={`M${x-12} 369H${x+w+12}L${x+w+21} 385H${x-21}Z`} fill={`url(#${uid}-metal)`}/>}
        {product.slug!=='acrylic-signs' && <rect x={x+3} y={y+3} width={w} height={h} rx={radius} fill="#000" opacity=".08"/>}
        <rect x={x} y={y} width={w} height={h} rx={radius} fill="white" opacity={product.slug==='acrylic-signs'?.12:1}/>
        <image href={image} x={x} y={y} width={w} height={h} preserveAspectRatio="none" clipPath={`url(#${uid}-sign)`}/>
        {['backdrop','xstand'].includes(visual) && <rect x={x} y={y} width={w} height={h} fill={`url(#${uid}-cloth)`}/>}
        {visual==='retractable' && <><rect x={x-2} y={y-3} width={w+4} height="5" rx="1.5" fill={`url(#${uid}-metal)`}/>{product.slug === 'standard-retractable-banner' && <path d={`M${x+8} 388l-14 8M${x+w-8} 388l14 8`} stroke="#838a90" strokeWidth="5"/>}<rect x={x-9} y="370" width={w+18} height="18" rx="6" fill={options.size==='33x81b'?'#20252a':`url(#${uid}-metal)`}/><path d={`M${x-3} 375H${x+w+3}`} stroke="#535c62" strokeWidth="1.3"/></>}
        {visual==='xstand' && [x+4,x+w-4].flatMap(cx=>[y+4,y+h-4].map(cy=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill="#454a4e" stroke="#e1e4e7" strokeWidth="1.5"/>))}
        {product.slug==='acrylic-signs' && options.hardware==='acrylic+standoff' && [[.065,.085],[.935,.085],[.065,.915],[.935,.915]].map(([cx,cy])=><circle data-preview-part="acrylic-standoff" key={`${cx}-${cy}`} cx={x+w*cx} cy={y+h*cy} r={Math.max(3,w*.016)} fill={`url(#${uid}-metal)`} stroke="#7b848c" strokeWidth=".75"/>)}
        {visual==='sign' && <rect data-preview-part="sign-edge" x={x} y={y} width={w} height={h} rx={radius} fill="none" stroke="#9ca3af" strokeWidth="1"/>}
        {holes.filter(hole=>Number.isFinite(hole.xIn)&&Number.isFinite(hole.yIn)&&hole.xIn>=0&&hole.yIn>=0&&hole.xIn<=template.widthIn&&hole.yIn<=template.heightIn).map((hole,i)=><circle key={i} data-preview-part="mounting-hole" cx={x+w*hole.xIn/template.widthIn} cy={y+h*hole.yIn/template.heightIn} r={w*(product.slug==='acrylic-signs'?.1875:.125)/template.widthIn} fill="#e8e7e4" stroke={options.holespunch==='custom2'?'#8e969c':'#64748b'} strokeWidth={options.holespunch==='custom2'?2:.6}/>)}
        {Array.from({length:lightCount},(_,i)=><g key={i} data-preview-part="led-light" transform={`translate(${x+w*(lightCount===1?.5:(i+1)/3)} ${y})`}><path d="M0 0V-16L8 -22" fill="none" stroke="#48515a" strokeWidth="3"/><rect x="-7" y="-27" width="31" height="8" rx="3" fill="#38424c"/><path d="M-4 -20H20" stroke="#f9f0ce" strokeWidth="2"/></g>)}
      </g>}
    </svg>
    {showCaption && <p className="px-4 pb-3 text-center text-xs leading-5 text-slate-500">{template.doubleFlag?'Front and back views of one flag. ':''}Appearance preview. Your saved flat artwork controls print placement. Hardware details and print color can vary.{product.slug==='acrylic-signs'?' Mounting is illustrative; final hole positions are confirmed before production.':''}</p>}
  </div>;
}
