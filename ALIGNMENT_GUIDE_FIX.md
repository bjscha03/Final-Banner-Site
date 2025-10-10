# Alignment Guide Fix - Complete Solution

## Problem Summary

The alignment guides were not positioning correctly when dragging text elements. The guides appeared at the banner's center (50%, 50%), but they were checking if the **top-left corner** of the text element was at 50%, not the **center** of the text element.

### Visual Issue
- When dragging text, the horizontal center guide line did NOT pass through the vertical middle of the text
- When dragging text, the vertical center guide line did NOT pass through the horizontal middle of the text
- The guides appeared when the text's top-left corner was at 50%, making the text appear off-center

## Root Cause

The text element uses CSS positioning with `left` and `top` properties, which position the **top-left corner** of the element. The original code was:

1. Checking if `newXPercent === 50` (top-left corner at horizontal center)
2. Checking if `newYPercent === 50` (top-left corner at vertical center)

This meant the guides appeared when the top-left corner was centered, not when the text itself was centered.

## Solution

The fix calculates the **center point** of the text element and checks if that center aligns with the banner's center.

### Key Changes in `DraggableText.tsx`

#### 1. Get Text Element Dimensions
```typescript
const textRect = textRef.current.getBoundingClientRect();
const textWidthPercent = (textRect.width / containerRect.width) * 100;
const textHeightPercent = (textRect.height / containerRect.height) * 100;
```

#### 2. Calculate Text Center Position
```typescript
// Calculate the CENTER position of the text element
// (top-left position + half of element size)
const textCenterXPercent = newXPercent + (textWidthPercent / 2);
const textCenterYPercent = newYPercent + (textHeightPercent / 2);
```

#### 3. Check if Text CENTER Aligns with Banner Center
```typescript
// Snap to horizontal center (50%) - check if TEXT CENTER aligns with banner center
if (Math.abs(textCenterXPercent - 50) < snapThreshold) {
  // Adjust position so text CENTER is at 50%
  newXPercent = 50 - (textWidthPercent / 2);
  onShowVerticalCenterGuide?.(true);
} else {
  onShowVerticalCenterGuide?.(false);
}

// Snap to vertical center (50%) - check if TEXT CENTER aligns with banner center
if (Math.abs(textCenterYPercent - 50) < snapThreshold) {
  // Adjust position so text CENTER is at 50%
  newYPercent = 50 - (textHeightPercent / 2);
  onShowHorizontalCenterGuide?.(true);
} else {
  onShowHorizontalCenterGuide?.(false);
}
```

#### 4. Fixed Edge Snapping
Also fixed the edge snapping to account for text dimensions:

```typescript
// Snap to right edge (100%)
if (Math.abs(newXPercent + textWidthPercent - 100) < snapThreshold) {
  newXPercent = 100 - textWidthPercent;
}

// Snap to bottom edge (100%)
if (Math.abs(newYPercent + textHeightPercent - 100) < snapThreshold) {
  newYPercent = 100 - textHeightPercent;
}
```

## How It Works Now

1. **User drags text element**
2. **System calculates**:
   - Text element's current position (top-left corner)
   - Text element's dimensions (width and height)
   - Text element's center point (position + half dimensions)
3. **System checks** if text center is within snap threshold of banner center (50%, 50%)
4. **If yes**:
   - Adjusts position so text center aligns exactly at 50%
   - Shows alignment guides at 50% (which now pass through text center)
5. **If no**:
   - Hides alignment guides
   - Allows free positioning

## Visual Result

### Before Fix
```
Banner Center (50%)
        |
        |  [Text Element]  <- Top-left at 50%, text appears off-center
        |
```

### After Fix
```
Banner Center (50%)
        |
    [Text Element]  <- Center at 50%, text is truly centered
        |
```

## Testing

To test the fix:

1. Start the dev server: `npm run dev`
2. Navigate to the banner designer
3. Add a text element
4. Drag the text element around
5. **Expected behavior**:
   - When the text's center approaches the banner's center, guides appear
   - The guides pass through the middle of the text element
   - The text snaps so its center is at exactly 50%, 50%
   - The guides clearly show the text is centered

## Files Modified

- `src/components/design/DraggableText.tsx` - Fixed alignment guide positioning logic

## Additional Improvements

The fix also improves:
- **Edge snapping**: Now accounts for text dimensions when snapping to edges
- **Visual accuracy**: Guides now accurately represent where the text center is
- **User experience**: Matches Canva-style behavior where guides show element centers

## Technical Details

- **Coordinate system**: Percentage-based (0-100%)
- **Snap threshold**: 2% (~10-20px depending on banner size)
- **Guide colors**: Bright magenta (#FF00FF) with glow effect
- **Z-index**: Guides at 9998, text at 9999 (text appears above guides)

## No Breaking Changes

This fix:
- ✅ Maintains backward compatibility
- ✅ No API changes
- ✅ No TypeScript errors
- ✅ No changes to other components
- ✅ Preserves all existing functionality
