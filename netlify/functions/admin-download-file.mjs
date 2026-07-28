// The legacy admin download handler uses runtime CommonJS requires. Declare
// those external packages at the modern entrypoint so Netlify includes them in
// the deployed artifact.
import '@neondatabase/serverless';
import 'cloudinary';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-download-file.cjs';

export default withLambda(legacyModule.handler);
