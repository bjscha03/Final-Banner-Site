// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {afterEach,it,expect,vi} from 'vitest';
import {useCartStore,type CartItem} from '@/store/cart';
import SpecialtyProductPage from './SpecialtyProductPage';
vi.mock('@/components/Layout',()=>({default:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/components/SEO',()=>({default:()=>null}));
vi.mock('@/components/design/CreateWithAIModal',()=>({default:()=>null}));
vi.mock('@/components/design/AIArtworkFitDialog',()=>({default:()=>null,ArtworkFitButton:()=>null}));
vi.stubGlobal('React',React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
afterEach(()=>{document.body.innerHTML='';});
it('waits for a saved cart item before initializing the real product designer on a direct edit link',async()=>{
  useCartStore.setState({items:[]});const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  await act(async()=>root.render(<MemoryRouter initialEntries={['/products/standard-retractable-banner?editItem=saved-line']}><Routes><Route path="/products/:slug" element={<SpecialtyProductPage/>}/></Routes></MemoryRouter>));
  expect(node.querySelector('#specialty-qty')).toBeNull();expect(node.textContent).toContain('Waiting for your saved cart item');
  // An item becomes available after asynchronous guest/account-cart hydration.
  const item={id:'saved-line',product_type:'specialty',quantity:7,width_in:47,height_in:81,specialty_config:{version:1,productSlug:'standard-retractable-banner',variantId:'standard-retractable-banner-4',panels:[]}} as CartItem;
  await act(async()=>useCartStore.setState({items:[item]}));
  expect((node.querySelector('#specialty-qty') as HTMLInputElement).value).toBe('7');
  expect((node.querySelector('#specialty-variant') as HTMLSelectElement).value).toBe('standard-retractable-banner-4');
  expect(node.textContent).toContain('Save changes to cart');
  await act(async()=>root.unmount());
});
