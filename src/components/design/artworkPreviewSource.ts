import type { ArtworkPreviewEditorProps } from './ArtworkPreviewEditor';

export const isRawPdfPreviewSource = (value?: string | null) => {
  const url = String(value || '').toLowerCase();
  return Boolean(value) && (
    url.endsWith('.pdf') ||
    url.includes('/raw/upload/') ||
    url.startsWith('application/pdf')
  );
};

export const resolveArtworkPreviewImageSrc = ({
  src,
  previewUrl,
  resourceType,
  mimeType,
}: Pick<ArtworkPreviewEditorProps, 'src' | 'previewUrl' | 'resourceType' | 'mimeType'>) => {
  const candidatePreviewSrc = previewUrl || src;
  const hasExplicitPreview = Boolean(previewUrl);
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
