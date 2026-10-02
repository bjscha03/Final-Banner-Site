import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { resolveEditBrief } from './editBrief';
import type { CreativeBrief } from './types';

const require = createRequire(import.meta.url);
const { normalizeBrief } = require('../../../../netlify/functions/_shared/ai-designer/schema.cjs');
const saved: CreativeBrief = normalizeBrief({
  description: 'A fall festival banner', widthIn: 72, heightIn: 36, structured: true,
  copy: { headline: 'FALL FESTIVAL', supportingText: 'EVERYONE WELCOME' },
});

describe('edit brief recovery contract', () => {
  it('does not mutate the selected version or the pending form', () => {
    const original = Object.freeze({ ...saved, copy: Object.freeze({ ...saved.copy }) });
    const pending = Object.freeze({ ...saved, description: '', copy: Object.freeze({ ...saved.copy, headline: '' }), copyOverrides: Object.freeze({ headline: '' }), layers: Object.freeze({ headline: Object.freeze({ scale: 1.5 }) }) });
    const recovered = resolveEditBrief(pending, original)!;
    expect(recovered).not.toBe(pending);
    expect(normalizeBrief(recovered)).toMatchObject({ description: saved.description, copy: { headline: '', supportingText: 'EVERYONE WELCOME' }, layers: { headline: { scale: 1.5 } } });
    expect(original).toEqual(saved);
    expect(pending.description).toBe('');
    expect(original.copy.headline).toBe('FALL FESTIVAL');
  });

  it.each(['', '   \n '])('leaves the server guard intact for blank generation or edit descriptions: %j', description => {
    expect(() => normalizeBrief({ ...saved, description })).toThrow('Describe the design you want before generating.');
    try { normalizeBrief({ ...saved, description }); } catch (error) { expect(error).toMatchObject({ code: 'DESCRIPTION_REQUIRED' }); }
    expect(resolveEditBrief({ ...saved, description }, undefined)).toBeNull();
  });
});
