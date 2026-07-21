import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('artwork preservation regressions', () => {
  it('keeps original uploaded artwork in the upsell/add-to-cart quote even with overlay/text layers', () => {
    const source = read('src/components/design/BannerEditorLayout.tsx');
    expect(source).toContain('file: freshQuoteForCart.file ||');
    expect(source).toContain('file: freshQuoteForCart.file,');
    expect(source).toContain('overlayImages: currentOverlayImages');
    expect(source).toContain('canvasStateJson: canvasStateJson');
  });

  it('serializes all artwork fields through PayPal order capture', () => {
    const source = read('netlify/functions/paypal-capture-order.cjs');
    for (const field of [
      'file_name',
      'is_pdf',
      'overlay_images',
      'canvas_background_color',
      'image_scale',
      'image_position',
      'canvas_state_json',
      'final_render_file_key',
    ]) {
      expect(source).toContain(field);
    }
  });

  it('serializes all artwork fields through Stripe pending order creation', () => {
    const source = read('src/components/checkout/StripeCheckout.tsx');
    for (const field of [
      'file_key',
      'file_url',
      'text_elements',
      'overlay_image',
      'overlay_images',
      'final_render_url',
      'final_render_file_key',
      'canvas_state_json',
    ]) {
      expect(source).toContain(field);
    }
  });

  it('keeps admin original artwork downloads separate from production PDF downloads', () => {
    const source = read('src/pages/admin/Orders.tsx');
    const details = read('src/components/orders/OrderDetails.tsx');
    expect(source).toContain('Original Artwork');
    expect(source).toContain('Production PDFs');
    expect(details).toContain('Download Original Artwork');
    expect(source).toContain('onFileDownload(downloadInfo.url, order.id, index, downloadInfo.fileName)');
    expect(source).toContain('onPdfDownload(item, index, order.id)');
  });

  it('passes original filenames to Cloudinary attachment downloads', () => {
    const source = read('netlify/functions/download-file.cjs');
    expect(source).toContain('filename');
    expect(source).toContain('attachment: filename || undefined');
  });
});
