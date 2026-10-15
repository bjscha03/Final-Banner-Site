# Specialty product implementation and release status

Updated October 13, 2026. Draft PR #601 and its protected Netlify preview are the review target.

## Current scope

19 product families and 58 selectable variants use the existing artwork-to-cart flow. The step-and-repeat is limited to 8 × 8 and 10 × 8 ft. Existing banner, yard-sign and magnet price tables are unchanged.

All 19 families have FREE Next Day Air after production under the owner's confirmed retail policy. This includes unpriced products and accessories. Shipping transit is separate from production turnaround; no rush/Saturday service or guaranteed arrival date was added.

The catalog retains 18 Lexington base-price mappings and the verified option adjustments in [the price comparison](specialty-price-comparison.md). The owner authorized best-judgment prices for the remaining items on October 13. All 58 variants and all offered options now have complete prices. New proposals have separate provenance from verified public matches and display an approval note in the preview. [John’s approval schedule](specialty-pricing-proposal.md) records the prices, discount exposure and assumptions. Unknown future options still remain incomplete and blocked from payment.

## Suppliers and release controls

B2Sign fulfills the specialty families except acrylic and aluminum composite signs, which are assigned to Signs365. The server writes the canonical supplier into the saved order configuration. Acrylic now uses the Signs365 3 mm back-printed product with white underbase. Unsupported B2Sign acrylic hole/corner/standoff permutations were removed. Mounting locations require final production confirmation; the appearance preview is illustrative.

`shared/specialty-release.json` provides independent category and product switches. All are enabled on this review branch. Setting one to false hides its catalog entry and direct product page, removes it from prerendering, and blocks its quotes and server checkout. Saved artwork can remain in a cart. If every product is disabled, the main navigation omits Displays & Signs. These are version-controlled release settings, not a new admin dashboard or automatic production rollout.

## Photography and artwork guides

`shared/specialty-media.json` maps each selected variant to a local branded example. New images cover stand sizes, flag shapes, table-cover sizes/open backs, tents and Signs365 acrylic. Supplier stock photos are no longer rendered in the shopping gallery or option thumbnails. A branded tent wall example and a clean flag-base reference supplement the selected product view. Technical source data, manufacturer download links and assembly instructions remain available.

Selected generated assets are in `public/images/products/gallery`; their built-in image-generation prompts are recorded in `docs/specialty-gallery-prompts.json`. Photos illustrate artwork and configuration. The chosen order options determine what is included; photographs do not certify exact manufacturing tolerances.

Downloadable two-page artwork guides use the same registered dimensions, export scale, silhouettes, safe margins and face/fold guides as the editor. Guide links follow the selected variant and required panels, including tent walls and two-face flags. Fonts are embedded for reliable PDF rendering. Large poster guides use PDF UserUnit to preserve physical dimensions. The guide clearly instructs customers to remove guide marks and export one artwork page per print panel; the two-page setup guide is not itself a print-ready upload.

## Existing artwork and order behavior

AI sessions/drafts are scoped to product, variant, panel and exact dimensions. Size, finishing and artwork changes clear incompatible approvals. Required tent walls and double-sided files retain their own panel identities. Original uploads, saved placement, previews and production PDFs travel together through cart and order processing. Server repricing and panel validation reject tampered or incomplete configurations.

A flag's installed height differs from its print artboard. Tent canopies require four artwork panels, with additional panels for selected walls. The 20-foot canopy uses 1:4 export scale and its long full wall uses 1:2. Table previews map front, top and side regions. PDF uploads preserve embedded/vector artwork; multipage print uploads are rejected. The appearance preview is not a color proof or a complete assembled 3D wall simulation.

## Review before production launch

John still needs to approve the proposed retail prices and confirm supplier costs, air-freight feasibility, Signs365 finishing availability/mounting specifications, confirm production turnarounds and choose the first release categories. Supplier account SKUs, physical production preflight and live upload/AI/order/admin/email testing remain separate release checks. The specialty migration must be present in the intended test/production database before order rollout. No real payment or customer order is created by this update.

The local Chromium suite uses the actual application with mocked upload and AI transports and the existing no-payment preview mode. It tests navigation, prices, options, artwork/cart persistence, checkout availability, templates and mobile layout. It does not establish live provider or production-payment readiness. Full-repository TypeScript and unrelated Admin commerce CI have known baseline failures; targeted specialty tests and a successful deployment do not imply that every repository check passes.

## Previous catalog validation (October 12)

- 22 server/catalog/quote tests and 15 focused frontend/artwork/cart tests passed.
- All 13 Chromium checks passed across focused runs, with zero page errors on the final runs. This includes all 19 pages/58 variants, local gallery asset decoding, price/option/quantity totals, saved-cart repricing, checkout eligibility, PDF upload/vector preservation, the actual guide download and mobile controls. A file refresh interrupted one initial cart-read check; its isolated rerun passed. A new guide test initially used a rounded wall height; it was corrected to the canonical 80.02778-inch dimension and passed.
- All 103 registered guide definitions generated with the expected dimensions; representative flag, table, tent and acrylic PDFs were rendered and inspected. Embedded fonts resolved a PDF reader substitution issue. The maximum 1,908-inch poster's physical PDF dimensions were verified separately.
- Final production build passed prerendering and verification for 233 routes plus the 404 page. Gallery contact sheets, catalog pricing cards and mobile artwork controls were visually reviewed.

## October 13 pricing update

The catalog now prices all 3,196 selectable option combinations. Exact ACM size overrides are preserved; custom-size rates and minima apply outside those overrides. Replacement-only configurations remove hardware once, wall quantities multiply per panel, and fixed aluminum size selections update the dimensions and artwork together. Proposed prices remain on draft PR #601; no production merge is authorized or performed.
