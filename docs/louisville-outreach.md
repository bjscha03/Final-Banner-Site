# Louisville outreach

Admin: `/admin/louisville-outreach`. No list is imported or email sent during deployment.

- Paste CSV/TSV (Email, Name or First Name/Last Name, Company) or one email per line. Review errors before saving; 250 rows per import. Existing emails keep their original coupon and personalization.
- Each contact gets an 80-bit random, email-bound, single-use 25% coupon with no expiry. Only banner lines qualify. Existing checkout reservation and consumption enforce one redemption across payment retries. No stacking with other promotions or quantity pricing.
- The email's main button opens `/louisville-offer?code=...&start=1`, validates the stored coupon and applies it before navigating to `/design`. A separate copy link opens the same coupon page. Emails cannot run clipboard JavaScript; copying happens on the first-party page. Coupon links reveal no recipient name/email.
- Sending is manual, explicitly confirmed per selected batch (up to 20). Requests run one recipient at a time. All existing global suppression lists and the existing marketing unsubscribe endpoint apply. A `sent` status means provider acceptance, not confirmed inbox delivery.
- Campaign key: `louisville-neighbors-25-v1`. Unique campaign/email send records plus stable Resend idempotency keys prevent duplicate sends. Unconfirmed requests can retry after five minutes and within 23 hours of first attempt. Older uncertain deliveries require provider reconciliation; they must not be blindly resent with a new key.
- Contact and coupon rows are inserted in one database statement. Marketing state remains in the existing Neon database. The admin endpoint adds only the `louisville_outreach_contacts` table; no existing discount schema constraints change. The campaign maps to `banner_lines` in the shared validator and matching client/server totals.

## Apple Wallet

Apple Developer enrollment and a Pass Type ID certificate are required. Admin contains the complete setup flow:

1. Download the certificate signing request. The server generates a 2048-bit RSA key and returns only the public CSR. Simultaneous requests share the same stored pending key.
2. In Apple Developer, register a Pass Type ID and issue its Pass Type ID certificate using this CSR.
3. Upload the `.cer` file in admin. The server checks the matching private key, Pass Type ID, Team ID, validity, and the signature against WWDR G4 fetched from Apple's fixed HTTPS certificate endpoint. It builds a signed pass before activating the configuration.

The private key is AES-256-GCM encrypted in a private, strongly consistent Netlify Blobs store (`bof-wallet-signing-v1`). Encryption uses `WALLET_ENCRYPTION_SECRET`, falling back to existing `AUTH_SESSION_SECRET` or `CLOUDINARY_API_SECRET`, with a purpose-specific key derivation. Preserve the selected secret or migrate the encrypted configuration when rotating it. No keys or certificates are returned from status endpoints or included in logs. Setup accepts no user-supplied URLs or trust anchors.

Deploy previews cannot read contacts, mutate Wallet setup, import contacts, send emails, or redeem production coupons. Production email sending remains disabled until a valid Wallet certificate is configured. Email preview remains available before setup.

Pass downloads use `application/vnd.apple.pkpass` and are signed with `passkit-generator`. Each pass has a stable serial number, coupon artwork, terms, code and QR link back to the coupon page. No PII is embedded. The coupon itself does not expire; certificate renewal is required to keep generating new downloads. Existing passes do not receive push updates; redemption availability is checked online when the coupon is used.

Local signing tests use a clearly isolated test CA to verify archive hashes, CMS signatures, fields, and image sizes. They do **not** establish that Apple Wallet accepts a production pass. After the Apple certificate is connected, download a real pass on an iPhone and verify Add, reopen, QR redemption, and checkout before sending a campaign.

## Verification

```
node --test netlify/functions/__tests__/louisville-outreach.test.mjs netlify/functions/__tests__/louisville-wallet.test.mjs netlify/functions/__tests__/first-order-admin-identity.test.cjs
npx vitest run --config vitest.ai.config.ts src/lib/louisvillePromotion.test.ts src/hooks/useAutomaticFirstOrderDiscount.test.tsx
npx vite build
```

The repository-wide TypeScript command currently hits pre-existing syntax errors in legacy unused source files (including BannerEditor.tsx and auth-insecure.ts). The production client bundle and focused tests are the relevant build checks for this change.
