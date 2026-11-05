# Seasonal Campaign Studio — 2026-09-07 production brief

## Production window

The roadmap's 6–10 week production window is calculated from each campaign's configured start date. On 2026-09-07, the inclusive window is 2026-10-19 through 2026-11-16.

One campaign is newly due:

| Campaign | Roadmap launch | Roadmap expiration | Event window | Status |
| --- | --- | --- | --- | --- |
| Christmas & Holiday Events | 2026-11-15 | 2026-12-23 | December 1–23 | Ready for draft review |

## Campaign strategy

**Audience:** retailers, schools, churches, nonprofits, community groups, arts organizations, and event venues preparing programs, services, concerts, festivals, donation drives, and seasonal traffic messages.

**Strategy:** Lead with a believable finished event banner in a bright real venue setting. The hero demonstrates a readable event hierarchy—name, date, time, and organizer—while the supporting modules expand the campaign into services, school programs, entrances, parking, pickup, and directional signage. The example remains inclusive and event-led rather than using a generic product collage or an overdecorated holiday scene.

## Homepage copy

- Eyebrow: `Christmas events · Holiday programs · Winter promotions`
- Headline: `Bring every holiday gathering into view.`
- Description: `Welcome guests, share event times, and guide holiday traffic with bright custom banners and yard signs.`
- Primary CTA: `Design holiday signage` → `/design`
- Secondary CTA: `Explore vinyl banners` → `/vinyl-banners`

## Supporting modules

1. `Festivals & holiday programs` — Put the event name, date, and time where guests can understand the plan before they arrive. CTA: `Create an event banner` → `/design`
2. `Services, concerts & school events` — Share schedules and welcoming messages with signage designed to stay readable from the street. CTA: `Shop vinyl banners` → `/vinyl-banners`
3. `Parking, entrances & pickup` — Guide guests, deliveries, and seasonal traffic with matching entrance and directional yard signs. CTA: `Shop yard signs` → `/yard-signs`

## SEO opportunity

Build `/blog/christmas-holiday-banner-ideas` around `Christmas banner`, `holiday event banner`, `church Christmas banner`, `holiday program signs`, and `winter festival signage`. The guide should give organizers message-hierarchy examples, explain date/time readability from the street, cover entrance and parking sign placement, distinguish event banners from directional signs, and include a changeover checklist that prevents expired information from remaining displayed. Suggested title: `Christmas & Holiday Banner Ideas for Events, Churches and Schools`. Internally link to `/design`, `/vinyl-banners`, and `/yard-signs`.

## Artwork specification and generation record

The final customer example is fictional **Cedar & Bell Community Arts Center**, using an original cedar-sprig-and-bell identity in deep evergreen, cranberry, warm ivory, and restrained antique gold. The sign is a finished 13 oz vinyl banner with reinforced hems, evenly spaced silver grommets, individual black UV zip ties, realistic tension and ripples, correct railing mounting, and readable perspective.

Verbatim banner text:

- `WINTER LIGHTS FESTIVAL`
- `DECEMBER 5 • 4–8 PM`
- `CEDAR & BELL COMMUNITY ARTS CENTER`

The built-in image generator produced two independent compositions:

- Desktop: wide 16:10 venue view with crop-safe product prominence and quieter space at left for homepage copy.
- Mobile: 4:5 near-front composition with the complete banner centered in the short product panel.

The first mobile output was rejected because incidental wall signage contained malformed text. A targeted image edit removed only those auxiliary signs while preserving the approved banner, building identity, mounting, lighting, and composition.

Final responsive assets are metadata-stripped WebP:

- `public/images/seasonal-holiday-events-2026-desktop.webp` — 1400×875, approximately 142 KB
- `public/images/seasonal-holiday-events-2026-mobile.webp` — 900×1125, approximately 113 KB

## Sequencing and expiration behavior

- Campaigns remain ineligible unless explicitly `ready` and paired with final desktop and mobile artwork.
- Existing nearest-expiration selection keeps Holiday Sales active through 2026-11-30 even though the Holiday Events eligibility window begins 2026-11-15.
- Holiday Events takes over automatically on 2026-12-01 and remains active through 2026-12-23 in `America/New_York`.
- The approved evergreen hero returns on 2026-12-24 unless a later campaign passes review.

## Creative QA gates

Approval requires the final artwork and rendered homepage to pass:

- exact text and believable fictional identity;
- finished vinyl, hems, grommets, fasteners, railing mounting, and realistic perspective;
- bright, relevant, unique composition with no unrelated brand marks or malformed text;
- safe responsive cropping and product prominence at 1440×1000, 1280×800, 390×844, and 412×915;
- visible headline, delivery panel, primary and secondary CTAs, and all three supporting modules;
- no horizontal overflow, image decode failure, serious/critical WCAG A/AA issue, or page exception;
- optimized image dimensions and file sizes;
- targeted campaign tests, lint, and production build.

This work is review-only. It must not be merged or deployed to production without separate approval.
