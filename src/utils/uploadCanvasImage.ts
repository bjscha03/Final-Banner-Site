/**
 * Utility for uploading canvas images to Cloudinary
 * Used when images are added to the canvas editor to ensure they persist across sessions
 */

export interface UploadResult {
  secureUrl: string;
  fileKey: string;
  publicId: string;
  width?: number;
  height?: number;
}

/**
 * Upload an image blob/file to Cloudinary via the upload-file Netlify function
 * @param imageSource - Can be a File, Blob, or blob URL string
 * @param fileName - Optional filename for the upload
 * @returns Upload result with Cloudinary URL and fileKey
 */
export async function uploadCanvasImageToCloudinary(
  imageSource: File | Blob | string,
  fileName?: string
): Promise<UploadResult> {
  console.log('📤 uploadCanvasImageToCloudinary called:', {
    type: typeof imageSource,
    fileName,
    isBlobUrl: typeof imageSource === 'string' && imageSource.startsWith('blob:')
  });

  let fileToUpload: File | Blob;

  // If imageSource is a blob URL, fetch it first
  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('blob:')) {
      console.log('📥 Fetching blob from URL:', imageSource.substring(0, 50) + '...');
      const response = await fetch(imageSource);
      const blob = await response.blob();
      fileToUpload = blob;
    } else if (imageSource.startsWith('http')) {
      // If it's already a Cloudinary URL, no need to re-upload
      console.log('⚠️ Image is already a Cloudinary URL, skipping upload');
      // Extract fileKey from URL
      const match = imageSource.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      const fileKey = match ? match[1] : '';
      return {
        secureUrl: imageSource,
        fileKey,
        publicId: fileKey,
      };
    } else {
      throw new Error('Invalid image source: must be a blob URL, HTTP URL, File, or Blob');
    }
  } else {
    fileToUpload = imageSource;
  }

  // Create FormData for upload
  const formData = new FormData();
  
  // If we have a File, use its name; otherwise use provided fileName or generate one
  const uploadFileName = fileToUpload instanceof File 
    ? fileToUpload.name 
    : (fileName || `canvas-image-${Date.now()}.png`);
  
  formData.append('file', fileToUpload, uploadFileName);

  console.log('📤 Uploading to Cloudinary via upload-file function...', {
    fileName: uploadFileName,
    size: fileToUpload.size,
    type: fileToUpload.type
  });

  // Upload to Cloudinary via Netlify function
  const response = await fetch('/.netlify/functions/upload-file', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Upload failed:', errorText);
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Upload successful:', result);

  return {
    secureUrl: result.secureUrl,
    fileKey: result.fileKey || result.publicId,
    publicId: result.publicId || result.fileKey,
    width: result.width,
    height: result.height,
  };
}

/**
 * Convert a blob URL to a File object
 * Useful for uploading blob URLs that need to be persisted
 */
export async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}
