import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-design-deposit.cjs';

export default withLambda(legacyModule.handler);

