# Site issue monitoring

The live admin at `/admin/site-issues` shows operational reports from the storefront. Other admin pages show a new-issue banner. The log refreshes every 30 seconds while visible, and supports marking reports reviewed without deleting the evidence. Use **Send monitoring test** to verify the capture endpoint, durable storage, and admin read path together.

Coverage includes artwork upload errors, the upload watchdog, local artwork preview failures, existing Stripe/PayPal technical checkout diagnostics, React error boundaries, and uncaught JavaScript errors/rejections. Known payment declines, ordinary validation errors, deliberate cancellation, and successful uploads do not create incident reports. Existing Clarity/GA4 events continue independently.

Each report contains a random session ID, timestamp, a normalized page category, coarse browser/device/OS, and allowlisted diagnostic codes (upload phase, file type/size bucket, elapsed time, and HTTP status where available). It never intentionally captures raw exception messages, customer field values, uploaded artwork, filenames, payment IDs, query strings, or full stack traces. Source locations are restricted to built JavaScript assets. The reported deploy identifies the receiving server release; cached client tabs can be older.

Reports are stored in the production-only `site-issues-v1` Netlify Blobs store. Admin reads/updates use the existing signed admin session, reject preview access, and are not public. Public ingestion validates origin, event type and size, with platform IP limits and browser burst limits. Retried IDs use atomic create-only writes. Test/known internal traffic is displayed separately and does not increment the customer alert count.

The browser keeps at most 20 sanitized reports in session storage, retries transient delivery failures up to three times, and retries when connectivity returns or the tab becomes visible. Monitoring requests never block upload/checkout completion. If JavaScript cannot run, the tab is closed before delivery, or the network/server remains unavailable, capture is not guaranteed. Successful uploads that took a long time but did not error are not incident reports.

The admin shows the latest 200 reports within 30 days. A daily scheduled cleanup removes older reports. ETags avoid re-reading unchanged records on admin refreshes. No Neon database queries, emails, SMS, or push alerts are added by this feature. Off-site notifications require a separate configured destination.
