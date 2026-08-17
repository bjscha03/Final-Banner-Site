import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { statusHandler } = require('./_shared/past-customer-marketing.cjs');

export const handler = statusHandler;
