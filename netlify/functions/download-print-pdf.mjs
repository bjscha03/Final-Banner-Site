// These packages are required at runtime by the shared legacy CommonJS handler
// and its production-renderer fallback. Import them here so Netlify's modern
// esbuild entrypoint includes/copies the external dependencies into this
// function artifact instead of leaving unresolved require() calls in Lambda.
import '@neondatabase/serverless';
import 'cloudinary';
import 'sharp';
import 'pdfkit';
import 'pdf-lib';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/download-print-pdf.cjs';

export default withLambda(legacyModule.handler);
