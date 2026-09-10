import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: ['react-helmet-async'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    ssr: 'src/entry-server.tsx',
    outDir: '.ssr-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'entry-server.mjs',
      },
    },
  },
});
