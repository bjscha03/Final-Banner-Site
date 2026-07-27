import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/detect-abandoned-carts.cjs';

export default withLambda(legacyModule.handler);

export const config = {
  schedule: '0 * * * *',
};

