import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/canva-export.cjs';

export default withLambda(legacyModule.handler);

