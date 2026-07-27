import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-create-deposit-for-intake.cjs';

export default withLambda(legacyModule.handler);

