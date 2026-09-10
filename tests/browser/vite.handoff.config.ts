import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import sharp from 'sharp';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
    hmr: false,
  },
  plugins: [
    {
      name: 'compact-builder-test-upload',
      configureServer(server) {
        // Test-only receiver: WebKit route interception omits file bytes.
        // Receiving real multipart HTTP verifies the same bytes in every engine.
        const assets = new Map<string, Buffer>();
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '/', 'http://127.0.0.1:4175');
          if (!url.pathname.startsWith('/__compact-test-')) return next();
          const scenario = url.searchParams.get('scenario') || 'default';
          if (url.pathname === '/__compact-test-asset') {
            const kind = url.searchParams.get('kind') || 'original';
            const bytes = assets.get(`${scenario}:${kind}`);
            res.statusCode = bytes ? 200 : 404;
            res.setHeader('Content-Type', kind === 'placement' ? 'image/jpeg' : 'image/png');
            res.end(bytes || 'not uploaded');
            return;
          }
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            const body = Buffer.concat(chunks);
            const boundary = String(req.headers['content-type']).match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
            if (!boundary) throw new Error('Missing multipart boundary');
            const marker = body.indexOf(Buffer.from('filename="'));
            if (marker < 0) throw new Error('Missing multipart file');
            const filenameStart = marker + 10;
            const filenameEnd = body.indexOf(Buffer.from('"'), filenameStart);
            const filename = body.subarray(filenameStart, filenameEnd).toString();
            const start = body.indexOf(Buffer.from('\r\n\r\n'), filenameEnd) + 4;
            const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), start);
            if (start < 4 || end <= start) throw new Error('Empty multipart file');
            const bytes = body.subarray(start, end);
            const metadata = await sharp(bytes).metadata();
            const kind = filename.startsWith('placement-v3-') ? 'placement' : 'original';
            assets.set(`${scenario}:${kind}`, bytes);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              secure_url: `http://${req.headers.host}/__compact-test-asset?scenario=${encodeURIComponent(scenario)}&kind=${kind}`,
              public_id: `${scenario}-${kind}`, asset_id: `${scenario}-${kind}-asset`, version: 7,
              resource_type: 'image', format: kind === 'placement' ? 'jpg' : 'png',
              bytes: bytes.length, width: metadata.width, height: metadata.height,
            }));
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        });
      },
    },
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@\/components\/design\/ArtworkPreviewEditor$/,
        replacement: path.resolve(__dirname, '../../src/components/design/SessionStableArtworkPreviewEditor.tsx'),
      },
      {
        find: /^@\/components\/cart\/BannerPreview$/,
        replacement: path.resolve(__dirname, '../../src/components/cart/StableBannerPreview.tsx'),
      },
      {
        find: /^@\/components\/preview\/ThumbnailPreviewWrapper$/,
        replacement: path.resolve(__dirname, '../../src/components/preview/StableThumbnailPreviewWrapper.tsx'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, '../../src'),
      },
      {
        find: 'util',
        replacement: 'util/',
      },
    ],
  },
});
