# Outbound Sales Engine — Phase 3 validation record

> Historical scope: Phase 3 personalization has been incorporated into the completed Shadow Mode architecture. Use `outbound-sales-engine.md` and `outbound-sales-production-readiness.md` for the current system and activation runbook.

Phase 3 adds grounded OpenAI personalization previews to the isolated outbound subsystem. It remains Shadow Mode only. It can create a research summary, subject, email draft, and recommended follow-up timing for an already qualified staging prospect. It cannot send email, schedule outreach, receive replies, attribute orders, or generate automatic responses.

## Safety boundary

- `PHASE_ALLOWS_LIVE_SENDING` remains `false` in code.
- OpenAI execution is rejected when the deployment context is `production`, even if every environment and database flag is hostile or misconfigured.
- Generation is authenticated, same-origin, rate-limited, and admin-triggered. There is no scheduler, background worker, provider-discovery endpoint, Resend sender, webhook receiver, or follow-up worker.
- The global `OUTBOUND_SALES_ENABLED` gate, locked Shadow Mode, database `shadow_generation_enabled` setting, emergency pause, dedicated credential status, and approved test/staging context must all agree before a request.
- The OpenAI client reads only `OUTBOUND_OPENAI_API_KEY`. It never reads the AI Banner Designer's `OPENAI_API_KEY` or any transactional Resend credential.
- Secret values are not accepted from the browser, written to the database, included in prompt metadata, returned in responses, or logged.
- Prompts contain public business evidence, not the discovered email address. Requests set `store: false` and install no model tools.
- Every contact remains `send_eligible=false`; generated messages remain `status='draft'` and have no send or Resend identifier.

## Staging configuration

Use a dedicated outbound-sales OpenAI project with independent billing and a strict provider-side project limit. The recommended project limit is $10 and the database-backed local monthly stop defaults to $8.

Only an approved test, development, deploy-preview, or branch-deploy environment may set:

- `OUTBOUND_OPENAI_API_KEY`: the dedicated outbound-sales key, installed server-side only;
- `OUTBOUND_PHASE3_SHADOW_EXECUTION_ENABLED=true`: the Phase 3 non-production execution gate;
- `OUTBOUND_SALES_ENABLED=true`: the global subsystem gate.

The database `shadow_generation_enabled` setting defaults to `false` and must be enabled through the authenticated admin controls for the isolated staging validation. Never install the outbound key in a production-scoped environment variable during Phase 3.

## Cost-first generation contract

The engine uses the pinned `gpt-5.4-mini-2026-03-17` model through one Responses API request per unique research state, with reasoning disabled and low output verbosity to control cost. A strict JSON schema returns only:

- grounded research summary;
- unique subject;
- opening, value, and call-to-action segments;
- cited evidence IDs;
- recommended follow-up delay;
- short personalization notes.

Deterministic code supplies the greeting, sender signature, branded HTML, experiment assignment, cost calculation, content hash, and follow-up timestamp. The application reserves the local monthly budget before invoking OpenAI, using UTF-8 bytes as a conservative input-token upper bound, records complete integer input/cached-input/output tokens afterward, and rejects any projected single-prospect cost above $0.01. A response with missing or inconsistent usage is failed and charged conservatively against the local ledger. This is stricter than the average-cost target of $0.02 per qualified prospect.

The generation key includes the prospect, research content hash, prompt version, output schema version, model, and deterministic test assignments. An unchanged research hash returns the stored preview without another OpenAI call. Materially changed research marks the old personalization stale and produces a new key.

## Grounding and output validation

Website content is wrapped as untrusted evidence. Deterministic filtering removes instruction-like or credential-exfiltration text before prompting. The system prompt also explicitly forbids following instructions in website text, inventing facts, claiming customer history, promising delivery dates, or using placeholders. The response is rejected unless it:

- references valid stored evidence IDs;
- grounds the research summary and opening in multiple meaningful cited-evidence tokens and the subject in at least one;
- contains no HTML, mail-merge placeholder, reply/forward prefix, or unsafe subject punctuation;
- stays within the approved subject and email-length bounds;
- returns a follow-up delay between two and ten days.

Only deterministic escaped HTML is stored for branded preview rendering.

## Migration and rollback

`023_outbound_shadow_personalization.sql` requires migrations 021 and 022. It only adds columns and indexes to existing `outbound_*` tables. It does not create a scheduler, trigger, function, legacy reference, or external-action path.

Use only an isolated writable Neon preview branch:

```sh
export OUTBOUND_TEST_DATABASE_URL_FILE=/secure/path/phase3-neon-url.txt
export OUTBOUND_TEST_DATABASE_CONFIRMATION=isolated-neon-preview
export OUTBOUND_TEST_BRANCH_LABEL=outbound-phase3-personalization-validation
export OUTBOUND_TEST_ENDPOINT_ID=ep-example-preview

node scripts/verify-outbound-sales-migration.cjs --phase3-apply
node scripts/verify-outbound-sales-migration.cjs --phase3-verify
node scripts/verify-outbound-sales-migration.cjs --phase3-rollback-cycle
```

The Phase 3 rollback drops only migration 023 indexes and columns, uses no `CASCADE`, verifies all Phase 2 objects remain, compares every non-outbound catalog object and legacy-table row count, reapplies migration 023, and revalidates its defaults.

## Admin endpoints

- `POST /.netlify/functions/outbound-sales-personalize`
- `GET /.netlify/functions/outbound-sales-activity`
- `GET /.netlify/functions/outbound-sales-activity?format=csv`

All require the existing signed admin session. The mutation additionally requires same-origin validation. Responses use `Cache-Control: no-store`, omit internal generation keys, and always report `shadowMode: true` and `liveSending: false`.

## Validation

```sh
npm run test:outbound-sales
npm run test:outbound-sales:database
npm run lint
npx tsc --noEmit
npm run build
```

Authenticated visual QA must cover the Prospect Queue, generated preview, Email Activity, Cost Analytics, Settings, migration-missing state, desktop and mobile navigation, and Return to Orders. Network responses, rendered HTML, logs, and built client assets must be scanned for the temporary credential before it is removed from the staging environment.
