import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { sendHandler } = require('./_shared/past-customer-marketing.cjs');

export const handler = sendHandler;
