# Daniel dedicated sales agent

Private CRM at `/daniel` and authenticated API at `/api/daniel/*`. The app uses only `DANIEL_DATABASE_URL`; it never falls back to the storefront connection. The preview uses the `daniel_preview` database on Neon branch `br-morning-hall-aetn7xh8` with restricted runtime role `daniel_preview_app`.

## Implemented workflows

- Server-side owner sign-in, HttpOnly secure sessions, CSRF and host validation, login throttling and logout.
- Corporate accounts, verified contacts, opportunity stages, ownership, notes, next actions, JSON batch import and export.
- AI-generated introductions and replies grounded in a versioned knowledge base. Exact-message review, revision invalidation, approvals and rejection.
- Durable outbox, atomic daily reservations, worker leases, canonical Gmail Message-ID capture and held ambiguous deliveries. Normal preview runs are simulated. Explicit controlled Gmail acceptance jobs use an expiring server-side owner allowlist.
- Gmail OAuth with PKCE, state binding, encrypted offline tokens, verified sender aliases, paginated initial reconciliation and incremental history synchronization. Unknown personal mail is not stored.
- Suppression on unsubscribe/decline, queued-message cancellation, duplicate inbound protection and follow-up cancellation on reply.
- Disabled-by-default autonomous discovery researches public official sources, verifies published shared business contacts and exact evidence, independently reviews qualification and original introductions, and automatically approves routine introductions. Special pricing, contracts and unusual commitments remain in the owner queue. Routine grounded replies and follow-ups can also be automatic. Preview automation only simulates delivery unless an explicit owner-only acceptance job is authorized.
- Follow-up tasks at five business days, maximum two unanswered follow-ups; daily caps and Eastern weekday sending hours.
- Task completion, conflict-checked meeting scheduling, UTC calendar export and audit history. At 8 PM Eastern on weekdays, an idempotent daily report is actually emailed to brandon.schaefer@hotmail.com from the verified BOF identity, signed Brad. Ambiguous provider outcomes are held for reconciliation, never blindly retried.
- Authenticated background jobs with durable run status and replay protection; the dashboard polls completion.

See [VALIDATION.md](./VALIDATION.md) for deployed verification evidence. The automated suite contains 64 policy, integration, lifecycle, Gmail safety and UI tests. Actual provider acceptance is recorded separately from simulations.

## Run / test

```
node --test server/daniel-agent/*.test.mjs server/daniel-agent/tests/*.test.mjs
node --env-file=.env.daniel-runtime server/daniel-agent/tests/deployed-api.mjs
DANIEL_TEST_BASE=https://deploy-preview-655--bannersonthefly.netlify.app DANIEL_TEST_AI=true node --env-file=.env.daniel-runtime server/daniel-agent/tests/deployed-api.mjs
node --env-file=.env.daniel-runtime server/daniel-agent/tests/browser.mjs
npm run build
```

`migrate.mjs` applies the three versioned migrations only to the explicitly configured dedicated connection. `provision-preview.mjs` is a one-time restricted-role provisioning command, not a build hook. Never put database owner credentials in runtime configuration.

## Deployment and Gmail authorization

The PR preview reuses existing Netlify infrastructure and OpenAI configuration. Only new `DANIEL_*` variables are configured for deploy-preview scope. `DANIEL_ALLOWED_HOST` restricts these endpoints to the dedicated preview host. Production storefront code and existing automation are unchanged.

Gmail requires an account grant for this application. Register the exact redirect displayed in Settings on the existing Google OAuth client, then use Connect Gmail while signed in as the owner. The mailbox must have an accepted `info@bannersonthefly.com` sender alias. Existing Google website sign-in is not Gmail authorization. Verify a controlled real-mail round trip before cutover; simulation cannot prove external delivery.

## Cutover lock

Live mode requires all three server values: `DANIEL_AGENT_MODE=live`, `DANIEL_CUTOVER_APPROVED=true`, and Netlify runtime `context.deploy.context=production`. Build-only `process.env.CONTEXT` is not assumed to exist inside deployed functions. The UI cannot set these gates. The scheduled function exits without them. The existing hourly Daniel automation remains untouched. No production activation is authorized until the completed system is tested and Brandon approves cutover.

## Controlled Gmail acceptance

The existing BOF OAuth client is used, with the exact preview callback registered. Enable the Gmail API in that same Google Cloud project. The owner account must be a listed tester while the OAuth app is in Testing. Gmail read, send and basic-settings scopes are needed; settings access verifies the accepted BOF sender. Tokens are encrypted and are never exported by the API. Google Testing grants expire after seven days; permanent production operation requires an appropriate production OAuth configuration and a fresh grant.

Acceptance requires `DANIEL_GMAIL_TEST_RECIPIENTS` (one to three exact owner-controlled addresses) and `DANIEL_GMAIL_TEST_UNTIL` (a future expiration no more than 24 hours away), both in deploy-preview/functions scope. It also requires authenticated, same-origin `POST /api/daniel/test/gmail/run`. Regular preview cycles, scheduled functions, and production contexts cannot use this permission. Unknown recipients are held. Messages are marked `ai_metadata.gmail_test=true` before the provider call and counted separately from sales sends. Evidence endpoints expose only allowlisted test message headers, never tokens or arbitrary mailbox contents.

`tests/real-gmail-acceptance.mjs` is an explicitly staged harness: setup, intro, schedule, followup, reply, unsubscribe, sync, cleanup, locked, status. Set `DANIEL_QA_ADDRESS` to the connected owner inbox and use the private runtime environment. It uses the actual deployed API. Human/connector test replies must originate from that inbox. Only isolated test fixture timestamps are accelerated to exercise a due follow-up; the production five-business-day rule is unchanged. The sync stage requires the actual test-message `DANIEL_QA_HISTORY_ID` and limits initial reconciliation to the test conversation before exercising incremental history. Disable the test window after acceptance, pause the dedicated agent, and verify the locked stage.

## Autonomous acceptance

`tests/autonomous-acceptance.mjs` verifies independently discovered research, automatic introduction approval, actual owner-only Gmail sends, threaded follow-up and response, opt-out cancellation, the actual emailed report, and final closed test gates. The test worker may run while paused only through an expiring exact-recipient acceptance permission; persisted pause and automation settings never need to be enabled. The real researched address is preserved as evidence and never used as the test recipient. Business signatures use the centralized verified address, PO Box 368, Crestwood, KY 40014.
