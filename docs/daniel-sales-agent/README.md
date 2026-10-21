# Daniel — BOF Dedicated Sales Agent (foundation, not deployed)

## Scope and isolation
Standalone worker/service; **do not change existing storefront, designer, checkout, payment, production, admin, or order routes**. The existing hourly ChatGPT automation remains the only running workflow until an explicitly verified cutover. No sending enabled by this document.

## Business objective
Sell recurring Banners On The Fly orders to end-customer franchisees, chains, contractors, property groups and event organizations. **No supplier sourcing**. Proposed BOF Business Accounts positioning is not a live discount program; any nonstandard pricing/terms require owner approval.

## Proposed components
1. **Inbound intake:** verified email-provider push webhook (if supported) with polling fallback. Verify signature, dedupe provider event IDs and map messages to threads; treat attachments and email content as untrusted.
2. **CRM in Neon:** accounts, contacts, opportunities, conversations, messages, tasks, suppression list, approvals, campaign counters and audit events. Keep this in a dedicated schema with least-privilege role; no access to order/payment data unless explicitly needed and read-only.
3. **State machine:** researched → qualified → contacted → replied → interested → quote requested → quote pending approval → quoted → negotiation → won/lost/nurture. Each open opportunity needs owner, next action and due time.
4. **Reply engine:** classify and draft grounded answers from a versioned, owner-approved product/production/shipping knowledge base. Auto-send only routine factual replies and follow-ups within scope. Escalate pricing exceptions, contract/payment terms, disputes, capacity guarantees and sensitive issues.
5. **Outreach scheduler:** business-hour delivery, daily global caps of 10 qualified new introductions and 5 due follow-ups; maximum two unanswered follow-ups >=5 business days apart. Weekends no cold introductions. Atomic reservations prevent hourly worker races and double sends.
6. **Compliance:** verified professional contact provenance, sender identity, commercial postal address and opt-out, suppression on unsubscribe/decline/hard bounce, provider policy restrictions, reply-based unsubscribe handling, auditable logs. Never guess email addresses or use supplier/vendor-only inboxes.
7. **Reporting:** one branded daily owner digest, immediate exceptional-approval alerts, verified sent/reply/quote/opportunity metrics. Distinguish sent from delivered and won from revenue.

## Minimum schema (design only)
- accounts(id, name, website, location_count, source_url, segment, created_at)
- contacts(id, account_id, name, role, email, verified_source_url, consent_status, suppression_reason)
- opportunities(id, account_id, stage, product_interest, estimated_quantity, next_action, next_action_at, approval_state)
- messages(id, contact_id, thread_key, provider_message_id UNIQUE, direction, classification, status, sent_at)
- tasks(id, opportunity_id, kind, due_at, status, attempt_count)
- daily_limits(local_date, kind, reserved_count, sent_count, UNIQUE(local_date,kind))
- approvals(id, opportunity_id, request_type, proposal_json, decision, decided_at)
- audit_events(id, entity_type, entity_id, event_type, actor, created_at, metadata_json)

## Implementation gates
1. Inspect actual production repository architecture, existing email provider and Neon schema. Choose independent deployment, secrets and webhook path.
2. Implement isolated migrations, idempotent intake, safe classifications and draft-only shadow mode.
3. Test replayed webhooks, duplicate cron invocations, opt-outs, bounces, timezone/DST, weekend boundaries, injection attempts, and daily cap enforcement.
4. Verify sender and reply threading with owner-controlled test mailboxes; test end-to-end CRM and reporting.
5. Review production impact and operating costs. Require explicit owner approval before enabling automatic sends, replacing the hourly automation, or deploying a service with live external effects.

## Acceptance criteria
No duplicate sends; no messages to suppressed contacts; all sends have provenance and audit IDs; every live opportunity has next action; routine replies use verified facts; exceptions require approval; storefront unaffected; cutover reversible. No live claims until verified.
