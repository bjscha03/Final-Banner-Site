import { createRequire } from 'module';
import { withLambda } from '@netlify/aws-lambda-compat';

const require = createRequire(import.meta.url);
const { sendHandler } = require('./_shared/past-customer-marketing.cjs');

export default withLambda(sendHandler);
