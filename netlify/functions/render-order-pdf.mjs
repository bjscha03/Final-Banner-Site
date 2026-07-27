import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/render-order-pdf.cjs';

export default withLambda(legacyModule.handler);

