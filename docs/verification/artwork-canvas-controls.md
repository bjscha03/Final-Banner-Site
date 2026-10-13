# Artwork controls: reference and acceptance record

Status: preview work in progress. Production deployment requires owner approval.

## Canva reference inspected on 2026-10-13

Signed into the owner's existing Canva account and used a separate copy of a 48 × 24-inch, single-image design. The original design was not edited.

| Interaction | Evidence and behavior |
| --- | --- |
| Four corner handles | Canva's current help describes corner scaling. Live bottom-right drag reduced a 1243 × 621.5 CSS-pixel image to approximately 983.8 × 491.9 while its top-left stayed fixed. The opposite corner anchors the resize. Other corner directions were documented by Canva but not individually dragged in the reference session. |
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
- Undo/redo records a complete gesture. Delete has a visible undo action after the editor unmounts.
- The compact toolbar is clamped to the canvas width with reserved space above it. AI fitting remains in the primary fit controls. Hardware stays in finishing.
- Crop is included in preview signatures, uploaded preview rendering, cart restoration, finishing display, and original-based print rendering. Legacy uncropped signatures remain compatible.
- Yard signs retain their existing four corner controls; new crop controls are scoped to the single-artwork banner/magnet pipeline until yard-sign production serialization supports them.

## Verification

- Initial focused geometry, editor, upload-removal and preview lifecycle suite: 48 passed.
- Production build: passed.
- Full-project TypeScript check is blocked by existing syntax errors in the unrelated legacy `BannerEditor.tsx`; the shipping Vite build succeeds.
- Browser interaction matrix and desktop/mobile recordings: pending.
- Actual customer-upload manual check: pending; customer artwork is not committed to this repository.
- Final preview URL, tested commit, browser results and demonstrations will be recorded before approval.
