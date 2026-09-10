# Google Ads production configuration

Last verified: 2026-09-04

## Verified Google tag destination

- Google Ads tag ID: `AW-17665878635`
- Production Netlify variable: `VITE_GOOGLE_ADS_CONVERSION_ID=AW-17665878635`

The tag ID was verified against the Google Ads account setup notice for Banners On The Fly. It is intentionally documented because it is a public browser-side identifier, not a secret.

## Purchase conversion requirement

The direct purchase conversion also requires the conversion-action label assigned by Google Ads:

- `VITE_GOOGLE_ADS_PURCHASE_LABEL=<Google Ads purchase conversion label>`

The application sends purchases to `AW-17665878635/<label>`. The label must come from the active Purchases/Sales conversion action in Google Ads and must never be guessed.

## Release rule

A production analytics release is not verified until all of the following are true:

1. Both production variables are present during the Vite build.
2. A production build has completed after either variable was changed.
3. The Google tag destination is present on customer-facing production pages.
4. A controlled paid-order test records a Google Ads attempt without `configuration_missing` in `purchase_analytics_audit`.
5. Google Ads tag diagnostics confirm the purchase event was received.

Missing purchase-conversion configuration is a release-blocking analytics defect, not a harmless optional state.
