import type { ArtworkPreviewEditorProps } from './ArtworkPreviewEditor';
import { buildCloudinaryPdfPreviewUrl } from '@/utils/uploadArtworkFile';

export const isRawPdfPreviewSource = (value?: string | null) => {
  const url = String(value || '').toLowerCase();
  return Boolean(value) && (
    /\.pdf(?:$|[?#])/.test(url) ||
    url.includes('/raw/upload/') ||
    url.startsWith('application/pdf') ||
    url.startsWith('data:application/pdf')
  );
};

export const resolveArtworkPreviewImageSrc = ({
  src,
  previewUrl,
  resourceType,
  mimeType,
}: Pick<ArtworkPreviewEditorProps, 'src' | 'previewUrl' | 'resourceType' | 'mimeType'>) => {
  // Older saved carts use f_jpg transformations with a .pdf extension. They
  // are image previews; normalize them before applying the raw-PDF guard.
  const candidatePreviewSrc = buildCloudinaryPdfPreviewUrl(previewUrl || src);
  const hasExplicitPreview = Boolean(previewUrl) || candidatePreviewSrc !== src;
  const rawPdfRejected = isRawPdfPreviewSource(candidatePreviewSrc) || (!hasExplicitPreview && (resourceType === 'raw' || mimeType === 'application/pdf'));
  return rawPdfRejected ? '' : candidatePreviewSrc;
};

export const getPreviewCrossOrigin = (imageSrc?: string | null, requestedCrossOrigin?: '' | 'anonymous' | 'use-credentials') => {
  if (!requestedCrossOrigin || !imageSrc) return undefined;
  const normalized = imageSrc.trim().toLowerCase();
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) return undefined;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return requestedCrossOrigin;
  return undefined;
};

export const shouldStartPreviewLoad = ({
  imageSrc,
  rawPdfRejected,
  loadedPreviewSrc,
}: {
  imageSrc?: string | null;
  rawPdfRejected: boolean;
  loadedPreviewSrc?: string | null;
}) => Boolean(imageSrc) && !rawPdfRejected && loadedPreviewSrc !== imageSrc;
