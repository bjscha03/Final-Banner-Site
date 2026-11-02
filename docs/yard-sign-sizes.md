# Sheet-based yard sign sizes

The shared catalog `shared/yard-sign-sizes.json` is the source of truth for both the designer and server checkout. The existing 24×18 defaults and $12/$14 prices remain unchanged. The new sizes are additive. No banner, magnet, promotion, or shipping rules change.

## Supplier labels versus artwork orientation

Supplier labels are retained as requested: 12×18, 18×24, 24×24, and 24×36. Artwork width/height are respectively 18×12 (landscape), 18×24 (portrait), 24×24 (square), and 36×24 (landscape). The exact ordered dimensions are stored in existing order-item width/height fields, with size ID, supplier label, and signs per sheet also recorded in the canvas metadata. Display helpers map those dimensions back to the exact supplier label for checkout, customer emails, and admin. Do not sort dimensions: the legacy 24×18 and the new portrait 18×24 have different sheet yields and prices.

## Size changes

Switching size keeps uploaded source files but clears the old placement artifacts and resets the editor to fit the entire design. A new preview is required before adding to cart. The editor, upload preview, AI Fit identity, AI generation target, saved placement, thumbnails and hardware preview all use the selected dimensions. Pending upload/AI/save operations disable the selector to prevent stale results. Quantity rounds up to a valid full sheet and clamps to the new size limit; artwork quantities still sum to the order quantity.

## Sheets and pricing

The supplier charges $44 per single-sided sheet or $55 per double-sided sheet. New yields are 20, 8, 8, and 4 respectively; the conservative 4-per-sheet 24×36 layout is deliberate. Validation is applied per cart line/selected size, not by combining unrelated sizes. Stakes retain the existing $1.50 each behavior. Double-sided uses the same artwork on both sides.

## Verification

- `node --test netlify/functions/_shared/__tests__/yard-sign-sizes.test.cjs netlify/functions/__tests__/stripe-server-pricing.test.cjs`
- `npx vitest run src/lib/__tests__/yard-sign-sizes.test.ts src/lib/__tests__/yard-sign-pricing.test.ts src/lib/yard-sign-first-order.test.ts src/lib/__tests__/admin-profit-estimate.test.ts src/lib/seo/__tests__/localPages.test.ts`
- `npx playwright test --config playwright.yard-sign-sizes.config.ts`
- `npm run build`

Browser integration tests use local upload/AI fixtures and do not charge customers or invoke paid AI providers. A real hosted deploy preview is still required before production approval.
