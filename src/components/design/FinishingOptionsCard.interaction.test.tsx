// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FinishingOptionsCard, { type FinishingType } from './FinishingOptionsCard';
import type { RopePlacement } from '@/lib/bannerPricingEngine';

it('requires an explicit choice and clears paid options when choosing hem only', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [type, setType] = useState<FinishingType>('none');
    const [confirmed, setConfirmed] = useState(false);
    const [grommets, setGrommets] = useState('none');
    const [polePockets, setPolePockets] = useState('none');
    const [rope, setRope] = useState(false);
    const [placement, setPlacement] = useState<RopePlacement>('top');
    return <><FinishingOptionsCard compact explicitChoice choiceConfirmed={confirmed}
      finishingType={type} setFinishingType={(value) => { setType(value); setConfirmed(true); }}
      grommets={grommets} setGrommets={setGrommets} polePockets={polePockets} setPolePockets={setPolePockets}
      addRope={rope} setAddRope={setRope} ropePlacement={placement} setRopePlacement={setPlacement} />
      <output>{JSON.stringify({ confirmed, type, grommets, polePockets, rope })}</output></>;
  }
  const click = (text: string) => act(() => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes(text))!.click());
  const state = () => JSON.parse(host.querySelector('output')!.textContent!);
  try {
    act(() => root.render(<Harness />));
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(state().confirmed).toBe(false);
    click('Pole Pockets');
    expect(state()).toMatchObject({ confirmed: true, type: 'pole_pockets', polePockets: 'top', rope: false });
    click('Pole Pockets');
    expect(state().type).toBe('pole_pockets');
    click('Rope in Welded Hem');
    expect(state()).toMatchObject({ type: 'rope', polePockets: 'none', rope: true });
    click('No hanging hardware');
    expect(state()).toEqual({ confirmed: true, type: 'none', grommets: 'none', polePockets: 'none', rope: false });
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toContain('No hanging hardware');
    click('Grommets');
    expect(state()).toMatchObject({ type: 'grommets', grommets: 'every-2-3ft', rope: false });
  } finally {
    act(() => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
