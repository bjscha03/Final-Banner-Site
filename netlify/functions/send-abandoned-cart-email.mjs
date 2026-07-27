import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/send-abandoned-cart-email.cjs';

export default withLambda(legacyModule.handler);

