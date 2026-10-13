import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {getSpecialtyProduct,specialtyTemplate} from '@/lib/specialtyProducts';
import SpecialtyPreview from './SpecialtyPreview';

function preview(slug:string,options:Record<string,string>,customHoles?:Array<{xIn:number;yIn:number}>){
 const product=getSpecialtyProduct(slug)!,variant=product.variants[0],template=specialtyTemplate(product,variant,variant.panels[0],24,18);
 return renderToStaticMarkup(<SpecialtyPreview product={product} variant={variant} template={template} options={options} customHoles={customHoles} imageUrl="https://example.test/design.png"/>);
}
describe('selected physical product options',()=>{
 it('removes the tension stand base and lights for a graphic-only order',()=>{
  expect(preview('tension-fabric-stand',{hardware:'ph',tradeshow_led:'2'}).match(/data-preview-part="led-light"/g)).toHaveLength(2);
  const graphic=preview('tension-fabric-stand',{hardware:'p'});
  expect(graphic).not.toContain('data-preview-part="stand-base"');expect(graphic).not.toContain('data-preview-part="led-light"');
 });
 it('shows standoffs only when selected for the Signs365 acrylic panel',()=>{
  expect(preview('acrylic-signs',{hardware:'acrylic+standoff'}).match(/data-preview-part="acrylic-standoff"/g)).toHaveLength(4);
  const panel=preview('acrylic-signs',{hardware:'acrylic'});
  expect(panel).not.toContain('data-preview-part="acrylic-standoff"');
  expect(panel).not.toContain('mix-blend-mode:multiply');
 });
 it('maps saved custom hole positions in physical inches and clips the selected corner radius',()=>{
  const html=preview('aluminum-signs',{holespunch:'custom',cornerstyle:'1_2'},[{xIn:2,yIn:3},{xIn:22,yIn:15}]);
  expect(html.match(/data-preview-part="mounting-hole"/g)).toHaveLength(2);
  expect(html).toMatch(/data-preview-part="mounting-hole" cx="100" cy="145"/);
  expect(html).toMatch(/data-preview-part="sign-edge"[^>]+rx="7.5"/);
 });
});
