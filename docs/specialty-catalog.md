# Displays & signs catalog

## Scope

This catalog adds 19 product families in four groups: banner stands and backdrops, advertising flags, event gear, and rigid signs and posters. It is separate from the existing banner, yard sign, and car magnet cart. Their product configuration, price calculations, discounts, shipping promise, and payment path are unchanged.

The new product pages collect variant, quantity, optional dimensions, project details, delivery address and location type, and artwork through the existing custom quote system. The admin quote view and email show the selected configuration. A customer receives a request number, then the team confirms the final quote and payment method. No payment is taken from the new pages.

## Retail price policy

The base retail figures in `src/lib/specialtyProducts.ts` were prepared from the signed-in supplier catalog on 2026-10-12. This is an initial retail policy, not a live supplier sync. The source supplier costs, margin target and account credentials are deliberately absent from this repository.

The shown prices cover the selected base configuration and quantity. Rigid signs and PVC display posters use a per-square-foot base; the poster has a $17.99 per-item minimum estimate. Hardware upgrades, print sides, walls, finishing, unusual sizes, artwork preparation, and volume pricing require a final quote. Review supplier prices and promotions before confirming any order. Reassess margin targets with the business owner before publishing these prices as a fixed online checkout price.

## Shipping and order handling

Ask for street, city, state, ZIP and whether the destination is a business or home. Use the supplier's shipping estimate for the exact configuration and destination, then add the chosen handling amount, applicable tax and any additional services to the final customer quote. The displayed product estimate excludes these amounts. Do not route a specialty item into the existing cart: its zero-shipping assumption and three-product server price allowlist cannot produce an accurate payable total.

B2Sign's white-label FAQ describes shipping estimates as reference values that require a full address and manual addition to the quote. It also describes the current white-label cart as an estimate request, with online payment and order sync still forthcoming. The team's own checkout would need an authoritative freight-rating integration and matching server-side validation before instant payment could be offered safely.

## Review before release

- Confirm the retail target, base configurations, supplier availability and promotions.
- Verify one real quote request, admin notification, customer confirmation and artwork upload in a Netlify deploy preview with test contact details.
- Check the production, delivery and tax details on the resulting quote before collecting payment.
- Review the catalog on a desktop and phone. The generated HTML, routes, metadata, sitemap, validation and build are checked locally, but a browser rendering check is still needed in a preview.

Supplier reference: https://newtest.b2sign.com/white_label_site_faq
