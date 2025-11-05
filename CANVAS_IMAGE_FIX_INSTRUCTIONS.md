# Canvas Image fileKey Fix - Implementation Guide

## Problem
When users add images to the canvas via AssetsPanel and save to cart, the images don't load back when editing from cart because the Cloudinary `fileKey` is missing.

## Root Cause
1. AssetsPanel uploads images to Cloudinary asynchronously in the background
2. User can click "Add to Canvas" before upload completes
3. Image is added to canvas with blob URL and no `fileKey`
4. When saving to cart, the `fileKey` is missing
5. When editing from cart, can't reconstruct Cloudinary URL

## Solution
Modify AssetsPanel.tsx to ensure Cloudinary upload completes BEFORE adding image to canvas.

## File to Modify
`src/components/design/editor/AssetsPanel.tsx`

## Changes Required

### Change 1: Make handleAddToCanvas async
Line 177: Change from:
```typescript
const handleAddToCanvas = (image: UploadedImage) => {
```

To:
```typescript
const handleAddToCanvas = async (image: UploadedImage) => {
```

### Change 2: Add Cloudinary upload check before adding to canvas
After line 180 (after the console.logs), add this code:

```typescript
    // CRITICAL FIX: Ensure image is uploaded to Cloudinary before adding to canvas
    // This ensures the fileKey is available for saving to cart and restoring later
    let finalImage = image;
    
    if (!image.fileKey && !image.cloudinaryUrl && image.url.startsWith('blob:')) {
      console.log('[IMAGE ADD] Image not yet uploaded to Cloudinary, uploading now...');
      
      try {
        // Fetch the blob and upload to Cloudinary
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
          console.log('[IMAGE ADD] Cloudinary upload success:', result);
          
          // Update the image in state with Cloudinary URL and fileKey
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
          console.log('[IMAGE ADD] Image updated with Cloudinary URL and fileKey:', finalImage.fileKey);
        } else {
          console.error('[IMAGE ADD] Cloudinary upload failed');
          alert('Failed to upload image to cloud storage. Please try again.');
          return;
        }
      } catch (error) {
        console.error('[IMAGE ADD] Error uploading to Cloudinary:', error);
        alert('Failed to upload image to cloud storage. Please try again.');
        return;
      }
    }
```

### Change 3: Use finalImage instead of image
Replace all references to `image` with `finalImage` in the rest of the function:

Line ~184: Change:
```typescript
const aspectRatio = image.width / image.height;
```
To:
```typescript
const aspectRatio = finalImage.width / finalImage.height;
```

Line ~195-210: Change:
```typescript
const imageObject = {
  type: 'image' as const,
  url: image.url,
  // ... other properties ...
  isPDF: image.isPDF || false,
  // CRITICAL BUG 2 FIX: Include fileKey and name so overlay image can be saved/restored
  fileKey: image.fileKey || image.cloudinaryUrl,
  name: image.name,
};
```

To:
```typescript
const imageObject = {
  type: 'image' as const,
  url: finalImage.url,
  // ... other properties ...
  isPDF: finalImage.isPDF || false,
  // CRITICAL: Include cloudinaryPublicId (fileKey) so image can be saved/restored from cart
  cloudinaryPublicId: finalImage.fileKey || finalImage.cloudinaryUrl,
  name: finalImage.name,
};
```

## Testing
1. Start the dev server
2. Go to /design-editor
3. Upload an image via AssetsPanel
4. Add image to canvas
5. Click "Add to Cart"
6. Check console logs - should see fileKey being saved
7. Click "Edit" on the cart item
8. Image should load back onto canvas correctly

## Expected Console Output
```
[IMAGE ADD] Clicked image: {id: "...", url: "blob:...", fileKey: undefined}
[IMAGE ADD] Image not yet uploaded to Cloudinary, uploading now...
[IMAGE ADD] Cloudinary upload success: {secureUrl: "https://res.cloudinary.com/...", fileKey: "..."}
[IMAGE ADD] Image updated with Cloudinary URL and fileKey: xyz123
[IMAGE ADD] Image object includes cloudinaryPublicId: xyz123
```

## Verification
After implementing, verify that:
1. Images added to canvas have `cloudinaryPublicId` set
2. Cart items saved to database have `overlay_image.fileKey`
3. Editing from cart loads images correctly
