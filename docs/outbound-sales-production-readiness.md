# Outbound Sales Engine production-readiness runbook

## Current deployment posture

The safe production posture is intentionally inactive:

- no outbound migrations applied to production;
- no production outbound credentials installed;
- `OUTBOUND_SALES_ENABLED=false`;
- Shadow Mode on, Live Sending unavailable and off;
- `PHASE_ALLOWS_LIVE_SENDING=false`;
- `PHASE_ALLOWS_PRODUCTION_AUTOMATION=false`;
- no outbound Netlify schedule;
- provider, OpenAI, inbound, reply-AI, and automation execution blocked in production;
- automatic replies unavailable in every environment.

Deploying the application code in this posture is safe without the outbound schema. The admin reports `schemaReady:false`, shows an empty queue, and rejects writes/execution.

## Migration procedure

Before production use, take the normal Neon backup/restore-point and record the branch and endpoint IDs. Apply exactly in this order:

1. `021_outbound_sales_foundation.sql`
2. `022_outbound_discovery_qualification.sql`
3. `023_outbound_shadow_personalization.sql`
4. `024_outbound_reply_intelligence.sql`
5. `025_outbound_campaign_delivery_safety.sql`
6. `026_outbound_attribution_learning_monitoring.sql`

Verify 27 `outbound_*` tables, their indexes/checks/foreign keys, three outbound triggers, three outbound functions, safe default settings, append-only audit behavior, and unchanged non-outbound catalog and row-count snapshots. Migrations do not register a scheduler or call an external provider.

For a full rollback, stop all outbound execution first, export required outbound records, then run the matching rollback files in reverse order: 026, 025, 024, 023, 022, 021. Every rollback is non-`CASCADE` and should stop on an unexpected dependency. Rollback deliberately removes outbound-only data/columns; restore from the backup if retention is required. Never run the rollback as an ad-hoc request or against an unidentified database.

## Dedicated accounts and credentials

Create separate projects/accounts with least privilege and independent billing:

- OpenAI: `OUTBOUND_OPENAI_API_KEY`, dedicated project, $10 provider-side monthly limit, local $8 stop. Do not reuse the AI Banner Designer key.
- Licensed discovery: initially `OUTBOUND_APOLLO_API_KEY`; confirm the subscribed plan permits the intended internal business use and document the actual credit economics. Keep all other adapters disabled.
- Email verification: select a licensed mailbox-verification provider, complete its data-processing/retention review, and install `OUTBOUND_EMAIL_VERIFICATION_API_KEY` only after its adapter is reviewed.
- Delivery provider: Resend's Acceptable Use Policy dated May 28, 2026 explicitly prohibits unsolicited messages, including cold outreach. Do not install an outbound Resend key or activate its transport without written contractual authorization for this exact workflow. Otherwise select a licensed provider that permits compliant B2B outreach and add it behind the isolated delivery interface. Existing transactional Resend credentials and routes remain untouched.
- Runtime: 32+ byte random unsubscribe and automation secrets, configured in the secret manager and rotated through a documented overlap procedure.

The admin must show booleans only. A credential value appearing in HTML, JSON, JavaScript, source maps, audit rows, function logs, error trackers, analytics, or screenshots is a release blocker.

## Email identity and compliance

Before any live-send activation:

- use a dedicated outbound subdomain so reputation and inbound routing remain isolated from transactional mail;
- configure and verify SPF and DKIM; publish DMARC in monitoring mode, review reports, then tighten policy deliberately;
- configure inbound MX/routing for the dedicated Reply-To domain and verify per-message `outbound-<message-id>@domain` correlation;
- set `OUTBOUND_FROM_EMAIL`, `OUTBOUND_REPLY_TO_EMAIL`, the canonical HTTPS `URL`, and a valid physical postal address;
- for the approved outbound provider, register isolated delivery/inbound webhooks and signature secrets;
- validate one-click unsubscribe and human-readable footer links end to end;
- document CAN-SPAM and applicable state/privacy requirements, data source licenses, suppression retention, and complaint handling with counsel/owner approval;
- verify the delivery provider, Apollo, and OpenAI account terms for the intended use before activation. Resend is currently policy-blocked for cold outreach; its policy is <https://resend.com/legal/acceptable-use>.

## Shadow acceptance gate

Run the complete workflow in an isolated writable staging branch with deterministic seed prospects and no real recipients. Acceptance requires:

- canonical/provider/deterministic duplicate barriers and existing-customer/contacted/suppression exclusions;
- SSRF tests covering private, loopback, link-local, metadata, DNS rebinding, redirects, size, timeout, and content type;
- unchanged research produces no provider/AI replay; changed research invalidates only the relevant cache;
- every lead score and rejection has human-readable evidence;
- every draft passes evidence grounding and renders in the branded desktop/mobile preview;
- cost reservations, monthly stop, one-cent per-draft ceiling, retries, timeouts, invalid usage, and provider errors fail closed;
- exactly what-would-send scheduling remains at or below 30/day and inside the business window;
- deterministic reply classifications, unclear-review flow, suppression, bounce, complaint, delivery, unsubscribe, and per-message routing are idempotent;
- learning waits for the minimum sample, uses revenue/qualified outcomes, accounts for safety rates, and retains exploration;
- all CSV exports are authenticated, escaped, redacted, and audit logged;
- no external email is sent and no production system is touched.

## OpenAI validation record

The single authorized staging request used the dedicated outbound key and the then-configured pinned model. The provider rejected the request before returning a model response. Recorded usage was zero input, zero cached-input, and zero output tokens; the provider-safe error classification was persisted, and the local budget ledger conservatively committed the pre-call reservation of 2,581 micro-USD ($0.002581). The historical failure row did not retain its measured latency, so that value is explicitly unverified rather than reconstructed. The client now attaches elapsed time to both successful and failed provider results, and failure-latency persistence is covered by contract tests. No prompt/response body or credential was retained. Timeout, one bounded retry, strict structured output, `store:false`, idempotency, budget enforcement, provider-error mapping, and graceful failure were verified by contract tests. No second live request is permitted without new authorization.

The current code pins `gpt-5.4-mini-2026-03-17` and accounts at $0.75 per million uncached input tokens, $0.075 per million cached input tokens, and $4.50 per million output tokens. Reconfirm model availability and pricing immediately before activation; a pricing/model change requires a reviewed code and budget update.

## Operations and monitoring

The intended production cadence is one discovery seed per business day and bounded worker invocations for the durable queue. Configure the scheduler only in the final activation change. It must call the authenticated automation endpoint, never a browser session, and alert on missed runs.

Monitor queue age/dead jobs, provider errors/rate limits, AI budget and tokens, discovery credits, send attempts, bounce/complaint/unsubscribe/error rates, reply review backlog, attribution freshness, and scheduler health. Circuit breakers pause on three high-rate bounces, one excessive complaint, or a sustained send-error threshold. Emergency Pause overrides all work. Do not auto-resume a complaint-triggered pause without review.

Retain only the public evidence and diagnostic metadata needed for audit, deduplication, suppression, and performance. Define production retention windows and deletion/export procedures before activation. Suppression hashes/values required to prevent re-contact must outlive ordinary prospect content under the approved policy.

## Activation change

Live activation is intentionally not a settings-only operation. A separate reviewed pull request must:

1. prove the checklist above and attach staging evidence;
2. install scoped credentials without exposing values;
3. apply and verify migrations 021–026 in production;
4. enable Shadow Mode production execution first and observe it without sending;
5. register the bounded scheduler only after Shadow observation is clean;
6. separately change the live-send and production-automation code locks;
7. start below 30/day, confirm deliverability, then increase only within the hard ceiling;
8. retain an immediate code/config rollback and Emergency Pause procedure.

The activation pull request must also remove the provider-policy lock only after attaching written authorization from the selected delivery provider. Changing the live-send lock alone is intentionally insufficient.

Until that activation PR is approved, production remains a monitoring-only, fail-closed shell.
