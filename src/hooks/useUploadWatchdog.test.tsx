// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadWatchdog, UPLOAD_IDLE_LIMIT_MS, UPLOAD_TOTAL_LIMIT_MS, LARGE_UPLOAD_TOTAL_LIMIT_MS, LARGE_UPLOAD_IDLE_LIMIT_MS } from './useUploadWatchdog';

let root: Root;
let timeout: ReturnType<typeof vi.fn>;
function Harness({ active, progress, fileBytes }: { active: boolean; progress: number; fileBytes: number }) {
  useUploadWatchdog(active, progress, timeout, fileBytes);
  return null;
}
function render(active: boolean, progress = 0, fileBytes = 0) {
  act(() => root.render(<Harness active={active} progress={progress} fileBytes={fileBytes} />));
}
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  timeout = vi.fn();
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

describe('upload lifecycle watchdog', () => {
  it('keeps a large upload alive beyond three minutes while bytes are moving', () => {
    const size = 300 * 1024 * 1024;
    render(true, 0, size);
    for (let i = 1; i <= 5; i++) {
      act(() => vi.advanceTimersByTime(60_000));
      render(true, i / 10, size);
    }
    expect(timeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(LARGE_UPLOAD_IDLE_LIMIT_MS));
    expect(timeout).toHaveBeenCalledOnce();
  });
  it('still bounds a large upload that retries forever', () => {
    const size = 300 * 1024 * 1024;
    render(true, 0, size);
    for (let elapsed = 60_000; elapsed <= LARGE_UPLOAD_TOTAL_LIMIT_MS; elapsed += 60_000) {
      act(() => vi.advanceTimersByTime(60_000));
      render(true, elapsed / LARGE_UPLOAD_TOTAL_LIMIT_MS, size);
    }
    expect(timeout).toHaveBeenCalledOnce();
  });
  it('releases a stalled preview or transport even when no promise settles', () => {
    render(true);
    act(() => vi.advanceTimersByTime(UPLOAD_IDLE_LIMIT_MS));
    expect(timeout).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(UPLOAD_TOTAL_LIMIT_MS));
    expect(timeout).toHaveBeenCalledOnce();
  });
  it('allows an upload that is still making progress', () => {
    render(true);
    act(() => vi.advanceTimersByTime(30_000));
    render(true, 20);
    act(() => vi.advanceTimersByTime(30_000));
    render(true, 40);
    expect(timeout).not.toHaveBeenCalled();
    render(false, 100);
    act(() => vi.advanceTimersByTime(UPLOAD_TOTAL_LIMIT_MS));
    expect(timeout).not.toHaveBeenCalled();
  });
  it('bounds the entire lifecycle even if retries report progress indefinitely', () => {
    render(true);
    for (let i = 1; i <= 6; i++) {
      act(() => vi.advanceTimersByTime(30_000));
      render(true, i);
    }
    expect(timeout).toHaveBeenCalledOnce();
  });
  it('starts a fresh deadline for a retry and removes old timers', () => {
    render(true);
    act(() => vi.advanceTimersByTime(40_000));
    render(false);
    render(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(timeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(35_000));
    expect(timeout).toHaveBeenCalledOnce();
  });
});
