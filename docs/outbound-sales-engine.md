# AI Sales Engine

## Production state

The outbound subsystem is feature-complete for Shadow Mode and deliberately fail-closed for automated cold outreach in production. It can model licensed discovery, deterministic qualification, cached website research, public-contact assessment, grounded personalization, experiments, reply intelligence, dry-run delivery plans, attribution candidates, performance learning, cost accounting, monitoring, and CSV exports. A separate Admin Lead Review path can send one permissioned marketing email at a time only after a named administrator records explicit opt-in evidence and clicks Send. It cannot run production automation or send unsolicited cold outreach while the checked-in activation locks remain false.

The existing AI Banner Designer, checkout, payments, orders, transactional Resend mail, customer accounts, uploads, previews, order tracking, and analytics are outside this subsystem. Outbound code has its own `outbound_*` schema, functions, credentials, budgets, provider adapters, audit records, admin routes, and error handling.

## Non-negotiable safety defaults

- `OUTBOUND_SALES_ENABLED=false` by default.
- Shadow Mode defaults on and the server rejects attempts to disable it.
- Live Sending defaults off and `PHASE_ALLOWS_LIVE_SENDING=false` is a code-level lock.
- Resend's current Acceptable Use Policy prohibits unsolicited cold outreach. A second code-level provider-policy lock prevents the dormant outbound Resend transport from becoming usable through live-send activation alone. Existing transactional Resend email is unaffected.
- Production automation, discovery, OpenAI execution, reply ingestion, and reply-AI fallback are code-blocked even under hostile environment and database settings.
- Automatic reply generation and automatic reply sending are unavailable.
- No outbound schedule is registered in `netlify.toml`; the only schedule there is the pre-existing AI Banner Designer cleanup.
- Automated delivery can never exceed 30/day and remains locked. The separate permissioned manual-review path is capped at 70 attempts/day. The local OpenAI stop defaults to $8/month, with a recommended dedicated-project limit of $10.
- Missing schema, database, configuration, or credentials produces an inactive state; it never falls back to existing production credentials.

Production activation requires a separate reviewed change to the code-level locks after the readiness checklist in `docs/outbound-sales-production-readiness.md` is complete. A browser toggle or environment variable alone cannot activate external work.

## Architecture

The data path is:

1. A licensed discovery adapter returns the provider-neutral prospect contract.
2. Deterministic code canonicalizes domains, deduplicates provider records and companies, and excludes prior customers, suppressions, and previously contacted businesses.
3. The SSRF-safe fetcher retrieves only public HTTP(S) website content after DNS/IP validation, redirect revalidation, response-size limits, and content-type checks.
4. Deterministic extraction records public evidence, contact candidates, content hashes, cache freshness, rejection reasons, and a transparent lead-score explanation.
5. Only eligible, changed research can enter personalization. A pinned outbound-only OpenAI client uses a strict structured-output schema, `store:false`, no tools, bounded input/output, a 30-second timeout, one bounded retry, an idempotency key, and database budget reservation.
6. Deterministic rendering supplies the branded preview, signature, variant assignments, evidence validation, follow-up date, and content hash. The unchanged generation key is a cache hit.
7. Shadow delivery planning spaces at most 30 previews within the configured business window and records exactly what would be sent. It performs no external action.
8. The dormant sender has independent configuration, idempotency, one-click unsubscribe, a physical-address footer, per-message Reply-To routing, suppression rechecks, daily counters, retries, and bounce/complaint/error circuit breakers. Its first assertion is the code-level live-send lock; its Resend implementation has an additional provider-policy lock because Resend currently prohibits cold outreach.
   The separate manual-review sender does not weaken or call that cold-outreach path. It requires explicit opt-in evidence, a same-origin authenticated admin action, a dedicated permissioned Resend key and sender identity, an active branded preview, fresh suppression and prior-send checks, a stable idempotency key, a physical-address footer, and footer plus one-click unsubscribe.
9. The isolated inbound handler verifies dedicated Resend webhook signatures. Deterministic reply rules run first; optional AI fallback is non-production-only for genuinely unclear replies. Suggested responses always require admin review and are never sent automatically.
10. Attribution reads eligible paid-order facts and writes only outbound candidate/attribution records. Learning requires minimum samples, optimizes revenue and qualified outcomes, penalizes safety events, and preserves controlled exploration.

## Database boundary

Migrations 021 through 026 and the additive manual-review migration 029 create or extend only `outbound_*` objects. Source order identifiers are opaque values without a foreign key, trigger, or mutation path into legacy orders. Every migration and rollback is transactional; rollbacks name only their own outbound objects and use no `CASCADE`.

- 021: isolated settings, providers, campaigns, prospects, contacts, research, messages, pipeline, replies, suppressions, jobs, cost/usage, email events, and immutable audit history.
- 022: provider source mappings and deterministic discovery/qualification fields.
- 023: cached Shadow Mode personalization, token/cost diagnostics, and grounded preview fields.
- 024: reply review, classification diagnostics, AI-usage linkage, and idempotent inbound events.
- 025: campaign controls, dry-run/live delivery lifecycle, unsubscribe tokens, daily counters, and circuit-breaker history.
- 026: attribution candidates, daily performance, learning recommendations, and operational alerts.
- 029: high-value lead review, explicit permission evidence, one-at-a-time delivery state, and separate manual daily counters.

No request handler runs migrations. The admin remains readable and fail-closed when the outbound schema is absent. Use only the guarded preview verifier and approved deployment migration process; see the production-readiness runbook for apply and reverse order.

## Provider and cost boundary

All discovery providers implement `providers/contract.cjs`, declare a licensed or first-party acquisition mode, and are constructed through `providers/registry.cjs`. Apollo Organization Search is the first installed adapter and is allowed only in approved test/staging contexts. Google Places, Clay, Data Axle, Yelp/licensed sources, email verification, and future providers remain manifest entries until a reviewed adapter and terms assessment are added. Adding one changes only its adapter and registry entry; the core queue, jobs, qualification, budgets, and admin APIs stay provider-neutral. The project contains no LinkedIn or Google Maps scraper.

Provider requests, results, credits, rate-limit state, and estimated micro-USD cost are recorded. OpenAI input, cached-input, output tokens, and request latency are charged or recorded separately in integer micro-USD. Reservations include concurrent reserved spend before a provider call; incomplete provider usage is charged conservatively. The engine never re-analyzes unchanged research.

## Credential isolation

The subsystem reads only dedicated server-side `OUTBOUND_*` values. It never reads `OPENAI_API_KEY`, `RESEND_API_KEY`, or any `VITE_*` secret. Browser responses report configured/not-configured booleans only. Settings reject unknown or secret-shaped keys, logs and audit metadata are redacted, and all admin reads are `no-store`.

The complete placeholder list is in `.env.example`. Values belong only in the deployment secret manager with the narrowest environment scope. Do not put values in source, GitHub, client bundles, browser-editable settings, database rows, or support logs.

## Admin and API surface

The authenticated `/admin/sales` area includes Dashboard, Prospect Queue, Lead Review, Email Activity, Replies, Orders & Revenue, Industry & Campaign Performance, Cost Analytics, Error Logs, and Settings. Lead Review prioritizes direct trade-show, expo, conference, and upcoming-event evidence, exposes each public source, records approval or rejection, and provides a Send button only after explicit opt-in evidence is recorded. It also exposes scoring reasons, contact assessment, suppression, generated previews, delivery state, reply classification/review, attribution, performance, cost, provider status, secret-presence status, and CSV exports.

Server endpoints are isolated under `outbound-sales-*`: status, settings, prospects, manual review, personalization, activity, replies, analytics, automation, inbound webhook, and unsubscribe. Admin endpoints reuse the existing signed admin session; mutations also require same-origin validation. Automation requires its own constant-time bearer secret. The webhook requires its own signature. Production gates are checked before database/client/provider construction.

## Validation

Run before every merge or activation change:

```bash
npm run test:outbound-sales
npm run test:outbound-sales:complete-database
npm test -- --run
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Also complete authenticated desktop/mobile browser QA, legacy storefront/checkout/admin/AI Designer/upload/preview/payment/transactional-email smoke tests, a client-bundle and response secret scan, migration apply/rollback/reapply on an isolated writable Neon branch, and an external-action inventory proving validation runs made zero outbound sends.
