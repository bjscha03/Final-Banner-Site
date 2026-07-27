import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/linkedin-auth.ts';

export default withLambda(handler);

