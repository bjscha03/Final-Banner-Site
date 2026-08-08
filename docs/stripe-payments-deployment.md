# Stripe card, Apple Pay, and Google Pay deployment runbook

This checkout is intentionally implemented as a Netlify full-stack flow. The
site uses Netlify Functions for pricing, order persistence, payment status,
webhooks, and fulfillment. A static Vercel preview cannot exercise those
functions and is not a valid payment preview. Use the Git-connected **Netlify
Deploy Preview** for the pull request; do not deploy this branch to production.

## Architecture and safety invariants

- Stripe.js is loaded only on checkout and only after the same-origin
  `stripe-config` function reports that Stripe is safely configured.
- Stripe Express Checkout Element renders Apple Pay and Google Pay only when
  Stripe reports that the current device, browser, wallet, and domain support
  them. The application does not draw substitute wallet buttons.
- Stripe Payment Element handles card entry. Wallets are disabled in that
  element to avoid duplicate Apple Pay or Google Pay choices.
- The browser never receives `STRIPE_SECRET_KEY` or
  `STRIPE_WEBHOOK_SECRET`, and card details never pass through a Banners On The
  Fly server.
- A PaymentIntent is created only after checkout details are submitted. The
  server re-prices supported products, validates the cart and discount, writes
  the pending order, creates an unconfirmed PaymentIntent, durably binds it to
  that order, and only then confirms it server-side with the ConfirmationToken.
  The browser never confirms the intent; it calls `handleNextAction` only when
  Stripe returns `requires_action`.
- A browser return is not fulfillment authority. The signed Stripe webhook and
  the browser finalization/status path share an idempotent server finalizer.
- Confirmation email, admin notification, PDF creation, and canonical purchase
  analytics run through the existing paid-order follow-up pipeline. The
  canonical order number remains the analytics transaction ID, and test orders
  must not create GA4 or Google Ads purchases.
- PayPal remains a separate supported provider and retains its existing create,
  capture, reconciliation, and follow-up flow.

## Required Netlify configuration

Configure secrets in **Netlify → Site configuration → Environment variables**.
Do not put values in Git, a `VITE_` variable, build logs, PR descriptions, or
browser storage. Use context-specific values and verify their effective scope
before enabling checkout.

| Variable | Deploy Preview / branch deploy | Production | Notes |
| --- | --- | --- | --- |
| `STRIPE_CHECKOUT_ENABLED` | `true` only when all rows below are ready | keep `false` until explicit approval | Master fail-closed switch |
| `STRIPE_MODE` | `test` | `live` only after approval | Runtime rejects a key family that does not match the deploy context |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | `pk_live_…` | Served by the same-origin config function; never bake it into Vite |
| `STRIPE_SECRET_KEY` | matching `sk_test_…` | matching `sk_live_…` | Server-only |
| `STRIPE_WEBHOOK_SECRET` | signing secret for the exact preview webhook | signing secret for the production endpoint | Each endpoint has its own secret |
| `NETLIFY_DATABASE_URL` | isolated Neon preview branch/database | existing production Neon database | Never test Stripe against production order data |
| `INTERNAL_JOB_SECRET` | unique preview secret | existing/unique production secret | Protects paid-order background follow-ups; `AUTH_SESSION_SECRET` is the legacy fallback |
| `ORDER_CONFIRMATION_TOKEN_SECRET` | unique preview secret | stable production secret | Signs payment-bound confirmation/order-view credentials; `AUTH_SESSION_SECRET` is the legacy fallback |

`DATABASE_URL` remains a supported server fallback, but a single unambiguous
`NETLIFY_DATABASE_URL` is preferred. Never set a client-visible
`VITE_DATABASE_URL` for this work.

Before setting `STRIPE_CHECKOUT_ENABLED=true`, open the deployed config endpoint
and confirm that it returns disabled when any required setting is missing or a
test/live key is mismatched. The public response may contain the publishable
key and mode; it must never contain a secret key or webhook secret.

## Isolated Neon preview data

1. Create or reset a Neon branch dedicated to this payment preview.
2. Apply the same schema/migrations as production without copying customer
   credentials or other sensitive production data unless an approved masked
   process exists.
3. Scope its connection URL to Deploy Preview/branch contexts only.
4. Confirm a preview payment writes only to the preview branch.
5. Confirm test orders, emails, and analytics cannot leak into production. Test
   mode orders are intentionally marked. A settled Stripe test order may appear
   to authenticated Admin on the explicit nonproduction preview so its lifecycle
   can be verified; production Admin and purchase analytics still exclude it.
6. Remove or rotate the preview database credential after the review window if
   the branch is no longer needed.

## Stripe Dashboard: test-mode setup

Perform these steps with **Test mode** selected.

1. Enable cards, Apple Pay, and Google Pay in Stripe payment-method settings.
2. Register the exact HTTPS Deploy Preview hostname under **Payment method
   domains**. For a pull request this is normally
   `deploy-preview-<PR_NUMBER>--bannersonthefly.netlify.app`.
3. Wait for the domain to show as enabled/verified. Stripe handles the Apple Pay
   domain association for Elements; do not add a hand-built Apple Pay button or
   merchant-validation endpoint.
4. Create a webhook endpoint for:
   `https://deploy-preview-<PR_NUMBER>--bannersonthefly.netlify.app/.netlify/functions/stripe-webhook`.
5. Subscribe only to the PaymentIntent lifecycle events handled by the deployed
   webhook. `payment_intent.succeeded` is required for fulfillment; failure,
   cancellation, and processing events should be included when the handler
   explicitly supports them.
6. Copy that endpoint's `whsec_…` value into the Deploy Preview-scoped
   `STRIPE_WEBHOOK_SECRET`. Do not reuse a Stripe CLI secret or the production
   endpoint secret.

Stripe must be able to reach both the registered domain and webhook. Do not put
Netlify's sitewide password/basic-auth protection in front of them. Keep the
existing `noindex` preview headers; if access control is required, use an
application-level review gate that does not block Stripe's verification and
webhook requests.

## Wallet verification

Wallet presence is contextual, so absence is not automatically a defect.

### Apple Pay

- Use the registered HTTPS preview hostname.
- Test Safari on a Mac with Apple Pay configured and Safari on a real iPhone.
- Test iPad Safari where an eligible wallet is configured.
- Confirm Apple Pay appears only when Stripe's Express Checkout Element reports
  availability, opens the native sheet, can be dismissed safely, and can be
  retried without losing the cart or creating a duplicate order.

### Google Pay

- Use the registered HTTPS preview hostname.
- Test Chrome on Android with Google Wallet configured.
- Test Chrome desktop with an eligible Google Pay profile where Stripe supports
  it.
- Confirm Google Pay appears only when available, opens the provider sheet,
  cancels cleanly, and can be retried safely.

Firefox, browsers without a configured wallet, unsupported devices, and private
browsing configurations may show no wallet. In every case card and PayPal must
remain usable and the layout must not leave a blank wallet box or broken button.

## Content Security Policy and network access

The repository currently does not apply a sitewide Content-Security-Policy. If
one is added before launch, validate it in report-only mode first and include at
least the Stripe origins required by the current Stripe.js/Elements integration
(including `https://js.stripe.com`, Stripe frame origins, and Stripe API/network
origins). Preserve the existing PayPal, analytics, Cloudinary, Resend-backed
application, and other required origins. Never loosen `script-src` to
`unsafe-eval` merely to make Stripe work.

Re-run desktop and mobile checkout after every CSP change. A CSP that lets the
page render but blocks an embedded wallet frame or confirmation request is a
payment outage.

## PayPal preview guard

The existing checkout deliberately does not expose a real PayPal provider flow
on `deploy-preview-*` hosts. It uses the existing admin no-payment preview path
when available so a reviewer cannot accidentally create a PayPal sandbox/live
order in the wrong environment. Do not remove this containment to make a PR
preview look more complete.

Set `FEATURE_PAYPAL=0`, `FEATURE_PAYPAL_CREDITS=0`, and `PAYPAL_ENV=sandbox`
in Netlify's **Deploy Preview** context. The server also rejects every provider-
facing PayPal path on a Deploy Preview even if a broader-scope live flag or key
is inherited; the context variables are defense in depth, not the only guard.
Production continues to require live mode, while an isolated branch deploy may
use explicitly scoped sandbox credentials and its own sandbox
`PAYPAL_WEBHOOK_ID`.

PayPal code and automated capture/status tests must still pass on this branch.
A real PayPal sandbox end-to-end test requires a separately isolated branch
deploy whose hostname and PayPal credentials are deliberately configured for
that purpose. Production PayPal must be re-verified after approval and before a
production release; do not make a random live charge.

AI-credit purchases use the same PayPal environment with an additional
server-only `FEATURE_PAYPAL_CREDITS=1` gate. New credit create/capture requests
require both `FEATURE_PAYPAL=1` and `FEATURE_PAYPAL_CREDITS=1`; signed status
reconciliation and verified webhook fulfillment deliberately continue after a
gate is disabled so an already-authorized payment cannot be orphaned. Configure
`PAYPAL_ENV=sandbox` plus only the sandbox client/secret in an isolated test
deploy. A preview/branch deploy rejects live PayPal credentials, and production
rejects sandbox credentials. Apply migration `029_ai_credit_payment_integrity.sql`
to the isolated Neon branch; Functions also run an idempotent schema readiness
gate and stop before contacting PayPal if historical provider IDs need manual
reconciliation. `RESEND_API_KEY`, `EMAIL_FROM`, and optionally
`EMAIL_REPLY_TO` are required for the durable credit receipt outbox. The retired
`notify-credit-purchase` browser route always returns `410`; no client should
call it.

## Preview validation checklist

Use Stripe test data only. Record the exact browser, OS/device, deploy SHA,
Stripe test event/PaymentIntent ID, internal order ID, and outcome for every
case.

- [ ] Config is fail-closed for missing, mixed-mode, or production keys on a
      preview host.
- [ ] Card success creates one pending order, one successful payment, one paid
      order transition, and one follow-up run.
- [ ] Decline, insufficient funds, and authentication failure remain unpaid and
      are safely retryable with a human-readable message.
- [ ] Apple Pay success and cancellation on supported Apple hardware.
- [ ] Google Pay success and cancellation on supported Google Pay hardware.
- [ ] Wallet-unavailable browsers show neither fake nor empty wallet controls.
- [ ] Promo, quantity discount, tax, shipping, same-day, Saturday, minimum-order,
      banner, yard-sign, and car-magnet totals match the server's canonical
      order totals.
- [ ] Altered browser totals, stale carts, invalid coupons, and changed prices
      fail before confirmation.
- [ ] Double tap, refresh, Back, timeout, network interruption, webhook retry,
      browser finalizer/webhook race, and status recovery do not duplicate an
      order, payment, email, or conversion.
- [ ] The paid order has the expected database values and is visible through
      the appropriate isolated-preview Admin verification path. Test-mode
      records remain excluded from production Admin and reports.
- [ ] The customer confirmation and admin notification are emitted once in the
      isolated test environment; no real customer receives a test email.
- [ ] The success page loads the canonical order with its payment-bound token,
      shows the correct subtotal/discount/tax/shipping/fees/total, and refreshes
      without creating work.
- [ ] Exactly one canonical purchase audit event exists for a real paid order;
      test-mode orders produce no GA4 or Google Ads conversion.
- [ ] Existing PayPal unit/integration regressions, cart persistence, Designer →
      Cart → Checkout, admin orders, email, and analytics suites still pass.
- [ ] Responsive coverage includes a small iPhone, current iPhone, large iPhone,
      Android phone, iPad/tablet, and desktop without horizontal scroll, covered
      controls, frozen scrolling, or keyboard/focus traps.
- [ ] Browser coverage includes Chrome, Safari, Edge, Firefox fallback behavior,
      iPhone Safari, and Android Chrome. Native wallet success is claimed only
      when actually completed on eligible hardware.

## Production approval gate

Production remains unchanged until the owner explicitly approves the exact
preview commit. After approval, use a separate reviewed release change:

1. Rotate every credential found in the historical tracked `.env` files. The
   known affected categories are Neon database access, PayPal sandbox access,
   and Cloudinary access. Deleting the files in this branch does not erase Git
   history and does not make those credentials safe to keep using.
2. Review history-cleanup implications before rewriting Git history; do not
   force-push a shared repository without a coordinated plan.
3. Create the production Stripe webhook and production payment-method domain
   entries with **Live mode** selected.
4. Configure only `pk_live_…`, `sk_live_…`, and the production endpoint's
   `whsec_…` in the production context. Confirm preview/test contexts still use
   test keys.
5. Re-run the full regression checklist on the release candidate.
6. Enable `STRIPE_CHECKOUT_ENABLED=true` in production only after monitoring,
   rollback ownership, and support response are ready.
7. Watch Stripe webhook delivery, Netlify Function errors, Neon order state,
   confirmation-email counts, Admin visibility, GA4 purchase deduplication, and
   Google Ads conversions during the controlled launch.
8. Roll back new Stripe checkout by setting `STRIPE_CHECKOUT_ENABLED=false`;
   this must leave the existing PayPal checkout available. Webhook,
   finalization, and status recovery deliberately continue for payments that
   were already authorized so the switch cannot orphan a charge.
