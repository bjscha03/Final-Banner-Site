import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createProgressWriter } = require('../_shared/ai-designer/progress.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

describe('nonblocking AI progress', () => {
  it('starts pipeline work without waiting on progress storage, and coalesces intermediate updates', async () => {
    const upload = deferred();
    const write = vi.fn().mockImplementationOnce(() => upload.promise).mockResolvedValue(undefined);
    const progress = createProgressWriter(write);
    expect(progress.publish({ stage: 'inputs' })).toBeUndefined();
    progress.publish({ stage: 'planning' });
    progress.publish({ stage: 'creating' });
    expect(write).toHaveBeenCalledTimes(1);
    upload.resolve();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls.map(([record]) => record.stage)).toEqual(['inputs', 'creating']);
    await progress.close();
  });

  it('drains the active upload before the terminal result, discarding obsolete queued stages', async () => {
    const upload = deferred();
    const records = [];
    const progress = createProgressWriter(async record => { await upload.promise; records.push(record.stage); });
    progress.publish({ stage: 'creating' });
    progress.publish({ stage: 'checking' });
    let done = false;
    const close = progress.close().then(() => { records.push('completed'); done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    upload.resolve();
    await close;
    progress.publish({ stage: 'stale' });
    expect(records).toEqual(['creating', 'completed']);
  });

  it('does not fail a completed generation because an informational progress upload failed', async () => {
    const progress = createProgressWriter(async () => { throw new Error('temporary storage hiccup'); });
    progress.publish({ stage: 'creating' });
    await expect(progress.close()).resolves.toBeUndefined();
  });
});
