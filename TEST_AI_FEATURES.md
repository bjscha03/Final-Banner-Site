# AI Features Testing Guide

## Test 1: Save AI Image Functionality

### Steps:
1. Navigate to `/design` page
2. Click on "AI Generator" tab
3. Enter a prompt (e.g., "Professional photograph of a sunset over mountains")
4. Select aspect ratio (e.g., "3:2")
5. Click "Generate Preview"
6. Wait for image to generate
7. Click the **bookmark icon** on the generated image
8. Verify you see a success message
9. Verify the bookmark icon changes to a checkmark for 2 seconds

### Expected Results:
- ✅ Image generates successfully
- ✅ Bookmark button is visible
- ✅ Clicking bookmark shows success feedback
- ✅ No console errors
- ✅ Image is saved to database

### Verification:
Navigate to `/my-ai-images` and verify the saved image appears in the grid.

---

## Test 2: My AI Images Page

### Steps:
1. Navigate to `/my-ai-images`
2. Verify saved images are displayed
3. Test "Download" button on an image
4. Test "Delete" button on an image (confirm deletion)
5. Test "Use in Design" button (hover over image)

### Expected Results:
- ✅ Page loads without errors
- ✅ Saved images are displayed in a grid
- ✅ Each image shows: thumbnail, prompt, tier badge, aspect ratio, save date
- ✅ Download button downloads the image
- ✅ Delete button removes the image after confirmation
- ✅ "Use in Design" button redirects to design page with image loaded

### Known Issue:
The "charsimple-widget" warning in console is from a third-party chat widget and can be ignored.

---

## Test 3: Generate 2 More Options

### Steps:
1. Navigate to `/design` page
2. Click on "AI Generator" tab
3. Enter a prompt
4. Click "Generate Preview"
5. Wait for 1 image to appear
6. Click "Generate 2 More Options" button
7. Wait for generation to complete

### Expected Results:
- ✅ Initial generation creates 1 image
- ✅ "Generate 2 More Options" button appears
- ✅ Clicking button shows loading state
- ✅ 2 new images are **added** to the grid (total 3 images)
- ✅ Button disappears after generating more options
- ✅ Toast notification shows "2 new images added"
- ✅ 1 credit is deducted from balance

### Verification:
Check that all 3 images are visible in the grid and can be selected/saved individually.

---

## Database Verification

To verify images are being saved correctly:

```bash
# Check saved images count
node check-prod-table.cjs
```

Expected output:
```
✅ Table saved_ai_images exists
Total saved images: [number]
```

---

## Troubleshooting

### Issue: Save button doesn't work
- Check browser console for errors
- Verify you're signed in
- Check Netlify function logs for `save-ai-image`

### Issue: My AI Images page is empty
- Verify images were actually saved (check database)
- Check browser console for errors
- Verify `get-saved-ai-images` function is working

### Issue: Generate 2 More Options doesn't add images
- Check browser console for errors
- Verify `ai-more-variations` function is working
- Check that you have sufficient credits

---

## Current Status

✅ Database table `saved_ai_images` exists in production
✅ Save functionality implemented in AIImageSelector
✅ "Generate 2 More Options" fix deployed (appends instead of replaces)
✅ MyAIImages page implemented with download/delete/use features
✅ All Netlify functions deployed and working

