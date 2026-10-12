import {getSpecialtyProduct, specialtyAllPanels, specialtyTemplate} from '@/lib/specialtyProducts';
import type {CreateWithAIProductType} from './types';

export type AIProductSize = {productType:CreateWithAIProductType; widthIn:number|null; heightIn:number|null};

export function sameAIProduct(value: {productType?:string;widthIn?:number;heightIn?:number}|null|undefined, target:AIProductSize) {
  return Boolean(value && value.productType===target.productType
    && Math.abs(Number(value.widthIn)-Number(target.widthIn))<0.001
    && Math.abs(Number(value.heightIn)-Number(target.heightIn))<0.001);
}

export function aiProductContext(target:AIProductSize) {
  const [,slug,variantId,panelId]=target.productType.split(':');
  const product=getSpecialtyProduct(slug);
  const variant=product?.variants.find(v=>v.id===variantId);
  const panel=variant&&specialtyAllPanels(variant).find(p=>p.id===panelId);
  const template=product&&variant&&panel?specialtyTemplate(product,variant,panel,Number(target.widthIn),Number(target.heightIn)):undefined;
  return {product,variant,panel,template,
    label:product?`${product.name} · ${panel?.label||'artwork'}`:target.productType==='yard_sign'?'yard sign':target.productType==='car_magnet'?'car magnet':'banner',
    noun:product?'design':target.productType==='yard_sign'?'yard sign':target.productType==='car_magnet'?'car magnet':'banner'};
}
