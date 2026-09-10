# Production Validation and Reconciliation Runbook

This runbook is the required evidence path after the draft PR produces a preview. It deliberately separates preview-safe checks, account changes, and real-payment checks.

## 1. Preview deployment

Record:

- PR number and commit SHA
- Netlify deploy-preview URL
- build/check status
- tester, timestamp, browser, and viewport

On the preview storefront, verify:

- The preview gate works.
- Home, product, design, cart, checkout, blog, city, and political pages render.
- Retired campaign and proof URLs redirect to `/custom-banners`; the old function names return unconditional 410 Gone responses from one logic-free Edge tombstone.
- No requests are made to Google tag, GA4, Meta, Clarity, Contentsquare, LinkedIn Insight, or PostHog.
- window.dataLayer, window.gtag, and window.fbq are not created.
- /admin and descendants also load no analytics.
- Private routes return X-Robots-Tag after Netlify headers are available.
- Public metadata, canonicals, schema, sitemap, and robots output match the candidate.

Preview is intentionally analytics-silent because preview traffic must not pollute production properties.

## 2. Browser matrix

Run the tracking-isolation Playwright test and the existing checkout/browser suite against:

- Desktop Chrome
- Desktop Edge
- Desktop Firefox
- Desktop WebKit/Safari approximation
- iPhone WebKit portrait and landscape
- Android Chromium portrait and landscape

Record browser engine and exact version. A WebKit emulation is useful but does not replace final iPhone Safari testing on a physical device.

For each environment, capture:

- route and viewport
- console errors
- failed network requests
- screenshot or trace on failure
- analytics request count
- checkout form/payment UI result

## 3. GA4 internal traffic

Inputs required:

- Office public IPv4/IPv6 address or CIDR
- VPN egress IPs
- Whether remote staff should be internal
- GA4 administrator

Procedure:

1. Sign in with a verified administrator account on each owner/admin browser, return to a public storefront page, and confirm no analytics requests are sent. This permanently marks that browser as an internal device.
2. In the GA4 web stream, define internal traffic using traffic_type=internal for office/VPN devices that do not authenticate.
3. Create or edit the Internal Traffic data filter in Testing state.
4. Visit a controlled non-purchase page from the office/VPN.
5. Confirm traffic_type is visible in the test data and that an external connection is not labeled internal.
6. Save screenshots and timestamps.
7. Activate only after the test succeeds.
8. Review Developer Traffic in the same Testing-first sequence.

Never use a client-side IP list or broad geographic exclusion.

## 4. Consent Mode and Enhanced Conversions decision

Before implementation, obtain:

- Approved consent categories and regions
- Approved CMP/vendor
- Default storage behavior
- Consent retention policy
- Whether Ads personalization is allowed
- Whether first-party customer data may be used for Enhanced Conversions
- Google Ads customer-data terms acceptance

The eventual implementation must set Consent Mode v2 defaults before tag configuration, update consent after the user choice, and persist the choice. Test analytics_storage, ad_storage, ad_user_data, and ad_personalization states.

Do not send email, phone, or address data to Google Ads until the legal/consent decision and Ads account setup are complete.

## 5. Google Ads account audit

Capture screenshots or exports for:

- Linked GA4 property
- Auto-tagging state
- Purchase conversion actions
- Source of each action: website tag or GA4 import
- Primary/Secondary setting
- Value mode and currency
- Count setting
- Click-through, engaged-view, and view-through windows
- Attribution model
- Enhanced Conversions status and diagnostics
- Cross-domain configuration

Expected design:

- One Primary purchase conversion for bidding.
- Any parallel diagnostic/import action is Secondary.
- Transaction ID is the canonical order number or UUID.
- Value uses the approved business ledger definition.
- gclid, gbraid, and wbraid are preserved.

## 6. Controlled wallet and card orders

Authorization required:

- Approved product/test SKU
- Approved coupon scenario
- Approved same-day/Saturday scenario
- Approved real charge amount
- Approved refund/reversal handling after validation
- Named tester and payment owner

Run at least:

1. PayPal wallet, ordinary order.
2. PayPal Card Fields, ordinary order.
3. One coupon order.
4. One optional service-fee order.
5. PayPal sandbox order, which must remain marked as a test order and produce no analytics purchase or advertising conversion.

For each order, record:

| Field | Website | Database | PayPal | GA4 | Google Ads |
|---|---|---|---|---|---|
| Order ID |  |  |  |  |  |
| Transaction ID |  |  |  |  |  |
| Gross value |  |  |  |  |  |
| Tax |  |  |  |  | N/A unless custom |
| Shipping |  |  |  |  | N/A unless custom |
| Coupon |  |  | N/A |  | N/A unless custom |
| Currency |  |  |  |  |  |
| Capture/status |  |  |  |  |  |
| Event/conversion count | N/A | audit row | capture count | purchase count | primary conversion count |

Acceptance:

- All money values match the approved ledger definition.
- One successful capture creates one paid order.
- One paid order creates one GA4 purchase transaction.
- Attributable orders create one intended Primary Ads conversion.
- Refreshing the success page does not create another transaction.
- Failed, declined, canceled, pending, test, and admin flows do not create purchase events.

## 7. GA4 event validation

Use Tag Assistant and GA4 DebugView only with an approved production test strategy. Automation is intentionally blocked from production analytics.

For each standard event, verify:

- event name
- exact timestamp/order
- fires once per intended action
- currency is USD where required
- value matches the selected ledger definition
- transaction_id is stable
- item_id and item_name are present
- item price is unit price
- quantity is an integer
- coupon, tax, shipping, item list, shipping tier, and payment type appear when applicable

Validate:

- page_view
- view_item
- view_item_list
- select_item
- add_to_cart
- view_cart
- begin_checkout
- add_shipping_info
- add_payment_info
- purchase
- refund only after an actual refund workflow exists

## 8. Reconciliation queries

For the controlled test window, export:

- Paid, non-test orders from the database
- PayPal completed captures
- GA4 purchase events by transaction_id
- Google Ads intended Primary purchase conversions by transaction ID where available
- purchase_analytics_audit rows

Join on transaction ID and compare count and gross value.

Flag:

- paid order with no processor capture
- capture with no paid order
- paid order with no GA4 purchase
- duplicate GA4 transaction ID
- attributable paid order with no intended Ads conversion
- multiple Primary Ads conversions for one transaction
- amount or currency mismatch
- audit row that says queued but has no provider receipt

The browser audit table is supporting evidence only. It does not prove provider receipt.

## 9. Search Console and SEO

After deployment:

1. Submit or confirm sitemap.xml.
2. Inspect home, each product hub, one city page, one blog page, and the political page.
3. Inspect /sign-up, /checkout, /payment-success, /admin/orders, and one proof URL; each must be excluded by noindex.
4. Request recrawl/removal for the currently indexed sign-up URL if needed.
5. Validate Organization/Product/Article/Breadcrumb structured data.
6. Review Pages, Sitemaps, Enhancements, Manual Actions, Security, and Core Web Vitals.
7. Test a nonexistent URL for a real 404 response/output rather than a soft 404.
8. Crawl redirects for chains and loops.
9. Compare mobile and desktop CWV groups.

## 10. Release decision

Approve production only when:

- Preview checks pass.
- Required account filters/configuration are documented.
- Consent behavior is approved.
- The browser matrix has no blocking regression.
- Controlled orders have an authorized payment plan.

After deployment, keep the audit open until the first controlled production reconciliation is complete. Roll back or disable only the affected candidate change if a discrepancy appears; preserve canonical paid-order records and provider captures for diagnosis.
