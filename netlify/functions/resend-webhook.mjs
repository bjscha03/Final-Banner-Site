import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/resend-webhook.cjs';
import { createHandler as createTradeShowHandler } from './trade-show-email-webhook.mjs';

const tradeShowHandler = createTradeShowHandler();

const handler = async (event, context) => {
  const existingResult = await legacyModule.handler(event, context);
  if (Number(existingResult?.statusCode || 500) >= 400) return existingResult;
  const tradeShowResult = await tradeShowHandler(event, context);
  if (Number(tradeShowResult?.statusCode || 500) >= 400) return tradeShowResult;
  return existingResult;
};

export default withLambda(handler);
