import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import trackingEmailModule from './_shared/tracking-email-handler.cjs';

export default withLambda(trackingEmailModule.handler);
