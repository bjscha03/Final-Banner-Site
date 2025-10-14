# Mobile UX Bug Fixes - Status Update

## ✅ Bug 4: Logo Overlay Remains Selected After Tapping Outside (FIXED)
**Status:** Fixed and deployed (Commit: 633ae6b)

**Issue:** On mobile, tapping empty canvas area did not deselect the logo overlay.

**Root Cause:** The `handleOverlayTouchStart` function was calling `e.preventDefault()` but not `e.stopPropagation()`. This meant touch events on the overlay were bubbling to the canvas level, preventing the deselection logic from properly detecting when the user tapped on the overlay vs empty canvas.

**Fix:** Added `e.stopPropagation()` to `handleOverlayTouchStart` to prevent the touch event from bubbling to the SVG canvas. Now when tapping the overlay, the event is stopped from bubbling, and when tapping empty canvas, the `handleCanvasTouchEnd` properly fires and deselects all elements.

**Testing:** Please test on both iOS Safari and Android Chrome.

---

## ✅ Bug 3: Logo Overlay Resize Handles Misaligned on Mobile (FIXED)
**Status:** Fixed and deployed (Commit: 7a69203)

**Issue:** Corner resize handles were offset from the actual logo corners on mobile.

**Root Cause:** The overlay image was rendered with `preserveAspectRatio="xMidYMid meet"`, which meant the actual rendered image could be smaller than the bounding box to maintain aspect ratio. The resize handles were positioned at the corners of the bounding box, not the actual image corners.

For example:
- If banner is 48" x 24" (2:1 aspect ratio)
- And overlay scale is 0.3
- Then overlayWidth = 14.4" and overlayHeight = 7.2"
- But if the overlay image is square (1:1 aspect ratio)
- The actual rendered image would be 7.2" x 7.2" (to fit within the 14.4" x 7.2" box)
- The handles would be at the corners of the 14.4" x 7.2" box, not the 7.2" x 7.2" image!

**Fix:**
1. Added `aspectRatio` field to overlayImage type in quote and cart stores
2. Modified `handleOverlayUpload` to load the image and calculate aspect ratio (width / height)
3. Updated PreviewCanvas to calculate overlay dimensions based on aspect ratio:
   - Use the smaller banner dimension as the base for scaling
   - Calculate width and height based on aspect ratio
   - Landscape/square images: width = base * scale * aspectRatio, height = base * scale
   - Portrait images: width = base * scale, height = base * scale / aspectRatio
4. Changed `preserveAspectRatio` to "none" since we now calculate correct dimensions

**Testing:** Please test on both iOS Safari and Android Chrome. The handles should now align perfectly with the image corners.

---

## 🔍 Bug 2: Logo Overlay Not Persisting When Editing Cart Item (INVESTIGATING)
**Status:** Debugging in progress (Commit: 3bb0ccd)

**Issue:** Logo disappears after saving cart item and re-editing.

**Investigation:** Added console logging to track overlay image data flow:
- `loadFromCartItem` in quote store logs the cart item and overlay_image data
- LivePreviewCard logs the overlayImage from quote store

**Code Review:** The code appears correct:
- `addFromQuote` saves `overlay_image: quote.overlayImage` to cart item ✅
- `updateCartItem` saves `overlay_image: quote.overlayImage` to cart item ✅
- `loadFromCartItem` loads `overlayImage: item.overlay_image` into quote store ✅
- LivePreviewCard uses `overlayImage` from quote store ✅

**Next Steps:** Please test the following workflow and check the browser console for logs:
1. Add a logo overlay to a banner
2. Click "Add to Cart"
3. Open cart and click "Edit" on the item
4. Check if the logo appears
5. Share the console logs (look for messages starting with 🔍, 🔄, or 🛒)

---

## 🔧 Bug 1: Text Elements Not Preserving Position on Mobile Orientation Change (IN PROGRESS)
**Status:** Root cause identified, fix in progress

**Issue:** When rotating the device from portrait to landscape (or vice versa) on mobile, text elements do not maintain their correct positions relative to the banner.

**Root Cause Analysis:**
Text elements use percentage-based positioning (`left: ${leftPercent}%`, `top: ${topPercent}%`), which is calculated relative to the **container** element, not the **banner SVG**. When the device rotates:
1. The container size changes (e.g., from 375px wide to 667px wide)
2. The banner size in inches remains the same (e.g., 48" x 24")
3. The SVG scales to fit the new container size
4. The text element's percentage position is relative to the container, so it moves relative to the banner

**Example:**
- Portrait: Container is 375px wide, SVG is centered, text at 50% is at 187.5px
- Landscape: Container is 667px wide, SVG is centered, text at 50% is at 333.5px
- But the SVG's center has moved within the container!

**Proposed Fix:**
Calculate text position relative to the banner SVG, not the container:
1. Get the SVG element's bounding rect
2. Calculate text position as percentage of SVG dimensions
3. Update position calculation to account for SVG's position within container

**Status:** Working on implementation. Will deploy soon.

---

## Testing Checklist
After all fixes are deployed, please verify:
- [ ] Logo overlay deselects when tapping outside on mobile
- [ ] Logo overlay resize handles align with image corners on mobile
- [ ] Logo overlay persists when editing cart item
- [ ] Text elements maintain position when rotating device
- [ ] All features work on iOS Safari
- [ ] All features work on Android Chrome
- [ ] All features work in both portrait and landscape orientations

