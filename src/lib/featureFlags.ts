/**
 * Feature flags for the storefront UI.
 *
 * Keep these as plain compile-time constants so unused branches can be
 * tree-shaken by the bundler when a flag is `false`.
 */

/**
 * Master switch for the "Create with AI" / "Edit with AI" experience.
 *
 * When `false`:
 *   - All AI entry-point buttons are hidden in the product designer UI.
 *   - The shared `CreateWithAIModal` / `EditWithAIModal` components render
 *     `null` and never call the `/.netlify/functions/generate-design` or
 *     `/.netlify/functions/edit-design` backends.
 *
 * Flip to `true` to re-enable the feature without code changes elsewhere.
 */
export const ENABLE_AI = false;
