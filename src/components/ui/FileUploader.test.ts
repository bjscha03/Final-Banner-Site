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
});
