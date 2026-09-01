import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import unsubscribeModule from './_shared/recovery-email-unsubscribe.cjs';

export default withLambda(unsubscribeModule.handler);
