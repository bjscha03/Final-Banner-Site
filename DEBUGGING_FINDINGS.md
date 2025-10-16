# Debugging Findings: Thumbnail Rendering and Preview Synchronization Issues

## Date: October 16, 2025

## Issue 1: Text Positioning in Thumbnails is Inaccurate ✅ FIXED

### Problem
Text elements in thumbnails (shopping cart and upsell modal) appeared in different locations compared to the live preview area.

### Root Cause
The `BannerPreview` component (used for thumbnails) was using SVG `textAnchor` attribute that varied based on `textAlign`:
- `textAlign='left'` → `textAnchor='start'` (text starts at x position)
- `textAlign='center'` → `textAnchor='middle'` (text is centered at x position)
- `textAlign='right'` → `textAnchor='end'` (text ends at x position)

However, in the live preview, `DraggableText` uses HTML positioning where:
- The text **container's top-left corner** is always at `(xPercent%, yPercent%)`
- The `textAlign` property only affects how text is aligned **within** the container
- The container position is independent of text alignment

This mismatch caused text to appear in different positions:
- Left-aligned text: matched correctly
- Center-aligned text: appeared shifted right in thumbnail
- Right-aligned text: appeared shifted far right in thumbnail

### Solution
Changed `BannerPreview.tsx` to always use `textAnchor='start'` regardless of `textAlign` value:

```typescript
// OLD CODE (INCORRECT):
const textAnchor = textEl.textAlign === 'left' ? 'start' 
                 : textEl.textAlign === 'right' ? 'end' 
                 : 'middle';

// NEW CODE (CORRECT):
// Match HTML positioning: xPercent/yPercent are top-left of text container
// In HTML, the text container's top-left is at xPercent/yPercent regardless of textAlign
// So in SVG, we always use textAnchor="start" (left-aligned) to position from the left edge
const textAnchor = 'start';
```

### Trade-off
In thumbnails, all text will now be left-aligned from the xPercent position, even if the original text was center or right-aligned. This is a reasonable trade-off because:
1. The text position is now accurate (starts from the correct location)
2. SVG `<text>` elements don't have a container width, so we can't perfectly replicate HTML text alignment
3. The thumbnail is small and primarily for visual reference
4. The live preview still shows the correct alignment

### Files Modified
- `src/components/cart/BannerPreview.tsx` (lines 256-259)

---

## Issue 2: Image Zoom/Pan Position Not Preserved When Editing from Cart 🔍 INVESTIGATING

### Problem
When clicking "Edit" in the shopping cart, the uploaded/generated image reverts to center position instead of maintaining the saved zoom and pan position.

### Investigation Steps

#### 1. Verified Data Flow
The data flow appears correct:
1. **Cart Storage**: `src/store/cart.ts` saves `image_scale` and `image_position` correctly
2. **Cart Loading**: `src/store/quote.ts` `loadFromCartItem()` loads these values correctly
3. **State Management**: Quote store properly stores `imageScale` and `imagePosition`
4. **Component Usage**: `LivePreviewCard` reads from quote store correctly

#### 2. Coordinate System Analysis
Discovered that `imagePosition` uses a **scaled coordinate system**:
- Values are stored as large numbers (e.g., 100, 200, 300)
- When rendering, they're multiplied by `0.01` to convert to pixels
- When dragging, mouse delta is multiplied by sensitivity (30) before storing

From `LivePreviewCard.tsx` line 1197:
```typescript
// Position is multiplied by 0.01 in rendering, so we multiply by 100 for storage
const sensitivity = 30;
const newX = initialImagePosition.x + (deltaX * sensitivity);
```

From `PreviewCanvas.tsx` line 249:
```typescript
x={RULER_HEIGHT + (bleedWidth - bleedWidth * imageScale) / 2 + (imagePosition.x * 0.01)}
```

#### 3. Added Debug Logging
Added a useEffect in `LivePreviewCard.tsx` to log when imagePosition/imageScale change:
```typescript
React.useEffect(() => {
  console.log('🔍 LivePreviewCard: imagePosition changed:', imagePosition);
  console.log('🔍 LivePreviewCard: imageScale changed:', imageScale);
  console.log('🔍 LivePreviewCard: editingItemId:', editingItemId);
  console.log('🔍 LivePreviewCard: file:', file);
}, [imagePosition, imageScale, editingItemId, file]);
```

#### 4. Checked Auto-Fit Logic
The dimension change useEffect (line 121) has proper guards:
```typescript
useEffect(() => {
  // Don't auto-fit if editing from cart - preserve saved scale/position
  if (editingItemId) {
    console.log('📐 Editing from cart - skipping auto-fit...');
    return;
  }
  // ... auto-fit logic only runs if NOT editing from cart
}, [widthIn, heightIn, editingItemId]);
```

#### 5. Checked File Change Logic
The file change useEffect (line 102) also has proper guards:
```typescript
React.useEffect(() => {
  const hadFile = prevFileRef.current !== undefined;
  const hasFile = file !== undefined;
  
  // Only reset if we HAD a file and now we DON'T (file was removed)
  if (hadFile && !hasFile && !editingItemId) {
    setImagePosition({ x: 0, y: 0 });
    setImageScale(1);
    // ...
  }
}, [file, editingItemId]);
```

### Next Steps for Debugging

1. **Test in Browser**: Open dev server at http://localhost:8080 and test the flow:
   - Create a banner with uploaded image
   - Zoom and pan the image to a custom position
   - Add to cart
   - Check browser console for the logged values
   - Click "Edit" in cart
   - Check console logs to see if imagePosition/imageScale are loaded correctly
   - Check if the preview shows the correct position

2. **Check Console Logs**: Look for:
   - `🔍 QUOTE STORE: loadFromCartItem called with item:` - verify image_scale and image_position values
   - `✅ QUOTE STORE: After set, imageScale is:` - verify state was set correctly
   - `🔍 LivePreviewCard: imagePosition changed:` - verify component received the values
   - `📐 Editing from cart - skipping auto-fit` - verify auto-fit is being skipped

3. **Potential Issues to Check**:
   - Is `editingItemId` being cleared too early?
   - Is there a race condition between loading state and rendering?
   - Is the PreviewCanvas receiving the correct props?
   - Are there any other useEffects that might be resetting the position?

### Hypothesis
Based on the code review, the logic appears correct. The issue might be:
1. A timing issue where the component renders before the state is fully loaded
2. The `editingItemId` being cleared before the component has a chance to use it
3. Some other component or useEffect interfering with the state

### Files Modified for Debugging
- `src/components/design/LivePreviewCard.tsx` (added debug logging)

---

## Testing Instructions

### Test 1: Text Positioning in Thumbnails
1. Go to design page
2. Upload an image
3. Add text with different alignments:
   - Add left-aligned text at top-left
   - Add center-aligned text at center
   - Add right-aligned text at bottom-right
4. Click "Add to Cart"
5. Check upsell modal thumbnail - text should start from the same positions as in preview
6. View shopping cart
7. Check cart thumbnail - text should start from the same positions as in preview

**Expected Result**: Text in thumbnails should start from the same x,y positions as in the live preview (though alignment within the text may differ)

### Test 2: Image Zoom/Pan Restoration
1. Go to design page
2. Upload an image
3. Zoom in on the image (make it larger)
4. Pan the image to a custom position (drag it around)
5. Note the exact position and zoom level
6. Add to cart
7. View shopping cart
8. Click "Edit" button
9. Check browser console for debug logs
10. Check if the preview shows the image at the same zoom and pan position

**Expected Result**: Image should appear at the exact same zoom level and pan position as when it was added to cart

### Browser Console Logs to Check
- Look for `🔍 QUOTE STORE:` logs showing the loaded values
- Look for `🔍 LivePreviewCard:` logs showing the component state
- Look for `📐 Editing from cart` log confirming auto-fit is skipped
- Check for any errors or warnings

---

## Summary

**Issue 1 (Text Positioning)**: ✅ FIXED
- Root cause identified: SVG textAnchor mismatch with HTML positioning
- Solution implemented: Always use textAnchor='start'
- Trade-off: Text alignment in thumbnails will be left-aligned

**Issue 2 (Image Zoom/Pan)**: 🔍 NEEDS TESTING
- Code review shows logic appears correct
- Added debug logging to investigate
- Need to test in browser to identify actual issue
- Hypothesis: Timing or state management issue

