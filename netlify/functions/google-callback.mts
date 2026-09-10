import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/google-callback.ts';

export default withLambda(handler);

