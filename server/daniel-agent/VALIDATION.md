# Daniel readiness and verification — 2026-10-21

## Result

The deployed dedicated agent passes automated, browser and real Gmail acceptance tests. Production cutover is **not authorized or activated**. The remaining account decision is moving the existing Google OAuth application out of Testing and renewing its grant for ongoing operation; Testing refresh tokens expire after seven days. No production-readiness claim relies solely on simulated mail.

## Verified preview

- Preview: https://deploy-preview-655--bannersonthefly.netlify.app/daniel
- Runtime commit: `798790cd44ee154d51044bafb2ab077b42eadb81`.
- Real-mail acceptance deployment: `6ad8e700064787a9e816f078`, verified ready.
- Final deployment after closing the test window: `6ad8e8b569a2e11420176770`, verified ready at the same runtime commit.
- Draft PR: https://github.com/bjscha03/Final-Banner-Site/pull/655 (unmerged).
- Later README, acceptance-harness and validation changes do not change application runtime.

## OAuth repair

The actual preview authorization request used the existing BOF Google client `294570446868-qpltmq64mg8djisbit61lm135v572vv5.apps.googleusercontent.com` in project `banners-on-the-fly`. Its callback was missing from that client's authorized redirect URIs.

Added exactly:

`https://deploy-preview-655--bannersonthefly.netlify.app/api/daniel/oauth/callback`

Preserved the existing storefront callback and localhost callback; no new OAuth client was created and no client secret was changed. Added the owner as a test user. The owner granted Gmail read-only, Gmail send and basic-settings permissions. The subsequent 403 was traced to the Gmail API being disabled in the same project; enabling it and retrying the approved grant completed the callback successfully.

The dedicated application refreshed its own encrypted offline token successfully and verified the existing `info@bannersonthefly.com` send-as identity with Google status `accepted`. Tests used that actual dedicated application grant, not the ChatGPT Gmail connector for outbound delivery.

## Real Gmail acceptance

Only the owner's connected Hotmail inbox was allowlisted. No actual prospects were contacted. Conversation marker: `Daniel QA 1792598866745`; Gmail thread: `1a15f38383c33379`.

| Check | Observed result |
| --- | --- |
| Verified BOF introduction | Gmail ID `1a15f38383c33379`; receiving inbox confirmed delivery at 16:08:10 UTC |
| Concurrent workers and repeated send run | One introduction delivered; competing worker reported busy; repeat run sent zero |
| Recipient restriction | Approved non-allowlisted `example.test` fixture remained held; no provider delivery |
| Follow-up schedule | Original task scheduled five business days later; isolated fixture timestamps accelerated; early run left task pending |
| Due follow-up | Real AI-generated follow-up sent as Gmail ID `1a15f42b3a99e36b`; receiving inbox confirmed 16:19:35 UTC |
| Thread continuity | Follow-up used the original Gmail thread and canonical `In-Reply-To`/`References` headers |
| Actual inbound customer reply | Owner replied through Outlook to the BOF identity; Gmail ID `1a15f4302d41929d` received through existing BOF forwarding |
| Automatic AI response | Grounded product-list response passed routine policy without manual approval; Gmail ID `1a15f4a64e554b40`; receiver confirmed 16:28:00 UTC |
| Reply threading and deduplication | Same Gmail thread, `In-Reply-To` matched the inbound Outlook Message-ID; repeat sync created no new inbound or outbound message |
| Reply stops follow-ups | Pending follow-up cancelled when the actual customer reply was ingested |
| Actual unsubscribe | Owner sent unsubscribe through Outlook; Gmail ID `1a15f4ab65561613`; contact suppressed, pending tasks cancelled and approved future message blocked |
| Suppression enforcement | New draft rejected with HTTP 409; repeated worker run sent zero |
| Normal sync path | Deployed initial reconciliation scoped to this test conversation, then real Gmail incremental history; complete with no mailbox error; cursor advanced to `23687081` |
| Reporting | 3 actual controlled Gmail sends, 0 sales sends, 7 earlier simulated deliveries, 0 uncertain outcomes; 2 actual inbound test messages plus 9 earlier simulated inbound fixtures |

The initial sync acceptance fixture used an actual Gmail history ID and a query scoped to the test conversation to avoid importing unrelated owner mail. Production's 30-day known-contact reconciliation and pagination are separately covered by integration tests. No provider responses or delivery results were fabricated.

## Failures found and fixed during real testing

1. Gmail replaced the submitted RFC Message-ID. Daniel now persists Gmail's immutable provider ID before reading its canonical headers. Follow-ups use the actual canonical ID. A read failure after Gmail accepts a send is reconciled by provider ID without resending. The first test introduction was repaired through this reconciliation path.
2. The real forwarded reply carried both `SENT` and `INBOX`. Label-only filtering skipped it. Daniel now determines inbound direction from recorded outbound IDs and exact known senders, ignores drafts, and preserves duplicate protection. The existing real reply was then received and answered successfully.
3. Deployed Netlify functions did not expose the build-only `CONTEXT` variable. Daniel now reads the actual function deployment context explicitly, keeping preview/production send gates accurate.

## Automated and dashboard verification

- 44 automated policy, database integration, AI regression, job lifecycle, Gmail safety and DOM UI tests: all passed; no skips.
- Earlier real isolated-database HTTP suite: 12 workflow checks passed.
- Deployed HTTP suite: 13 workflows passed, including actual OpenAI generation, approval exceptions, concurrent jobs and idempotent simulated delivery.
- Chrome: owner sign-in, prospect creation, actual AI drafting, editing, approval, worker completion, inbound replay, suppression, scheduling, reporting, audit history and all nine views checked.
- Earlier observed mobile grid overflow fixed; client width and scroll width both 375px after correction. Desktop checked visually.
- AI cold introductions reject fabricated prior-contact claims; duplicate signatures removed and regression tested.
- Anonymous data endpoint requires authentication; anonymous HTML contains no CRM controls/data. Deployed inline script validated against CSP SHA-256.
- Existing application build and prerender validations passed. Final Netlify runtime build succeeded.
- Restricted Neon runtime role is `daniel_preview_app` in isolated `daniel_preview`; audit update/delete privileges revoked.

## Isolation, cleanup and existing automation

All acceptance contacts are suppressed. Dedicated agent paused; routine replies disabled. The expiring Gmail test window was explicitly closed after acceptance. Final deployed lock checks passed at 16:34 UTC: `liveEmailEnabled=false`, `gmailTestEnabled=false`, paused=true, auto_reply=false. Both test run and test evidence endpoints returned HTTP 403; anonymous CRM data returned HTTP 401 and anonymous HTML exposed no test-contact data. The test-window expiration is `2026-10-21T16:29:00.000Z` in deploy-preview/functions scope only.

No storefront, designer, checkout, payment, order or production supplier code or production environment variables were modified by this project. Live sending requires all three server gates: live agent mode, explicit cutover approval and production deployment context. The dashboard cannot activate these gates. Gmail authorization alone cannot activate emailing.

Existing automation `6ad58ee2f27c8191858a7ebc21f8572a` remains enabled on its 8 AM–8 PM Eastern hourly schedule and was not edited. Latest recorded scheduled run at 16:00 UTC completed with `no_update`. Its earlier detailed 15:00 UTC result reported shared Gmail quota limits; this is distinct from the dedicated BOF project, where actual sends succeeded. Current connector reads also succeeded during acceptance. Scheduler continuity is verified; no claim is made that an earlier quota warning guarantees later send capacity.

## Remaining Google account approval before cutover

Google Cloud Audience currently shows External / Testing with one owner tester. The existing application's branding now references the existing BOF home, privacy and terms pages. Google's Publish app confirmation is prepared but was not confirmed: it states that authorization becomes available to Google accounts beyond the tester list and that sensitive/restricted scopes may require verification.

The owner must approve that account configuration change and an ongoing grant for the same three Gmail permissions. The Browser confirmation policy requires action-time confirmation for materially expanded authorization availability or duration. No additional Gmail scope is proposed. After the production OAuth configuration and renewed token are verified, request separate explicit cutover approval before activating autonomous prospect sends or replacing the hourly automation.

Google reference: https://developers.google.com/identity/protocols/oauth2#expiration (Testing refresh-token expiration).
