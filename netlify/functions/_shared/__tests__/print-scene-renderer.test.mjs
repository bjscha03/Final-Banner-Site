import { describe, it, expect } from 'vitest';
import assert from 'assert';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import renderer from '../print-scene-renderer.cjs';

const { renderPrintSceneToPdfBuffer, effectiveResolution } = renderer;

describe('print scene v2 renderer', () => {

  async function createVectorPdf() {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([500, 400]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Tiny vector family-tree label', { x: 20, y: 360, size: 6, font, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: 20, y: 350 }, end: { x: 480, y: 20 }, thickness: 0.25, color: rgb(0, 0, 0) });
    const page2 = pdf.addPage([500, 400]);
    page2.drawText('Second PDF page', { x: 20, y: 360, size: 12, font, color: rgb(0, 0, 0) });
    return Buffer.from(await pdf.save());
  }

  it('embeds original vector PDF, transparent PNG, JPG, transforms, and text at banner sizes', async () => {
    const vectorPdf = await createVectorPdf();
    const transparentPng = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#4466aa' } }).jpeg({ quality: 95 }).toBuffer();
    const assets = new Map([
      ['https://assets.example/vector.pdf', vectorPdf],
      ['https://assets.example/transparent.png', transparentPng],
      ['https://assets.example/photo.jpg', jpeg],
    ]);
    global.fetch = async (url) => {
      const body = assets.get(url);
      return body ? { ok: true, status: 200, arrayBuffer: async () => body } : { ok: false, status: 404, statusText: 'Not Found' };
    };

    const baseScene = {
      sceneVersion: 2,
      widthIn: 24,
      heightIn: 72,
      backgroundColor: '#ffffff',
      objects: [
        { id: 'pdf-rotated-offcanvas', type: 'image', xIn: -1, yIn: 2, widthIn: 18, heightIn: 14.4, rotation: 5, opacity: 0.95, zIndex: 1, source: { originalUrl: 'https://assets.example/vector.pdf', mimeType: 'application/pdf', format: 'pdf', pdfPageNumber: 1, isVector: true } },
        { id: 'png-transparent', type: 'image', xIn: 3, yIn: 20, widthIn: 12, heightIn: 6, rotation: 0, opacity: 0.8, zIndex: 2, source: { originalUrl: 'https://assets.example/transparent.png', mimeType: 'image/png', format: 'png', originalWidth: 1200, originalHeight: 600 } },
        { id: 'jpg-stretched', type: 'image', xIn: 2, yIn: 34, widthIn: 20, heightIn: 5, rotation: 0, opacity: 1, zIndex: 3, source: { originalUrl: 'https://assets.example/photo.jpg', mimeType: 'image/jpeg', format: 'jpg', originalWidth: 2400, originalHeight: 1200 } },
        { id: 'text-layer', type: 'text', xIn: 1, yIn: 52, widthIn: 10, heightIn: 1, rotation: 0, opacity: 1, zIndex: 4, text: { content: 'Vector text layer', fontSize: 0.4, color: '#111111' } },
      ],
    };

    for (const [widthIn, heightIn] of [[24, 72], [36, 96], [48, 120]]) {
      const result = await renderPrintSceneToPdfBuffer({ ...baseScene, widthIn, heightIn });
      expect(result.buffer.length).toBeGreaterThan(1000);
      expect(result.metadata.resolution[0].isVector).toBe(true);
      expect(result.metadata.resolution[1].effectivePpi).toBe(100);
      expect(result.metadata.resolution[1].status).toBe('fail');
    }

    expect(effectiveResolution(baseScene.objects[2]).effectivePpi).toBe(120);
    await assert.rejects(() => renderPrintSceneToPdfBuffer({ ...baseScene, objects: [{ id: 'bad-data', type: 'image', widthIn: 1, heightIn: 1, source: { originalUrl: 'data:image/png;base64,abc' } }] }), /Invalid production source/);
    await assert.rejects(() => renderPrintSceneToPdfBuffer({ ...baseScene, objects: [{ id: 'bad-blob', type: 'image', widthIn: 1, heightIn: 1, source: { originalUrl: 'blob:https://example/abc' } }] }), /Invalid production source/);
    await assert.rejects(() => renderPrintSceneToPdfBuffer({ ...baseScene, objects: [{ id: 'missing', type: 'image', widthIn: 1, heightIn: 1, source: { originalUrl: 'https://assets.example/missing.png', mimeType: 'image/png', format: 'png' } }] }), /Failed to fetch production asset/);
  });
});
