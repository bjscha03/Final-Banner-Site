# Displays, flags, event gear and signs

## Draft status

This branch adds 19 product families with 51 configurations. It is a draft and must not be merged or published yet. New products use the existing cart, not a quote-request form. Existing banners, yard signs and car magnets retain their pricing, discounts, designers and checkout behavior.

Implemented: categorized product pages; 19 realistic fictional-business catalog images; PDF/PNG/JPG upload; the existing placement editor, Create with AI and Fit with AI dialogs; supplier template boundaries; per-panel review; saved physical product previews; production PDF export; in-place cart edits; durable cart data and multi-panel order storage. No customer artwork is regenerated to create a product mockup. Customer artwork is mapped onto product surfaces deterministically.

## Artwork and previews

`shared/specialty-templates.json` records supplier artboard dimensions, source URLs, cut paths, fold lines and safe areas. A flag's nominal height is not its print artboard size. Tents require four approved panels; their long and short sides use separate dimensions. The 20-foot tent exports at the supplier's 1:4 scale. Table previews use front/top/side regions from the supplier's templates. Product scenes are appearance previews, not color proofs or guaranteed simulations of fabric drape.

Uploads retain original files. Single-page PDFs retain their embedded artwork in the export; image uploads are embedded in a correctly sized PDF at the approved position. Originals, placement transforms, permanent previews and print files travel together in `specialty_config`. Source/size/transform changes invalidate review. The server checks panel identities, composition signatures, dimensions and permanent artifact URLs. Editing preserves the cart line ID, and account-cart merging compares all specialty panels. Direct edit links wait for cart hydration before initializing the designer, so a refresh cannot silently initialize a blank replacement.

Fit with AI receives the exact template and a technical reference mask. Its inspection uses the registered boundary, or a table's front face, when checking essential wording. The existing Astra-based inspection path is retained. Paid live AI calls have not been tested in this draft.

Clear acrylic is specifically transparent CMYK on 1/4-inch material, with four included chrome standoffs and pre-drilled corner holes. No white ink option is implied. Production color conversion, transparency and final supplier preflight still require validation.

## Pricing policy — updated by owner request

On October 11, 2026 (America/New_York), the owner instructed that new products match Lexington Sign's product prices and shipping terms. This supersedes the earlier margin-based proposal for matching configurations. The live product pages and current public configurator were checked; older search snippets had outdated prices and were not used.

See [specialty-price-comparison.md](specialty-price-comparison.md) for the exact configuration mapping. Thirteen fixed configurations and four single-sided ACM dimensions now match published retail prices. These include free overnight shipping **after production**. Sales tax remains separate. Competitor delivery promises do not establish our production cutoff, facility availability or arrival dates.

Configurations without a published match keep their earlier values only as clearly labeled draft estimates. They cannot be paid for. The 33 × 81-inch retractable is not silently equated to Lexington's 33.5 × 80-inch kit, and standard table prices are not applied to fitted/stretch covers. No supplier costs, account credentials or margin targets are stored here.

The shared catalog is the source for browser and server calculations. ACM matching dimensions use fixed totals rather than an inferred per-square-foot rate. Other custom ACM sizes remain estimates. Existing product price tables are unchanged.

## Delivery and launch dependencies

John's Otter meeting notes explain that supplier routing and delivery depend on the destination ZIP and eligible facility. His $51 ground/$160 next-day example was for a particular tent shipment, not a universal rate table and not a browser-time-zone multiplier. Under the new matching policy, customer shipping is included on confirmed configurations; actual supplier freight still matters for cost and service validation.

Payment remains unavailable for all specialty products in this draft. Server guards independently require verified pricing and `fulfillmentStatus: ready`; no browser flag can bypass this. These guards apply through the existing authoritative Stripe/PayPal/order pricing path. The draft is not a completed shipping or supplier-order integration.

Before release:

1. Restore secure supplier access and confirm exact supplier SKUs, availability, freight service and production cutoffs for the matched offer. Resolve remaining price gaps with the owner.
2. Complete desktop/mobile browser testing of real uploads, PDF conversion, panel switching, AI generation/fitting, approval invalidation, cart reload and editing. The secure browser session could not be resumed; local Playwright could not obtain a runnable browser binary.
3. Verify transparent acrylic and all unusual shapes through supplier file preflight, including CMYK output. Run real preview-environment uploads and test-mode payments; do not place live paid orders for QA.
4. Verify multi-panel originals and print files in the admin/fulfillment and email paths. Apply `database-migrations/add-specialty-artwork.sql` in an isolated preview database. No production database migration has been run.
5. Review product images against exact hardware, then change fulfillment availability only after the ordering path passes end-to-end checks.

## Verification

Targeted automated checks cover permanent preview signatures and cart save/load, price tampering, artwork/dimension mismatch, required tent panels, custom-size limits, PDF export scale, vector PDF retention, edit-in-place behavior, merged-cart identity and banner-only quantity discounts. Existing banner, yard-sign and magnet server pricing tests remain in the regression suite. Build verification checks 233 generated routes, metadata, schema, sitemap and social assets.

Project-wide TypeScript checking is blocked by existing parse errors in `BannerEditor.tsx` and `auth-insecure.ts`; a diagnostic run excluding those files still reports pre-existing errors elsewhere. Do not describe the entire application as type-clean. Build and unit results do not replace the outstanding browser and supplier checks.

The first hosted draft build completed successfully. Hosted checkout/order/email/tracking unit stages also passed, but the existing Admin commerce browser contracts failed while looking for the Abandoned Cart Analytics heading and period controls. The broader CI run is not green; this failure is not covered by the targeted specialty test results.
