import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import base from './vite.handoff.config';
const config = mergeConfig(base, defineConfig({
  server: { port: 4189 },
  resolve: { alias: [
    { find: /^@stripe\/react-stripe-js$/, replacement: path.resolve(__dirname, 'checkoutStripeFixture.tsx') },
    { find: /^@stripe\/stripe-js$/, replacement: path.resolve(__dirname, 'checkoutStripeFixture.tsx') },
  ] },
}));
config.resolve.alias = [
  { find: /^(?:\.\/|@\/components\/checkout\/)checkoutEnvironment$/, replacement: path.resolve(__dirname, 'checkoutEnvironmentFixture.ts') },
  ...config.resolve.alias,
];
export default config;
