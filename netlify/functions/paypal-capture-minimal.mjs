// Keep Neon visible to Netlify's esbuild dependency analysis because the
// shared CommonJS capture handler imports it at runtime.
import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-minimal.cjs';

export default withLambda(legacyModule.handler);
