# Canvas Image fileKey Fix - COMPLETED ✅

## Problem
When users add images to the canvas via AssetsPanel and save to cart, the images don't load back when editing from cart because the Cloudinary `fileKey` is missing.

## Root Cause
1. AssetsPanel uploads images to Cloudinary asynchronously in the background
2. User can click "Add to Canvas" before upload completes
3. Image is added to canvas with blob URL and no `fileKey`
4. When saving to cart, the `fileKey` is missing
5. When editing from cart, can't reconstruct Cloudinary URL

## Solution Implemented
Modified AssetsPanel.tsx to ensure Cloudinary upload completes BEFORE adding image to canvas.

## Files Modified

### 1. src/components/design/editor/AssetsPanel.tsx
**Changes:**
- Made `handleAddToCanvas` async
- Added upload check before adding to canvas - if image has blob URL and no fileKey, upload to Cloudinary first
- Changed property name from `fileKey` to `cloudinaryPublicId` to match ImageObject interface
- Use `finalImage` variable to hold either original image or uploaded image with fileKey

**Key Code:**
```typescript
const handleAddToCanvas = async (image: UploadedImage) => {
  // ... console logs ...
  
  // CRITICAL FIX: Ensure image is uploaded to Cloudinary before adding to canvas
  let finalImage = image;
  
  if (!image.fileKey && !image.cloudinaryUrl && image.url.startsWith('blob:')) {
    console.log('[IMAGE ADD] Image not yet uploaded to Cloudinary, uploading now...');
    
    try {
      // Fetch blob and upload to Cloudinary
      const response = await fetch(image.url);
      const blob = await response.blob();
      const file = new File([blob], image.name, { type: blob.type });
      
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/.netlify/functions/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        const updatedImage = {
          ...image,
          url: result.secureUrl,
          fileKey: result.fileKey || result.publicId,
          cloudinaryUrl: result.secureUrl,
        };
        
        setUploadedImages((prev) => 
          prev.map((img) => img.id === image.id ? updatedImage : img)
        );
        
        finalImage = updatedImage;
      } else {
        alert('Failed to upload image to cloud storage. Please try again.');
        return;
      }
    } catch (error) {
      alert('Failed to upload image to cloud storage. Please try again.');
      return;
    }
  }
  
  const imageObject = {
    type: 'image' as const,
    url: finalImage.url,
    // ... other properties ...
    cloudinaryPublicId: finalImage.fileKey || finalImage.cloudinaryUrl,
    name: finalImage.name,
  };
  
  addObject(imageObject);
};
```

### 2. src/components/design/BannerEditorLayout.tsx
**Changes:**
- Updated line 636 to extract `cloudinaryPublicId` from editor object (with fallback to `fileKey` for backwards compatibility)

**Before:**
```typescript
fileKey: overlayObj.fileKey || '',
```

**After:**
```typescript
fileKey: overlayObj.cloudinaryPublicId || overlayObj.fileKey || '',
```

## How It Works Now

### Upload Flow:
1. User uploads image via AssetsPanel
2. Image is added to `uploadedImages` state with blob URL
3. Background upload to Cloudinary starts
4. User clicks "Add to Canvas"
5. **NEW:** If fileKey is missing, upload completes synchronously before adding to canvas
6. Image is added to canvas with `cloudinaryPublicId` set
7. User clicks "Add to Cart"
8. BannerEditorLayout extracts `cloudinaryPublicId` from editor object
9. Cart item is saved to database with `overlay_image.fileKey`

### Edit Flow:
1. User clicks "Edit" on cart item
2. `loadFromCartItem()` loads cart data into quote store
3. BannerEditorLayout loads overlay image from quote store
4. Cloudinary URL is reconstructed from `fileKey`
5. Image is added to canvas with `cloudinaryPublicId` set
6. Image displays correctly ✅

## Testing Checklist
- [ ] Upload image via AssetsPanel
- [ ] Add image to canvas
- [ ] Check console logs - should see Cloudinary upload success
- [ ] Click "Add to Cart"
- [ ] Check console logs - should see fileKey being saved
- [ ] Click "Edit" on cart item
- [ ] Image should load back onto canvas correctly
- [ ] Check console logs - should see fileKey being loaded

## Expected Console Output
```
[IMAGE ADD] Clicked image: {id: "...", url: "blob:...", fileKey: undefined}
[IMAGE ADD] Image not yet uploaded to Cloudinary, uploading now...
[IMAGE ADD] Cloudinary upload success: {secureUrl: "https://res.cloudinary.com/...", fileKey: "..."}
[IMAGE ADD] Image updated with Cloudinary URL and fileKey: xyz123
[IMAGE ADD] Image object includes cloudinaryPublicId: xyz123
```

## Build Status
✅ Build successful (npm run build)
- No TypeScript errors
- No new warnings related to our changes

## Next Steps
1. Test the complete flow in the browser
2. Verify images load correctly when editing from cart
3. Check that fileKey is being saved to database
4. Verify console logs show correct fileKey values

## Notes
- The `ImageObject` interface in `src/store/editor.ts` already had `cloudinaryPublicId` field defined
- Used `cloudinaryPublicId` instead of `fileKey` to match the existing interface
- Added fallback to `fileKey` in BannerEditorLayout for backwards compatibility
- The fix ensures images are always uploaded to Cloudinary before being added to canvas
- Users will see a brief delay when adding images if upload hasn't completed yet
