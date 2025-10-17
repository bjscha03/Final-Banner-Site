# Image Resize Handlers Fix

## Problem
When clicking the "Edit" button on a cart item, the image resize handlers (corner/edge handles for resizing) were not appearing on the uploaded image in the design canvas.

**Symptoms:**
- Initial image upload: Resize handlers ARE visible ✅
- Edit cart item: Resize handlers are NOT visible ❌

## Root Cause

The resize handlers are only rendered when `isImageSelected === true` (see `PreviewCanvas.tsx` line 403):

```typescript
{isImageSelected && !isDraggingImage && file?.url && (() => {
  // Render resize handles...
})()}
```

The issue was in `LivePreviewCard.tsx`:
- When a file was **removed**, the code set `setIsImageSelected(false)` (line 110)
- But when a file was **loaded** (either from upload or editing a cart item), there was NO code to set `setIsImageSelected(true)`
- Users had to manually click the image first to select it and show the resize handles

## Solution

Added auto-selection logic when a file is loaded:

```typescript
// CRITICAL FIX: Auto-select image when file is loaded (upload or edit from cart)
// This ensures resize handles appear immediately
if (!hadFile && hasFile) {
  console.log('✅ File loaded - auto-selecting image to show resize handles');
  setIsImageSelected(true);
}
```

This code:
1. Detects when a file transitions from `undefined` to defined
2. Automatically sets `isImageSelected = true`
3. Triggers the resize handles to appear immediately

## Files Modified
- `src/components/design/LivePreviewCard.tsx` - Added auto-selection when file is loaded

## Testing

### Test Case 1: Initial Upload
1. Go to /design page
2. Upload an image
3. ✅ Resize handles should appear immediately

### Test Case 2: Edit Cart Item
1. Add an item with an image to cart
2. Click "Edit" on the cart item
3. ✅ Resize handles should appear immediately on the design canvas

### Test Case 3: Cart Persistence (Regression Test)
1. User A logs in, adds items to cart
2. User A logs out
3. User B logs in
4. User B logs out
5. User A logs back in
6. ✅ User A should see their cart items (cart persistence still works)

## Deployment
- Commit: `bc601b6`
- Status: ✅ Deployed to production via Netlify

## Notes
- Cart persistence functionality remains intact
- No other functionality was affected
- The fix is minimal and surgical - only adds 5 lines of code
