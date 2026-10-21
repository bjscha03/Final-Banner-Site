# Daniel dedicated sales agent

Private CRM at `/daniel` and authenticated API at `/api/daniel/*`. The app uses only `DANIEL_DATABASE_URL`; it never falls back to the storefront connection. The preview uses the `daniel_preview` database on Neon branch `br-morning-hall-aetn7xh8` with restricted runtime role `daniel_preview_app`.

## Implemented workflows

- Server-side owner sign-in, HttpOnly secure sessions, CSRF and host validation, login throttling and logout.
- Corporate accounts, verified contacts, opportunity stages, ownership, notes, next actions, JSON batch import and export.
- AI-generated introductions and replies grounded in a versioned knowledge base. Exact-message review, revision invalidation, approvals and rejection.
- Durable outbox, atomic daily reservations, worker leases, deterministic Message-ID and held ambiguous deliveries. Preview deliveries are explicitly simulated and never passed to Gmail.
- Gmail OAuth with PKCE, state binding, encrypted offline tokens, verified sender aliases, paginated initial reconciliation and incremental history synchronization. Unknown personal mail is not stored.
- Suppression on unsubscribe/decline, queued-message cancellation, duplicate inbound protection and follow-up cancellation on reply.
- Disabled-by-default routine automation can approve grounded non-exception replies and follow-ups. Introductions and exceptions stay in the owner queue. Preview automation only simulates delivery.
- Follow-up tasks at five business days, maximum two unanswered follow-ups; daily caps and Eastern weekday sending hours.
- Task completion, conflict-checked meeting scheduling, UTC calendar export, audit history and daily reporting.
- Authenticated background jobs with durable run status and replay protection; the dashboard polls completion.

See [VALIDATION.md](./VALIDATION.md) for the 38-test suite and deployed verification evidence. The deployed API, desktop browser and mobile checks pass. Actual Gmail mailbox verification still requires the dedicated account grant.

## Run / test

```
node --test server/daniel-agent/*.test.mjs server/daniel-agent/tests/*.test.mjs
node --env-file=.env.daniel-runtime server/daniel-agent/tests/deployed-api.mjs
DANIEL_TEST_BASE=https://deploy-preview-655--bannersonthefly.netlify.app DANIEL_TEST_AI=true node --env-file=.env.daniel-runtime server/daniel-agent/tests/deployed-api.mjs
node --env-file=.env.daniel-runtime server/daniel-agent/tests/browser.mjs
npm run build
```

`migrate.mjs` applies the two versioned migrations only to the explicitly configured dedicated connection. `provision-preview.mjs` is a one-time restricted-role provisioning command, not a build hook. Never put database owner credentials in runtime configuration.

## Deployment and Gmail authorization

The PR preview reuses existing Netlify infrastructure and OpenAI configuration. Only new `DANIEL_*` variables are configured for deploy-preview scope. `DANIEL_ALLOWED_HOST` restricts these endpoints to the dedicated preview host. Production storefront code and existing automation are unchanged.

Gmail requires a new account grant. Register the exact redirect displayed in Settings on the existing Google OAuth client, then use Connect Gmail while signed in as the owner. The mailbox must have an accepted `info@bannersonthefly.com` sender alias. Existing Google website sign-in is not Gmail authorization. Verify a controlled real-mail round trip before cutover; simulation cannot prove external delivery.

## Cutover lock

Live mode requires all three server values: `DANIEL_AGENT_MODE=live`, `DANIEL_CUTOVER_APPROVED=true`, and Netlify `CONTEXT=production`. The UI cannot set them. The scheduled function exits without those conditions. The existing hourly Daniel automation remains untouched. No production activation is authorized until the completed system is tested and Brandon approves cutover.
