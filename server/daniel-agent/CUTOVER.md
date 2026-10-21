# Daniel controlled transition

The production dashboard is `/daniel` on the existing BOF host. Production uses
only the `daniel_production` database on branch `br-lucky-butterfly-aespvjvv`;
the storefront database and existing storefront files are outside this change.

## Activation order

1. Reconcile the current hourly worklog, all original Gmail threads, suppressions,
   sending counters and already-sent daily reports. Preserve source records.
2. Deploy production with the dedicated database paused. Live server gates may
   be preconfigured, but the database pause must remain set through preflight.
   Verify `/api/daniel/preflight` while signed in: actual OAuth refresh, accepted
   BOF alias, restricted runtime role, isolated database, counts and pause state.
3. Complete initial Gmail synchronization while paused. Resolve every ambiguous
   send and any newly found opt-out before activation.
4. If not already configured, set production live/cutover server gates and
   redeploy while still paused.
   Verify the scheduled worker records a paused run and cannot send.
5. Confirm the hourly run has completed, migrate any final delta, then disable
   the old hourly automation. Verify it is disabled before resuming Daniel.
6. Enable routine replies and prospecting, resume, and inspect the actual first
   run and provider records. Never override the migrated daily counts to force
   a first send. Ten introductions already sent today means no further intros.

## Emergency pause

Dashboard → Settings → Pause agent. This prevents subsequent database claims.
A provider request already in flight may finish; inspect its immutable Gmail ID
and the uncertain-delivery queue before deciding whether anything was sent.
For an independent kill switch set production `DANIEL_CUTOVER_APPROVED=false`
and redeploy. Do not disable Gmail itself or change storefront email settings.

## Rollback

Pause the dedicated agent first. Confirm its worker lease has cleared and
reconcile all accepted/uncertain provider outcomes. Export any new contacts,
suppressions, original message IDs, follow-up dates, daily counters and report
IDs into the hourly worklog before re-enabling the old task. Otherwise leave
both senders paused rather than risk duplicate outreach. The preserved hourly
automation ID is `6ad58ee2f27c8191858a7ebc21f8572a`; restore its existing schedule
and prompt without changing limits. The pre-cutover storefront deployment is
`6ad8e1fae3607a3084590a29`. Database history is retained; never reset or drop it
as part of rollback. No automatic rollback may turn on both senders.
