// The shared legacy handler loads these packages with runtime CommonJS
// require() calls. Surface them from the modern entrypoint so Netlify's
// esbuild packaging copies them into the deployed Lambda artifact.
import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/notify-order.cjs';

export default withLambda(legacyModule.handler);
