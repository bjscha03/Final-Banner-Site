// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useArtworkFitHelp, type ArtworkFitAssistance } from './ArtworkFitHelp';

let root: Root;
let host: HTMLDivElement;
let help: ReturnType<typeof useArtworkFitHelp>;
let key: string;
let sequence = 0;
let eligible: boolean;
let assistance: ArtworkFitAssistance;
function Harness() { help = useArtworkFitHelp(key, assistance, () => eligible); return null; }
function render() { act(() => root.render(<Harness />)); }
function adjust(needsHelp = true) { act(() => { help.recordAdjustment(needsHelp); vi.advanceTimersByTime(400); }); }
function settle() { act(() => vi.advanceTimersByTime(2000)); }

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  key = `design-${++sequence}`; eligible = true;
  assistance = { enabled: true, fitDialogOpen: false, onFit: vi.fn(), widthIn: 72, heightIn: 36, productLabel: 'banner' };
  render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

it('waits for three completed problematic adjustments and a pause', () => {
  settle(); expect(help.open).toBe(false);
  adjust(); settle(); expect(help.open).toBe(false);
  adjust(); settle(); expect(help.open).toBe(false);
  adjust(); expect(help.open).toBe(false);
  settle(); expect(help.open).toBe(true);
});

it('does not interrupt a new gesture, hidden canvas, or disabled fitter', () => {
  adjust(); adjust(); adjust(); act(() => help.cancelPending()); settle(); expect(help.open).toBe(false);
  eligible = false; adjust(); settle(); expect(help.open).toBe(false);
  eligible = true; assistance = { ...assistance, enabled: false }; render(); adjust(); settle(); expect(help.open).toBe(false);
});

it('clears struggle attempts when the artwork fits', () => {
  adjust(); adjust(); adjust(false); adjust(); settle(); expect(help.open).toBe(false);
});

it('suppresses repeats across dismissal, size changes, and remounts', () => {
  adjust(); adjust(); adjust(); settle(); expect(help.open).toBe(true);
  act(() => help.dismiss());
  assistance = { ...assistance, widthIn: 96 }; render();
  adjust(); adjust(); adjust(); settle(); expect(help.open).toBe(false);
  act(() => root.unmount()); root = createRoot(host); render();
  adjust(); adjust(); adjust(); settle(); expect(help.open).toBe(false);
});

it('cancels stale timers on replacement and offers help for the new design', () => {
  adjust(); adjust(); adjust(); key = `replacement-${sequence}`; render(); settle(); expect(help.open).toBe(false);
  adjust(); adjust(); adjust(); settle(); expect(help.open).toBe(true);
});

it('suppresses the prompt when the customer already opened AI fit themselves', () => {
  assistance = { ...assistance, fitDialogOpen: true }; render();
  assistance = { ...assistance, fitDialogOpen: false }; render();
  adjust(); adjust(); adjust(); settle(); expect(help.open).toBe(false);
});

it('does not count a held key or a burst of pointer frames as three attempts', () => {
  act(() => { for (let i = 0; i < 20; i++) help.recordAdjustment(true); });
  settle(); expect(help.open).toBe(false);
});
