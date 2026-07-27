import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/upload-final-print-pdf.cjs';

export default withLambda(legacyModule.handler);

