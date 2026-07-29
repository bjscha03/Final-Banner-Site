import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
    hmr: false,
  },
  plugins: [
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
