import mediaData from '../../shared/specialty-media.json';
import detailData from '../../shared/specialty-gallery-details.json';
import {specialtyOptionMatches,specialtyOptionSummary,specialtyProfile,type SpecialtyProduct,type SpecialtyVariant,type SpecialtyOptions} from './specialtyProducts';

export interface ProductGalleryImage {
  url:string; label:string; when?:Record<string,string>;
  optionKey?:string; values?:string[]; visible?:Record<string,string[]>;
  selected?:boolean; selectionLabel?:string; overview?:boolean;
}
const media=mediaData as {variants:Record<string,ProductGalleryImage[]>};
const details=detailData as Record<string,ProductGalleryImage[]>;

/** A setup photograph is an example, never an exact rendering of the cart configuration. */
export function specialtyGallery(product:SpecialtyProduct,variant:SpecialtyVariant,options:SpecialtyOptions):ProductGalleryImage[] {
  const candidates=media.variants[variant.id]||[];
  const exact=candidates.filter(image=>Object.entries(image.when||{}).every(([key,value])=>options[key]===value));
  const overview=exact[0]||candidates[0]||{url:product.image,label:product.imageAlt};
  const profile=specialtyProfile(variant);
  const summary=specialtyOptionSummary(variant,options);
  const images=(details[variant.supplierProfile||'']||[]).filter(image=>
    Object.entries(image.visible||{}).every(([key,values])=>values.includes(options[key]))
  ).map(image=>{
    const group=profile?.groups.find(g=>g.key===image.optionKey);
    const active=!!group&&specialtyOptionMatches(group.visible,options);
    const selected=active&&!!image.values?.includes(options[image.optionKey!]);
    const selectionLabel=selected?summary.find(row=>row.key===image.optionKey)?.value:undefined;
    return {...image,selected,selectionLabel};
  });
  return [{...overview,label:'Product overview',overview:true},...images];
}

export function specialtyPackageNote(product:SpecialtyProduct,options:SpecialtyOptions):string|undefined {
  if(options.hardware==='p')return 'Printed graphic only. Stand, frame, carry bag and lights are not included.';
  if(options.flag_pole_tab==='0'||options.flag_pole==='fo')return 'Printed flag only. Pole and base are not included.';
  if(options.tent_hardware==='0')return 'Printed canopy only. Tent frame and carry bag are not included. Any walls or sandbags selected are listed below.';
  if(product.visual==='sign'&&options.hardware==='acrylic')return 'Printed panel only. Wall standoffs are not included.';
  return undefined;
}
