// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import FileUploader from './FileUploader';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

it('opens once per tap and accepts another selection after an upload finishes', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onUpload = vi.fn();
  const render = (isUploading: boolean) => act(() => root.render(
    <FileUploader onUpload={onUpload} isUploading={isUploading} />,
  ));
  try {
    render(false);
    const input = container.querySelector('input')!;
    const button = container.querySelector('[role="button"]') as HTMLElement;
    const click = vi.spyOn(input, 'click');
    act(() => button.click());
    expect(click).toHaveBeenCalledTimes(1);
    const artwork = new File(['artwork'], 'banner.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [artwork] });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    render(true);
    act(() => button.click());
    expect(click).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    render(false);
    act(() => button.click());
    expect(click).toHaveBeenCalledTimes(2);
    expect(input.disabled).toBe(false);
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onUpload).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
