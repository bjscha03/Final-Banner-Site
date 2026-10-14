# Specialty catalog integration review - October 14, 2026

Status: preview only. Retail approval, supplier-cost and freight review, production validation, and explicit launch authorization remain required. Do not merge this PR to production on the strength of pricing completeness alone.

## Current-site preservation

Integrated catalog head `c89921bf095e68da32987b371e22389cd87bc2bc` with current main `c92d1a150f7baac4cb06225eec8ceb6f6bb0b022`, which contains 16 commits since the shared base. Ten conflicting files were resolved individually.

- Retained current checkout layout, payment locks, wallet/card presentation and realistic/print-layout preview switching; added specialty previews, option summaries, discount line prices and pending-price handling within that layout.
- Retained current artwork crop controls and stored-original print rendering. Acrylic transparency and specialty panel routing remain supported.
- Retained current direct-to-designer navigation and retired product/city routes. Only the 20 specialty catalog/product routes are added to prerendering.
- Existing production page, hero, upload and checkout changes remain in the ancestry; no reset of main or production deployment is part of this update.
- The original retail proposal, including its 18 existing base-price mappings, is unchanged pending approval.

## Verification

- Application TypeScript check (`npx tsc --noEmit --pretty false`) passed on both current main and the integrated catalog.
- Production build passed and verified 20 specialty routes; retired product/city routes remain excluded.
- 33 server/catalog/production tests passed, including all 3,196 selectable retail-price combinations and stored-original print-scene regressions.
- 60 frontend assertions/tests passed across the selected specialty, artwork, checkout layout, payment-integrity and order-total suites. One source assertion was updated for the existing specialty quantity cap of 100 while retaining 999 for other eligible products and the payment lock.

Browser fixtures have been refreshed for the current AI approval checkbox, checkout savings label, structured admin session, site-monitoring response, and existing advertising/referral UI. These updates retain price/total assertions and production authentication.

The integrated catalog passed all 9 specialty CI browser scenarios on `dca67acf788d198f8335596b0b13d97ab74f06a5`, with no page errors. This includes all 58 variants, option/quantity pricing, mobile controls, artwork approval, saved-cart repricing, invalid-option blocking and test-checkout availability. Upload and AI transports are mocked; no payment is submitted.

The core Order/Email/Tracking regression job also passed on that commit, including all 4 desktop/mobile admin contracts, artwork handoff, TypeScript and the production build. Hosted Stripe initialization and preview PayPal containment passed. A stale smoke assertion expected `/custom-banners`; it has been aligned with current main's `/design?product=banner` redirects. Direct HTTP checks confirmed all 3 retired campaign routes return 301 to that destination and all 7 retired functions return 410 for both GET and POST.

These checks establish integration and calculation coverage, not supplier confirmation or production release readiness. The full cross-browser/responsive matrix, payment workflow and remaining hosted smoke gates must still finish before release. Real upload/storage, live AI, isolated test-mode payment, admin/order-email propagation and the specialty-artwork database migration still require the documented release checks.

## Approval blockers

Current supplier quote review found that some October 13 proposals do not cover supplier cost plus next-day freight after existing promotions. The private approval PDF contains the detailed cost/profit review. No retail adjustment has been silently approved or applied here.

The acrylic and ACM supplier is Signs365, not B2Sign. Its current costs, mounting/finishing support and freight terms require confirmation. B2Sign freight is destination-, quantity- and package-dependent; a Louisville quote is not a nationwide fixed rate.

Before launch: obtain John’s retail, cost, freight and production approval; apply the approved price schedule; repeat the relevant pricing, mixed-cart, discount, upload, checkout and production-output checks against the latest main; then obtain Brandon’s explicit launch authorization. Refresh main again if it changes during review.
