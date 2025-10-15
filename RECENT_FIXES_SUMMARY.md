# Recent Fixes Summary - Final Banner Site

## Fix #1: PDF Logo Scaling (Commit a6d3151)

### Problem
Logos/overlay images in generated PDFs were rendering with incorrect size compared to the preview shown on the design page. Logos appeared approximately 2× too large on landscape banners.

### Root Cause
Mismatch in base dimension calculation:
- **Preview**: Used `Math.min(widthIn, heightIn)` as base dimension
- **PDF**: Used `req.bannerWidthIn` as base dimension

For a 48" × 24" banner:
- Preview: baseDimension = min(48, 24) = 24 inches
- PDF: baseDimension = 48 inches
- Result: Logo rendered at 2× the intended size

### Solution
Changed PDF rendering to match preview logic:
```javascript
// BEFORE
const baseDimension = req.bannerWidthIn * targetDpi;

// AFTER
const baseDimension = Math.min(req.bannerWidthIn, req.bannerHeightIn) * targetDpi;
```

### Files Changed
- `netlify/functions/render-order-pdf.cjs` (lines 617-620)

---

## Fix #2: Text Box Edit Mode Expansion (Commit a1d3d36)

### Problem
When users double-clicked a text overlay to edit it, the text box would expand horizontally beyond its intended boundaries, breaking the visual layout.

### Root Cause
The textarea element had a hardcoded `minWidth: '200px'` that forced expansion regardless of actual content size.

### Solution
Removed the `minWidth` constraint and added proper styling:
```javascript
// BEFORE
style={{
  width: '100%',
  minWidth: '200px',  // ❌ Forced expansion
}}

// AFTER
style={{
  width: '100%',
  height: 'auto',
  overflow: 'hidden',
  outline: 'none',
  padding: '0',
  margin: '0',
  boxSizing: 'border-box',
  textAlign: element.textAlign,
}}
```

### Files Changed
- `src/components/design/DraggableText.tsx` (lines 443-458)

---

## Deployment Status

Both fixes have been:
- ✅ Committed to main branch
- ✅ Pushed to GitHub
- ⏳ Automatically deployed via Netlify

## Testing Checklist

### PDF Logo Scaling
- [ ] Create test order with 48" × 24" banner (landscape)
- [ ] Add logo in design preview
- [ ] Download print-ready PDF from admin panel
- [ ] Verify logo size matches preview exactly
- [ ] Test with portrait and square banners

### Text Edit Mode
- [ ] Add text overlay to banner design
- [ ] Double-click text to enter edit mode
- [ ] Verify text box does NOT expand
- [ ] Verify text alignment is preserved
- [ ] Test with different text lengths and font sizes
- [ ] Verify drag and resize still work

## Impact

### PDF Logo Scaling Fix
- **Critical**: Ensures print-ready PDFs match customer preview
- **Affects**: All orders with logo overlays
- **Benefit**: Prevents costly print errors and customer complaints

### Text Edit Mode Fix
- **High**: Improves user experience during design
- **Affects**: All users adding text to banners
- **Benefit**: Professional, seamless editing experience

---

**Last Updated**: 2025-10-15
**Commits**: a6d3151 (PDF), a1d3d36 (Text)
