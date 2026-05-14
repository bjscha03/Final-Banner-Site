import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cjsModule = require('./generate-ai-designs.cjs');

export const handler = async (event, context) => {
  return cjsModule.handler(event, context);
};
