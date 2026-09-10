# Outbound Sales Engine — Phase 2 runbook

Phase 2 adds licensed business discovery and deterministic qualification to the isolated outbound subsystem. It is Shadow Mode only. It cannot generate emails, call OpenAI, send through Resend, receive replies, attribute orders, or run on a production schedule.

## Safety boundary

- All new writes target `outbound_*` tables.
- The only legacy access is a read-only `SELECT` against `orders.email` for existing-customer exclusion. There are no legacy foreign keys, triggers, updates, inserts, or deletes.
- `PHASE_ALLOWS_LIVE_SENDING` remains `false` in code.
- `OUTBOUND_SALES_ENABLED` remains off by default. An explicitly approved staging run must enable it in addition to every Shadow Mode and provider gate; the global kill switch otherwise stops execution before a provider call.
- Shadow Mode is locked on in the Phase 2 settings handler.
- The Apollo adapter rejects production context and requires both an allowed test/staging context and explicit staging enablement. Unit tests may use fixture transport without the staging flag.
- There is no discovery HTTP endpoint, scheduler, background function, OpenAI client path, Resend sender, reply receiver, or follow-up worker.
- Public website contacts always persist with `send_eligible=false`. Syntax and MX checks are not mailbox verification.

## Initial licensed provider

The first adapter is Apollo Organization Search (`POST /api/v1/mixed_companies/search`). Apollo is a server-only, test/staging implementation behind the provider-neutral adapter contract. No provider credential is installed by this phase.

Required credential for a future explicitly approved staging test:

- `OUTBOUND_APOLLO_API_KEY`: a dedicated, least-privilege Apollo API key. Never use a master key, client-side variable, source file, log field, or browser setting.
- `OUTBOUND_PHASE2_SHADOW_EXECUTION_ENABLED=true`: staging-only execution gate.
- `OUTBOUND_SALES_ENABLED=true`: global subsystem gate for that isolated staging environment only.
- `CONTEXT=deploy-preview`, `branch-deploy`, or `dev`. `production` is rejected regardless of the flag.

Apollo documents Organization Search as one credit per page with up to 100 organizations. The engine caps a request at 30 normalized results. The local reference cost is 19,600 micro-USD per credit, derived from the current Basic annual price of $588 and 30,000 annual credits. This is an accounting estimate, not a claim that Apollo sells individual credits at that rate. A subscription may impose a much higher fixed cost than actual Phase 2 usage.

Official references:

- Organization Search: <https://docs.apollo.io/reference/organization-search>
- API pricing: <https://docs.apollo.io/docs/api-pricing>
- Pricing plans: <https://www.apollo.io/pricing?solution=enrichment>
- API key creation: <https://docs.apollo.io/docs/create-api-key>
- Rate limits and usage: <https://docs.apollo.io/reference/rate-limits>
- Terms: <https://www.apollo.io/terms>
- API terms: <https://www.apollo.io/terms/api>

Before any production activation, obtain written confirmation that the intended Organization Search retention and outreach workflow is permitted by the purchased plan. Do not scrape Apollo, LinkedIn, Google Maps, or any prohibited source. Role/group addresses such as `hello@`, `marketing@`, and `info@` are evidence only and are blocked from outreach readiness.

## Provider-neutral contract

Every discovery adapter declares:

- stable provider ID and kind;
- licensed API or first-party acquisition mode;
- configuration-status function that returns booleans only;
- bounded cost estimate;
- execute function that returns normalized records and usage;
- normalizer into the standard prospect shape.

The standard shape contains provider provenance, business name, canonical domain, website, phone, industry, business type, location count, address, sanitized non-secret metadata, and a deterministic dedupe fingerprint. Core qualification code has no Apollo-specific branches.

## Deterministic pipeline

1. Normalize and bound the provider query to 30 results.
2. Reserve the local provider budget under a serializable database transaction and durable request key.
3. Execute the licensed adapter only when the global subsystem switch, provider row, Shadow Mode, and allowed test/staging context all agree.
4. Record request count, result count, credits, estimated/actual cost, and rate-limit metadata.
5. Deduplicate by provider record ID, canonical domain, and fallback fingerprint. Attach additional provider identities to the canonical prospect.
6. Exclude active suppressions, prior outbound contacts, and existing non-test customers before website research.
7. Fetch the public website with DNS resolution, public-IP validation, address pinning, redirect revalidation, strict ports/content types, timeouts, and byte limits.
8. Extract public text, metadata, same-domain signal pages, source URLs, business emails, and evidence without AI.
9. Hash normalized text per page. Reuse conditional HTTP responses and the existing snapshot when the aggregate hash is unchanged. An extraction-version change invalidates the cache.
10. Validate email syntax and DNS/MX state, record business-domain matching, identify role and free-mailbox addresses, refresh rediscovered contacts, and mark no-longer-public contacts inactive while retaining historical evidence. No address becomes send-eligible.
11. Score evidence using deterministic, visible weights. Apply hard exclusions before the score.
12. Store status, rejection/suppression reasons, score explanation, research evidence, and audit entries for the Shadow Mode queue.

## Lead score

The current `deterministic-v1` score uses disclosed industry/business type, location count, upcoming events, hiring/expansion, promotions/openings, real-estate activity, construction activity, community/school/church/nonprofit/sports activity, visible print need, public-contact quality, MX state, and website freshness. A score of 45 is qualified. `ready_for_outreach` additionally requires a matching business-domain, non-role public email with a present MX record. It still remains `send_eligible=false` until a later approved phase installs mailbox verification and sending controls.

Hard exclusions set the score to zero and status to `suppressed`:

- existing customer;
- active suppression;
- previously contacted business or email.

## Migration

`022_outbound_discovery_qualification.sql` is additive and requires migration 021 first. It:

- adds deterministic research/contact/qualification fields to existing outbound tables;
- creates `outbound_prospect_sources`;
- extends provider usage accounting;
- inserts a disabled, zero-limit Apollo configuration.

It does not reference or alter a legacy object.

Use only an isolated writable Neon preview branch. The validation script refuses a non-Neon endpoint, a mismatched endpoint ID, an unconfirmed branch, a production endpoint match, a read-only connection, or an overly permissive URL file.

```sh
export OUTBOUND_TEST_DATABASE_URL_FILE=/secure/path/phase2-neon-url.txt
export OUTBOUND_TEST_DATABASE_CONFIRMATION=isolated-neon-preview
export OUTBOUND_TEST_BRANCH_LABEL=outbound-phase2-discovery-validation
export OUTBOUND_TEST_ENDPOINT_ID=ep-example-preview

node scripts/verify-outbound-sales-migration.cjs --phase2-apply
node scripts/verify-outbound-sales-migration.cjs --phase2-verify
node scripts/verify-outbound-sales-migration.cjs --phase2-rollback-cycle
```

The rollback cycle removes only migration 022, verifies all Phase 1 objects remain, confirms legacy catalog and row counts are unchanged, reapplies 022, and revalidates the Phase 2 catalog and defaults. The rollback deliberately has no `CASCADE`; unexpected dependencies stop it safely. Back up preview data before rollback because Phase 2-only source mappings and additive column values are intentionally removed.

## Validation

```sh
npm run test:outbound-sales
npm run test:outbound-sales:database
npm run lint
npx tsc --noEmit
npm run build
```

The authenticated visual review must cover `/admin/sales/prospects` on desktop and mobile, the horizontal Sales Engine navigation, the return-to-Orders link, source links, score explanations, empty/schema-missing states, and confirmation that browser payloads and client bundles contain no credential values.
