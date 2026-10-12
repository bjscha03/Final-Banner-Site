# BOF Cash: implementation and launch notes

BOF Cash defaults to OFF. The owner authorized production rollout and a test email on October 2, 2026, after two functionality/design audits. Record the verified rollout status below before enabling the program.

## Customer flow

- An eligible customer opens an invitation and explicitly activates their account. Opening the email link does not consume it. The single-use link verifies the purchase email, reuses an existing profile or creates a non-admin account, and connects guest orders with that email.
- Returning customers can request a 15-minute sign-in link; no password is required. Existing admin accounts use their normal sign-in.
- BOF Cash is visible in the signed-in account menu and on My Orders. Before launch, the account card explains that rewards are coming soon; it never invents a balance. After launch, joined customers see available/pending credit and a direct link to share and open their wallet.
- The wallet puts sharing first: Facebook, text, email, native sharing, copy-link, copy-code, and a ready-to-send message. All shared messages use the public referral URL and disclose the reward; private activation links are never shared. Photos, posts, and reviews are optional.
- Invitations reuse the existing BOF logo and banner imagery. The primary email button says “Activate BOF Cash & Start Sharing.” A new customer explicitly activates before sharing; the account then opens Facebook, text, or email with their own public link. Text and email include an editable message, real code, link and reward disclosure. Facebook uses a server-rendered branded link card, with an optional customer-written caption. Admin can inspect the email on desktop/mobile and open “See customer sharing” without sending or copying anything.
- A friend can check out as a guest. Referral attribution lasts 30 days in the browser. Entering a valid referral code replaces the previous attribution.
- Signed-in members check their usable credit at checkout and apply it with one control. A better existing promotion preserves the credit. Product/service changes or expiration require a fresh quote before payment.
- A gold star labeled **BOF Cash member** appears in admin order views and the Customers tab only after activation. Invitations have a separate **Invited** label. The referral admin page filters joined/invited/not-invited customers and previews each selected send.

## Program rules

| Item | Rule |
| --- | --- |
| New friend's discount | 25% on eligible banners/signs, 10% on magnets; $25 maximum total |
| First-order minimum | $50 eligible merchandise; $75 if the cart includes magnets |
| Referrer's reward | $5 for $50–$99.99 eligible merchandise; $10 for $100+ |
| Reward timing | Paid order, then 14 days after shipment is first recorded |
| Wallet redemption | $50 eligible merchandise minimum; up to 25% banners/signs and 15% magnets, weighted for mixed carts |
| Financial floor | Both $5 and 15% contribution after supplier costs, supplier shipping, payment allowance, refund allowance, and any new reward |
| Allowances | 5% of tax-inclusive charges plus $0.50; 2% of net pretax merchandise |
| Exclusions | Finishing, stakes, services, tax, shipping, unsupported/uncosted options; no self-referrals or repeat-customer rewards |
| Credit | No expiration, cash withdrawal, or transfer |

The policy uses the same supplier cost calculator as admin. Stake supplier costs and double-sided banner supplier costs remain unconfigured and therefore fail closed for referral offers. No zero-cost assumptions are made. A wallet quote reduces the usable amount when needed to preserve the financial floor. The guard is a contribution estimate, not a guarantee of business profit: ads, fixed overhead, actual processing variances, and refunds still matter.

## Emails

The confirmation contains a small invitation section, while the standalone invitation is sent after recorded delivery or three days after the first recorded shipment if delivery is unavailable. Joined customers and marketing suppressions are skipped. Only orders placed after the configured launch timestamp enter this automatic flow; historical customers are selected manually in admin. Both invitation paths lead to the same account activation flow.

Manual sends preview up to 20 selected customers, require a final send action, use provider idempotency keys, and report sent/skipped/failed results. A campaign can invite an email only once. Ambiguous attempts older than the provider's idempotency window require delivery review rather than automatic resending.

## Money and payment behavior

- Quotes are server-priced and bound to a verified account, purchase email, exact priced cart, expiration, and one order. Browser-supplied discounts and account IDs do not authorize spending.
- Postgres row locks reserve the balance and first-customer benefit. Provider-confirmed payment creates the debit and pending reward exactly once.
- A declined Stripe Intent remains reserved because its client secret can still be retried. The wallet can cancel an unfinished Intent and release credit only after Stripe confirms cancellation. Background cleanup also cancels eligible abandoned Intents after 24 hours. In-flight or uncertain captures retain their hold.
- PayPal cannot capture after the reservation is released. Unstarted checkouts can be released; payment attempts already being verified retain their hold until a definitive result.
- Refunds return spent credit proportionally to cumulative successful provider-confirmed cash refunds. Stripe pending refunds do not return credit; if an initially successful refund later fails, the wallet receives a signed correction. Canonical Stripe reads use a database revision check and fresh-read retries to prevent concurrent or reordered snapshots from restoring stale credit. Any refund or dispute revokes the referral reward. A spent reward or corrected refund can offset future earnings; it never charges the customer's card. Dispute outcomes and exceptional adjustments require staff review.
- Admin budgets the full reward at issuance and releases that reserve when credit is spent, avoiding double counting the same credit. Wallet redemption still passes a separate cash-contribution guard. Refund/dispute orders are flagged for review in profit estimates.
- Scheduled maintenance completes missed bookkeeping and matures shipment-based rewards. The background endpoint requires the existing internal job secret. Preview deployments cannot send real invitations, claim real accounts, or mutate real wallets.

## Before activation

1. Review and approve the program and customer-facing copy. Keep `BOF_REFERRAL_ENABLED` unset/false during review.
2. Apply additive migration `045_bof_referral_program.sql` to an isolated test database first, then the production database during rollout. The existing marketing email tables must be present.
3. Verify production `AUTH_SESSION_SECRET` (or existing signing fallback), `RESEND_API_KEY`, approved sender/reply-to/physical address, and `INTERNAL_JOB_SECRET`.
4. Confirm the live Stripe webhook also subscribes to `charge.refunded`, `refund.updated`, `refund.failed`, and `charge.dispute.created`. Confirm the PayPal webhook also subscribes to `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, and `CUSTOMER.DISPUTE.CREATED`.
5. Complete provider sandbox checks against an isolated database: success, decline/retry, cancellation, partial/full refunds, dispute events, duplicate and reordered webhooks. Never point a preview or synthetic test wallet at production. Production wallet actions intentionally reject preview deployments.
6. Set `BOF_REFERRAL_LAUNCHED_AT` to the actual ISO launch timestamp and `BOF_REFERRAL_ENABLED=true` in production only. The launch timestamp also keeps existing payment bookkeeping running if new offers are later paused.
7. Verify one controlled activation, membership star in both admin locations, wallet redemption, and a delivery-follow-up candidate before sending the first selected customer batch. Review the first 30 completed referrals and actual fees/refunds before expanding.

## Verification

The focused suite covers supplier-cost rules, caps, unknown costs, owner/cart binding, serialized wallet spending, one reward per new customer, payment retries, duplicate settlements, shipment maturity, partial/full refunds, pre-settlement refunds, account reuse, expired/single-use links, preview and authorization guards, membership indicators, and reserve accounting.

The browser suite exercises real application routes with mocked APIs and blocks all external requests, live emails, and payments. It covers desktop/mobile activation, expired-link recovery, wallet redemption/removal, membership stars, branded invitation previews, channel-specific sharing and copying, account discovery/joining, guest referral attribution, and the inactive switch. CI also runs WebKit and the production build.

Existing unrelated large-banner promotion tests expect a retired 25% campaign and fail on the unchanged base branch. The application-wide TypeScript check also encounters pre-existing syntax errors in the unused `BannerEditor.tsx`. These are separate from the focused referral checks and production build.

Other baseline CI failures include Node 20 tests importing the existing uncompiled TypeScript profit calculator, four AI Designer logo-removal assertions, and a PayPal source-copy assertion for a billing-address label absent on the base branch. The new BOF workflow uses Node 24 for source tests and separately bundles the affected production functions for Node 20.

Provider references: [Stripe Charge](https://docs.stripe.com/api/charges/object), [Stripe cancellation](https://docs.stripe.com/api/payment_intents/cancel), [PayPal Payments v2](https://developer.paypal.com/docs/api/payments/v2/).

## October 2 activation and sharing revision

- Guest history now attaches after verified signup, password sign-in, OAuth, and BOF enrollment; only unowned orders matching the verified account email are linked. My Orders supports histories longer than 20 orders and recoverable pagination errors.
- Signed account state refreshes after activation, sign-out, and cross-tab changes. Expired credentials return the customer to secure email access; a previous account’s wallet cannot remain visible.
- The invitation uses one activation-first call to action. Sharing drafts include the actual code and link and remain editable. Social crawlers receive the real public offer metadata directly from the server.
- Record-only admin refunds revoke referral rewards but do not restore spent credit without provider confirmation. Maintenance queues skip completed work, advance past suppressed recipients, and retry transient sends safely.
- An owner-only isolated test at `/bof-cash-test` uses a dedicated database branch, credential, session, and storage. The configured test branch is checked on every request. Payment, shipping, and elapsed time are explicitly simulated; the pricing policy and wallet ledger are real. Test links never apply discounts to ordinary checkout.
- Local verification: 173 focused backend/auth/tracking checks, 51 desktop/Android/iPhone browser checks, complete production/prerender build, and 16 Node 20 function bundles passed. Separate provider handler suites cover Stripe and PayPal. Two independent code/design audit passes found and resolved the account, refund and maintenance issues above.

Deployment-specific database/provider checks and the final release identifiers are recorded when rollout finishes. Actual Facebook composer rendering must be distinguished from verified Open Graph metadata and automated share-button checks.

## Final provider and deployed checks

- Applied migration045 to a separate Neon branch cloned from the actual database. Real PostgreSQL testing caught and fixed profile varchar/text return mismatches that lightweight fixtures missed. Two concurrent reservations against one wallet allowed only the affordable reservation.
- The deployed private owner test passed activation, historical guest-order linking, public referral metadata, pending and available rewards, redemption, and duplicate request protection.
- Actual Stripe sandbox responses exercised success, decline/retry, cancellation, partial/full refunds and disputes. Actual PayPal sandbox responses exercised capture, decline/retry, void, and partial/full refunds. These canonical responses were passed through the application adapters and isolated database; this does not claim actual network webhook delivery or a real-money checkout.
- Stripe pending and subsequently failed refunds exposed a provider behavior that required the signed correction and concurrent-snapshot protection described above. Focused regressions cover these transitions, including already-spent credit and negative balances.
- Facebook's external sharing page retained the full referral URL and code but required sign-in. The signed-in composer and Facebook-rendered card remain outside this session's visual verification. Public server metadata and automated button checks are verified; no Facebook post was published.
- Deployed browser inspection caught the existing image integration's Cloudinary redirect. Both referral pages now permit the specific existing Cloudinary account in their image security policy; preview test images use the configured preview origin.
- Live Stripe and PayPal webhook event configuration is enabled. Production activation and the final owner email remain gated on the final isolated provider checks and deployment verification.

## Owner-approved activation exceptions

Migration 046 adds a revocable activation grant bound to an existing profile ID
and its exact normalized email. Grants are provisioned only through an authorized
server-side database operation; there is no public grant endpoint. They allow
secure access emails, invitation claims, and signed-in enrollment without a paid
order. Claiming still verifies the email, rejects admin profiles, and consumes a
single-use token. A renamed or replaced profile cannot inherit the grant.

Apply migration 046 before deploying the corresponding server functions. An
explicitly authorized grant records its reason in `bof_activation_exceptions`;
set `revoked_at=now()` to remove that activation exception. Revoking a grant does
not delete an already activated membership. Activation grants do not create
orders or cash, alter balances, or change referral/payment rules. Automatic and
promotional invitations continue to require a real paid order. Use the normal
`request-link` flow to send an approved owner's transactional activation email.

## October 7 reward notifications

- A qualifying paid referral now triggers a transactional email to the referrer from the existing paid-order background job. The message states the exact $5 or $10 reward is **pending**, explains availability 14 days after shipment, and links to `/bof-cash` without exposing a private activation token or the buyer's identity.
- Hourly BOF maintenance recovers missed notifications and sends one separate ready-to-use notice once the reward matures. Refund reconciliation runs first. Unpaid/test orders and reversed rewards do not qualify.
- `bof_reward_email_sends` is an additive, lazily initialized outbox. Its `(order_id, kind)` key, atomic claim, stored immutable email payload and provider idempotency key prevent duplicate sends. Transient failures retry after five minutes via maintenance; ambiguous attempts older than 23 hours are marked `review`, never blindly resent. Hard bounce and complaint suppressions are honored. Email failures do not block payment, customer confirmation or print-file generation.
- Verified production referral calculations using the owner's public code: $50/$75/$90/$100/$150 eligible banner subtotals returned $12.50/$18.75/$22.50/$25/$25 savings. These checks did not create orders, charge money or send customer invitations.
