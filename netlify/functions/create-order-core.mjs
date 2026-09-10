import { withLambda } from '@netlify/aws-lambda-compat';
// Public aliases must pass through the same authorization/session wrapper.
// Stripe calls the core only in-process with an unforgeable Symbol context.
import legacyModule from './_shared/legacy/create-order.cjs';

export default withLambda(legacyModule.handler);
