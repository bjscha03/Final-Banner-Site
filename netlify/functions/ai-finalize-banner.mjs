import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-finalize-banner.cjs';

export default withLambda(legacyModule.handler);

