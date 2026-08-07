import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-order.cjs';

const handler = (event, context) => legacyModule.handler(event, context);

export default withLambda(handler);
