// Keep this direct import in the entrypoint. Netlify's bundler can otherwise
// miss Sharp's native Lambda binary when it is required only through the
// shared CommonJS handler.
import 'sharp';
import aiDesigner from './_shared/ai-designer/handler.cjs';
import { withDesignerRuntime } from './_shared/ai-designer/netlify-modern.mjs';

export default withDesignerRuntime(aiDesigner.workerHandler);

export const config = {
  background: true,
};
