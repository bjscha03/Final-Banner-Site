// The shared upload handler uses runtime CommonJS requires. Surface the
// external packages from this modern entrypoint so Netlify copies them into
// the deployed artifact.
import 'cloudinary';
import 'busboy';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/upload-file.cjs';

export default withLambda(legacyModule.handler);
