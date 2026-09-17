import type { AIConcept } from './types';

// A concept family keeps its id through edits. Only versionId identifies the
// image, source background and production export that must travel together.
export function collectVersions(...groups: AIConcept[][]): AIConcept[] {
  const versions = new Map<string, AIConcept>();
  for (const version of groups.flat()) {
    versions.set(version.versionId || version.id, version);
  }
  return [...versions.values()];
}
