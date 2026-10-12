# Specialty product implementation and release status

Updated October 12, 2026. Draft PR #601; **not ready for production**.

## Scope and safeguards

The catalog has 19 product families, 60 variants, 103 supplier templates and 133 registered variant/panel combinations. It uses the existing artwork-to-cart flow. Existing banner, yard-sign and magnet price tables are unchanged; existing banner resizing retains its editable AI draft; targeted regression checks cover their pricing and the banner AI workspace.

Each family has a fictional-business catalog image. Product pages also expose manufacturer photography that follows size and accessory selections, supplier details, available template files, installation instructions and videos. The captured data covers 24 supplier profiles and 91 normalized selection groups. Six illustrated installation PDF guides were created from manufacturer instructions and inspected page by page.

`shared/specialty-supplier.json` retains the detailed public source data. `shared/specialty-configuration.json` and the shared option engine drive browser/server selection rules. The ESM mirror is generated from the CJS implementation; the build rejects a stale mirror. Supplier-only selectable options are available even when retail prices are still pending.

## Corrections in this pass

- AI sessions, drafts and results are scoped to product, variant, panel and exact dimensions. Specialty products no longer inherit the banner showcase. Changing products or dimensions resets incompatible AI work; a mismatched result cannot be applied.
- Fractional template inches are preserved before validation. Rounding to two decimal places rejected 24 valid panel combinations. All 133 registered combinations now pass exact-dimension validation.
- Generation, editing and fitting receive the selected supplier geometry. The shaped guide is positioned inside the provider's final crop band. Visual inspection checks the printable silhouette or table front face. The existing Astra inspection model remains configured.
- Size and finishing changes invalidate artwork approvals. Mounting-hole coordinates also clear approval. Conditional tent walls and reverse/double-sided artwork require all selected print faces before adding to cart.
- Compact cart, enlarged cart and order previews use specialty artwork and saved configuration. Graphic-only stands omit their hardware. Selected flag bases, acrylic standoffs, optional lights, corner radii and custom hole coordinates are reflected in the appearance preview.
- Original uploads, placement transforms, permanent preview images and production PDFs remain together per panel. The paid-order job retains specialty PDFs instead of feeding flags, table covers or multi-panel tents to the banner renderer. Admin order details expose every panel file and selected option.
- Unknown prices display as pending. They are not presented as confirmed totals or made payable. Known retail option adjustments are computed by the same browser/server rules.

## Artwork and production

A flag's nominal installed height is not its print artboard. The complete double-sided flag supplier sheet contains both faces; the customer designs and approves that full sheet. The preview shows its front and back separately. A tent canopy has four artwork panels, with additional panels determined by selected full and half walls. The 20-foot canopy uses 1:4 export scale, while its long full wall uses 1:2. Table previews map separate front, top and side regions.

Single-page PDF uploads preserve embedded artwork when exported. Multi-page files are rejected with guidance to split them by panel. Image uploads are embedded at the approved placement. PDF UserUnit preserves physical dimensions for the supplier's long poster sizes. Uploaded PDFs can contain vectors, so raster PPI alone cannot certify them. No production CMYK conversion or supplier preflight has been completed.

Appearance previews are not color proofs or fabric-drape simulations. Main product photos and accessory images provide manufacturer references. Exact assembled tent wall placement, some standard punched-hole offsets and all hardware/photo matches still require supplier verification. The tent viewer currently previews each selected wall separately, rather than assembling every wall into one 3D scene. Do not describe these scenes as perfect photorealistic proofs.

Clear acrylic is the supplier's transparent CMYK-on-1/4-inch product, without white ink. Hardware choices now include no hardware, punched holes and the supplier's 2/4/6-standoff arrangements. Known standoff diameter and 1.5-inch inset are represented; transparent output still needs supplier preflight.

## Pricing and shipping

The owner's instruction is to match Lexington Sign retail prices and shipping for new products. [The price mapping](specialty-price-comparison.md) documents 17 exact baseline matches and the verified accessory adjustments. The earlier cost-plus proposal is superseded for these matches. The 33 × 81-inch retractable is not equated to Lexington's 33.5 × 80-inch kit. Unmatched configurations retain internal draft values for compatibility, but customer-facing totals say price pending and payment is blocked.

Matched offers include overnight shipping **after production**. That is not a validated arrival date or an integration with the supplier's freight quote system. John's Otter notes describe destination ZIP, eligible facility, service and cost; his $51 ground/$160 next-day tent example is not a universal rate or timezone multiplier. Public supplier pages do not expose account freight prices. Actual facility routing, availability, cutoff times, rush/Saturday eligibility and freight cost remain unverified.

Both browser and server block specialty payment until pricing is verified and fulfillment is ready. No configuration is marked fulfillment-ready yet. Existing discount policies remain in place, including the NEW20 coupon; changing specialty coupon eligibility would require a separate explicit policy decision. No production database migration or live paid test order has been run.

## Verification and its limits

This pass includes automated coverage for all registered AI dimensions, crop-mask alignment, product-specific draft isolation, flag fitting with mocked provider responses, exact PDF dimensions/vector embedding, long-page PDF scale, required panel identities, saved previews, option pricing, tamper rejection and specialty production-file handling. Legacy banner/yard-sign/magnet pricing remains covered.

`scripts/test-specialty-browser.mjs` launches the actual application in Chromium and checks all 19 pages/60 variants, size-photo switching, the flag AI workspace, upload → mocked fit → cart reload, conditional tent panels, PDF upload/export and mobile controls. Upload, AI and external-image transports are intercepted. This validates application flow and Canvas/PDF behavior; it does **not** prove live Cloudinary, paid AI, actual supplier asset availability or hosted checkout operation. Tests use a clearly identified technical fixture, not production catalog art.

The public-asset audit contains 350 unique URLs: 110 binary responses verified; 240 could not be verified because the environment returned proxy 403 responses. These are access failures, not proof of broken supplier links. See `specialty-assets-verification.json`. All six newly created local guides were rendered and reviewed.

The final local run passed 258 AI tests, 49 frontend/library tests, 19 pricing/catalog tests and three PDF-job/snapshot tests. All seven Chromium integration checks passed with zero page errors. The production build passed SSR/prerender, metadata, schema, sitemap and 233 generated route checks. A first concurrent build/test attempt timed out under local resource contention; the separate reruns passed. Project-wide TypeScript checking still has pre-existing parse/type failures; do not call the repository type-clean. The earlier hosted build passed, but its broader CI failed at existing Admin commerce browser contracts (missing analytics heading/period controls). Targeted specialty passes do not establish a green full CI run.

## Release dependencies

1. Restore a secure signed-in supplier and protected-preview session. The available authenticated browser runtime could not resume. Never put account passwords or private pricing credentials in this repository or chat.
2. Obtain missing Lexington retail option prices or an explicit owner pricing policy. Verify supplier account SKUs, availability, ZIP/facility freight routing, service and cutoffs. Implement validated shipping/arrival calculations before enabling payment.
3. Test real flag Fit with AI and Create with AI on every distinct template family, including double-face files and multi-panel products. Inspect provider/job logs for the originally reported flag error. Local geometry fixes are verified; that specific live failure has not been reproduced in the authenticated environment.
4. Complete hosted upload/cart/order/admin/email tests and test-mode checkout against an isolated preview database. Apply `database-migrations/add-specialty-artwork.sql` there first. Check artwork download permissions and every selected panel.
5. Confirm supplier CMYK/transparency preflight, hardware/assembly previews, all asset links and unresolved finishing geometry. Enable fulfillment only after these checks pass.

The hosted deployment for commit `cfc1444` failed with Netlify’s generic build-stage exit code 3. The connector did not expose the detailed build log. Local packaging of the AI fit and paid-order PDF functions succeeded. The hosted regression run passed upload recovery, checkout/order/email tests, specialty AI and preview unit stages, then failed the existing Admin commerce browser contracts. Hosted readiness is still unverified.
