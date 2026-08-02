import sharp from 'sharp';
import { withLambda } from '@netlify/aws-lambda-compat';

const SOURCE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png';

async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const response = await fetch(SOURCE_URL, { headers: { 'Cache-Control': 'no-cache' } });
    const arrayBuffer = await response.arrayBuffer();
    const input = Buffer.from(arrayBuffer);
    if (!response.ok || !input.length) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceStatus: response.status, bytes: input.length }),
      };
    }

    const image = sharp(input, { failOn: 'none' });
    const metadata = await image.metadata();
    const analysis = await sharp(input, { failOn: 'none' })
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = analysis;
    const channels = info.channels;
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    let nonWhitePixels = 0;
    let nonTransparentLikePixels = 0;
    let darkest = 255;
    let brightest = 0;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        darkest = Math.min(darkest, min);
        brightest = Math.max(brightest, max);
        const distanceFromWhite = Math.max(255 - r, 255 - g, 255 - b);
        if (distanceFromWhite > 10) {
          nonWhitePixels += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if (distanceFromWhite > 35) nonTransparentLikePixels += 1;
      }
    }

    const totalPixels = info.width * info.height;
    const bbox = maxX >= minX && maxY >= minY
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          widthFraction: (maxX - minX + 1) / info.width,
          heightFraction: (maxY - minY + 1) / info.height,
        }
      : null;

    const preview = await sharp(input, { failOn: 'none' })
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        sourceUrl: SOURCE_URL,
        sourceStatus: response.status,
        sourceContentType: response.headers.get('content-type'),
        sourceBytes: input.length,
        metadata,
        analysis: {
          width: info.width,
          height: info.height,
          channels,
          darkest,
          brightest,
          nonWhitePixels,
          nonWhiteFraction: nonWhitePixels / totalPixels,
          strongInkFraction: nonTransparentLikePixels / totalPixels,
          bbox,
        },
        previewDataUrl: `data:image/png;base64,${preview.toString('base64')}`,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    };
  }
}

export default withLambda(handler);
