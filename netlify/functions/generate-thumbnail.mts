import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/generate-thumbnail.ts';

export default withLambda(handler);

