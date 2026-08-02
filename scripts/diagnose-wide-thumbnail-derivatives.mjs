import sharp from 'sharp';

const urls = {
  original: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png',
  transformed: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto:good,w_800,c_limit/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png',
  transformedPng: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto:good/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png',
};

async function analyze(name, url) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  const input = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !input.length) throw new Error(`${name} failed HTTP ${response.status} bytes=${input.length}`);

  const metadata = await sharp(input, { failOn: 'none' }).metadata();
  const { data, info } = await sharp(input, { failOn: 'none' })
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let nonWhite = 0;
  let strongInk = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let channelSum = 0;
  const channels = info.channels;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      channelSum += r + g + b;
      const distance = Math.max(255 - r, 255 - g, 255 - b);
      if (distance > 10) {
        nonWhite += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (distance > 35) strongInk += 1;
    }
  }

  const total = info.width * info.height;
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

  const result = {
    name,
    url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: input.length,
    metadata,
    analysis: {
      width: info.width,
      height: info.height,
      nonWhiteFraction: nonWhite / total,
      strongInkFraction: strongInk / total,
      meanChannel: channelSum / (total * 3),
      bbox,
    },
  };
  console.log(`[WIDE_DERIVATIVE_DIAGNOSTIC] ${JSON.stringify(result)}`);
  return result;
}

const results = {};
for (const [name, url] of Object.entries(urls)) {
  results[name] = await analyze(name, url);
}

const original = results.original.analysis;
for (const name of ['transformed', 'transformedPng']) {
  const candidate = results[name].analysis;
  if (candidate.nonWhiteFraction < Math.max(0.05, original.nonWhiteFraction * 0.25)) {
    throw new Error(`${name} lost visible artwork: ${candidate.nonWhiteFraction} vs original ${original.nonWhiteFraction}`);
  }
}
