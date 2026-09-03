import { describe, expect, it } from 'vitest';
import {
  ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH,
  getAdminPreviewFrameStyle,
} from './admin-preview-frame';

describe('getAdminPreviewFrameStyle', () => {
  it('keeps the latest 36 × 60 portrait order at its exact ratio in the large admin modal', () => {
    expect(getAdminPreviewFrameStyle(36, 60, true)).toEqual({
      aspectRatio: '36 / 60',
      width: '100%',
      height: 'auto',
      maxWidth: '39.6dvh',
      maxHeight: '66dvh',
    });
  });

  it('caps a landscape preview by the same viewport-height-derived ratio', () => {
    expect(getAdminPreviewFrameStyle(60, 36, true)).toEqual({
      aspectRatio: '60 / 36',
      width: '100%',
      height: 'auto',
      maxWidth: '110dvh',
      maxHeight: `${ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH}dvh`,
    });
  });

  it('fits compact portrait and landscape previews inside the square admin thumbnail', () => {
    expect(getAdminPreviewFrameStyle(36, 60, false)).toMatchObject({
      width: 'auto',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
    });
    expect(getAdminPreviewFrameStyle(60, 36, false)).toMatchObject({
      width: '100%',
      height: 'auto',
      maxWidth: '100%',
      maxHeight: '100%',
    });
  });

  it('fails safely for invalid dimensions without emitting an invalid CSS ratio', () => {
    expect(getAdminPreviewFrameStyle(0, Number.NaN, true)).toMatchObject({
      aspectRatio: '1 / 1',
      maxWidth: '66dvh',
      maxHeight: '66dvh',
    });
  });
});
