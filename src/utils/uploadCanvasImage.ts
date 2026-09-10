/**
 * Utility for uploading canvas images to Cloudinary.
 * Used when images are added to the canvas editor to ensure they persist
 * across page navigation and browser sessions.
 */

import { uploadArtworkFile } from '@/utils/uploadArtworkFile';

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

function isCloudinaryUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
}

function getCloudinaryPublicId(value: string): string {
  const match = value.match(/\/upload\/(?:[^/]+\/)*(?:v\d+\/)?(.+?)(?:\.[^.\/]+)?(?:[?#].*)?$/);
  return match ? match[1] : '';
}

/**
 * Upload an image blob/file to Cloudinary using the same signed direct-upload
 * transport as original customer artwork. Large canvas snapshots no longer
 * traverse Netlify's binary request body.
 *
 * @param imageSource Can be a File, Blob, data URL, blob URL, or HTTP URL.
 * @param fileName Optional filename for the upload.
 */
export async function uploadCanvasImageToCloudinary(
  imageSource: File | Blob | string,
  fileName?: string,
): Promise<UploadResult> {
  console.log('📤 uploadCanvasImageToCloudinary called:', {
    type: typeof imageSource,
    fileName,
    isBlobUrl: typeof imageSource === 'string' && imageSource.startsWith('blob:'),
  });

  let fileToUpload: File;

  if (typeof imageSource === 'string') {
    if (/^https?:/i.test(imageSource) && isCloudinaryUrl(imageSource)) {
      const fileKey = getCloudinaryPublicId(imageSource);
      return {
        secureUrl: imageSource,
        fileKey,
        publicId: fileKey,
      };
    }

    if (
      imageSource.startsWith('data:')
      || imageSource.startsWith('blob:')
      || /^https?:/i.test(imageSource)
    ) {
      const response = await fetchWithTimeout(
        imageSource,
        /^https?:/i.test(imageSource) ? { mode: 'cors' } : {},
        /^https?:/i.test(imageSource) ? 20_000 : 12_000,
      );
      if (!response.ok) throw new Error(`Could not read preview (${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Preview image was empty');
      const uploadFileName = fileName || `canvas-image-${Date.now()}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
      fileToUpload = new File([blob], uploadFileName, { type: blob.type || 'image/png' });
    } else {
      throw new Error('Invalid image source: must be a data URL, blob URL, HTTP URL, File, or Blob');
    }
  } else if (imageSource instanceof File) {
    fileToUpload = imageSource;
  } else {
    const uploadFileName = fileName || `canvas-image-${Date.now()}.${imageSource.type.includes('jpeg') ? 'jpg' : 'png'}`;
    fileToUpload = new File([imageSource], uploadFileName, {
      type: imageSource.type || 'image/png',
    });
  }

  console.log('📤 Uploading canvas image directly:', {
    fileName: fileToUpload.name,
    size: fileToUpload.size,
    type: fileToUpload.type,
  });

  const result = await uploadArtworkFile(fileToUpload, {
    correlationId: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  return {
    secureUrl: result.secureUrl,
    fileKey: result.fileKey,
    publicId: result.publicId,
    width: result.width || undefined,
    height: result.height || undefined,
  };
}

/** Convert a blob URL to a File object. */
export async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetchWithTimeout(blobUrl, {}, 12_000);
  if (!response.ok) throw new Error(`Could not read blob URL (${response.status})`);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}
