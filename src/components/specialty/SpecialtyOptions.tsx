import media from '../../../shared/specialty-media.json';
import {specialtyProfile,specialtyOptionMatches,specialtyOptions,specialtyOptionPriceCents,specialtyConfigurationPrice,formatSpecialtyPrice,type SpecialtyProduct,type SpecialtyVariant,type SpecialtyOptions as Options} from '@/lib/specialtyProducts';

export default function SpecialtyOptions({product,variant,value,onChange,disabled,width,height,basePriced}:{product:SpecialtyProduct;variant:SpecialtyVariant;value:Options;onChange:(options:Options)=>void;disabled:boolean;width:number;height:number;basePriced:boolean}) {
  const profile=specialtyProfile(variant);
  return <div className="mt-5 space-y-5">
    {profile?.groups.filter(g=>!Object.prototype.hasOwnProperty.call(variant.supplierFixed||{},g.key)&&specialtyOptionMatches(g.visible,value)).map(group=>{
      const choices=group.options.filter(o=>specialtyOptionMatches(o.visible,value));
      const image=(media.options as Record<string,string>)[`${variant.supplierProfile}:${group.key}`];
      if(choices.length===1)return <p key={group.key} className="text-sm text-slate-600"><strong>{group.label}:</strong> {choices[0].label}</p>;
      return <div key={group.key}>
        <label htmlFor={`option-${group.key}`} className="block text-sm font-bold whitespace-pre-line">{group.label}</label>
        <div className="mt-2 flex items-start gap-3">
          <select id={`option-${group.key}`} value={value[group.key]} disabled={disabled} onChange={e=>onChange(specialtyOptions(variant,{...value,[group.key]:e.target.value}))} className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base">
            {choices.map(option=>{
              const cents=specialtyOptionPriceCents(variant,width,height,{...value,[group.key]:String(option.key)},group.key);
              let priceLabel=basePriced?(cents===undefined?'Price coming soon':cents===0?'Included':`${cents>0?'+':'−'}${formatSpecialtyPrice(Math.abs(cents))}`):'';
              if(basePriced&&variant.priceProposal?.revision==='margin-30-after-20-v1') {
                const next=specialtyOptions(variant,{...value,[group.key]:String(option.key)});
                const size=group.key==='size'&&String(option.key).match(/^(\d+)x(\d+)$/);
                try {const quote=specialtyConfigurationPrice(product,variant,size?Number(size[1]):width,size?Number(size[2]):height,next);priceLabel=quote.verified?`${formatSpecialtyPrice(quote.unitCents)} total`:'Price coming soon';}
                catch {priceLabel='Choose a valid size';}
              }
              return <option key={option.key} value={option.key}>{option.label}{priceLabel?` · ${priceLabel}`:''}</option>;
            })}
          </select>
          {image&&<a href={image} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-slate-200 bg-white p-1" aria-label={`View ${group.label.toLowerCase()} options`}><img src={image} alt={group.label} loading="lazy" className="h-14 w-14 object-contain"/></a>}
        </div>
      </div>;
    })}
    {product.visual==='tent'&&<p className="text-xs leading-5 text-slate-500">Printed walls require separate artwork. Sandbags are supplied empty. On 15 ft and 20 ft tents, half walls fit the short sides only.</p>}
    {product.visual==='flag'&&value.sides==='2'&&<p className="text-xs leading-5 text-slate-500">The double-sided template contains both print faces. Check both faces before approving the print file.</p>}
  </div>;
}
