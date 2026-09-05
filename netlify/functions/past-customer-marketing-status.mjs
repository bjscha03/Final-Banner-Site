import { createRequire } from 'module';
import { withLambda } from '@netlify/aws-lambda-compat';

const require = createRequire(import.meta.url);
const { statusHandler } = require('./_shared/past-customer-marketing.cjs');

export default withLambda(statusHandler);
