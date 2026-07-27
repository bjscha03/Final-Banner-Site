import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/start-pdf-job.cjs';

export default withLambda(legacyModule.handler);

