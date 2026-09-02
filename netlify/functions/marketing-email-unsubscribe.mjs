import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import unsubscribeModule from './_shared/marketing-email-unsubscribe.cjs';

export default withLambda(unsubscribeModule.handler);
