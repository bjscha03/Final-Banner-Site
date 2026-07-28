// The legacy admin upload handler uses runtime CommonJS requires. Import the
// production packages here so Netlify includes them in the modern function
// artifact.
import '@neondatabase/serverless';
import 'cloudinary';
import 'busboy';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/upload-final-print-pdf.cjs';

export default withLambda(legacyModule.handler);
