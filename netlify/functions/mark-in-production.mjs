// The shared CommonJS handler loads Neon and Resend at runtime. Declare both
// packages at the modern entrypoint so Netlify includes them in the deployed
// function artifact and the Admin "Mark In Production" action can update the
// order and send the customer notification reliably.
import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/mark-in-production.cjs';

export default withLambda(legacyModule.handler);
