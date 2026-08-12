import { withLambda } from '@netlify/aws-lambda-compat';
import { getDeployStore, getStore } from '@netlify/blobs';
import 'cloudinary';
import sharp from 'sharp';
import handlerModule from './_shared/outbound-sales/manual-artwork-handler.cjs';
import artworkModule from './_shared/outbound-sales/manual-artwork.cjs';

function artworkStore() {
  const options = { name: artworkModule.MANUAL_ARTWORK_STORE_NAME, consistency: 'strong' };
  return process.env.CONTEXT === 'production' ? getStore(options) : getDeployStore(options);
}

const handler = handlerModule.createManualArtworkHandler({
  sharp,
  getStore: artworkStore,
});

export default withLambda(handler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 90,
  },
};
