/**
 * Convert a base64-encoded image (without the data URL prefix) into a File
 * object that can be passed to the existing FileUploader / handleFileUpload
 * flow used across the designer pages.
 */
export function base64ToFile(
  base64: string,
  fileName: string,
  mimeType: string = 'image/png',
): File {
  const cleaned = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = atob(cleaned);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}
