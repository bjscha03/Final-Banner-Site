# Site issue audit — October 13, 2026

Reviewed all 33 customer reports and all 45 internal/test reports visible in the live admin's retained log. Eleven customer reports were still marked new. A report is historical evidence; it does not by itself establish that recovery failed or an order was lost.

| Report family | Finding and action |
| --- | --- |
| Failed dynamic imports across home, designer, blog, product, checkout and confirmation routes | Netlify atomic releases can remove a hashed asset from the main domain while an older document still references it. Pin Vite build assets to the immutable `DEPLOY_URL`, with CORS only on public `/assets/*`. Functions and customer requests stay on the current site origin. |
| Unable to preload CSS for the Google Ads page and realistic preview | The error classifier omitted Vite's actual CSS message. Include it in boundary/rejection recovery. Install recovery before speculative route imports, catch their rejected promises, and make installation idempotent. |
| Repeated failures after refresh or when browser storage is blocked | Use the cache-busting URL as a persistent recovery guard and extend the storage cooldown to five minutes. A recovery document never auto-refreshes again; the manual reload button remains available. |
| Small PNG upload timed out at ticket preparation | The October 8 report predates #589 (`6a6bd3a`), which fixed retry termination after a failed same-origin upload. Re-ran the regression simulating both the 20-second primary timeout and 15-second first-ticket timeout, then successful retry. |
| React hydration errors 418/422/425 | Historical reports predate #583 (`e47c970`). Verified all four delivery variants hydrate days-old HTML without mismatches and then show current delivery dates. |
| React lazy module `default` was undefined | Historical builds cancelled Vite's preload event, which let the import resolve undefined. #583 preserves the rejection; the regression remains passing. Older reports lacking messages match the same built React asset and source location. |
| Opaque `Script error.` | One customer report and ten internal iOS reports contain no source, stack, or line. Cause cannot be verified from this evidence. Keep these open; the admin now explains the diagnostic limitation. Do not silently suppress them or classify them as fixed. |

Validation before publication: 74 focused tests passed across chunk recovery, React error boundaries, issue reporting, small/large upload recovery, the upload watchdog, and delivery hydration. The production build with a deploy permalink passed and verified all three current prerendered product routes after incorporating the removal of city pages in #604. Deployment acceptance additionally requires public JS/CSS responses with usable MIME/CORS headers and live route loading.

The upload and hydration fixes were already present; this change does not alter prices, payments, shipping rules, or customer artwork. Preserved the newly approved homepage from #603 and cleanup from #604.

The main `/design` banner route now enables the same mobile redesign as `/google-ads-banner`: hero, discount display, priced size choices, reviews, artwork step, review/finishing step, and sticky action bar. Both routes use the same component and shared shipping notice. Desktop and specialized yard-sign/car-magnet flows retain their existing behavior; double-sided banner controls remain available in the shared mobile flow.

Compared both entry routes through the production renderer with the mobile breakpoint: their complete application HTML is identical (39,283 bytes), including the header, redesigned size selector, and double-sided controls.

Deployment permalinks remain available only while Netlify retains their deploys. Existing tabs from before this release still use their old asset URLs and may need one refresh. Long-lived tabs whose deploy has expired use the bounded recovery path.

References: [Netlify code splitting guidance](https://answers.netlify.com/t/support-guide-handling-code-splitting-issues-on-netlify/113158), [Vite load error handling](https://vite.dev/guide/build#load-error-handling).
