import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { unsubscribeHandler } = require('./_shared/past-customer-marketing.cjs');

export const handler = unsubscribeHandler;
