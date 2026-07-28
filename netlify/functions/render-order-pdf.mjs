// The shared production renderer is CommonJS and retains runtime require()
// calls. Declare its external runtime packages at this modern entrypoint so
// Netlify copies them into the deployed artifact.
import '@neondatabase/serverless';
import 'cloudinary';
import 'sharp';
import 'pdfkit';
import 'pdf-lib';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/render-order-pdf.cjs';

export default withLambda(legacyModule.handler);
