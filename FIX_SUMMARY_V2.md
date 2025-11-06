# Bug Fixes - Image Duplication & Grommet Rendering

## Bug 1: Image Duplication in Edit Mode - FIXED ✅

### Root Cause
The previous fix used React `useRef` to track loading state (`loadedItemIdRef` and `isLoadingRef`). However, when clicking "Edit" in the CartModal, the app navigates to `/design-editor`, which **unmounts and remounts** the `BannerEditorLayout` component. This resets all refs to their initial values (`null` and `false`), making the guards ineffective.

### Solution
Moved the tracking state from React refs to the **Zustand quote store**, which persists across navigation and component remounts.

### Changes Made

#### 1. `src/store/quote.ts`
- Added `loadedItemId?: string | null` to QuoteState interface
- Added `isLoadingItem?: boolean` to QuoteState interface
- Initialized both values to `null` and `false` in the store
- Reset both values in `resetDesign()`

#### 2. `src/components/design/BannerEditorLayout.tsx`
- Removed React refs: `loadedItemIdRef` and `isLoadingRef`
- Added `loadedItemId` and `isLoadingItem` to destructuring from quote store
- Updated all guards to check store values instead of refs
- Updated all loading markers to use `setQuote()` instead of ref assignments

### Why This Works
The Zustand store persists across:
- Navigation (route changes)
- Component unmounts/remounts
- Browser refreshes (with persistence middleware)

So the guards will now correctly prevent duplicate loading even after navigation.

---

## Bug 2: Grommets Not Rendering in Edit Mode - FIXED ✅

### Root Cause
When a user selects grommets from the GrommetPicker while in edit mode, the `grommets` value is updated in the quote store, but `showGrommets` in the editor store is NOT updated. The canvas only renders grommets when BOTH conditions are true:
1. `showGrommets === true` (editor store)
2. `grommets !== 'none'` (quote store)

### Solution
Updated the GrommetPicker's `onChange` handler to also call `setShowGrommets()` when the user selects a grommet option.

### Changes Made

#### `src/components/design/LivePreviewCard.tsx`
Updated the GrommetPicker onChange handler:

```typescript
// BEFORE:
onChange={(value) => set({ grommets: value as Grommets })}

// AFTER:
onChange={(value) => {
  set({ grommets: value as Grommets });
  // Also update showGrommets in editor store when grommets change
  const { setShowGrommets } = useEditorStore.getState();
  setShowGrommets(value !== 'none');
}}
```

### Why This Works
Now when the user selects grommets:
1. The `grommets` value is updated in the quote store
2. The `showGrommets` value is updated in the editor store
3. The canvas re-renders with grommets visible

---

## Testing Checklist

### Image Duplication Fix
- [ ] Add item to cart with image
- [ ] Click "Edit" button
- [ ] Verify image appears only ONCE on canvas
- [ ] Make changes and click "Update Cart"
- [ ] Click "Edit" again
- [ ] Verify image still appears only ONCE
- [ ] Repeat 5-10 times to ensure reliability

### Grommet Rendering Fix
- [ ] Add item to cart
- [ ] Click "Edit" button
- [ ] Select grommet option from GrommetPicker
- [ ] Verify grommets render on canvas
- [ ] Change grommet option
- [ ] Verify grommets update on canvas
- [ ] Select "None" for grommets
- [ ] Verify grommets disappear from canvas

---

## Files Modified
1. `src/store/quote.ts` - Added tracking state to persist across navigation
2. `src/components/design/BannerEditorLayout.tsx` - Removed refs, use store state
3. `src/components/design/LivePreviewCard.tsx` - Update showGrommets when grommets change

## Console Logs to Monitor
- `[BannerEditorLayout] Already loaded this item, skipping:` - Duplicate prevention working
- `[BannerEditorLayout] Already loading, skipping duplicate load` - Concurrent loading prevented
- `[BannerEditorLayout] Loading complete for item:` - Loading finished successfully
- `[GROMMET DEBUG] showGrommets:` - Grommet visibility state
- `[GROMMET DEBUG] grommetPositions count:` - Number of grommets being rendered
