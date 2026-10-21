# Daniel Sales Agent — dedicated service
The dedicated agent lives under server/daniel-agent, with a guarded Netlify endpoint and isolated daniel_sales schema. It does not alter checkout, orders or existing supplier relationships.
## Implemented
- SQL tables for accounts, contacts, opportunities, messages, tasks, limits, approvals and audits
- OAuth Gmail adapter (requires independently authorized credentials)
- Shadow inbox processor with provider-message deduplication and classification
- Supplier exclusion, daily send eligibility, follow-up limits, explicit escalation rules
- Protected endpoint /api/internal/daniel-agent/run
- Node policy and operations unit tests
## Not production ready
Outbound execution is deliberately disabled; no live provider credentials, development database migration, authenticated owner dashboard, complete Gmail history synchronization, durable outbox, verified reply threading, or real provider delivery test has been completed. Inbound suppression events are flagged for review rather than trusting spoofable sender headers. The current shadow polling is bounded and does not guarantee completeness.
## Test
node --test server/daniel-agent/*.test.mjs
## Required before cutover
Provision isolated Neon development DB and restricted role, OAuth grant, strong endpoint secret; apply migration and test; implement robust inbox history cursor/pagination and provider retries; build CRM dashboard and authenticated approval workflow; integrate transactional outbound outbox with idempotent send reconciliation; test end-to-end with controlled mailboxes and get explicit owner approval. Keep the existing hourly automation running until the new system has passed cutover checks.
