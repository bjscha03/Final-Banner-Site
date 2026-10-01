import type { CreativeBrief } from './types';

/** Recover only context lost by clearing the description, not the user's edits. */
export function resolveEditBrief(current: CreativeBrief, saved?: CreativeBrief): CreativeBrief | null {
  if (current.description.trim()) return current;
  if (!saved?.description?.trim()) return null;

  return {
    ...current,
    description: saved.description,
    // Changing the description clears inferred copy in the form. The selected
    // artwork still contains that wording. Explicit overrides, including empty
    // strings that remove text, must win over the saved version's wording.
    copy: { ...current.copy, ...saved.copy, ...current.copyOverrides },
  };
}
