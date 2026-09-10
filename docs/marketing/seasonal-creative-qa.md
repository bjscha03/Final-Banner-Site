# Seasonal creative approval gate

No seasonal campaign may move to `ready`, be merged, or be deployed until every item below passes on the final rendered homepage. One failure blocks the campaign and the evergreen hero remains live.

## Required pass/fail checks

- Image realism
- Signage accuracy and physically believable mounting
- Printed text spelling and legibility
- Product accuracy against the current catalog
- Campaign relevance within one to two seconds
- Product prominence
- Composition and safe crop zones
- Large desktop rendering
- Standard laptop rendering
- iPhone-width rendering
- Android-width rendering
- Brand consistency without forcing BOF colors into customer examples
- Brightness and visual mood
- Uniqueness versus recent campaigns
- HTML copy and CTA readability
- Accessibility and meaningful alt text
- Image dimensions, compression, responsive source selection, LCP, and layout stability

## Approval rule

All categories must pass. There is no weighted score. If repeated revisions do not pass, set the campaign to `blocked`, record the exact failure, and leave the evergreen hero active.

## Current approved source-art standard

Customer-example banners should look like the customer or organization's own professional brand. They do not need to use Banners On The Fly colors. BOF identity should come from the surrounding interface, typography, CTA treatment, and messaging while the photographed signage remains realistic for its use case.
