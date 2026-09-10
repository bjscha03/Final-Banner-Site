import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from './_shared/legacy/generate-upload-signature.js';

export default withLambda(handler);

