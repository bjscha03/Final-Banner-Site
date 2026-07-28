// The background renderer uses runtime CommonJS requires. Declare its external
// packages at the modern entrypoint so Netlify copies them into the deployed
// background-function artifact.
import '@neondatabase/serverless';
import 'cloudinary';
import 'sharp';
import 'pdfkit';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/render-order-pdf-background.cjs';

export default withLambda(legacyModule.handler);

export const config = {
  background: true,
};
