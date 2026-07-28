import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-update-order-customer.cjs';

export default withLambda(legacyModule.handler);
