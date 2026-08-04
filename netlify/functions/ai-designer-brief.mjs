import { withLambda } from '@netlify/aws-lambda-compat';
import aiDesigner from './_shared/ai-designer/handler.cjs';

export default withLambda(aiDesigner.briefHandler);
