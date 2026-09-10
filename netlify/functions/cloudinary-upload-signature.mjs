// Surface Cloudinary from the modern entrypoint so Netlify packages the
// dependency used by the shared Lambda-compatible handler.
import 'cloudinary';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/cloudinary-upload-signature.cjs';

export default withLambda(legacyModule.handler);
