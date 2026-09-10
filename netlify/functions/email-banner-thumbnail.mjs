// The shared email-thumbnail compositor uses a runtime CommonJS require for
// Sharp. Declare it at the modern entrypoint so Netlify copies the native
// package into this function artifact instead of returning a blank/502 image in
// customer and admin emails.
import 'sharp';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/email-banner-thumbnail.cjs';

export default withLambda(legacyModule.handler);
