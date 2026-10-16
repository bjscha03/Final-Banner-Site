import {describe,it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {specialtyGallery,specialtyPackageNote} from './specialtyGallery';
import {specialtyProducts,specialtyOptions,specialtyProfile,specialtyOptionMatches,specialtyPanels,specialtyTemplates} from './specialtyProducts';

describe('catalog gallery audit',()=>{
  for(const product of specialtyProducts)it(`${product.slug}: every reachable option combination has a real local image and valid panels`,()=>{
    for(const variant of product.variants){
      const queue=[specialtyOptions(variant)],seen=new Set<string>();
      for(let n=0;n<queue.length;n++){
        const options=queue[n],key=JSON.stringify(options);if(seen.has(key))continue;seen.add(key);
        const images=specialtyGallery(product,variant,options);
        expect(images.length).toBeGreaterThan(0);
        expect(images[0].overview).toBe(true);
        for(const img of images){expect(img.url).toMatch(/^\/images\/products\//);expect(existsSync('public'+img.url),img.url).toBe(true);}
        for(const panel of specialtyPanels(variant,options))expect(specialtyTemplates[panel.templateId],panel.templateId).toBeDefined();
        const profile=specialtyProfile(variant);
        for(const group of profile?.groups||[]){
          if(variant.supplierFixed?.[group.key]!==undefined||!specialtyOptionMatches(group.visible,options))continue;
          for(const option of group.options){if(!specialtyOptionMatches(option.visible,options))continue;
            const next=specialtyOptions(variant,{...options,[group.key]:option.key});if(!seen.has(JSON.stringify(next)))queue.push(next);
          }
        }
      }
      console.log(`${variant.id}: ${seen.size} configurations audited`);
    }
  },60000);
  it('shows the selected light without losing the deluxe product photo',()=>{
    const p=specialtyProducts.find(p=>p.slug==='deluxe-retractable-banner')!,v=p.variants[0];
    const options=specialtyOptions(v,{led:'1'}),gallery=specialtyGallery(p,v,options);
    expect(gallery[0].url).toBe('/images/products/deluxe-retractable-banner.webp');
    expect(gallery.find(i=>i.optionKey==='led')?.selected).toBe(true);
  });
  it('labels graphic-only and canopy-only packages explicitly',()=>{
    const p=specialtyProducts.find(p=>p.slug==='x-banner-stand')!;
    expect(specialtyPackageNote(p,{hardware:'p'})).toContain('not included');
    expect(specialtyGallery(p,p.variants[0],specialtyOptions(p.variants[0],{hardware:'p'}))[0].url).toContain('x-banner-stand');
    expect(specialtyPackageNote(p,{tent_hardware:'0'})).toContain('Tent frame and carry bag are not included');
  });
  it('keeps sandbag counts accurate for all three tent sizes',()=>{
    const p=specialtyProducts.find(p=>p.slug==='custom-event-tents')!;
    p.variants.forEach((v,index)=>{
      const g=specialtyGallery(p,v,specialtyOptions(v,{tent_sandbag:'1'}));
      const bags=g.find(i=>i.optionKey==='tent_sandbag')!;
      expect(bags.selected).toBe(true);expect(bags.selectionLabel).toBe(index===2?'6 Sandbags':'4 Sandbags');
      const without=specialtyGallery(p,v,specialtyOptions(v));expect(without.find(i=>i.optionKey==='tent_sandbag')?.selected).toBe(false);
    });
  });
});
