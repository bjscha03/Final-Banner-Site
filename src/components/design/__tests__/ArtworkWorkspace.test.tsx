// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import ArtworkWorkspace from '../ArtworkWorkspace';
import ArtworkPreviewEditor from '../ArtworkPreviewEditor';

it('pinches the camera without resizing artwork or dragging it when one finger lifts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600, height: 300, left: 0, top: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON() {},
  });
  const metrics = ['clientWidth','offsetWidth','clientHeight','offsetHeight'].map(key =>
    vi.spyOn(HTMLElement.prototype, key as 'clientWidth', 'get').mockReturnValue(key.includes('Width') ? 600 : 300));
  const host = document.createElement('div'), slot = document.createElement('div');
  document.body.append(host, slot);
  const root = createRoot(host), change = vi.fn();
  const previousHitTest = document.elementFromPoint;
  document.elementFromPoint = () => host.querySelector('img');
  function Harness() {
    const [value, setValue] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    return <ArtworkWorkspace aspect={0.5}><ArtworkPreviewEditor src="camera-gesture.png" paddingPct="50%"
      value={value} constrain onConstrainChange={() => {}} mobileToolbarContainer={slot}
      onChange={next => { change(next); setValue(next); }} /></ArtworkWorkspace>;
  }
  const pointer = (type: string, id: number, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' } });
    return event;
  };
  try {
    await act(async () => root.render(<Harness />));
    const img = host.querySelector('img')!;
    Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } });
    await act(async () => img.dispatchEvent(new Event('load')));
    const canvas = host.querySelector('[data-artwork-canvas]')!;
    const before = change.mock.calls.length;
    await act(async () => canvas.dispatchEvent(pointer('pointerdown', 1, 100)));
    await act(async () => canvas.dispatchEvent(pointer('pointerdown', 2, 200)));
    await act(async () => canvas.dispatchEvent(pointer('pointermove', 2, 250)));
    expect(host.querySelector('[aria-label="Fit banner in workspace"]')!.textContent).toBe('150%');
    expect(change.mock.calls).toHaveLength(before);
    await act(async () => canvas.dispatchEvent(pointer('pointerup', 2, 250)));
    await act(async () => canvas.dispatchEvent(pointer('pointermove', 1, 140)));
    expect(change.mock.calls).toHaveLength(before);
    await act(async () => canvas.dispatchEvent(pointer('pointerup', 1, 140)));
    await act(async () => canvas.dispatchEvent(pointer('pointerdown', 3, 100)));
    await act(async () => canvas.dispatchEvent(pointer('pointermove', 3, 130)));
    expect(change.mock.lastCall?.[0].x).toBeCloseTo(20);
    expect(change.mock.lastCall?.[0].scaleX).toBe(1);
    await act(async () => canvas.dispatchEvent(pointer('pointerup', 3, 130)));
  } finally {
    await act(async () => root.unmount()); host.remove(); slot.remove(); rect.mockRestore(); metrics.forEach(m => m.mockRestore());
    document.elementFromPoint = previousHitTest; vi.unstubAllGlobals();
  }
});
