# Admin AI Banner Studio

The existing **Designer → Create with AI** entry remains Admin-only. The pre-existing `/admin/ai-designer` workspace is also protected. No public navigation or paid customer API access was added. The optional public copy/paste artwork help remains separate, hidden on mobile, and never blocks checkout.

## Design architecture

New designs use GPT Image 2 (`gpt-image-2-2026-04-21`, high quality) for the complete visual composition **including artistic lettering**. Earlier versions deliberately excluded generated text and overlaid two programmatic fonts; that produced accurate but visually generic typography. New image prompts request expressive, theme-specific lettering with exact approved copy, safe margins, and full canvas coverage.

GPT-5 mini extracts wording, plans edits, improves prompts on request, and inspects final artwork. Vision/OCR checks are probabilistic, so users must still review spelling, artwork and layout. Failed wording inspection blocks approval and allows one bounded image repair. There is no silent fallback to generic type on a new design.

Uploaded logos and up to three photos remain separate original-image overlays. The model does not redraw these assets. Original assets are resized proportionally and stay within safe bounds; small sources are not enlarged. Retained logo/reference thumbnails are visible outside the upload disclosure. A restored logo is intentionally retained until removed.

## Editing and recovery

Conversational edits use the current image as input. AI edits of older programmatic-text designs transition to integrated lettering; old versions remain available through undo. New AI lettering is raster artwork, not an editable font object. Wording, size, color and placement controls request an AI edit; typography cannot be guaranteed pixel-identical outside the requested region. Users compare before/after and accept or reject. Legacy programmatic text remains supported for saved versions and its manual changes do not call the image API.

The optional **Improve prompt with AI** action uses the existing text model. It writes a revised description without generating an image, preserves extracted exact wording, checks the 1,200-character budget, and offers a one-click undo. Planning summaries can be shortened to fit internal fields; printed wording is never truncated.

Drafts, assets and version history are stored in browser IndexedDB for 24 hours, scoped to the Admin user, product and size. Temporary master artwork and background versions use authenticated Cloudinary storage with expiry. Job references are session-bound. A client guard and persisted request identity prevent duplicate dispatch while a request is active and allow retry/recovery of interrupted responses.

## Print and order pipeline

The final master is JPEG quality 95 with 4:4:4 chroma sampling. A smaller JPEG preview travels in the UI response; approval fetches the stored master and passes it through the existing artwork upload path. Asset filenames contain the AI version ID. Cart, checkout, payment and production retrieval use the normal artwork records.

Final canvas dimensions follow the selected physical ratio within integer-pixel rounding, bounded by 8,000 pixels per edge and 24 megapixels. The output canvas PPI is checked, but resizing does not manufacture native image detail; inspect actual large-format artwork at intended viewing distance. Extreme ratios use a bounded outpainting pass. No AI-generated mounting hardware, mockup or white padding is requested.

## Operations

All endpoints require server-verified Admin access and retain origin, body-size and rate limits. Existing OpenAI and Cloudinary configuration is reused. No new recurring service was added. Rate limits are per runtime instance; public launch would require a separate abuse/cost review and explicit owner approval.

Admin diagnostics display model, dimensions, duration, repair status and an image-API cost estimate from returned usage. The estimate uses the existing configured model assumptions and excludes text planning/inspection costs; it is not a billing reconciliation. Artistic wording edits usually call the image model and therefore cost more than the old programmatic text edits. The two initial live designs showed approximately $0.38 each for image calls because each included an unnecessary text-validation repair; the capitalization check was subsequently corrected. This is an observed diagnostic estimate, not a universal per-design price. Prompt improvement calls only the text model. Funnel events are recorded through the existing analytics and an Admin-only server event endpoint, excluding prompt text and artwork bytes.

## Verification record

- 118 selected regression tests passed: AI/Admin authorization, cart ownership and recovery protections, provider errors, prompt guards, exact copy, legacy rendering scenarios, artistic text without fallback overlays, aspect ratios, master/preview separation, uploaded assets, geometry, public artwork help, pricing, cart and checkout payment integrity.
- Production build passed: 213 prerendered routes plus 404, metadata and sitemap validation.
- Focused AI TypeScript and component ESLint checks passed.
- Full-app typecheck remains blocked by pre-existing syntax errors in unrelated `BannerEditor.tsx` and `auth-insecure.ts`.
- Local desktop/mobile Playwright execution was blocked by missing Chromium and failed browser downloads. This is not a passing mobile runtime check.
- Live testing verified the Admin entry, restored drafts/assets, selected dimensions, material and promotional pricing. A live planning-length failure was found and fixed.
- Live artistic birthday and business banners were generated and visually inspected; both use integrated lettering and the business logo remained intact. Prompt rewrite and undo passed. Standard upload, size changes, Fit/Fill/Reset and cart addition passed on the ad page. Live testing found overly strict capitalization checks, a restored-empty-draft synchronization bug, and standalone Admin cart recovery on reload; these were fixed with regression coverage. AI edit, master export and final cart/checkout rechecks are in progress. No paid production order has been placed by QA.
