// The recovery handler delegates to the shared CommonJS order-email handler.
// Make the runtime dependencies visible to Netlify's modern bundler.
import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/resend-order-emails.cjs';

export default withLambda(legacyModule.handler);
