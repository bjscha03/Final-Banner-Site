# Seasonal Campaign Studio — 2026-08-24 production brief

## Production window

The roadmap's 6–10 week production window is calculated from each campaign's configured start date. From 2026-08-24, the inclusive window is 2026-10-05 through 2026-11-02.

One campaign is newly due:

| Campaign | Roadmap launch | Roadmap expiration | Event window | Status |
| --- | --- | --- | --- | --- |
| Black Friday, Small Business Saturday & Cyber Monday | 2026-11-02 | 2026-11-30 | 2026-11-27–30 | Ready for draft review |

## Campaign strategy

**Audience:** retailers, restaurants, and local service businesses preparing storefront, entrance, pickup, and in-store messages for the Thanksgiving shopping weekend.

**Strategy:** Make a believable finished storefront banner the proof point. Lead with one verified offer and explicit dates, then use the supporting modules to show how a coordinated sign system attracts, directs, and changes over without keeping expired promotions in market.

Avoid generic red-and-gold holiday decoration, invented urgency, unverified price claims, trademark-dependent artwork, and crowded multi-offer signage. The example retailer is fictional and uses an original identity that is intentionally distinct from Banners On The Fly.

## Homepage copy

- Eyebrow: `Holiday weekend · Storefront sales · Pickup signage`
- Headline: `Make your holiday offer impossible to miss.`
- Description: `Bring Black Friday and holiday-weekend offers to the street with clear custom banners and directional signs.`
- Primary CTA: `Create a holiday sale banner` → `/design`
- Secondary CTA: `Explore vinyl banners` → `/vinyl-banners`

## Supporting modules

1. `Storefront sale banners` — Lead with one verified offer and clear dates so passing shoppers understand it at a glance. CTA: `Create a sale banner` → `/design`.
2. `Pickup & entrance directions` — Guide online orders and holiday traffic with matching entrance, curbside, and pickup signs. CTA: `Shop yard signs` → `/yard-signs`.
3. `Plan every changeover` — Sequence weekend offers, gift deadlines, and clearance messages so expired signage comes down on time. CTA: `Read the retail guide` → `/blog/holiday-retail-sale-banners`.

## SEO opportunity

The planned opportunity already exists as the published `/blog/holiday-retail-sale-banners` guide, so this campaign links to and merchandises that page instead of creating a duplicate article. The guide targets `holiday sale banners`, `Black Friday banner`, `storefront signage`, and related retail-planning intent, then connects readers to the banner configurator, storefront sizing, readability, installation, and QR-code guidance.

Recommended follow-through: retain the page's evergreen planning angle, add campaign analytics to the supporting-module link, and refresh the title/description only if search performance shows a clearer query opportunity. Do not create a second near-duplicate Black Friday article.

## Hero artwork

The customer example is the fictional `Northline Outdoor Goods`, using an original mountain-and-river identity in deep teal, pale citron, warm cream, and restrained coral.

- Desktop: 1400×875 responsive WebP; wide storefront composition with the finished banner concentrated in the right two-thirds for the redesigned homepage's copy wash.
- Mobile: 900×1125 responsive WebP; independently composed portrait photograph with the complete banner centered and readable rather than cropped from desktop.
- Banner text: `HOLIDAY WEEKEND SALE`, `NOV 27–30`, `30% OFF SELECTED STYLES`, `NORTHLINE OUTDOOR GOODS`.
- Product accuracy: 13 oz vinyl appearance, reinforced hems, evenly spaced metal grommets, taut zip-tie mounting, plausible railing attachment, natural tension, readable hierarchy, and realistic perspective.

## Homepage sequencing and expiration behavior

- Back to School remains active through 2026-09-07, then the approved evergreen hero returns from 2026-09-08 through 2026-09-20.
- Existing campaign handoffs remain Halloween through 2026-10-31, Veterans Day through 2026-11-11, and Thanksgiving through 2026-11-26.
- Holiday Sales is configured from 2026-11-02 through 2026-11-30. Because overlapping campaigns hand off by nearest expiration, Thanksgiving remains featured through November 26 and Holiday Sales takes over November 27–30.
- At the end of November 30 in `America/New_York`, Holiday Sales expires automatically and the evergreen hero returns unless a later campaign has passed creative review.
- A campaign remains ineligible unless it is explicitly `ready` and includes final desktop and mobile artwork.

## Roadmap status

- **Ready:** Halloween, Veterans Day, Thanksgiving, and Holiday Sales are prepared on the isolated seasonal branch.
- **Expiring:** Back to School ends after 2026-09-07.
- **Next due:** Christmas & Holiday Events launches 2026-11-15 and enters its 10-week production window on 2026-09-06.
- **Production:** Draft review only. Do not merge or deploy to production.

## Creative QA result

The first Holiday Sales desktop and laptop renders passed, but the first mobile integration failed human creative review: the redesigned horizontal orange wash left only a narrow sliver of the customer banner visible. The mobile seasonal hero was revised to place its dedicated portrait artwork in a full-width, crop-safe product panel immediately after the headline. The complete banner, organization identity, offer, dates, hems, grommets, and mounting now remain visible while the primary CTA stays in the first screen.

The final redesigned-homepage matrix passed 16/16 campaign/device combinations:

| Campaign | 1440×1000 desktop | 1280×800 laptop | 390×844 iPhone | 412×915 Android |
| --- | --- | --- | --- | --- |
| Halloween | Pass | Pass | Pass | Pass |
| Veterans Day | Pass | Pass | Pass | Pass |
| Thanksgiving | Pass | Pass | Pass | Pass |
| Holiday Sales | Pass | Pass | Pass | Pass |

Every render verified the correct desktop/mobile WebP, completed image decode, expected natural dimensions, headline containment, visible primary and secondary CTAs, three supporting modules, no horizontal overflow, no page exceptions, and no serious or critical WCAG A/AA violations. Human inspection also passed signage realism, finished materials, exact intentional text, mounting, perspective, relevance, prominence, safe cropping, brightness, uniqueness, readability, and continuity with the redesigned site.

- Holiday Sales desktop WebP: 1400×875, 148 KB.
- Holiday Sales mobile WebP: 900×1125, 128 KB.
- Campaign-selection tests: 7/7 passed.
- Targeted ESLint: passed.
- Production build: passed; 289 routes prerendered and verified.

## Final generation prompts

### Desktop

Photorealistic premium daylight photograph of fictional Northline Outdoor Goods, with one professionally printed horizontal 13 oz vinyl Holiday Weekend Sale banner installed across a storefront railing. Original mountain-and-river identity in deep teal, pale citron, warm cream, and restrained coral. Reinforced hems, evenly spaced silver grommets, taut black zip ties, natural vinyl texture, realistic scale and perspective. Exact text: `HOLIDAY WEEKEND SALE`, `NOV 27–30`, `30% OFF SELECTED STYLES`, `NORTHLINE OUTDOOR GOODS`. Wide 16:10 product-first composition with the complete banner in the right two-thirds and crop-safe breathing room. Bright late-morning retail scene. No BOF branding, trademarks, extra sale signs, paper appearance, impossible mounting, blocked text, gibberish, watermarks, heavy snow, or nighttime.

### Mobile

Separate photorealistic portrait 4:5 photograph of the same fictional retailer and campaign. Center the complete professionally printed and installed vinyl banner in the middle/lower frame with all corners, grommets, mounts, and exact text visible. Include enough storefront above to establish a real independent shop while keeping the banner dominant. Preserve the original identity, materials, color palette, daylight realism, and all desktop avoid constraints. Compose independently for mobile; do not crop the desktop image.
