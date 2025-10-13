# Grommet Dropdown Window Resize Fix

**Date:** October 13, 2025  
**Commit:** d2852e5  
**Component:** `src/components/ui/GrommetPicker.tsx`

## Problem

When the grommet dropdown was open on desktop browsers and the user resized the browser window, the dropdown would remain in its original position, causing it to become detached and misaligned from its trigger button.

### Root Cause

In commit `14b8a28`, the resize event listener was removed as part of the scroll behavior fix. The original resize listener was repositioning the dropdown, but it was removed entirely rather than being updated to close the dropdown (matching the scroll behavior).

### User Impact

- **Desktop users:** When resizing the browser window with the dropdown open, the dropdown would appear in the wrong position, detached from the trigger button
- **Mobile users:** No impact (mobile uses bottom sheet, not positioned dropdown)

## Solution

Added a resize event listener that **closes the dropdown** when the window is resized, matching the scroll behavior implemented in commit `14b8a28`.

### Implementation Details

**File:** `src/components/ui/GrommetPicker.tsx`

**Changes:**
1. Added `handleResize` function that closes the dropdown
2. Added `window.addEventListener('resize', handleResize)` 
3. Added cleanup in the return statement: `window.removeEventListener('resize', handleResize)`

**Code:**
```typescript
// Close dropdown on scroll (standard dropdown behavior)
const handleScroll = () => {
  setIsOpen(false);
};

// Close dropdown on window resize (prevents misalignment)
const handleResize = () => {
  setIsOpen(false);
};

window.addEventListener('scroll', handleScroll, true);
window.addEventListener('resize', handleResize);

return () => {
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('resize', handleResize);
};
```

### Why Close Instead of Reposition?

**Option A: Reposition the dropdown**
- More complex implementation
- Requires recalculating position on every resize event
- Can cause visual jitter during resize
- May have performance implications

**Option B: Close the dropdown (chosen)**
- Simple, clean implementation
- Matches the scroll behavior (consistency)
- Standard dropdown UX pattern
- No performance concerns
- Predictable user experience

## Testing

### Desktop Testing
1. ✅ Open grommet dropdown
2. ✅ Resize browser window (drag window edge)
3. ✅ Verify dropdown closes automatically
4. ✅ Reopen dropdown after resize
5. ✅ Verify dropdown appears in correct position below trigger button

### Scroll Behavior (Regression Test)
1. ✅ Open grommet dropdown
2. ✅ Scroll the page
3. ✅ Verify dropdown closes automatically (existing behavior preserved)

### Mobile Testing
1. ✅ Open grommet picker on mobile (<640px)
2. ✅ Verify bottom sheet appears (not affected by resize listener)
3. ✅ Rotate device (triggers resize)
4. ✅ Verify bottom sheet closes on orientation change

### Build Verification
```bash
npm run build
# ✅ Build successful
# ✅ No TypeScript errors
# ✅ No console warnings
```

## Related Commits

- **ebe97ad** - Fix grommet dropdown positioning on desktop browsers
- **14b8a28** - Fix grommet dropdown scroll behavior (removed original resize listener)
- **d2852e5** - Fix grommet dropdown misalignment on window resize (this fix)

## Behavior Summary

| Event | Desktop Dropdown | Mobile Bottom Sheet |
|-------|-----------------|---------------------|
| Scroll | Closes automatically | Not affected |
| Window Resize | Closes automatically | Closes on orientation change |
| Outside Click | Closes | Closes |
| Escape Key | Closes | Closes |

## Technical Notes

### Event Listener Cleanup
The resize event listener is properly cleaned up in the `useEffect` return function to prevent memory leaks.

### Desktop-Only Application
The resize listener is only added when:
- `isOpen === true` (dropdown is open)
- `isMobile === false` (desktop viewport)
- `triggerRef.current` exists (trigger button is mounted)

This ensures the listener is only active when needed and doesn't interfere with mobile bottom sheet behavior.

### Standard Dropdown UX
Closing the dropdown on resize matches standard dropdown behavior across the web:
- Select dropdowns close on scroll/resize
- Context menus close on scroll/resize
- Tooltips close on scroll/resize

This provides a familiar, predictable user experience.

## Future Considerations

If users request the dropdown to stay open during resize, we could:
1. Implement repositioning logic with debouncing
2. Add a configuration prop to control resize behavior
3. Use ResizeObserver for more granular control

However, the current "close on resize" behavior is simpler, more performant, and matches user expectations for dropdown components.
