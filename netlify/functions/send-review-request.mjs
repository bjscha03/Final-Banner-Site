// The review-request implementation is isolated in a shared CommonJS module.
// Declare its runtime dependencies here so Netlify includes them in the bundle.
import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import reviewRequestModule from './_shared/review-request-handler.cjs';

export default withLambda(reviewRequestModule.handler);
