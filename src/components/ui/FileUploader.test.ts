import { describe, expect, it, vi } from 'vitest';
import { activateFilePicker } from './filePicker';

describe('activateFilePicker', () => {
  it('invokes the native input synchronously when available', () => {
    const click = vi.fn();

    expect(activateFilePicker({ click })).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the input while upload is blocked', () => {
    const click = vi.fn();

    expect(activateFilePicker({ click }, true)).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it('returns a safe fallback signal when the input is not mounted', () => {
    expect(activateFilePicker(null)).toBe(false);
  });

  it('uses showPicker synchronously without opening the picker twice', () => {
    const input = { click: vi.fn(), showPicker: vi.fn() };
    expect(activateFilePicker(input)).toBe(true);
    expect(input.showPicker).toHaveBeenCalledTimes(1);
    expect(input.click).not.toHaveBeenCalled();
  });

  it('falls back synchronously when showPicker is unsupported or blocked', () => {
    const input = { click: vi.fn(), showPicker: vi.fn(() => { throw new Error('NotAllowedError'); }) };
    expect(activateFilePicker(input)).toBe(true);
    expect(input.click).toHaveBeenCalledTimes(1);
  });

  it('returns false instead of crashing when both native methods throw', () => {
    const fail = () => { throw new Error('Blocked'); };
    expect(activateFilePicker({ click: fail, showPicker: fail })).toBe(false);
  });
});
