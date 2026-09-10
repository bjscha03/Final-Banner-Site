// The legacy CommonJS handler loads these packages with runtime require().
// Surface them from the modern entrypoint so Netlify includes them in the
// deployed function artifact.
import '@neondatabase/serverless';
import 'cloudinary';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/download-file.cjs';

export default withLambda(legacyModule.handler);
