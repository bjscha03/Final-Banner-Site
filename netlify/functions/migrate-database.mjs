import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/migrate-database.cjs';

export default withLambda(legacyModule.handler);

