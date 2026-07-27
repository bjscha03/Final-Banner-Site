import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/render-order-pdf-background.cjs';

export default withLambda(legacyModule.handler);

export const config = {
  background: true,
};

