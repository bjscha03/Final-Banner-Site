// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {SpecialtyProductGallery} from './SpecialtyProductResources';
import {specialtyProducts,specialtyOptions} from '@/lib/specialtyProducts';
vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
it('keeps the main photograph, shows selected sandbags, and lets customers inspect accessories without changing the order',async()=>{
  const product=specialtyProducts.find(p=>p.slug==='custom-event-tents')!,variant=product.variants[0];
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  let options=specialtyOptions(variant);
  const render=()=>root.render(<SpecialtyProductGallery product={product} variant={variant} options={options}/>);
  await act(render);const main=()=>host.querySelector('button[aria-label^="Enlarge"] img')!;
  const initial=main().getAttribute('src');
  options=specialtyOptions(variant,{tent_sandbag:'1'});await act(render);
  expect(main().getAttribute('src')).toBe(initial);expect(host.textContent).toContain('4 Sandbags');
  const bags=host.querySelector<HTMLButtonElement>('button[aria-label="View Four empty sandbags"]')!;
  expect(bags.textContent).toContain('Selected');await act(()=>bags.click());
  expect(main().getAttribute('src')).toContain('event-tent-canopy-graphic-8.webp');
  expect(options.tent_sandbag).toBe('1');
  options=specialtyOptions(variant,{tent_hardware:'0'});await act(render);
  expect(host.textContent).toContain('Tent frame and carry bag are not included');
  expect(host.querySelector('[data-testid="selected-configuration-guide"]')).toBeNull();
  await act(()=>root.unmount());host.remove();
});
