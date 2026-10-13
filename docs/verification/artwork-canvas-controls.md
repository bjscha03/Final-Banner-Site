# Artwork controls: reference and acceptance record

Status: implemented in the existing designer and verified in automated browsers. Manual customer-artwork verification on the protected deployment remains pending. Production deployment requires owner approval.

## Canva reference inspected on 2026-10-13

Signed into the owner's existing Canva account and used a separate copy of a 48 × 24-inch, single-image design. The original design was not edited.

| Interaction | Evidence and behavior |
| --- | --- |
| Four corner handles | Canva's current help describes corner scaling. Live bottom-right drag reduced a 1243 × 621.5 CSS-pixel image to approximately 983.8 × 491.9 while its top-left stayed fixed. The opposite corner anchors the resize. Subsequent top-left, top-right and bottom-left drags also preserved the selected ratio and their respective opposite corners. |
| Top / bottom side pills | Each was dragged inward in the live editor. Only the corresponding crop boundary moved; lettering and image scale stayed unchanged. |
| Left / right side pills | Each was dragged inward. Content disappeared behind the boundary without distortion. Expanding the right edge recovered hidden content. Behavior after expansion beyond the complete source was not measured precisely. |
| Selection | Thin purple outline, circular white corners, narrow rounded white side pills. Active side turns purple. The DOM exposes separate corner and edge controls, with larger interactive areas than the visible handles. |
| Crop mode | Clicking Crop exposes a fixed visible window and a translucent view of the hidden image. Dragging the image changes the visible portion while the crop frame remains fixed. Done returns to normal selection. |
| Center snapping | Dragging close to the page center produced a selected center of (717.498, 481.495), matching the printable page center (717.5, 481.5). Exact magnetic threshold and mid-drag guide timing could not be measured through the available browser API. No guides remained after release. |
| Contextual delete | A compact floating pill below the selected image contained a trash icon alongside duplicate and other actions. Placement changes with available space; the owner's supplied screenshots also show it above the selection. |
| Mobile | Current official help was inspected, including mobile tabs and double-tap crop guidance. Native mobile Canva interaction and toolbar placement could not be inspected: this browser exposes no device-emulation/viewport API. Mobile behavior is not claimed to be an exact verified match. |

Sources: [Canva resize and crop](https://www.canva.com/help/resize-and-crop/), [frames and repositioning](https://www.canva.com/help/using-frames/), [photo editing tutorial](https://www.canva.com/design-school/resources/uploading-and-editing-photos/).

## Banner implementation decisions

- Corners scale proportionally about the opposite corner. Side pills crop one axis. Outward expansion reveals hidden pixels, then proportionally covers the larger window.
- Crop mode moves the underlying image and allows corner scaling inside a fixed window. Cropping records source-relative coordinates; it never overwrites or downsamples the original.
- Snap threshold is 6 CSS pixels for mouse, 10 for touch. This is an explicit product choice, not a claim about Canva's unpublished threshold. Guides use the printable area and disappear on release/cancel.
- Selection handles have 44-pixel touch targets. Pointer capture keeps drag ownership. Pinch and keyboard arrows remain available.
- Overlapping touch targets on thin artwork resolve to the closest visible handle. Short landscape viewports use a compact order bar, a height-limited canvas, and a full-size contextual toolbar; the complete work area is centered after upload or rotation.
- Undo/redo records a complete gesture. Delete has a visible undo action after the editor unmounts.
- The compact toolbar is clamped to the canvas width with reserved space above it. AI fitting remains in the primary fit controls. Hardware stays in finishing.
- Crop is included in preview signatures, uploaded preview rendering, cart restoration, finishing display, and original-based print rendering. Legacy uncropped signatures remain compatible.
- Yard signs retain their existing four corner controls; new crop controls are scoped to the single-artwork banner/magnet pipeline until yard-sign production serialization supports them.

## Verification

Tested commit: `02d55c0d85544fcd190d9182ca23cba607a64adb`. Application code is unchanged from `d8c66b8a788ec9003a130b161962eec2e441fdf9`; the subsequent change isolates a crop assertion from the center snap zone.

Preview: https://deploy-preview-614--bannersonthefly.netlify.app/google-ads-banner

[Browser matrix run](https://github.com/bjscha03/Final-Banner-Site/actions/runs/38479280973): **54 passed, 34 intentionally skipped, zero failures**.

| Project | Passed | Skipped |
| --- | ---: | ---: |
| Desktop Chromium | 9 | 2 |
| Desktop Firefox | 5 | 6 |
| Desktop WebKit | 5 | 6 |
| iPhone 15 Pro portrait | 10 | 1 |
| iPhone 15 Pro landscape | 5 | 6 |
| iPhone SE portrait | 5 | 6 |
| Pixel 8 portrait | 10 | 1 |
| iPad portrait | 5 | 6 |

The full interaction case runs in all eight projects. Additional photo/logo/transparent/wide-image cases run on representative desktop and phone projects; native Chromium touch events run on Pixel. Skips are these predeclared project filters, not disabled failures. Apple devices are WebKit device emulation, not physical-device testing.

Verified: all four proportional corners and opposite anchors; all four crop sides without stretching source pixels; cropped-content repositioning and scaling; temporary horizontal/vertical center guides; delete and undo, including desktop keyboard recovery; mobile touch drag without page scroll; dimension changes preserving the upload; finishing, pricing and cart restoration with the crop; and unchanged original upload bytes. Test uploads use repository photo/logo assets and generated transparent/12:1 PNG fixtures, with a local multipart receiver rather than live customer services.

- Focused editor/geometry/AI-fit compatibility suite: 59 passed. Mobile footer/shipping checks: 10 passed. Original-based PDF clipping checks: 2 passed.
- Latest regression workflow: 43 upload/editor tests, 334 checkout/order/email/tracking tests, and 219 preview/source-selection tests passed. Its four admin-browser failures match the pre-existing failures on PR #612; those checks were not disabled. The workflow therefore remains red and its later stages did not run.
- Production build: passed. Full-project TypeScript checking remains blocked by pre-existing syntax errors in the unrelated legacy `BannerEditor.tsx`.
- Supplied customer PNG checked locally through cropped print rendering: all 1303 × 2048 source pixels remained embedded; source bytes were unchanged. This does not substitute for its pending manual browser interaction check. Customer artwork is not committed to this repository.
- Desktop (35 seconds) and mobile (33 seconds) recordings were delivered privately. They show the actual designer with test artwork, are slowed 1.5× for visibility, and the mobile deletion state has an added 1.2-second viewing pause. Recorded application code is `d8c66b8`, identical to the tested application code above.
- Manual customer-upload check on the deployed preview remains blocked by authenticated Preview Access. Native mobile Canva behavior and its exact snap threshold remain unverified, as documented in the reference table. No production deployment or merge is authorized by this record.
