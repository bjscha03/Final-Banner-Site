// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import FileUploader, { type FileUploaderHandle } from './FileUploader';

const logUx = vi.hoisted(() => vi.fn());
vi.mock('@/lib/uxAnalytics', () => ({ logUx }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

it('uses a native input for taps and accepts the same file again after an upload finishes', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onUpload = vi.fn();
  const ref = React.createRef<FileUploaderHandle>();
  const render = (isUploading: boolean) => act(() => root.render(
    <FileUploader ref={ref} onUpload={onUpload} isUploading={isUploading} />,
  ));
  try {
    render(false);
    const input = container.querySelector('input')!;
    expect(input.closest('label')).not.toBeNull();
    expect(input.classList.contains('hidden')).toBe(false);
    expect(input.classList.contains('opacity-0')).toBe(true);
    expect(input.getAttribute('aria-label')).toBe('Upload your artwork');
    const click = vi.spyOn(input, 'click');
    act(() => input.click());
    expect(click).toHaveBeenCalledTimes(1);
    expect(logUx).toHaveBeenCalledWith('upload_picker_requested', { source: 'native_input', requested: true });
    const artwork = new File(['artwork'], 'banner.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [artwork] });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    render(true);
    act(() => { expect(ref.current!.openFilePicker()).toBe(false); });
    expect(click).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    render(false);
    act(() => { expect(ref.current!.openFilePicker()).toBe(true); });
    expect(click).toHaveBeenCalledTimes(2);
    expect(input.disabled).toBe(false);
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onUpload).toHaveBeenCalledTimes(2);
    act(() => input.dispatchEvent(new Event('cancel', { bubbles: true })));
    expect(logUx).toHaveBeenCalledWith('upload_picker_cancelled');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
