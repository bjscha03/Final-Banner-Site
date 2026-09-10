import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateWithAIResult } from '@/components/design/ai/types';

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/components/design/ai/draftStore', () => ({
  saveDraft: vi.fn(async (key: string, value: unknown) => { records.set(key, structuredClone(value)); }),
  loadDraft: vi.fn(async (key: string) => records.get(key) || null),
}));
const result = { imageBase64: 'jpeg-bytes', fileName: 'banner.jpg', width: 96, height: 48 } as CreateWithAIResult;
const config = { widthIn: 96, heightIn: 48, material: '13oz' as const, quantity: 2 };
beforeEach(() => { records.clear(); vi.resetModules(); vi.useRealTimers(); });

describe('recoverable AI artwork transfer', () => {
  it('survives repeat route effects and only clears after successful upload', async () => {
    const handoff = await import('./aiDesignHandoff');
    const id = await handoff.createAIHandoff(result, config);
    expect((await handoff.readAIHandoff(id))?.result).toEqual(result);
    expect((await handoff.readAIHandoff(id))?.configurator).toEqual(config);
    await handoff.completeAIHandoff(id);
    expect(await handoff.readAIHandoff(id)).toBeNull();
  });
  it('restores the full JPEG and selected configuration after a module reload', async () => {
    const handoff = await import('./aiDesignHandoff');
    const id = await handoff.createAIHandoff(result, config);
    vi.resetModules();
    const restored = await import('./aiDesignHandoff');
    expect(await restored.readAIHandoff(id)).toMatchObject({ result, configurator: config });
  });
  it('does not discard the valid transfer when an unrelated token is read', async () => {
    const handoff = await import('./aiDesignHandoff');
    const id = await handoff.createAIHandoff(result, config);
    expect(await handoff.readAIHandoff('wrong-id')).toBeNull();
    expect(await handoff.readAIHandoff(id)).not.toBeNull();
  });
  it('allows a long design session but expires transfers after 24 hours', async () => {
    vi.useFakeTimers();
    const handoff = await import('./aiDesignHandoff');
    const id = await handoff.createAIHandoff(result, config);
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await handoff.readAIHandoff(id)).not.toBeNull();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(await handoff.readAIHandoff(id)).toBeNull();
    vi.useRealTimers();
  });
});
