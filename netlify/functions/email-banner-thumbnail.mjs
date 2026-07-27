import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/email-banner-thumbnail.cjs';

export default withLambda(legacyModule.handler);

