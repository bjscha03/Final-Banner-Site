import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import base from './vite.handoff.config';
export default mergeConfig(base, defineConfig({
  server: { port: 4189 },
  resolve: { alias: [
    { find: /^@stripe\/react-stripe-js$/, replacement: path.resolve(__dirname, 'checkoutStripeFixture.tsx') },
    { find: /^@stripe\/stripe-js$/, replacement: path.resolve(__dirname, 'checkoutStripeFixture.tsx') },
  ] },
}));
