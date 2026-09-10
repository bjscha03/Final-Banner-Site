import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-repair-same-day-fees.cjs';

export default withLambda(legacyModule.handler);

