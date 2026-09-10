import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-credits-status.cjs';

export default withLambda(legacyModule.handler);

