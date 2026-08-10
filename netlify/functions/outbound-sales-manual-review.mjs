import { withLambda } from '@netlify/aws-lambda-compat';
import { Resend } from 'resend';
import manualReviewModule from './_shared/outbound-sales/manual-review-handler.cjs';
import outboundDeliveryModule from './_shared/outbound-sales/outbound-delivery.cjs';

const manualReviewHandler = manualReviewModule.createManualReviewHandler({
  dependencies: {
    sendPermissionedMarketingMessage(options) {
      const apiKey = String(
        options.env?.OUTBOUND_PERMISSIONED_RESEND_API_KEY
          || options.env?.RESEND_API_KEY
          || '',
      ).trim();
      return outboundDeliveryModule.sendPermissionedMarketingMessage({
        ...options,
        transport: new Resend(apiKey),
      });
    },
  },
});

export default withLambda(manualReviewHandler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 90,
  },
};
