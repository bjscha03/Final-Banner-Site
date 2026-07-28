import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/send-shipping-notification.cjs';

export default withLambda(legacyModule.handler);
