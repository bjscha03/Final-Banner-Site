/**
 * Utility for uploading canvas images to Cloudinary.
 * Used when images are added to the canvas editor to ensure they persist
 * across page navigation and browser sessions.
 */

export interface UploadResult {
  secureUrl: string;
  fileKey: string;
  publicId: string;
  width?: number;
  height?: number;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error(`Upload request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Upload an image blob/file to Cloudinary via the upload-file Netlify function.
 * @param imageSource Can be a File, Blob, data URL, blob URL, or HTTP URL.
 * @param fileName Optional filename for the upload.
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

  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:') || imageSource.startsWith('blob:')) {
      const response = await fetchWithTimeout(imageSource, {}, 12_000);
      if (!response.ok) throw new Error(`Could not read temporary preview (${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Temporary preview was empty');
      fileToUpload = blob;
    } else if (/^https?:/i.test(imageSource)) {
      let isCloudinaryUrl = false;
      try {
        const host = new URL(imageSource).hostname.toLowerCase();
        isCloudinaryUrl = host === 'cloudinary.com' || host.endsWith('.cloudinary.com');
      } catch {
        isCloudinaryUrl = false;
      }

      if (isCloudinaryUrl) {
        const match = imageSource.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?(?:[?#].*)?$/);
        const fileKey = match ? match[1] : '';
        return {
          secureUrl: imageSource,
          fileKey,
          publicId: fileKey,
        };
      }

      const response = await fetchWithTimeout(imageSource, { mode: 'cors' }, 15_000);
      if (!response.ok) throw new Error(`Could not download preview (${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Downloaded preview was empty');
      fileToUpload = blob;
    } else {
      throw new Error('Invalid image source: must be a blob URL, HTTP URL, File, or Blob');
    }
  } else {
    fileToUpload = imageSource;
  }

  const formData = new FormData();
  const uploadFileName = fileToUpload instanceof File
    ? fileToUpload.name
    : (fileName || `canvas-image-${Date.now()}.png`);
  formData.append('file', fileToUpload, uploadFileName);

  console.log('📤 Uploading canvas image:', {
    fileName: uploadFileName,
    size: fileToUpload.size,
    type: fileToUpload.type
  });

  const response = await fetchWithTimeout('/.netlify/functions/upload-file', {
    method: 'POST',
    body: formData,
  }, 35_000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Upload failed:', errorText);
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const secureUrl = result.secureUrl || result.url;
  const fileKey = result.fileKey || result.publicId;
  if (!secureUrl || !fileKey) {
    throw new Error('Preview upload completed without a permanent URL');
  }

  return {
    secureUrl,
    fileKey,
    publicId: result.publicId || fileKey,
    width: result.width,
    height: result.height,
  };
}

/** Convert a blob URL to a File object. */
export async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetchWithTimeout(blobUrl, {}, 12_000);
  if (!response.ok) throw new Error(`Could not read blob URL (${response.status})`);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}
