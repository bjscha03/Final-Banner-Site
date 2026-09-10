# Conversion Friction Audit — BannersOnTheFly (Google Ads Traffic)

Date: 2026-05-09  
Scope audited in codebase: homepage, `/google-ads-banner`, `/design`, `/political-signs`, product-type switching, upload/design flow, checkout/payment UX, and conversion-performance risks.

---

## Executive Summary (Why paid traffic is leaking)

The highest-risk conversion losses appear to come from **checkout payment clarity**, **builder complexity before commitment**, and **heavy visual assets on first paint**.

Top likely causes of ad-click abandonment:

1. **Card checkout is visually de-emphasized / hidden behind an expand step in some flows** while Stripe is also globally disabled in this build path. This can make users think card payment is unavailable or confusing.  
2. **The main build pages combine too many decision blocks before a user feels “done”** (size, material, quantity, options, upload, preview tuning, promo, etc.), creating cognitive overload for cold Google Ads users.  
3. **Large autoplay background videos and multiple heavy Cloudinary media assets in conversion-critical pages** likely hurt LCP/INP on mobile, especially on ad traffic from mixed connection quality.
4. **Trust + outcome reassurance is present but dispersed**; key objections (file quality checks, upload help, what happens if file is wrong) are not consistently placed right where users hesitate.

---

## Critical Conversion Blockers

### 1) Card payment discoverability/availability ambiguity
- **Page/component:** Checkout payment panel (`/checkout`).
- **Exact problem:** Stripe is hard-disabled (`ENABLE_STRIPE = false`), and payment UX depends on PayPal component/card-funding behaviors, while card messaging still appears as available. This can create trust mismatch and hesitation for users who prefer direct card fields.  
- **Why it hurts conversions:** Ad traffic expects immediate, obvious “Pay with card” path. Any ambiguity at payment causes sharp drop-off.
- **Recommended fix:**
  1. Re-enable Stripe when stable, or
  2. If intentionally off, make payment message explicit: “Card payments processed via PayPal card form on this page” with visual examples and single clear CTA.
  3. Do not collapse card path behind extra click when card is primary buyer preference.
- **File(s) to update:** `src/pages/Checkout.tsx`, `src/components/checkout/PayPalCheckout.tsx`, `src/components/checkout/StripeCheckout.tsx`.
- **Priority:** **Critical**.

### 2) High-friction pre-cart configuration depth on builder pages
- **Page/component:** `/google-ads-banner` and `/design` builders.
- **Exact problem:** Users are pushed through many sequential configuration interactions before emotional “progress certainty” (size/material/quantity/options/upload/preview edits + product-specific rules).
- **Why it hurts conversions:** Cold paid users need quick confidence path. Excess early choices increase abandonment before add-to-cart.
- **Recommended fix:**
  1. Default-and-hide advanced options behind “Customize more”.
  2. Keep one dominant CTA state (“Continue” / “Add to Cart”) with concise microcopy under it.
  3. Move secondary complexity (e.g., extra finishing nuance) post-add-to-cart upsell where possible.
- **File(s) to update:** `src/pages/GoogleAdsBanner.tsx`, `src/pages/Design.tsx`, `src/lib/builderSteps.ts`, `src/components/design/*`.
- **Priority:** **Critical**.

### 3) Mobile-first performance risk from conversion-page hero video + media weight
- **Page/component:** Homepage hero + builder hero sections.
- **Exact problem:** Full-bleed autoplay video in hero and several remote media assets in high-intent paths; likely expensive on mobile LCP and data.
- **Why it hurts conversions:** Slow first render from ad clicks directly reduces CVR and increases bounce.
- **Recommended fix:**
  1. Disable autoplay video on mobile + reduced-data contexts; use static poster image.
  2. Lazy-load non-essential below-fold media.
  3. Serve tighter Cloudinary transforms (explicit width + quality + format) for hero assets.
- **File(s) to update:** `src/components/HeroSection.tsx`, `src/pages/GoogleAdsBanner.tsx`, `src/pages/Design.tsx`.
- **Priority:** **Critical**.

---

## High-Impact Friction

### 4) Inconsistent “how fast / how shipping works” reassurance timing
- **Problem:** Messaging appears in multiple places, but user-critical reassurance is not always adjacent to key action moments (upload, add-to-cart, pay).
- **Impact:** Hesitation about turnaround and delivery certainty.
- **Fix:** Standardize a compact trust strip near each major CTA: “Printed within 24 hours and shipped free via next-day air.” + proofing/help statement.
- **Files:** `src/pages/Design.tsx`, `src/pages/GoogleAdsBanner.tsx`, `src/pages/Checkout.tsx`, `src/components/design/layout/TrustStrip.tsx`.
- **Priority:** High.

### 5) Political landing page sends traffic to general builder without reinforced campaign-specific guidance
- **Problem:** `/political-signs` CTA routes to `/design` with query params but does not strongly pre-answer quantity rules, artwork requirements, and campaign use-case expectations right at transition.
- **Impact:** Extra uncertainty before first step in builder.
- **Fix:** Add pre-CTA micro checklist + post-click anchor to first required action in builder.
- **Files:** `src/pages/PoliticalSigns.tsx`, `src/pages/Design.tsx`.
- **Priority:** High.

### 6) Checkout includes sign-up modal interruption risk for guests
- **Problem:** Guest users can be shown a delayed sign-up encouragement modal during checkout.
- **Impact:** Interruptive modal can reduce completion for ad-driven buyers seeking speed.
- **Fix:** Defer modal to post-purchase or shrink to non-blocking inline block.
- **Files:** `src/pages/Checkout.tsx`, `src/components/checkout/SignUpEncouragementModal.tsx`.
- **Priority:** High.

---

## Medium-Impact Improvements

### 7) Product-tab routing/state complexity could still create wrong-context opens
- **Problem:** Mixed `tab` vs `product` param handling and legacy values increase chance of context drift.
- **Impact:** Users may land on wrong product mode, then back out.
- **Fix:** Canonicalize to one query key (`tab`) everywhere and normalize redirects once.
- **Files:** `src/pages/GoogleAdsBanner.tsx`, `src/pages/Design.tsx`, cart “add another” URL builders.
- **Priority:** Medium.

### 8) Choice-rich copy density vs action density
- **Problem:** Some sections explain features heavily without immediate action tie-back.
- **Impact:** Attention diffuses, especially on mobile.
- **Fix:** Compress long descriptive text into scannable bullets under CTA blocks.
- **Files:** `src/pages/Design.tsx`, `src/pages/GoogleAdsBanner.tsx`, `src/pages/PoliticalSigns.tsx`.
- **Priority:** Medium.

### 9) Validation clarity can be more anticipatory
- **Problem:** Some constraints (e.g., yard sign increments) are strongly surfaced only at warning moments.
- **Impact:** Late surprises reduce trust.
- **Fix:** Show proactive rule hints directly at quantity controls before error states.
- **Files:** `src/components/design/YardSignConfigurator.tsx`, `src/lib/yard-sign-pricing.ts`, `src/pages/Checkout.tsx`.
- **Priority:** Medium.

---

## Performance Issues (Code-Level)

### 10) Hero video preload strategy is aggressive
- **Problem:** `preload="auto"` on homepage hero video forces high network/CPU cost.
- **Fix:** Use `preload="metadata"`, mobile/video disable, or static image fallback.
- **Files:** `src/components/HeroSection.tsx`.
- **Priority:** High.

### 11) Unoptimized static remote images in key funnels
- **Problem:** Several Cloudinary assets use varying transformations; not all are width-bounded for context.
- **Fix:** Enforce utility for all critical images with explicit `w_`, `q_auto`, `f_auto`, and `c_limit` by viewport bucket.
- **Files:** `src/pages/PoliticalSigns.tsx`, `src/pages/Checkout.tsx`, `src/pages/GoogleAdsBanner.tsx`, `src/pages/Design.tsx`.
- **Priority:** High.

### 12) Potential hydration/runtime overhead in mega-components
- **Problem:** Builder pages are very large single components with many states/effects; likely higher hydration/interaction latency.
- **Fix:** Split into route-level chunks or feature subtrees (config, upload, preview, pricing) with memoized boundaries.
- **Files:** `src/pages/Design.tsx`, `src/pages/GoogleAdsBanner.tsx`.
- **Priority:** Medium.

---

## Copy / Clarity Issues

### 13) Ensure shipping claim wording is consistent everywhere
- **Required approved phrasing:** **“Printed within 24 hours and shipped free via next-day air.”**
- **Audit status:** This exact framing already appears in checkout and should be standardized globally.
- **Fix:** Create single shared copy constant and consume everywhere.
- **Files:** `src/pages/Checkout.tsx`, `src/components/HeroSection.tsx`, `src/pages/Design.tsx`, `src/pages/PoliticalSigns.tsx`, `src/pages/Index.tsx`.
- **Priority:** High.

### 14) Missing “what if my file isn’t perfect?” reassurance at key upload step
- **Problem:** File proofing/support reassurance is not consistently adjacent to upload CTA.
- **Fix:** Add short guarantee block under upload zone: “Our team reviews files and contacts you if adjustments are needed.”
- **Files:** `src/components/ui/FileUploader.tsx`, `src/pages/Design.tsx`, `src/pages/GoogleAdsBanner.tsx`.
- **Priority:** High.

---

## Mobile Issues

### 15) Potentially heavy above-the-fold visuals on mobile ad clicks
- **Problem:** Video backgrounds and dense sections push key ordering controls down.
- **Fix:** Mobile-specific compact hero with immediate product select + upload CTA above fold.
- **Files:** `src/components/HeroSection.tsx`, `src/pages/GoogleAdsBanner.tsx`, `src/pages/Design.tsx`.
- **Priority:** High.

### 16) Sticky/fixed UI stacking can compete with primary CTA at checkout
- **Problem:** Sticky totals and dense payment cards may compete for viewport and attention on small screens.
- **Fix:** Prioritize one sticky action zone; reduce secondary visual chrome in payment area.
- **Files:** `src/pages/Checkout.tsx`.
- **Priority:** Medium.

---

## Checkout Issues

### 17) Payment method mental model is not single-path simple
- **Problem:** User sees PayPal module + card cues depending on flags; this may feel inconsistent.
- **Fix:** One explicit payment-primary path with optional secondary method, not mixed UI semantics.
- **Files:** `src/pages/Checkout.tsx`, `src/components/checkout/PayPalCheckout.tsx`, `src/components/checkout/StripeCheckout.tsx`.
- **Priority:** Critical.

### 18) Checkout trust proof can be stronger with real transaction confidence signals
- **Problem:** Generic trust badges present, but limited proof of order safety/help (e.g., upload support, proofing, issue resolution).
- **Fix:** Add concise “What happens next” 3-step assurance near payment submit.
- **Files:** `src/pages/Checkout.tsx`.
- **Priority:** High.

---

## Immediate Safe Fixes Applied

No code behavior changes were made in this audit pass. I documented prioritized findings and recommended implementation steps without introducing risky design or flow changes.

---

## Recommended Implementation Sequence (Highest ROI)

1. **Checkout payment clarity hardening (Critical).**
2. **Mobile performance trim on hero media + above-fold payload (Critical).**
3. **Builder simplification for first-time paid traffic (Critical).**
4. **Upload-step reassurance + proactive validation hints (High).**
5. **Copy standardization and trust messaging consistency (High).**

