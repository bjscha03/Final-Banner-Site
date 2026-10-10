# Twilio text ordering for Banners On The Fly

This integration adds durable SMS/MMS ordering to the existing BOF site. It is disabled until Twilio credentials, a verified number, and settings are installed. It uses existing Neon, Cloudinary, server pricing, Stripe, paid-order finalization, and order notifications. No AI subscription is needed for the menu or the image preview.

## Preparation on a free trial

The website, order storage, saved print artwork, mobile approval, Stripe test checkout, and automated code checks can be prepared without upgrading Twilio. `npm run test:text-ordering` uses local Postgres and simulated providers; it sends no real messages and takes no real payments. Read-only account/number preflight is also available when credentials have been installed securely.

Twilio's current trial includes 100 SMS messages for 30 days, limits recipients to five verified numbers, and restricts outbound content to Twilio templates. It does not support this complete custom SMS/MMS ordering conversation. Use the trial's built-in SMS demo for basic connectivity; upgrade and complete number verification before the full phone test and public launch. Older trial experiences can have different restrictions; check the actual account rather than assuming trial credits enable production messaging.

References: https://www.twilio.com/docs/usage/trials and https://www.twilio.com/docs/usage/trials/try-out-sms.

## Account and number

1. The owner completes Twilio signup, email/phone verification, password creation, and acceptance of Twilio terms. Upgrade and fund the account when ready to purchase the number; do not enable automatic recharge initially.
2. Purchase an SMS/MMS-capable U.S. toll-free number. Create the business's Trust Hub Primary Customer Profile as a **Direct Customer** and submit toll-free verification for **customer-initiated banner ordering and transactional order updates**. Use the owner's actual business/legal information, address, contact details, and evidence of the opt-in flow. Include the Terms and Privacy Policy URLs in their separate registration fields, and publish the corresponding SMS disclosures before submission. Twilio/carrier approval is required before public launch; the app cannot bypass it.
3. Enable HTTP authentication for stored messaging media in Twilio. Limit messaging geographic permissions to the United States. Configure a Twilio usage alert at the owner's chosen dollar threshold. The application caps outgoing messages, but does not cap incoming charges, phone rental, or carrier fees.

The customer voluntarily texts the published ordering number to request a banner. That request initiates replies about that order; it is not permission for unrelated marketing. The initial reply identifies BOF and provides rates/STOP/HELP/terms information. STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, and OPTOUT suppress future outgoing messages. Twilio handles its own STOP/START acknowledgements. HELP provides BOF support details; START resumes messaging. RESTART closes an unpaid order and opens a new conversation.

Verification evidence should include a screenshot of the eventual number advertisement with this disclosure:

> Text BANNER to [verified number] to start your banner order. Automated texts about your order; frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to buy. Terms: https://bannersonthefly.com/terms. Privacy: https://bannersonthefly.com/privacy.

Do not publish a placeholder number. The legal pages contain the corresponding SMS terms/privacy sections.

## Netlify settings

Add these server-only environment variables to the **site**, using Netlify's secret environment-variable controls. Never commit values or add a VITE_ prefix.

| Variable | Value |
| --- | --- |
| TWILIO_ACCOUNT_SID | The real AC… account SID |
| TWILIO_AUTH_TOKEN | The real account auth token; secret |
| BOF_SMS_SETTINGS | Compact JSON below |

Production JSON, initially disabled:

```json
{"enabled":false,"mode":"live","phoneNumber":"+1YOURVERIFIEDNUMBER","origin":"https://bannersonthefly.com","dailyMessages":200,"monthlyMessages":2000,"sessionMessages":50}
```

Only replace enabled:false with true after account/number verification, routing, and live preflight are complete. Existing DATABASE_URL/NETLIFY_DATABASE_URL, CLOUDINARY_* and Stripe/order-notification secrets are reused. Additional variables should be scoped to Functions and runtime where supported to avoid the site's existing environment size limit.

For a test deployment, set mode:test, origin to its actual https://deploy-preview-N--bannersonthefly.netlify.app URL, and testPhones to an array of approved +1 test recipients. Use existing preview-scoped Stripe **test** keys and webhook secret. Test mode rejects all other phone numbers. Stripe mode must match text-order mode; production Stripe is never used for a test-marked order.

Redeploy after changing environment settings. In the deployed site's authenticated **Admin → Text orders** page, use **Check Twilio connection** to validate the private credentials and read assigned SMS/MMS numbers. This check works before a number or database has been configured; it never sends messages, purchases a number, or changes routing. It requires a real signed admin session, including on previews; the preview convenience cookie is not accepted.

The two Twilio variables alone are enough for a read-only account check. `BOF_SMS_SETTINGS` is required to configure a selected number and enable ordering. A connection result verifies account access, not carrier registration or successful order delivery. When preview review access is also enabled, the signed owner session still takes precedence for this protected account check.

Preflight commands, with variables supplied securely in the terminal:

```sh
node scripts/configure-twilio-text-orders.cjs
node scripts/configure-twilio-text-orders.cjs --apply
```

The first command works with just the two Twilio credentials and reads account/number capability and whether configured routing matches. The second requires the selected number settings and updates only the owned number's inbound SMS/MMS webhook and fallback to the chosen BOF origin, POST /api/twilio/inbound. It refuses trial or unknown account types. A safe retry uses the same MessageSid and cannot repeat a conversation step. No number purchase, account creation, verification submission, or test text is performed by this script. Raw provider exceptions and existing webhook URLs are not printed because they can contain private values.

## Endpoints and checkout

| Endpoint | Purpose |
| --- | --- |
| POST /api/twilio/inbound | Validate Twilio signature, account/number, then persist inbound message |
| POST /api/twilio/status?id=… | Signed delivery callback, associated with one outbox item |
| /.netlify/functions/twilio-worker-background | HMAC-protected background processing and outgoing delivery |
| /.netlify/functions/twilio-retry | Five-minute recovery of saved pending work |
| GET/POST /api/text-order | Signed, expiring customer link for original upload, approval, shipping, payment |
| /text-order/:token | Mobile review and secure-payment handoff |
| /admin/text-orders | Authenticated conversation status, outgoing usage and failed/uncertain deliveries |

The Stripe webhook at /.netlify/functions/stripe-webhook must subscribe to:

* payment_intent.succeeded (existing checkout event)
* checkout.session.completed
* checkout.session.async_payment_succeeded
* checkout.session.async_payment_failed

Keep existing unrelated subscriptions. New events use bof_sms:v1 metadata and are isolated from normal web checkout. The customer enters contact/shipping details on BOF and pays on Stripe Checkout, including eligible wallet methods. BOF creates its pending order before Stripe Checkout. The approved artwork revision, amount, currency, checkout key, saved order, and test/live mode must match before the paid transition. The browser's success redirect never marks an order paid. Existing fulfillment/email jobs run after the verified webhook.

Sales tax currently mirrors the site's existing flat 6% calculation; this integration does not introduce a new tax policy or Stripe Tax registration. Shipping is U.S. only, matching normal checkout.

## Artwork and conversations

Choices: listed/custom size with explicit feet or inches; 13oz/15oz/18oz/mesh; grommets; pole pockets; pocket opening when selected; rope; quantity; JPG/PNG/WebP artwork. Authoritative pricing includes options, quantity and existing automatic discounts.

MMS often compresses photos. Images below the existing banner minimum of 100 source DPI are rejected with a secure original-upload link rather than silently upscaled. Signed direct Cloudinary uploads support originals up to 50MB, ten attempts per conversation. PDF/vector and double-sided banner work remains available through the site's regular order/custom-quote flow.

FILL crops at center. FIT preserves the entire image with white space as needed. A permanent print image is saved; the phone preview is a downsample of that exact file. Changing the image or fit creates a new revision and clears approval. APPROVE locks the current revision before checkout; RESTART is required for changes after approval. Session links expire after seven days. Private links have no-store/noindex/no-referrer headers and are excluded from analytics.

The database owns conversation state, inbound deduplication, an outbox and usage counters. State, reply creation, and acknowledgement commit atomically. Concurrent texts for the same customer are serialized. Per-day/month caps count reserved outgoing SMS segments and each MMS, including uncertain deliveries conservatively. They are not dollar-denominated billing caps. Rate-limit rejections retry; an uncertain send is never automatically duplicated. Inspect unknown/failed deliveries in /admin/text-orders and Twilio logs.

## Required launch checks

Use one owner-approved test recipient and Stripe test mode on a preview. Verify: full order; invalid/custom size; photo vs original upload; FIT/FILL then approval; duplicate inbound delivery; STOP and START; RESTART with an open Checkout Session; successful/failed payment; webhook replay; BOF saved print file and receipt; delivery callbacks and caps. Confirm no test order enters production fulfillment.

Production requires Twilio verification, a capability-checked owned number, live environment configuration, webhook subscriptions and a small owner-approved paid test before advertising the number. Until those external gates are complete, setup is prepared, not live.

Local verification:

```sh
npm run test:text-ordering
npm run build
```
