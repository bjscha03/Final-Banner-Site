import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/fix-blob-urls.ts';

export default withLambda(handler);

