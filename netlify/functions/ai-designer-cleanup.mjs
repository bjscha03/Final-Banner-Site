import { withLambda } from '@netlify/aws-lambda-compat';
import 'cloudinary';
import storageModule from './_shared/ai-designer/storage.cjs';

const cleanupHandler = async () => {
  try {
    const deleted = await storageModule.cleanupTemporaryArtwork();
    console.info('[ai_designer_cleanup]', { deleted });
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted }) };
  } catch (error) {
    console.error('[ai_designer_cleanup_failed]', { category: error?.code || 'CLEANUP_FAILED' });
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};

export default withLambda(cleanupHandler);

export const config = {
  schedule: '@daily',
};
