import { describe, expect, it } from 'vitest';
import {
  buildCreateArtworkPrompt,
  buildFixArtworkPrompt,
  getUncoveredCanvasFraction,
  shouldWarnAboutArtworkWhitespace,
} from './aiArtworkHelp';

describe('AI artwork help', () => {
  it('builds a new-artwork prompt with live dimensions and JPEG-only instructions', () => {
    const prompt = buildCreateArtworkPrompt(72, 36, 'A grand opening banner');
    expect(prompt).toContain('72 × 36 inch vinyl banner');
    expect(prompt).toContain('72:36 shape');
    expect(prompt).toContain('A grand opening banner');
    expect(prompt).toContain('high-quality JPEG/JPG');
    expect(prompt).toContain('Do not give me a PNG');
  });

  it('builds a fix prompt that protects important content and requires JPEG output', () => {
    const prompt = buildFixArtworkPrompt(96, 36);
    expect(prompt).toContain('96 × 36 inch vinyl banner');
    expect(prompt).toContain('96:36 shape');
    expect(prompt).toContain('Do not noticeably stretch or distort');
    expect(prompt).toContain('high-quality JPEG/JPG');
    expect(prompt).toContain('Do not give me a PNG');
  });

  it('warns only for clearly noticeable ratio mismatches', () => {
    expect(getUncoveredCanvasFraction(72, 36, 1200, 600)).toBe(0);
    expect(shouldWarnAboutArtworkWhitespace(72, 36, 1900, 1000)).toBe(false);
    expect(shouldWarnAboutArtworkWhitespace(72, 36, 1000, 1000)).toBe(true);
    expect(shouldWarnAboutArtworkWhitespace(72, 36, null, null)).toBe(false);
  });
});
