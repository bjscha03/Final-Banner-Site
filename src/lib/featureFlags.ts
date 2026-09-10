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
 *     `null` and never call the production AI Designer functions.
 *
 * Flip to `true` to re-enable the feature without code changes elsewhere.
 */
/**
 * Netlify/Vite env var: `VITE_AI_BANNER_ENABLED`
 * - Set to `'true'` to force-enable AI
 * - Set to `'false'` to force-disable AI
 * - If omitted, AI is disabled (fail closed)
 */
export const ENABLE_AI = import.meta.env.VITE_AI_BANNER_ENABLED === 'true';
