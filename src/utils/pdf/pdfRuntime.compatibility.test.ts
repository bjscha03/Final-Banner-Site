// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('parses a real PDF when Promise.withResolvers is missing', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    Promise.withResolvers = undefined;
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdf.getDocument({ data: new Uint8Array(fs.readFileSync('test.pdf')) }).promise;
    console.log(JSON.stringify({ pages: doc.numPages, supported: typeof Promise.withResolvers === 'function' }));
    await doc.destroy();
  `], { encoding: 'utf8' });
  expect(JSON.parse(result.trim().split('\n').at(-1)!)).toMatchObject({ pages: 1, supported: true });
});
