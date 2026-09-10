const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPermanentEmailPreviewCandidates,
  getPermanentEmailPreviewSource,
} = require('../_shared/legacy/email-preview-source.cjs');

test('email preview source prefers the exact Yard Sign design over item-level artwork', () => {
  const item = {
    product_type: 'yard_sign',
    yard_sign_designs: [
      {
        previewThumbnailUrl: 'https://cdn.example.com/yard-first-positioned.jpg',
        fileUrl: 'https://cdn.example.com/yard-first-original.jpg',
      },
      {
        previewThumbnailUrl: 'https://cdn.example.com/yard-second-positioned.jpg',
      },
    ],
    thumbnail_url: 'https://cdn.example.com/wrong-item-level.jpg',
  };

  assert.equal(
    getPermanentEmailPreviewSource(item),
    'https://cdn.example.com/yard-first-positioned.jpg',
  );
});

test('email preview source reconstructs a permanent Cloudinary URL from file_key', () => {
  assert.equal(
    getPermanentEmailPreviewSource({
      file_key: 'uploads/customer-artwork_abc123',
      file_name: 'customer-artwork.png',
    }),
    'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer-artwork_abc123.png',
  );
});

test('email preview source converts image-type PDFs to a first-page JPG', () => {
  assert.equal(
    getPermanentEmailPreviewSource({
      file_url: 'https://res.cloudinary.com/demo/image/upload/v123/uploads/design.pdf',
      is_pdf: true,
    }),
    'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/v123/uploads/design.jpg',
  );
});

test('email preview candidates reject temporary and raw PDF sources', () => {
  assert.deepEqual(
    getPermanentEmailPreviewCandidates({
      placement_preview: { url: 'blob:https://bannersonthefly.com/temporary' },
      thumbnail_url: 'data:image/png;base64,temporary',
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
    }),
    [],
  );
});
