import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/linkedin-callback.ts';

export default withLambda(handler);

