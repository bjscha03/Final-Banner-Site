'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PreviewArtifactValidationError,
  assertReadyPlacementPreview,
  buildCompositionSignatureFromPreview,
  normalizeCartItemPlacement,
} = require('../_shared/preview-artifact.cjs');

function artifact(overrides = {}) {
  const preview = {
    version: 3,
    sourceIdentity: 'uploads/customer-artwork@42@1',
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v42/customer-artwork.png',
    productType: 'banner',
    widthIn: 48,
    heightIn: 24,
    fitMode: 'fit',
    positionPct: { x: 12.5, y: -4.25 },
    scaleX: 1.6,
    scaleY: 1.35,
    compositionRevision: 7,
    url: 'https://res.cloudinary.com/demo/image/upload/exact-placement.jpg',
    publicId: 'exact-placement',
    previewUrl: 'https://res.cloudinary.com/demo/image/upload/exact-placement.jpg',
    previewPublicId: 'exact-placement',
    previewWidthPx: 1400,
    previewHeightPx: 700,
    uploadStatus: 'uploaded',
    ...overrides,
  };
  preview.compositionSignature = overrides.compositionSignature
    || buildCompositionSignatureFromPreview(preview);
  return preview;
}

test('server and browser canonical signature algorithms share a fixed vector', () => {
  assert.equal(
    buildCompositionSignatureFromPreview(artifact()),
    'placement-v3-0fmi0551wi3ftg',
  );
});

test('a complete permanent artifact validates and becomes the only commerce URL', () => {
  const placement = artifact();
  assert.equal(assertReadyPlacementPreview(placement), placement);
  const normalized = normalizeCartItemPlacement({
    id: 'cart-1',
    placement_preview: placement,
    thumbnail_url: 'https://example.com/wrong-original.jpg',
    web_preview_url: 'https://example.com/stale.jpg',
  });
  assert.equal(normalized.thumbnail_url, placement.previewUrl);
  assert.equal(normalized.web_preview_url, placement.previewUrl);
  assert.equal(normalized.composition_signature, placement.compositionSignature);
  assert.equal(normalized.composition_revision, placement.compositionRevision);
});

test('tampering any canonical transform or revision invalidates the artifact', () => {
  for (const changed of [
    { widthIn: 72 },
    { heightIn: 36 },
    { positionPct: { x: 13, y: -4.25 } },
    { scaleX: 1.7 },
    { scaleY: 1.4 },
    { compositionRevision: 8 },
    { sourceIdentity: 'different-source@42@1' },
  ]) {
    const original = artifact();
    assert.throws(
      () => assertReadyPlacementPreview({ ...original, ...changed }),
      PreviewArtifactValidationError,
    );
  }
});

test('a valid artifact for another product or size cannot attach to this cart line', () => {
  assert.throws(() => normalizeCartItemPlacement({
    product_type: 'car_magnet',
    width_in: 24,
    height_in: 12,
    placement_preview: artifact(),
  }), PreviewArtifactValidationError);
  assert.throws(() => normalizeCartItemPlacement({
    product_type: 'banner',
    width_in: 72,
    height_in: 24,
    placement_preview: artifact(),
  }), PreviewArtifactValidationError);
});

test('transient, blank-sized, and incomplete artifacts fail closed', () => {
  for (const changed of [
    { previewUrl: 'blob:https://bannersonthefly.com/transient' },
    { previewUrl: 'data:image/jpeg;base64,transient' },
    { sourceUrl: 'blob:https://bannersonthefly.com/original' },
    { previewWidthPx: 0 },
    { previewPublicId: '', publicId: '' },
    { uploadStatus: 'pending' },
  ]) {
    assert.throws(
      () => assertReadyPlacementPreview(artifact(changed)),
      PreviewArtifactValidationError,
    );
  }
});

test('Yard Sign designs retain isolated artifacts and signatures', () => {
  const first = artifact({
    sourceIdentity: 'yard-one@1@1',
    productType: 'yard_sign',
    widthIn: 24,
    heightIn: 18,
    previewUrl: 'https://res.cloudinary.com/demo/image/upload/yard-one.jpg',
    url: 'https://res.cloudinary.com/demo/image/upload/yard-one.jpg',
    previewPublicId: 'yard-one',
    publicId: 'yard-one',
  });
  const second = artifact({
    sourceIdentity: 'yard-two@1@1',
    productType: 'yard_sign',
    widthIn: 24,
    heightIn: 18,
    previewUrl: 'https://res.cloudinary.com/demo/image/upload/yard-two.jpg',
    url: 'https://res.cloudinary.com/demo/image/upload/yard-two.jpg',
    previewPublicId: 'yard-two',
    publicId: 'yard-two',
  });
  const normalized = normalizeCartItemPlacement({
    product_type: 'yard_sign',
    width_in: 24,
    height_in: 18,
    yard_sign_designs: [
      { id: 'design-one', placementPreview: first },
      { id: 'design-two', placementPreview: second },
    ],
  });
  assert.notEqual(first.compositionSignature, second.compositionSignature);
  assert.equal(normalized.yard_sign_designs[0].previewThumbnailUrl, first.previewUrl);
  assert.equal(normalized.yard_sign_designs[1].previewThumbnailUrl, second.previewUrl);
  assert.throws(() => normalizeCartItemPlacement({
    product_type: 'yard_sign',
    width_in: 48,
    height_in: 24,
    yard_sign_designs: [{ id: 'design-one', placementPreview: first }],
  }), PreviewArtifactValidationError);
});
