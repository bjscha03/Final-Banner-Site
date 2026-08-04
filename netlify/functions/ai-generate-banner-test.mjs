import { withLambda } from '@netlify/aws-lambda-compat';
import retired from './_shared/ai-designer/retired-wrapper.cjs';

export default withLambda(retired.handler);
