# Verification record — 2026-10-21

## Verified deployment

- Preview: https://deploy-preview-655--bannersonthefly.netlify.app/daniel
- Implementation commit: `12814979d17d510dc525c1077b374083472c4ad2`
- Netlify deployment: `6ad8d81537630c653959d881`, verified ready.
- The validation-document update after this commit changes no runtime files.

## Passed

- 38 automated policy, database integration, AI regression, job lifecycle and DOM UI tests. No failures or skipped tests.
- 12 HTTP workflow checks using the real isolated Neon database: authentication, prospect creation, approval, competing workers, exactly one simulated delivery, reply replay, suppression, reports, calendar export/cancellation, pause/resume and logout.
- 13 HTTP workflow checks against the final deployed preview, including real OpenAI reply generation, concurrent background jobs, idempotent simulated delivery and required quote approval.
- Deployed anonymous HTML contains only sign-in; authenticated CRM data returns 401 without a session. The actual script matches its CSP SHA-256 hash.
- Actual Chrome verification: sign-in, corporate prospect creation, real AI generation, message editing, owner approval, worker execution, simulated delivery, inbound simulation, suppression, cancellation of pending follow-ups and all nine dashboard views.
- Final deployed routine-reply automation: a synthetic product question generated a grounded real-AI reply, passed routine policy, and produced exactly one simulated delivery with no manual approval. Subsequent unsubscribe suppressed the synthetic contact. Routine automation was returned to its disabled default.
- Phone viewport check after fixing the observed grid overflow: document client width and scroll width both 375 pixels. Desktop layout inspected visually. Temporary viewport override reset.
- A fabricated prior-contact claim observed in an AI cold introduction was fixed; regression tests verify retry/rejection and duplicate-signature removal. Final deployed AI introduction accurately identified itself as unsolicited outreach.
- Existing application production build and bundled prerender validations completed successfully.
- Runtime database role is `daniel_preview_app` in `daniel_preview`; audit update/delete permissions are revoked.

## Required account authorization

The dedicated application has not received Gmail OAuth authorization. Automatic approval review blocked opening the Google Accounts authorization flow because explicit consent for this application's mailbox permissions is required. No grant was made or bypassed.

The application requests Gmail read-only, Gmail send and basic Gmail settings access (to verify the approved BOF send-as identity). The owner must approve the account grant before actual mailbox synchronization and controlled real-mail integration can be verified. Existing Google storefront sign-in and ChatGPT's Gmail connection do not provide this application's offline token.

Exact OAuth redirect: `https://deploy-preview-655--bannersonthefly.netlify.app/api/daniel/oauth/callback`. It must be registered on the selected Google OAuth client. The connected mailbox must have an accepted `info@bannersonthefly.com` sender identity.

Mock-provider tests cover pagination, history expiry, inbound replay, unsubscribe, bounce correlation and ambiguous sending. These do not prove the actual mailbox integration. Full mailbox acceptance remains blocked on authorization.

## Isolation and cutover

No real prospect email was sent by these tests. All synthetic contacts use `example.test`. Preview deliveries have null `sent_at` and explicit simulated status. No storefront, designer, checkout, payment, order or production supplier changes were made. No production environment variable was modified. The existing hourly Daniel automation was not edited or disabled. The draft PR remains unmerged. Live mode requires three explicit server gates and owner cutover approval; Gmail authorization alone cannot activate live sending.
