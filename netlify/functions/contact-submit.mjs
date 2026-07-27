import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/contact-submit.cjs';

export default withLambda(legacyModule.handler);

