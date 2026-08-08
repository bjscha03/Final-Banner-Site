// The backend handler remains authoritative for pricing, identity, PayPal
// order linkage, and buyer-visible line items.
import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-create-order-forward.cjs';
import orderDetails from './_shared/legacy/paypal-order-details.cjs';
import runtimeConfig from './_shared/paypal-runtime-config.cjs';

const handler = async (event, context) => {
  runtimeConfig.preparePayPalRuntime({ event });
  return legacyModule.handler(event, context);
};

export const _test = orderDetails;

export default withLambda(handler);
