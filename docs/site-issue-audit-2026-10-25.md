# Site issue audit — October 25, 2026

## Findings

The live admin contained 312 retained customer-labeled reports: 253 resolved,
25 new, and 34 reviewed but still unresolved. The old badge counted only new
reports, so reviewing an incident could make it disappear from the badge.

The 25 new reports represent eight sessions. Hosting request logs identify
23 reports across seven sessions as Googlebot, GoogleOther, AdsBot-Google,
and meta-externalads. Their coarse device labels were misleading. They are
crawler diagnostics, not evidence of customer checkout or upload failures.
The requests include failed JavaScript asset loads; the affected immutable
assets currently return HTTP 200 with JavaScript MIME and CORS headers.

The remaining two new reports describe one Safari visit on October 21. The
SEO module request returned 499 (connection interrupted), followed by the
automatic recovery document returning 200 and the same module returning 200.
This establishes asset delivery after recovery, not proof of a completed
purchase or of the customer's entire subsequent session.

The 34 older reviewed reports break down as follows:

| Class | Reports | Disposition evidence |
| --- | ---: | --- |
| Split CSS load failure | 3 | Production uses one blocking stylesheet; no lazy CSS preload dependency |
| Obsolete/dynamic module failure | 12 | Deploy-pinned assets and bounded cache-busted chunk recovery are present |
| React.lazy default failure | 2 | Recovery no longer cancels Vite preload errors, so failed imports remain rejected |
| Retired product-page hydration | 14 | Product hubs redirect to the designer; retired city routes return 404 |
| Small PNG upload ticket timeout | 1 | Existing regression covers the exact 2,144,002-byte size, stalled request, fallback and retry |
| Opaque Safari Script error | 2 | No source or stack; archive as cause/fix unconfirmed, retain future reporting |

## Changes

- Classify explicit crawler user-agent tokens on ingestion, including requests
  from old clients. Preserve crawler reports in their own admin view.
- Keep unknown user agents, normal mobile/desktop browsers, and headless
  browsers in customer monitoring; do not trust client crawler declarations.
- Count both new and reviewed customer issues as open.
- Require evidence notes to resolve, archive, or manually classify historical
  crawler reports. Preserve diagnostics and allow reopening. Archived reports
  explicitly say the fix is unconfirmed and do not receive a resolved timestamp.
- No changes to checkout, payments, orders, cart, pricing, or artwork handling.

## Validation

86 focused tests passed across ingestion/admin authorization, diagnostics,
traffic classification, recovery, upload fallback, Stripe options, and checkout
payment integrity. Production build and generated-route verification passed.
Changed frontend files pass ESLint. Repository-wide TypeScript checking is
blocked by pre-existing syntax errors in the unused BannerEditor.tsx; that file
is unchanged and not imported by the production build.

Live page and monitoring checks and exact cleanup totals are recorded in the
admin investigation notes. The retained historical evidence is not deleted.
