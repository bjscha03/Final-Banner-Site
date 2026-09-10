# PDF Static Preview Testing Checklist

## Feature Flag Testing

### ✅ Feature Flag ON (VITE_FEATURE_PDF_STATIC_PREVIEW=1)
- [ ] Upload PNG/JPG/SVG → previews exactly as before (no changes)
- [ ] Upload single-page PDF → renders as static image, no native toolbar in Firefox
- [ ] Upload multi-page PDF → page 1 renders as static image, no native toolbar
- [ ] Preview Scale slider (25%-200%) → PDF image updates with crisp quality
- [ ] Grommet overlay → lines up correctly over the PDF image
- [ ] Size labels → display correctly over PDF preview
- [ ] Remove button → works, memory (object URLs) freed, no console errors
- [ ] Corrupt/invalid PDF → shows "PDF preview unavailable" fallback, rest of UI works

### ✅ Feature Flag OFF (VITE_FEATURE_PDF_STATIC_PREVIEW=0)
- [ ] Upload PDF → uses old iframe-based PDFPreview component
- [ ] All existing functionality works exactly as before
- [ ] No regressions in any PDF handling

## Cross-Browser Testing

### Firefox (Primary Target)
- [ ] PDF upload → NO magnifying glass icon visible
- [ ] PDF upload → NO annotation tools visible  
- [ ] PDF upload → NO zoom controls visible
- [ ] PDF upload → NO native PDF toolbar of any kind
- [ ] Preview scale → PDF image scales smoothly
- [ ] Grommet overlay → positioned correctly over PDF

### Chrome
- [ ] PDF upload → renders as static image
- [ ] Preview scale → works correctly
- [ ] No console errors
- [ ] Performance is acceptable

### Safari
- [ ] PDF upload → renders as static image
- [ ] Preview scale → works correctly
- [ ] No console errors
- [ ] Performance is acceptable

### Edge
- [ ] PDF upload → renders as static image
- [ ] Preview scale → works correctly
- [ ] No console errors
- [ ] Performance is acceptable

## Performance & UX Testing

### Loading & Rendering
- [ ] PDF rendering → shows loading state appropriately
- [ ] Large PDF files (>10MB) → renders without freezing UI
- [ ] Multiple rapid file changes → previous renders are cancelled
- [ ] High DPI displays → PDF renders crisp (not blurry)
- [ ] Low-end devices → acceptable performance

### Memory Management
- [ ] Upload multiple PDFs → no memory leaks in dev tools
- [ ] Remove PDF files → object URLs are properly revoked
- [ ] Long session with many uploads → memory usage stays reasonable

## Integration Testing

### Design Tool Flow
- [ ] Upload PDF → preview appears correctly
- [ ] Adjust banner size → PDF scales appropriately in preview
- [ ] Change grommets → overlay updates correctly over PDF
- [ ] Change material → no impact on PDF preview
- [ ] Preview scale slider → PDF image quality updates

### Cart & Order Flow
- [ ] Add PDF banner to cart → cart shows correct thumbnail
- [ ] Proceed to checkout → PDF file info preserved
- [ ] Complete order → PDF file uploaded to server correctly
- [ ] Order confirmation → shows PDF file in order details

### Error Handling
- [ ] Network error during PDF render → shows fallback gracefully
- [ ] Corrupted PDF file → shows fallback, doesn't crash
- [ ] Very large PDF → either renders or fails gracefully
- [ ] PDF with no pages → shows fallback gracefully

## Regression Testing

### Non-PDF Files (Must be unchanged)
- [ ] PNG upload → exact same behavior as before
- [ ] JPG upload → exact same behavior as before  
- [ ] SVG upload → exact same behavior as before
- [ ] File validation → same error messages
- [ ] File size limits → same restrictions

### Existing Features
- [ ] Upload drag & drop → works for all file types
- [ ] File remove button → works for all file types
- [ ] Preview scale → works for image files
- [ ] Grommet overlay → works for image files
- [ ] Banner sizing → works correctly
- [ ] Material selection → works correctly
- [ ] Pricing calculation → unchanged
- [ ] Cart functionality → unchanged
- [ ] Order creation → unchanged

## Build & Deploy Testing

### Development
- [ ] `npm run dev` → PDF preview works in dev mode
- [ ] Hot reload → PDF preview updates correctly
- [ ] Console → no errors related to PDF rendering

### Production Build
- [ ] `npm run build` → builds successfully
- [ ] Built app → PDF preview works in production mode
- [ ] PDF.js worker → loads correctly from bundled assets
- [ ] No 404 errors for worker files

### Deployment
- [ ] Deploy to staging → PDF preview works
- [ ] Deploy to production → PDF preview works
- [ ] CDN/static assets → PDF.js worker accessible

## Security Testing

### File Handling
- [ ] PDF files → processed client-side only (no server upload for preview)
- [ ] Object URLs → created and revoked properly
- [ ] File content → not exposed to global scope
- [ ] Memory → sensitive data cleared after use

## Accessibility Testing

### Screen Readers
- [ ] PDF preview → has appropriate alt text
- [ ] Loading states → announced to screen readers
- [ ] Error states → announced to screen readers
- [ ] Controls → keyboard accessible

## Notes

### Test Environment Setup
```bash
# Enable feature flag
echo "VITE_FEATURE_PDF_STATIC_PREVIEW=1" >> .env

# Disable feature flag  
echo "VITE_FEATURE_PDF_STATIC_PREVIEW=0" >> .env

# Run tests
npm test

# Start dev server
npm run dev
```

### Test Files Needed
- Small PDF (< 1MB)
- Large PDF (> 10MB) 
- Multi-page PDF
- Single-page PDF
- Corrupted PDF file
- PNG/JPG/SVG files for regression testing

### Success Criteria
- ✅ Firefox shows NO native PDF controls for PDF uploads
- ✅ All existing functionality preserved for non-PDF files
- ✅ Feature flag allows instant rollback if needed
- ✅ No performance regressions
- ✅ No memory leaks
- ✅ Cross-browser compatibility maintained
