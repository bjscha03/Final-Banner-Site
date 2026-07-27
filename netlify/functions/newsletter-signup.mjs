import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/newsletter-signup.cjs';

export default withLambda(legacyModule.handler);

