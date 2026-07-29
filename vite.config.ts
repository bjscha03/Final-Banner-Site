import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// NOTE: A deferCssPlugin (media="print" + onload="this.media='all'") was
// previously used here but has been removed. The deferred-CSS pattern caused
// Flash of Unstyled Content (FOUC) that made the site appear broken / "not
// loading" when the onload handler fired late or the CSS CDN was slow.
// Standard blocking CSS from Netlify's CDN loads in <100 ms, so the perf
// trade-off wasn't worth the reliability risk.

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Enable polyfills for specific modules
      protocolImports: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: [
      // One preview pipeline is used by Design, Google Ads landing pages,
      // cart, checkout, upsells, and enlarged lightboxes. These exact aliases
      // deliberately sit before the general @ alias so legacy imports cannot
      // bypass decoded-image buffering or the cross-browser sizing fixes.
      {
        find: /^@\/components\/design\/ArtworkPreviewEditor$/,
        replacement: path.resolve(__dirname, "./src/components/design/StableArtworkPreviewEditor.tsx"),
      },
      {
        find: /^@\/components\/cart\/BannerPreview$/,
        replacement: path.resolve(__dirname, "./src/components/cart/StableBannerPreview.tsx"),
      },
      {
        find: /^\.\/cart\/BannerPreview$/,
        replacement: path.resolve(__dirname, "./src/components/cart/StableBannerPreview.tsx"),
      },
      {
        find: /^\.\/BannerPreview$/,
        replacement: path.resolve(__dirname, "./src/components/cart/StableBannerPreview.tsx"),
      },
      {
        find: /^@\/components\/preview\/ThumbnailPreviewWrapper$/,
        replacement: path.resolve(__dirname, "./src/components/preview/StableThumbnailPreviewWrapper.tsx"),
      },
      {
        find: /^\.\/preview\/ThumbnailPreviewWrapper$/,
        replacement: path.resolve(__dirname, "./src/components/preview/StableThumbnailPreviewWrapper.tsx"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        find: "util",
        replacement: "util/",
      },
    ],
  },
  build: {
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // Increase chunk warning limit since we have manual chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Force new file names on each build to bust cache
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        // Manual chunks for better code splitting
        manualChunks: {
          // React core - needed immediately
          'react-core': ['react', 'react-dom'],
          // React Router - needed for navigation
          'react-router': ['react-router-dom'],
          // UI library chunks
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-accordion',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-label',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
          ],
          // Canvas/Editor - lazy load for design pages only
          'canvas-editor': ['konva', 'react-konva', 'use-image'],
          // PDF handling - lazy load
          'pdf-libs': ['pdfjs-dist', 'pdfkit'],
          // Charts - only needed for admin
          'charts': ['recharts'],
          // Form handling
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Utilities
          'utils': ['date-fns', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          // State management
          'state': ['zustand', '@tanstack/react-query'],
        },
      },
    },
  },
}));
