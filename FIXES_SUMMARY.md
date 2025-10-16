# Cart Persistence and UX Fixes - Summary

## Issue 1: Cart Not Persisting After Logout/Login ✅ FIXED

**Root Cause:** PostgreSQL CTE (Common Table Expression) was not being referenced, causing the archive step to be optimized away. This led to duplicate key constraint violations when trying to insert a new active cart while an old one still existed.

**Fix:** Changed from CTE approach to explicit two-step process:
1. UPDATE to archive existing active carts
2. INSERT new active cart

**Files Changed:**
- `src/lib/cartSync.ts` - Fixed saveCart method

**Commit:** d3f8d3c

---

## Issue 2: Page Should Scroll to Top After Adding to Cart ✅ FIXED

**Root Cause:** No scroll behavior after cart actions, leaving user at bottom of page unable to see cart confirmation.

**Fix:** Added `window.scrollTo({ top: 0, behavior: 'smooth' })` after both "Add to Cart" and "Update Cart" actions.

**Files Changed:**
- `src/components/design/AddToCartButton.tsx`

**Commit:** 3b404af

---

## Issue 3: Text Elements Not Displaying in Cart Thumbnails ⚠️ NEEDS TESTING

**Status:** The code appears correct - `text_elements` is being saved to database and passed to BannerPreview component. This may be a rendering issue that needs browser testing to diagnose further.

**Files to Check:**
- `src/components/cart/BannerPreview.tsx` - Renders text elements
- `src/lib/cartSync.ts` - Saves text_elements to database (line 362-364)
- `src/components/CartModal.tsx` - Passes textElements prop (line 143)

---

## Issue 4: Items Get Resized When Editing from Cart ⚠️ NEEDS ADDITIONAL FIX

**Root Cause:** QuoteState interface is missing `imageScale` and `imagePosition` fields. The code tries to use these fields but they're not defined in the TypeScript interface, causing them to be undefined.

**Current State:**
- `loadFromCartItem` tries to set `imageScale` and `imagePosition` (lines 172-173 in quote.ts)
- `addFromQuote` tries to read `quote.imageScale` and `quote.imagePosition` (line 243-244 in cart.ts)
- But QuoteState only has `previewScalePct`, not `imageScale`/`imagePosition`

**Fix Needed:**
Add `imageScale` and `imagePosition` to QuoteState interface and ensure they're properly initialized and used throughout the codebase.

**Files to Fix:**
- `src/store/quote.ts` - Add fields to interface and initial state
- Verify all components using these fields

---

## Additional Fixes Applied

### Field Name Corrections (aa960d3)
Fixed sanitization to use correct snake_case field names matching the CartItem interface:
- `width_in`, `height_in` instead of `width`, `height`
- `pole_pockets` instead of `poles`
- Added all required pricing fields
- Added support for `text_elements`, `overlay_image`, `aiDesign`

### Enhanced Error Logging (5493166)
Added comprehensive logging to diagnose cart save failures:
- Logs data being saved before database call
- Logs detailed error information on failure
- Helps identify JSON serialization issues

---

## Testing Checklist

- [ ] Test cart persistence: Add items while logged in, logout, login - cart should persist
- [ ] Test scroll behavior: Add to cart, verify page scrolls to top
- [ ] Test text elements: Add text to banner, add to cart, verify text shows in cart thumbnail
- [ ] Test edit functionality: Edit cart item, verify it loads with correct scale/position
- [ ] Test guest cart merge: Add items as guest, login, verify items merge correctly

