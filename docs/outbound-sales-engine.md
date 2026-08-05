# AI Sales Engine

## Phase 1 status

Phase 1 installs an isolated, fail-closed foundation only. It does not discover businesses, crawl websites, call OpenAI, verify email addresses, schedule work, send email, process Resend webhooks, or change order attribution.

The subsystem shares only the existing server-verified admin session, the server-side Neon connection, and the admin application shell. It does not import or modify the AI Banner Designer, checkout, payment, order, transactional email, upload, preview, tracking, customer-account, or analytics implementations.

## Safety defaults

- `OUTBOUND_SALES_ENABLED` is false unless its exact server value is `true`.
- Shadow Mode defaults to enabled.
- Live Sending defaults to disabled and is code-level phase-locked in Phase 1. Neither environment variables nor database/admin settings can unlock it without a later reviewed code change.
- Emergency Pause defaults to inactive and overrides future automation when enabled.
- The daily send limit defaults to 30 and cannot exceed 30.
- The local monthly OpenAI stop defaults to $8.
- The recommended dedicated OpenAI project hard limit is $10.
- No outbound secret is accepted from browser code or stored in the database.

## Credential boundary

The AI Banner Designer continues to use its existing configuration. The AI Sales Engine will use only dedicated server-side `OUTBOUND_*` credentials in later phases.

Phase 1 reports booleans for required configuration. It never returns environment-variable names or values to the browser. Production secrets must be installed through the deployment platform, never through the admin interface, source code, GitHub, logs, or client bundles.

## Migration

`migrations/021_outbound_sales_foundation.sql` creates only `outbound_*` tables, indexes, triggers, and functions. It does not alter or reference an existing application table. The migration is never executed by a request handler.

The default row in `outbound_settings` is safe for a first deployment. Prospect and opportunity status changes receive database-level audit entries, and the generic audit table is append-only. A partial unique index permits only one initial outbound message per prospect. Provider-record, canonical-domain, deterministic-fingerprint, and normalized-email constraints create independent duplicate barriers.

Opportunities and attributed orders are stored only in outbound tables. `outbound_order_attributions.source_order_id` is an isolated identifier with no foreign key, trigger, or write path into the existing `orders` table; later attribution work can observe existing orders without changing checkout or order creation.

Apply the migration only through the approved production migration process after reviewing the SQL and taking the normal database backup. The UI reports `schemaReady: false` and disables writes until it is applied.

### Preview validation and rollback

`scripts/verify-outbound-sales-migration.cjs` is the guarded live-catalog contract suite. It accepts only `OUTBOUND_TEST_DATABASE_URL` or an owner-only URL file, requires an explicit preview/staging label and matching Neon endpoint ID, and never falls back to the application's ordinary database variables.

The `--rollback-cycle` mode snapshots every non-outbound public catalog object and legacy-table row count, applies migration 021, verifies all outbound tables/indexes/constraints/triggers/functions/defaults and audit behavior, runs the outbound-only rollback, confirms that no outbound object remains, and reapplies the migration. Any change to a non-outbound schema object or row count fails validation.

`migrations/021_outbound_sales_foundation.rollback.sql` is transactional, names only objects created by migration 021, and deliberately avoids `CASCADE`. It destroys outbound-only data and must not be run on production without an approved rollback and retention decision.

## Provider architecture

All discovery and verification providers must implement the adapter contract in `netlify/functions/_shared/outbound-sales/providers/contract.cjs`, including an explicit `licensed_api` or `first_party` acquisition mode. Provider records normalize into the same internal prospect shape before core processing.

Phase 1 includes metadata for planned licensed providers but no operational adapter. Prohibited scraping sources are not implemented.

## Job foundation

`outbound_jobs` supports durable deduplication, priorities, delayed execution, bounded attempts, leases, `FOR UPDATE SKIP LOCKED` claims, exponential backoff with jitter, and dead-letter state. No scheduler or worker entrypoint exists in Phase 1.

## Budget foundation

Costs are stored in micro-USD so sub-cent API usage remains measurable. Reservations run in a database transaction, serialize on the locked settings row, and include both reserved and committed current-month usage before accepting another cost. Reservation keys are idempotent and cannot be reused with different cost data. OpenAI reservations are rejected above the one-cent per-prospect application ceiling.

No ordinary OpenAI project key can modify or reliably reconcile organization billing. The local ledger is authoritative for application shutdown; the dedicated OpenAI project limit remains the provider-side backstop.

## Admin endpoints

- `GET /.netlify/functions/outbound-sales-status`
- `GET|PUT /.netlify/functions/outbound-sales-settings`

Both require the existing signed admin session. Mutations also require a same-origin request and optimistic settings version. Responses use `Cache-Control: no-store` and never contain secret values.

## Phase 1 acceptance commands

```bash
npm run test:outbound-sales
npm test -- --run
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Phase 2 must not begin until Phase 1 is reviewed and explicitly approved.
