import { withLambda } from '@netlify/aws-lambda-compat';
import { Resend } from 'resend';
import { getDeployStore, getStore } from '@netlify/blobs';
import sharp from 'sharp';
import manualReviewModule from './_shared/outbound-sales/manual-review-handler.cjs';
import outboundDeliveryModule from './_shared/outbound-sales/outbound-delivery.cjs';
import manualArtworkModule from './_shared/outbound-sales/manual-artwork.cjs';

function artworkStore() {
  const options = { name: manualArtworkModule.MANUAL_ARTWORK_STORE_NAME, consistency: 'strong' };
  return process.env.CONTEXT === 'production' ? getStore(options) : getDeployStore(options);
}

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
    loadVerifiedManualArtwork(options) {
      return manualArtworkModule.loadVerifiedManualArtwork({
        ...options, store: artworkStore(), sharp,
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
