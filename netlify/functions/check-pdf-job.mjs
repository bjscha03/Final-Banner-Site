import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/check-pdf-job.cjs';

export default withLambda(legacyModule.handler);

