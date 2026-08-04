import aiDesigner from './_shared/ai-designer/handler.cjs';
import { withDesignerRuntime } from './_shared/ai-designer/netlify-modern.mjs';

export default withDesignerRuntime(aiDesigner.statusHandler);
