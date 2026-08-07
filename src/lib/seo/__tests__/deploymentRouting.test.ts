import { describe, expect, it } from 'vitest';
import redirects from '../../../../public/_redirects?raw';
import netlifyConfig from '../../../../netlify.toml?raw';

const clientSources = import.meta.glob('../../../**/*.{ts,tsx,js,jsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const functionSources = import.meta.glob('../../../../netlify/functions/*.{mjs,cjs,js,mts,cts,ts}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('production deployment routing', () => {
  it('returns a true failure for missing chunks before the SPA fallback', () => {
    const spaFallback = redirects.indexOf('/*    /index.html   200');
    const missingAssets = redirects.indexOf('/assets/*          /404.html   404');

    expect(missingAssets).toBeGreaterThan(-1);
    expect(spaFallback).toBeGreaterThan(-1);
    expect(missingAssets).toBeLessThan(spaFallback);

    const tomlSpaFallback = netlifyConfig.indexOf('from = "/*"');
    const tomlMissingAssets = netlifyConfig.indexOf('from = "/assets/*"');
    expect(tomlMissingAssets).toBeGreaterThan(-1);
    expect(tomlSpaFallback).toBeGreaterThan(-1);
    expect(tomlMissingAssets).toBeLessThan(tomlSpaFallback);
  });

  it('ships an artifact for every statically referenced client function', () => {
    const referencedFunctions = new Set<string>();

    for (const source of Object.values(clientSources)) {
      for (const match of source.matchAll(/\.netlify\/functions\/([A-Za-z0-9_-]+)/g)) {
        referencedFunctions.add(match[1]);
      }
    }

    const functionArtifacts = new Set(Object.keys(functionSources).map((file) => (
      file.split('/').pop()!.replace(/\.(?:mjs|cjs|js|mts|cts|ts)$/, '')
    )));

    expect([...referencedFunctions].filter((name) => !functionArtifacts.has(name))).toEqual([]);
  });
});
