# Tracking, Attribution, Revenue, and Technical SEO Audit

- Audit date: 2026-08-06
- Repository: bjscha03/Final-Banner-Site
- Base reviewed: main at 280e1b44
- Candidate branch: audit/tracking-integrity
- Production status: unchanged; this branch is not deployed to production
- Audit status: not complete — source remediation and local validation are complete, but provider-account and real-payment verification remain open

## Executive summary

The production source had several confirmed trust-breaking defects:

- The universal HTML shell loaded GA4, Meta, Clarity, Contentsquare, and LinkedIn on every route, including admin routes. Production observation confirmed those libraries loaded on /admin/orders.
- GA4 relied on its initial automatic page view but did not explicitly track SPA route changes.
- The standard ecommerce funnel was incomplete. view_item_list, select_item, and add_payment_info were absent, while other ecommerce helpers existed without active call sites.
- A purchase was emitted only from the ordinary payment-success route. The graduation design-deposit flow used a different thank-you route and could miss the purchase event.
- Ecommerce item price represented the full line total while quantity was also supplied, allowing item revenue to be multiplied twice.
- Optional same-day and Saturday fees were calculated by the server but were not included in the persisted payment total. That could make the website, database, PayPal request, and analytics value disagree or cause PayPal order creation to fail its amount check.
- gclsrc, which describes the click-source type, was incorrectly treated as a GCLID.
- The client purchase audit described browser-queued events as delivered attempts and accepted client-supplied order amounts without first reconciling the canonical paid order.
- No consent-management platform, Consent Mode v2 implementation, office-IP definition, GA4 internal-traffic filter, or Enhanced Conversions implementation exists.
- Search crawler-specific robots groups bypassed wildcard admin/proof exclusions. A public search check also found /sign-up indexed.

The candidate branch fixes the source-controlled defects without enabling analytics globally:

- Analytics libraries now load only on the two approved HTTPS production hosts and only on customer routes.
- Admin, preview, localhost, development, automation, and conservative known-bot traffic are rejected before any analytics library is loaded.
- GA4, Meta, and optional PostHog page views are emitted once per eligible SPA navigation; GA4 automatic page views are disabled.
- Standard ecommerce events are wired with cent-to-dollar conversion at a single boundary and unit item prices.
- Paid orders are loaded from the server and mapped through one canonical purchase path for normal, PayPal-card, PayPal-wallet, and graduation-deposit success flows.
- The database total is the payment and analytics ledger. Service fees are added exactly once before persistence and processor validation.
- Purchase dedupe now uses local/session provider keys, GA4 and Google Ads transaction_id, Meta eventID, and a unique server audit event key.
- Private-route noindex controls, crawler rules, missing canonicals, sitemap entries, and a broken schema logo reference are corrected.

This is still not a final production verification. GA4, Google Ads, Search Console, office-IP filtering, Consent Mode, real PayPal/card captures, and production browser receipts cannot be proven from repository source or a preview host.

## Overall health score

| State | Score | Meaning |
|---|---:|---|
| Production baseline reviewed | 34/100 | Material analytics pollution, incomplete ecommerce, and an unsafe revenue reconciliation path |
| Candidate branch | 72/100 provisional | Source integrity and local validation are substantially improved; external configuration and real production evidence are still missing |
| Final verified state | Not assigned | Must wait for preview, provider dashboards, controlled production orders, and post-deploy reconciliation |

The candidate score is intentionally capped. A green build or a queued browser event is not proof that GA4 or Google Ads received and attributed a conversion.

## Reconciliation contract

For every paid order, all systems must use the same immutable identifiers and amounts:

| Field | Authoritative source | Downstream use |
|---|---|---|
| Internal order ID | orders.id | Database joins, success URL, audit idempotency |
| Transaction ID | orders.order_number when present; otherwise orders.id | GA4 purchase, Google Ads conversion, Meta eventID |
| Gross paid value | orders.total_cents | Website receipt, PayPal amount validation, GA4/Ads/Meta purchase value |
| Tax | orders.tax_cents | Website receipt and GA4 tax |
| Shipping | orders.shipping_cents | Website receipt and GA4 shipping |
| Discount | orders.applied_discount_cents and applied_discount_label | Website receipt, checkout coupon, purchase coupon |
| Same-day service | orders.same_day_fee_cents | Website receipt and gross paid value |
| Saturday service | orders.saturday_fee_cents | Website receipt and gross paid value |
| Currency | USD | PayPal, GA4, Google Ads, Meta |
| Paid state | canonical order status | Purchase eligibility; pending, failed, and canceled orders do not emit purchase |

The paid flow is now:

1. The cart submits items, discount, and optional service selections.
2. create-order recalculates subtotal, discount, tax, shipping, and server-authoritative service fees.
3. The resulting total is persisted on the pending order.
4. paypal-create-order validates the requested amount against that persisted total.
5. PayPal wallet or PayPal Card Fields captures the same amount.
6. The order becomes paid.
7. The success route fetches that canonical paid order and emits purchase with the same transaction ID and gross value.
8. The server audit upserts one row after reconciling the same canonical paid order.

## Tracking inventory

### Libraries and destinations

| System | Identifier/configuration | Implementation | Candidate behavior |
|---|---|---|---|
| Google Analytics 4 | G-2TQ6JYYZV7 | Direct Google tag; no GTM container found | Loaded once by src/lib/analyticsLoader.ts on eligible production customer routes |
| Google Tag Manager | None found | No GTM- container or GTM bootstrap | Not used |
| Google Ads | Production observation exposed destinations AW-830060716 and AW-17665878635; source-controlled purchase action uses VITE_GOOGLE_ADS_CONVERSION_ID plus VITE_GOOGLE_ADS_PURCHASE_LABEL | Conditional direct conversion event and possible GA4 import, which is account-controlled | Direct purchase is a no-op unless both variables exist; account linkage/import remains unverified |
| Meta Pixel | 1487321805934457 | Browser pixel | Loaded only on eligible production customer routes; explicit SPA PageView and ecommerce events |
| Microsoft Clarity | vb952a5v2f | Browser tag and custom UX events | Loaded only on eligible production customer routes |
| Contentsquare | f68a18990d1b7 | Browser tag | Delayed three seconds and rechecked against eligibility before load |
| LinkedIn Insight | partner 8163164 | Browser tag and optional conversion helpers | Delayed five seconds and rechecked against eligibility before load |
| PostHog | VITE_POSTHOG_API_KEY; optional host | posthog-js | Disabled when no key; manual page views; autocapture and session recording disabled |
| Purchase audit | purchase_analytics_audit table | Netlify function | Records queued/configuration/error status after canonical paid-order validation; one event key per order |
| Other analytics | None confirmed | Repository search found no Segment, Mixpanel, Hotjar, Plausible, or Matomo implementation | None |

### Standard ecommerce event inventory

| Event | Trigger | Timing and dedupe | Key parameters | Candidate result |
|---|---|---|---|---|
| page_view | AnalyticsController on an eligible navigation | One per React Router navigation key; automatic GA4 page view disabled | page_title, sanitized page_path, sanitized page_location | Implemented and locally validated |
| view_item | Product hub or selected configurator product | On product detail/configurator product view | item_id, item_name, category, variant, unit price, currency, value | Implemented |
| view_item_list | Homepage product strip | Once when the list mounts | list ID/name and three product items | Implemented |
| select_item | Homepage product link click | Once per selection click | list ID/name and selected item | Implemented |
| add_to_cart | Cart store after item state is created | Once for each add action | currency, line value, unit price, quantity, product metadata | Corrected |
| view_cart | Checkout after persisted cart hydration | Shared ref prevents rerender duplicates | currency, total value, coupon, items | Implemented |
| begin_checkout | Checkout after persisted cart hydration | Shared ref prevents rerender duplicates | currency, total value, coupon, unit-priced items | Corrected |
| add_shipping_info | Valid customer/shipping form before payment submission | One ref per checkout component; only marked sent if queued | currency, value, shipping tier, coupon, items | Implemented |
| add_payment_info | Valid customer form and selected wallet/card method | One per payment method per checkout component | currency, value, payment_type, coupon, items | Implemented |
| purchase | Canonical paid order loaded on the appropriate success route | Paid-only; per-provider browser keys; provider transaction dedupe; server unique event key | transaction_id, USD, gross value, tax, shipping, coupon, canonical items | Corrected and locally validated |
| refund | No automated refund operation exists | Not applicable to current read-only PayPal reconciliation workflow | Would require canonical refunded amount/items and refund ID | Not implemented; must be added with any future refund workflow |

### Meta events

- PageView
- ViewContent
- AddToCart
- InitiateCheckout
- Purchase, with transaction ID also supplied as eventID
- Lead
- CompleteRegistration

### GA4 custom events

- design_started
- material_selected
- size_selected
- image_uploaded
- text_added
- ai_generation_started
- ai_generation_success
- ai_generation_failed
- ai_image_selected
- ai_credit_used
- payment_method_selected
- payment_button_click
- payment_failed
- payment_success
- sign_up
- login
- quote_requested
- blog_view
- blog_cta_click

AI workspace events:

- ai_designer_opened
- ai_brief_created
- ai_generation_started
- ai_generation_succeeded
- ai_generation_failed
- ai_validation_failed
- ai_concept_selected
- ai_edit_started
- ai_edit_succeeded
- ai_edit_rejected
- ai_design_approved
- ai_applied_to_configurator
- ai_added_to_cart
- ai_checkout_started

UX funnel events currently emitted from call sites:

- cta_click
- sticky_cta_rendered
- step_scrolled
- upload_start
- upload_success
- upload_error
- preview_opened
- preview_done
- quantity_invalid
- finishing_reviewed
- upsell_opened
- add_to_cart_attempted
- add_to_cart_completed
- cart_opened

PostHog promo events currently emitted:

- promo_applied_success
- promo_rejected

The analytics module also defines additional UX and provider helpers that currently have no active call site. They are not counted as live triggers.

## Traffic exclusion policy

### Source-level filters implemented

| Filter | Rule | Reason |
|---|---|---|
| Production host allowlist | bannersonthefly.com and www.bannersonthefly.com only | Reject preview, branch, Netlify, localhost, and development traffic before tag load |
| Protocol | HTTPS required on production host | Reject local or malformed non-secure production contexts |
| Route exclusion | /admin and descendants, /canva-test, /logo-showcase, /pdf-diagnostic | These are not customer analytics surfaces |
| Automation | navigator.webdriver | Prevent Playwright and automated browser checks from polluting production |
| Conservative bot list | HeadlessChrome, Lighthouse, PageSpeed, Googlebot, Bingbot, and common crawler/spider identifiers | Remove obvious non-customer sessions without broad browser/device guesses |
| Server render | No window means no analytics | SSR/prerender does not emit browser analytics |
| Sensitive URL redaction | Removes orderId, intakeId, auth tokens, email, session, and similar query keys; masks proof and order path IDs | Prevent private identifiers from entering analytics URLs |
| Route boundary | Customer-to-admin navigation uses a full reload; controller also reloads if an SPA boundary is crossed | Prevent already-loaded replay/advertising libraries from following the session into admin |

Checkout, payment success, customer order history, and customer proof pages are intentionally not globally disabled. They are valid customer interactions. Private identifiers are sanitized and the private pages are separately noindexed.

### GA4 account filters still required

Office traffic cannot be safely hardcoded in client JavaScript. The owner must supply current public office/VPN egress IP addresses and an authorized GA4 administrator must:

1. Define internal traffic on the web stream with traffic_type set to internal.
2. Create an Internal Traffic data filter in Testing state.
3. Validate the test dimension and confirm real customer traffic remains present.
4. Activate the exclusion only after validation.
5. Create or review the Developer Traffic filter in Testing state, validate debug traffic, and then activate it.
6. Record IP owner, CIDR/range, VPN behavior, effective date, and reviewer.

No office IP was supplied and no GA4 administrator session was available, so no account filter was guessed or activated.

## Issue register

| Severity | Issue and root cause | Risk/impact | Files affected | Actual fix/status |
|---|---|---|---|---|
| Critical | Universal HTML shell loaded every tag on every route | Admin, preview, and synthetic traffic contaminated audiences, sessions, and replay tools | index.html, App, new loader/controller/policy files | Fixed in candidate |
| Critical | Optional service fees were not added to persisted total | Website, DB, PayPal, and analytics could disagree; PayPal amount validation could fail | create-order-core.cjs, order-totals.ts, reconciliation helper/tests | Fixed in candidate |
| Critical | Graduation deposit bypassed the ordinary purchase route | Paid deposits could be missing from GA4/Ads/Meta | Checkout.tsx, GraduationSignsThankYou.tsx, canonicalPurchaseTracking.ts | Fixed in candidate |
| Critical | Purchase item price used line total plus quantity | GA item revenue could be multiplied twice | analytics.ts, Checkout.tsx, PayPalCheckoutReliable.tsx, canonical mapper | Fixed in candidate |
| Critical | Tracked .env and .env.backup contain non-empty database, PayPal sandbox, and Cloudinary credential variables | Public repository history may expose live or reusable secrets | .env, .env.backup and git history | Not changed; rotate credentials, remove tracked secret files, and scrub history in a separate approved security operation |
| High | SPA route page views were not explicitly managed | Blank/wrong landing pages and session attribution; initial page view only | index.html, AnalyticsController.tsx, analyticsLoader.ts | Fixed in candidate |
| High | Ecommerce funnel events were absent or inactive | Funnel loss could not be diagnosed; Ads audiences incomplete | analytics.ts and product/checkout call sites | Fixed in candidate |
| High | Client audit trusted amount/status and called queued work attempted | False confidence in delivery and client-spoofed ledger rows | purchaseTracking.ts, record-purchase-analytics.cjs | Fixed in candidate; provider receipt still must be verified externally |
| High | gclsrc was stored as GCLID | Invalid Google click identifiers and broken Ads attribution | attribution.ts | Fixed in candidate |
| High | Consent Mode/CMP absent | Regulatory and measurement risk; Enhanced Conversions cannot be safely enabled | No implementation exists | Open blocker requiring legal/CMP decision |
| High | GA4 internal/developer filters not source-controlled | Office traffic can remain in reports | GA4 account | Open blocker requiring IPs and GA4 admin access |
| High | Google Ads linking, import, primary action, window, attribution model, and enhanced conversion settings are account-controlled and unverified | Missing or double-counted Ads conversions | Google Ads/GA4 accounts | Open blocker |
| High | /sign-up is currently discoverable in public search | Auth/utility surface appears in the index | netlify.toml, RouteRobotsPolicy.tsx | Candidate adds response and client noindex; deindex verification requires deployment/Search Console |
| Medium | Crawler-specific robots groups bypassed wildcard admin/proof rules | Private URLs could be crawled despite wildcard rules | public/robots.txt | Fixed in candidate |
| Medium | Missing canonicals for design, graduation, and political pages | Duplicate/canonical ambiguity | Design.tsx, GraduationSigns.tsx, PoliticalSigns.tsx | Fixed in candidate |
| Medium | Graduation and political landing pages absent from sitemap | Slower discovery and incomplete sitemap parity | public/sitemap.xml | Fixed in candidate |
| Medium | Blog publisher schema referenced nonexistent /logo.png | Structured-data validation warning/broken image | BlogPostPage.tsx | Fixed to existing social logo asset |
| Medium | Exact source of Direct/Unassigned traffic could not be quantified without GA4 reports | Root-cause percentages remain unknown | GA4 account | Confirmed source mechanisms fixed; quantitative validation open |
| Medium | Cross-domain settings cannot be assessed from source | Session continuity risk if checkout changes to a redirect domain | GA4 stream | Current PayPal SDK returns to same-site success flow; account review still required |
| Low | Browserslist data is stale and large chunks remain | Performance/CWV maintenance risk | build dependencies and bundles | Existing warning; not changed in tracking branch |

## Session-attribution findings

Confirmed source mechanisms contributing to Direct, Unassigned, admin traffic, or blank landing pages:

1. Tags loaded on admin routes with no customer campaign context.
2. Preview, localhost, and automation used the same tag IDs as production.
3. GA4 relied on one automatic document-load page view while the app used client-side routing.
4. gclsrc was persisted as though it were a valid GCLID.
5. No account-level internal traffic exclusion was documented.
6. Sensitive success URLs could fragment page reporting by order query values.

The candidate removes those mechanisms. It does not claim that every Direct visit is invalid; genuine direct customer visits must remain. The exact before/after contribution requires a GA4 exploration segmented by hostname, page path, landing page, session source/medium, traffic_type, and date after deployment.

## Google Ads pipeline audit

### Source-controlled results

- gclid, gbraid, and wbraid are captured independently and persisted with landing page, referrer, UTMs, consent status, and timestamp.
- gclsrc is no longer accepted as a click ID.
- Purchase conversion uses the canonical transaction ID and gross order value.
- Direct Google Ads conversion is emitted only when both the conversion ID and purchase label are configured.
- Missing configuration is stored as configuration_missing rather than falsely marked successful.
- A later direct-Ads retry does not resend GA4 or Meta.
- No Enhanced Conversions user-data payload is implemented.
- No cross-domain linker code is present.

### Account-controlled checks still open

- GA4 property linked to the intended Google Ads account
- Exact purchase conversion action and label
- Whether GA4 purchase import is enabled
- Which purchase action is Primary versus Secondary
- Whether a direct Ads event and a GA4 import currently double-count the same order
- Conversion value mode and currency
- Click-through and engaged-view windows
- Attribution model and data-driven eligibility
- Auto-tagging
- Enhanced Conversions terms, diagnostics, and user-data consent
- Cross-domain list

The account must use one clearly documented primary purchase path. If Enhanced Conversions for web is required, the direct Google Ads conversion action should be evaluated because GA-imported purchase goals do not provide the same implementation path. Do not activate a second Primary purchase action for the same transaction.

## Revenue validation findings

### Payment methods

The visible wallet and credit-card experiences both use PayPal infrastructure:

- PayPal wallet through PayPal Buttons
- Credit card through PayPal Card Fields

The repository contains Stripe-related identifiers and compatibility code, but the current UI path is hard-disabled. Therefore, this audit does not represent Stripe as an active customer payment processor.

### Corrected mismatch

Before the candidate change:

- computeTotals calculated subtotal, discount, tax, shipping, and a base total.
- Same-day and Saturday fees were separately reconciled later.
- The fees were stored in dedicated columns but not added to total_cents.
- The client passed a total that included those services to paypal-create-order.
- The processor endpoint compared that client amount to the lower database total.
- The receipt helper could display the higher reconstructed value even if a different amount had been captured.

After the candidate change:

- Server-authoritative service fees are added to total_cents exactly once.
- That total is persisted before PayPal order creation.
- PayPal validates against the persisted total.
- The receipt and purchase event prefer the stored total and reconstruct only legacy rows with no stored value.
- The focused test proves 6,360 cents plus a 509-cent service fee produces exactly 6,869 cents.

### Remaining production evidence

No real wallet or card charge was authorized during this branch audit. A final release needs controlled orders for each payment method and a database/provider/GA4/Ads reconciliation query. Test or preview orders must remain excluded from production analytics.

## Technical SEO and Search Console

### Source and build results

- robots.txt now repeats admin/proof exclusions inside specific Googlebot and Bingbot groups.
- Response-level X-Robots-Tag rules cover admin, private order/proof, checkout, payment, auth, thank-you, and utility routes.
- A client robots policy provides a second noindex layer for SPA-rendered private routes.
- Canonicals were added to the design, graduation, and political landing pages.
- Graduation and political landing pages were added to the sitemap.
- Blog publisher logo schema now points to an existing asset.
- The production build prerendered 139 routes plus 404.html and verified 19 sitemap-eligible routes.
- The build verifier passed city pages, blog pages, schema, metadata, CTA, sitemap parity, 404 output, and social assets.
- Analytics is dynamically loaded only after hydration, so source changes did not alter SSR metadata or structured-data output.

### Open Search Console checks

No authenticated Search Console session was available. These remain open:

- Coverage/indexing reasons
- Live URL inspection for representative public and private routes
- Submitted sitemap status and last fetch
- Crawled-currently-not-indexed and discovered-currently-not-indexed groups
- Soft 404 report
- Redirect chains reported by Google
- Rich Results status
- Manual actions and security issues
- Core Web Vitals field data for mobile and desktop

Public search evidence found /sign-up indexed before deployment. After deployment, request recrawl/removal as appropriate and verify the URL becomes excluded by noindex.

## Files changed

### Analytics isolation and page views

- index.html
- src/App.tsx
- src/components/AnalyticsController.tsx
- src/components/Header.tsx
- src/lib/analyticsLoader.ts
- src/lib/trackingPolicy.ts
- src/lib/trackingRuntime.ts
- src/lib/posthog.ts
- src/lib/uxAnalytics.ts
- Blog event call sites

### Ecommerce and revenue

- src/lib/analytics.ts
- src/lib/purchaseTracking.ts
- src/lib/canonicalPurchaseTracking.ts
- src/lib/order-totals.ts
- src/lib/attribution.ts
- src/store/cart.ts call semantics validated
- src/pages/Checkout.tsx
- src/pages/PaymentSuccess.tsx
- src/pages/GraduationSignsThankYou.tsx
- Product list/product detail/configurator call sites
- PayPal wallet/card checkout components
- netlify/functions/_shared/legacy/create-order-core.cjs
- netlify/functions/_shared/legacy/record-purchase-analytics.cjs
- Reconciliation helpers and tests

### SEO

- netlify.toml
- public/robots.txt
- public/sitemap.xml
- src/components/RouteRobotsPolicy.tsx
- Design, graduation, political, and blog metadata files

## Validation results

| Check | Result | Evidence/limitation |
|---|---|---|
| Focused tracking tests | Pass, 37/37 | Policy, events, click IDs, totals, purchase dedupe, admin suppression, SEO source controls |
| Server reconciliation tests | Pass, 5/5 | Exact service-fee total and transaction-ID fallback |
| TypeScript | Pass | npx tsc --noEmit |
| Production build | Pass | Browser and SSR bundles; 139 routes plus 404; build verifier passed |
| Local page data | Pass, 12/12 | Existing local-page suite |
| Trade-show data | Pass, 5/5 | Existing trade-show suite |
| Diff integrity | Pass | git diff --check |
| Full Vitest command | Not a clean signal | 426 of 435 collected assertions passed; nine pre-existing failures involve browser globals, profit fixture drift, grommet expectations, and PDF window assumptions; Vitest also miscollects Playwright/node:test files |
| Browser matrix | Test added; execution pending | Environment has no installed Chromium, Chrome, Edge, Firefox, or WebKit binaries |
| Preview deployment | Pending | Branch must be pushed and draft PR checks must publish it |
| GA4 DebugView/Realtime | Pending | Requires authorized account and a production-eligible test strategy |
| Google Ads diagnostics | Pending | Requires authorized Ads account |
| PayPal wallet capture | Pending | Requires approved controlled charge |
| PayPal card capture | Pending | Requires approved controlled charge |
| Search Console | Pending | Requires authorized property |

## Final verification gate

Do not mark this audit complete until all of the following have direct evidence:

- [ ] Customer traffic is accurately tracked on production.
- [ ] Admin traffic no longer loads or sends analytics.
- [ ] Preview, localhost, development, and automated tests do not send production analytics.
- [ ] Office/VPN traffic is labeled and excluded with GA4 filters.
- [ ] Each standard ecommerce event appears once with the expected payload.
- [ ] PayPal wallet paid order equals database total and GA4 purchase total.
- [ ] PayPal card paid order equals database total and GA4 purchase total.
- [ ] Google Ads receives exactly one intended primary purchase conversion.
- [ ] GA4 purchase count and revenue reconcile to the paid-order ledger for the test window.
- [ ] Google Ads count and revenue reconcile for attributable test clicks.
- [ ] No duplicate purchase transaction IDs exist.
- [ ] No paid order is missing a purchase.
- [ ] Consent behavior is approved and implemented.
- [ ] Public SEO templates remain indexed/canonical and private routes are noindexed.
- [ ] Search Console, rich results, soft 404s, redirects, and Core Web Vitals are reviewed.
- [ ] Cross-browser production-safe checkout tests are complete.
- [ ] No regression is found in ordering, proof, admin, city, blog, or metadata functionality.

Until those boxes are checked, the correct status is preview candidate, not completed audit.

## Authoritative references

- [GA4 page-view measurement for single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [GA4 recommended ecommerce events and parameters](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [GA4 ecommerce validation guidance](https://developers.google.com/analytics/devguides/collection/ga4/validate-ecommerce)
- [GA4 internal traffic definition and filters](https://support.google.com/analytics/answer/10104470?hl=en)
- [Google Consent Mode implementation](https://developers.google.com/tag-platform/security/guides/consent)
- [Google Ads Enhanced Conversions setup](https://support.google.com/google-ads/answer/13258081?hl=en)
- [Google Ads Enhanced Conversions eligibility and limitations](https://support.google.com/google-ads/answer/13262500?hl=en)
- [GA4 cross-domain measurement](https://support.google.com/analytics/answer/10071811?hl=en)
